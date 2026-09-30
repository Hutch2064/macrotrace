import { readFile } from "node:fs/promises";
import { fredSeries } from "../scripts/catalog.mjs";
import { extendedFredSeries } from "../scripts/extended-macro-catalog.mjs";
import {
  canonicalMacroCategory,
  isMacroSeries,
  macroCountries,
  macroGeographies,
  macroFrequencies,
} from "../scripts/macro-scope.mjs";

const snapshot = JSON.parse(
  await readFile("public/data/snapshot.json", "utf8"),
);
const version = JSON.parse(await readFile("public/data/version.json", "utf8"));
if (!snapshot.generatedAt || version.generatedAt !== snapshot.generatedAt)
  throw new Error("Version manifest does not match the data snapshot.");
if (!Array.isArray(snapshot.series) || snapshot.series.length < 200)
  throw new Error("Expected a substantial macroeconomic history set.");
if (!Array.isArray(snapshot.countries) || snapshot.countries.length < 200)
  throw new Error(
    "Expected the current non-aggregate World Bank country roster.",
  );

const countriesById = new Map(
  snapshot.countries.map((country) => [country.id, country]),
);
if (
  countriesById.has("WLD") ||
  countriesById.size !== snapshot.countries.length
)
  throw new Error(
    "Country roster must contain unique non-aggregate economies.",
  );
const wdiGeographies = new Set(
  [...countriesById.values()].map(({ id, name }) =>
    id === "USA" ? "US" : name,
  ),
);
wdiGeographies.add("Global");
const normalizedCategories = new Set([
  "Credit",
  "Currencies",
  "Commodities",
  "Demography",
  "Fiscal",
  "Growth",
  "Housing",
  "Inflation",
  "Labor",
  "Productivity",
  "Rates",
]);

const byId = new Map();
for (const series of snapshot.series) {
  if (!series.id || byId.has(series.id))
    throw new Error(`Duplicate or missing series identifier: ${series.id}.`);
  byId.set(series.id, series);
  if (!isMacroSeries(series))
    throw new Error(
      `Out-of-scope investment/security series retained: ${series.id}.`,
    );
  if (
    series.category !== canonicalMacroCategory(series) ||
    !normalizedCategories.has(series.category)
  )
    throw new Error(
      `Unnormalized macro category for ${series.id}: ${series.category}.`,
    );
  const isWdi = series.id.startsWith("WDI_");
  const isCountrySource =
    isWdi || series.dataset === "international-supplement";
  const wdiCode = isWdi ? series.id.match(/^WDI_([A-Z0-9]{3})_/)?.[1] : null;
  if (isWdi) {
    if (!wdiCode || series.countryCode !== wdiCode)
      throw new Error(
        `WDI countryCode does not match series ID: ${series.id}.`,
      );
    if (
      !series.sourceIndicator ||
      !series.sourceDefinition ||
      !series.sourceOrganization
    )
      throw new Error(`Incomplete World Bank source provenance: ${series.id}.`);
    if (wdiCode === "WLD") {
      if (series.geography !== "Global" || series.country !== null)
        throw new Error(
          `World aggregate geography/country mismatch: ${series.id}.`,
        );
    } else {
      const country = countriesById.get(wdiCode);
      if (!country)
        throw new Error(
          `WDI series references an unknown economy: ${series.id}.`,
        );
      const expectedGeography = wdiCode === "USA" ? "US" : country.name;
      if (
        series.geography !== expectedGeography ||
        series.country !== country.name
      )
        throw new Error(`WDI geography/country mismatch: ${series.id}.`);
      if (!wdiGeographies.has(series.geography))
        throw new Error(
          `WDI geography is outside the current roster: ${series.id}.`,
        );
    }
    if (series.frequency !== "annual" || series.releaseFrequency !== "annual")
      throw new Error(`WDI history is not annual: ${series.id}.`);
  }
  if (
    !series.name ||
    !series.category ||
    !series.sourceUrl ||
    !series.unit ||
    !macroFrequencies.includes(series.frequency) ||
    (!isCountrySource && !macroGeographies.includes(series.geography)) ||
    (isCountrySource && !wdiGeographies.has(series.geography))
  )
    throw new Error(`Incomplete normalized macro metadata for ${series.id}.`);
  if (
    ["Global", "Euro Area"].includes(series.geography) &&
    series.country !== null
  )
    throw new Error(
      `Global series has a country unexpectedly set: ${series.id}.`,
    );
  if (
    series.geography === "FX" &&
    series.country !== null &&
    !macroCountries.includes(series.country)
  )
    throw new Error(`FX series has an unknown country: ${series.id}.`);
  const minimumObservations = isCountrySource ? 1 : 24;
  if (
    !Array.isArray(series.observations) ||
    series.observations.length < minimumObservations
  )
    throw new Error(`Too few observations for ${series.id}.`);

  let previousDate = "";
  for (const point of series.observations) {
    const [date, value] = point;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
    )
      throw new Error(`${series.id} has an invalid calendar date: ${date}.`);
    if (date > snapshot.generatedAt.slice(0, 10))
      throw new Error(
        `${series.id} contains a future-dated observation: ${date}.`,
      );
    if (
      isCountrySource &&
      (!date.endsWith("-12-31") ||
        Number(date.slice(0, 4)) >= Number(snapshot.generatedAt.slice(0, 4)))
    )
      throw new Error(
        `WDI history is not a completed annual year: ${series.id}/${date}.`,
      );
    if (date <= previousDate)
      throw new Error(`${series.id} dates are not strictly increasing.`);
    if (!Number.isFinite(value))
      throw new Error(`${series.id} has a non-finite value.`);
    if (isWdi) {
      const indicatorKey = series.indicatorKey || series.id.split("_").at(-1);
      if (indicatorKey === "UNEMPLOYMENT" && (value < 0 || value > 100))
        throw new Error(
          `${series.id} has an invalid unemployment rate: ${value}.`,
        );
      if (indicatorKey === "POP" && !(value > 0))
        throw new Error(
          `${series.id} has a non-positive population: ${value}.`,
        );
      if (
        ["GDP", "GDPPC", "GDPNOMINAL", "GDPPCPPP"].includes(indicatorKey) &&
        !(value > 0)
      )
        throw new Error(`${series.id} has a non-positive GDP value: ${value}.`);
    }
    previousDate = date;
  }
}
const wdiCount = snapshot.series.filter(({ id }) =>
  id.startsWith("WDI_"),
).length;
const existingCount = snapshot.series.length - wdiCount;
if (wdiCount < 1 || existingCount < 24)
  throw new Error(
    `Expected at least one WDI history and 24 existing macro histories; received ${wdiCount} and ${existingCount}.`,
  );

const fredCatalog = [...fredSeries, ...extendedFredSeries].filter(
  isMacroSeries,
);
for (const [id, geography] of [
  ["SPPOP65UPTOZSWLD", "Global"],
  ["NYGDPMKTPCDWLD", "Global"],
  ["CLVMNACSCAB1GQEA19", "Euro Area"],
])
  if (byId.get(id)?.geography !== geography)
    throw new Error(`Regional/world indicator incorrectly attributed: ${id}.`);
for (const spec of fredCatalog) {
  const [id, name, category, unit, frequency] = spec;
  const series = byId.get(id);
  if (!series) throw new Error(`Missing allowlisted FRED series ${id}.`);
  if (
    series.name !== name ||
    series.category !== canonicalMacroCategory(spec) ||
    series.unit !== unit ||
    series.frequency !== frequency
  )
    throw new Error(`Allowlisted metadata changed for ${id}.`);
}

for (const id of ["SHILLER_HOME_REAL", "SHILLER_HOME_NOMINAL"])
  if (!byId.has(id))
    throw new Error(`Missing retained actual housing series ${id}.`);

const prohibited = snapshot.series.filter((series) => {
  const text =
    `${series.id} ${series.name} ${series.category} ${series.source} ${series.provider}`.toLowerCase();
  return (
    text.includes("yahoo finance") ||
    series.id === "VIXCLS" ||
    text.includes("fama") ||
    text.includes("damodaran") ||
    text.includes("proxy splice") ||
    series.instrumentType === "ETF" ||
    series.instrumentType === "Security" ||
    series.historyType === "proxy_splice" ||
    series.dataRole === "research_factor_index" ||
    series.dataRole === "research_portfolio" ||
    series.dataRole === "simulated_proxy_index" ||
    series.dataRole === "total_return_index" ||
    /^FF_|^HIST_|_SIM$/.test(series.id)
  );
});
if (prohibited.length)
  throw new Error(
    `Prohibited investment series: ${prohibited.map(({ id }) => id).join(", ")}.`,
  );

const categories = Object.entries(
  snapshot.series.reduce((counts, series) => {
    counts[series.category] = (counts[series.category] || 0) + 1;
    return counts;
  }, {}),
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([category, count]) => `${category}=${count}`)
  .join(", ");
const dates = snapshot.series.flatMap(({ observations }) => [
  observations[0][0],
  observations.at(-1)[0],
]);
console.log(
  `Verified ${snapshot.series.length} macro series (${categories}) covering ${dates.sort()[0]} through ${dates.sort().at(-1)} through ${snapshot.generatedAt}.`,
);
