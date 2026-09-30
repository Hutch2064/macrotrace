import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fredSeries } from "./catalog.mjs";
import { extendedFredSeries } from "./extended-macro-catalog.mjs";
import { fetchCommodityHistorySeries } from "./commodity-history.mjs";
import { fetchWorldDevelopmentSeries } from "./world-development.mjs";
import { fetchInternationalSupplement } from "./international-supplement.mjs";
import { fetchTerritoryData } from "./territory-data.mjs";
import { fetchShillerHousing } from "./shiller-history.mjs";
import { isMacroSeries, normalizeMacroSeries } from "./macro-scope.mjs";

const fredStart = "1000-01-01";
const pruneOnly = process.argv.includes("--prune-only");
const countriesOnly = process.argv.includes("--countries-only");
const supplementsOnly = process.argv.includes("--supplements-only");
const territoriesOnly = process.argv.includes("--territories-only");
const previous = JSON.parse(
  await readFile("public/data/snapshot.json", "utf8").catch(
    () => '{"series":[]}',
  ),
);
const previousById = new Map(
  (previous.series || []).map((series) => [series.id, series]),
);
const failures = [];
let countries = previous.countries || [];
let countryAudit = previous.countryAudit || null;
let supplementaryCountries = (previous.countries || []).filter(
  (country) =>
    country.sourceFamily && !/World Bank/i.test(country.sourceFamily),
);
let supplementaryAudit = previous.countryAudit?.supplementary || null;
let territorialCountries = (previous.countries || []).filter((country) =>
  previous.series.some(
    (series) =>
      series.dataset === "regional-territories" &&
      series.countryCode === country.id,
  ),
);
let territorialAudit = previous.countryAudit?.territories || null;

function parseCsv(text) {
  const [, ...rows] = text.trim().split(/\r?\n/);
  return rows.flatMap((row) => {
    const [date, raw] = row.split(",");
    const clean = raw?.trim();
    const value = Number(clean);
    return date && clean && clean !== "." && Number.isFinite(value)
      ? [[date, value]]
      : [];
  });
}

async function fetchFred([
  id,
  name,
  category,
  unit,
  frequency,
  transform = "identity",
  metadata = {},
]) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${fredStart}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`FRED ${id}: ${response.status}`);
  return {
    id,
    name,
    category,
    unit,
    frequency,
    ...metadata,
    checkedAt: new Date().toISOString(),
    source: "Federal Reserve Bank of St. Louis (FRED)",
    sourceUrl: `https://fred.stlouisfed.org/series/${id}`,
    observations: parseCsv(await response.text())
      .filter(([, value]) => transform !== "invert" || value > 0)
      .map(([date, value]) => [
        date,
        transform === "invert" ? 1 / value : value,
      ]),
  };
}

function itemId(item) {
  return Array.isArray(item) ? item[0] : item.id;
}

async function mapWithConcurrency(items, mapper, limit = 6) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      try {
        results[index] = await mapper(item);
        if (!results[index].observations.length)
          throw new Error(`Empty series ${itemId(item)}`);
      } catch (error) {
        try {
          const retry = await mapper(item);
          if (!retry.observations.length)
            throw new Error(`Empty series ${itemId(item)}`);
          results[index] = retry;
        } catch {
          const cached = previousById.get(itemId(item));
          if (!cached) throw error;
          results[index] = {
            ...cached,
            refreshStatus: "upstream-unavailable",
            checkedAt: cached.checkedAt || previous.generatedAt,
          };
          failures.push(itemId(item));
        }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

async function fetchDataset(dataset, fetcher) {
  try {
    const result = await fetcher();
    if (dataset === "worldbank-development") {
      countries = result.countries;
      countryAudit = result.audit;
      failures.push(...result.failures);
    } else if (dataset === "international-supplement") {
      supplementaryCountries = result.countries;
      supplementaryAudit = result.audit;
      failures.push(
        ...result.series
          .filter((series) => series.refreshStatus)
          .map(({ id }) => id),
      );
    } else if (dataset === "regional-territories") {
      territorialCountries = result.countries;
      territorialAudit = result.audit;
      failures.push(
        ...result.series
          .filter((series) => series.refreshStatus)
          .map(({ id }) => id),
      );
    }
    return (Array.isArray(result) ? result : result.series)
      .map((series) => ({ ...series, dataset }))
      .filter(isMacroSeries);
  } catch (error) {
    const cached = (previous.series || []).filter(
      (series) => series.dataset === dataset && isMacroSeries(series),
    );
    if (!cached.length) throw error;
    console.warn(
      `${dataset}: retaining ${cached.length} macro series after ${error.message}`,
    );
    failures.push(...cached.map(({ id }) => id));
    return cached.map((series) => ({
      ...series,
      refreshStatus: "upstream-unavailable",
      checkedAt: series.checkedAt || previous.generatedAt,
    }));
  }
}

function normalizeAll(series) {
  const specs = new Map(
    [...fredSeries, ...extendedFredSeries].map((spec) => [spec[0], spec]),
  );
  return series
    .map((entry) => {
      const spec = specs.get(entry.id);
      return normalizeMacroSeries(
        spec
          ? {
              ...entry,
              name: spec[1],
              category: spec[2],
              unit: spec[3],
              frequency: spec[4],
              ...spec[6],
            }
          : entry,
      );
    })
    .filter(Boolean);
}

function dedupe(series) {
  const seen = new Set();
  return series.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function csv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

async function writeMacroInventory(snapshot) {
  const rows = snapshot.series.map((series) => ({
    id: series.id,
    name: series.name,
    category: series.category,
    geography: series.geography,
    country: series.country,
    source: series.source,
    source_url: series.sourceUrl,
    frequency: series.frequency,
    unit: series.unit,
    start: series.observations[0][0],
    end: series.observations.at(-1)[0],
    observations: series.observations.length,
    classification: series.historyType || "published observations",
    methodology:
      series.methodology ||
      "Published source values at native frequency; missing values omitted.",
  }));
  const columns = Object.keys(rows[0] || {});
  await writeFile(
    "public/data/source-inventory.csv",
    `${columns.join(",")}\n${rows.map((row) => columns.map((key) => csv(row[key])).join(",")).join("\n")}\n`,
  );
  const groups = rows.reduce(
    (map, row) =>
      map.set(row.category, [...(map.get(row.category) || []), row]),
    new Map(),
  );
  const sections = [...groups].map(
    ([category, items]) =>
      `## ${category}\n\n| ID | Series | Geography | Frequency | Unit | From | Through | Observations |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${items
        .map(
          (row) =>
            `| [${row.id}](${row.source_url}) | ${row.name.replaceAll("|", "/")} | ${row.geography} | ${row.frequency} | ${row.unit} | ${row.start} | ${row.end} | ${row.observations} |`,
        )
        .join("\n")}`,
  );
  await writeFile(
    "public/data/source-inventory.md",
    `# MacroTrace macroeconomic source inventory\n\nSnapshot: ${snapshot.generatedAt}. ${rows.length} retained macroeconomic series. Coverage is the actual first/last stored observation, not the data-download date. FX is labeled separately from country-specific macro histories; commodity prices and indexes are source price levels, not investment returns.\n\n${sections.join("\n\n")}\n`,
  );
}

let sourceSeries;
const developmentFetcher = () =>
  fetchWorldDevelopmentSeries({
    previousSeries: previous.series,
    previousCountries: countries.filter(
      (country) =>
        !country.sourceFamily || /World Bank/i.test(country.sourceFamily),
    ),
    previousAudit: countryAudit,
  });
const supplementFetcher = () =>
  fetchInternationalSupplement({
    previousSeries: previous.series,
    previousCountries: previous.countries,
  });
const territoryFetcher = () =>
  fetchTerritoryData({
    previousSeries: previous.series,
    previousCountries: previous.countries,
  });
if (pruneOnly) {
  // Offline scope migration: preserve every retained observation byte-for-byte
  // and retain the prior generation timestamp; no source is fetched.
  sourceSeries = normalizeAll((previous.series || []).filter(isMacroSeries));
} else if (territoriesOnly) {
  const territories = await fetchDataset(
    "regional-territories",
    territoryFetcher,
  );
  sourceSeries = dedupe(
    normalizeAll([
      ...previous.series.filter(
        (series) => series.dataset !== "regional-territories",
      ),
      ...territories,
    ]),
  );
  failures.push(
    ...(previous.refreshFailures || []).filter(
      (id) => previousById.get(id)?.dataset !== "regional-territories",
    ),
  );
} else if (supplementsOnly) {
  const supplement = await fetchDataset(
    "international-supplement",
    supplementFetcher,
  );
  sourceSeries = dedupe(
    normalizeAll([
      ...previous.series.filter(
        (series) => series.dataset !== "international-supplement",
      ),
      ...supplement,
    ]),
  );
  failures.push(
    ...(previous.refreshFailures || []).filter(
      (id) => previousById.get(id)?.dataset !== "international-supplement",
    ),
  );
} else if (countriesOnly) {
  const development = await fetchDataset(
    "worldbank-development",
    developmentFetcher,
  );
  sourceSeries = dedupe(
    normalizeAll([
      ...previous.series.filter(
        (series) => series.dataset !== "worldbank-development",
      ),
      ...development,
    ]),
  );
  failures.push(
    ...(previous.refreshFailures || []).filter((id) => !id.startsWith("WDI_")),
  );
} else {
  // The allowlist is applied before any network call. Removed Yahoo, factor,
  // Damodaran, and proxy histories therefore cannot be retried or refetched.
  const fredCatalog = [...fredSeries, ...extendedFredSeries].filter(
    isMacroSeries,
  );
  const [
    macro,
    commodities,
    development,
    shillerHousing,
    supplement,
    territories,
  ] = await Promise.all([
    mapWithConcurrency(fredCatalog, fetchFred),
    fetchDataset("worldbank-commodities", fetchCommodityHistorySeries),
    fetchDataset("worldbank-development", developmentFetcher),
    fetchDataset("shiller", fetchShillerHousing),
    fetchDataset("international-supplement", supplementFetcher),
    fetchDataset("regional-territories", territoryFetcher),
  ]);
  sourceSeries = dedupe(
    normalizeAll([
      ...macro,
      ...shillerHousing,
      ...commodities,
      ...development,
      ...supplement,
      ...territories,
    ]),
  );
}

const countryMap = new Map(countries.map((country) => [country.id, country]));
for (const country of [...supplementaryCountries, ...territorialCountries]) {
  const existing = countryMap.get(country.id);
  if (
    !existing ||
    (existing.sourceFamily &&
      !/World Bank|World Development/i.test(existing.sourceFamily))
  )
    countryMap.set(country.id, country);
}
countries = [...countryMap.values()]
  .map((country) => ({
    ...country,
    seriesCount: sourceSeries.filter(
      (series) => series.countryCode === country.id,
    ).length,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
countryAudit = {
  ...countryAudit,
  supplementaryCount:
    countries.length - (countryAudit?.rosterCount || countries.length),
  supplementary: supplementaryAudit,
  territories: territorialAudit,
};

const retainedIds = new Set(sourceSeries.map(({ id }) => id));
const generatedAt =
  pruneOnly && previous.generatedAt
    ? previous.generatedAt
    : new Date().toISOString();
const snapshot = {
  generatedAt,
  countries,
  countryAudit,
  refreshFailures: [
    ...new Set(
      (pruneOnly ? previous.refreshFailures || [] : failures).filter((id) =>
        retainedIds.has(id),
      ),
    ),
  ],
  methodology: {
    fredStart,
    missingValues: "Rows with missing or non-numeric observations are omitted.",
    scope:
      "Macroeconomics only: published economic indicators, FX, policy and sovereign yields, actual commodity prices and commodity indexes, World Bank, UN, Pacific Community, Taiwan DGBAS, official territorial statistics and actual-only IMF macro histories, and two explicitly retained Shiller actual housing histories. Stocks, securities, ETFs, factors, and reconstructed investment returns are excluded before fetch.",
    transformations:
      "Source values are preserved. Panel views calculate native-frequency levels, calendar-year changes and prior-observation changes; rate changes are percentage points, signed index changes use native points, and prices or quantities use percent changes with strictly positive baselines.",
  },
  series: sourceSeries,
};

await mkdir("public/data", { recursive: true });
await writeFile("public/data/snapshot.json", `${JSON.stringify(snapshot)}\n`);
await writeFile(
  "public/data/version.json",
  `${JSON.stringify({ generatedAt: snapshot.generatedAt })}\n`,
);
await writeMacroInventory(snapshot);
await writeFile(
  "public/data/country-coverage.json",
  `${JSON.stringify({
    generatedAt,
    ...countryAudit,
    countries: countries.map((country) => {
      const series = sourceSeries.filter(
        (entry) => entry.countryCode === country.id,
      );
      return {
        ...country,
        series: series.map((entry) => ({
          id: entry.id,
          indicator: entry.sourceIndicator,
          name: entry.indicatorName,
          source: entry.source,
          sourceUrl: entry.sourceUrl,
          unit: entry.unit,
          frequency: entry.frequency,
          ...(entry.actualCutoff ? { actualCutoff: entry.actualCutoff } : {}),
          start: entry.observations[0][0],
          end: entry.observations.at(-1)[0],
          observations: entry.observations.length,
          checkedAt: entry.checkedAt,
          retained: Boolean(entry.refreshStatus),
        })),
        unavailable: (country.sourceFamily
          ? []
          : countryAudit?.indicators || []
        )
          .filter(
            (entry) =>
              !series.some((item) => item.sourceIndicator === entry.indicator),
          )
          .map(({ indicator, label }) => ({ indicator, label })),
      };
    }),
  })}\n`,
);
console.log(
  `${pruneOnly ? "Pruned" : "Refreshed"} ${snapshot.series.length} macro series and ${snapshot.series.reduce((n, item) => n + item.observations.length, 0).toLocaleString()} observations${pruneOnly ? " without fetching" : ""}.`,
);
