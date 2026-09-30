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
    !series.name ||
    !series.category ||
    !series.sourceUrl ||
    !series.unit ||
    !macroFrequencies.includes(series.frequency) ||
    !macroGeographies.includes(series.geography)
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
  if (!Array.isArray(series.observations) || series.observations.length < 24)
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
    if (date <= previousDate)
      throw new Error(`${series.id} dates are not strictly increasing.`);
    if (!Number.isFinite(value))
      throw new Error(`${series.id} has a non-finite value.`);
    previousDate = date;
  }
}

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
