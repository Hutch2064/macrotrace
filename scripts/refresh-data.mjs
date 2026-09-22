import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fredSeries } from "./catalog.mjs";
import { extendedFredSeries } from "./extended-macro-catalog.mjs";
import { marketSeries } from "./market-catalog.mjs";
import { fetchLongHistorySeries } from "./long-history.mjs";
import { fetchShillerHistorySeries } from "./shiller-history.mjs";
import { buildSplicedHistory } from "./spliced-history.mjs";
import { writeSourceInventory } from "./source-inventory.mjs";
import { fetchFactorHistorySeries } from "./factor-history.mjs";
import { fetchCommodityHistorySeries } from "./commodity-history.mjs";
import { fetchWorldDevelopmentSeries } from "./world-development.mjs";

const marketStart = "1800-01-01";
const fredStart = "1000-01-01";
const startEpoch = Math.floor(
  new Date(`${marketStart}T00:00:00Z`).getTime() / 1000,
);
const endEpoch = Math.floor(Date.now() / 1000);
const marketsOnly = process.argv.includes("--markets-only");
const previous = JSON.parse(
  await readFile("public/data/snapshot.json", "utf8").catch(
    () => '{"series":[]}',
  ),
);
const previousById = new Map(
  previous.series.map((series) => [series.id, series]),
);
const marketIds = new Set(marketSeries.map(({ id }) => id));
const failures = [];

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

async function fetchMarket(spec) {
  const {
    id: symbol,
    name,
    category,
    unit,
    source,
    sourceUrl,
    provider,
    frequency,
    ...metadata
  } = spec;
  const params = new URLSearchParams({
    period1: String(startEpoch),
    period2: String(endEpoch),
    interval: "1d",
    events: "history",
  });
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "Mozilla/5.0 MacroTrace/1.0" },
  });
  if (!response.ok) throw new Error(`Yahoo ${symbol}: ${response.status}`);
  const result = (await response.json()).chart.result?.[0];
  if (!result) throw new Error(`Yahoo ${symbol}: no data`);
  const adjusted = result.indicators.adjclose?.[0]?.adjclose;
  const closes = adjusted ?? result.indicators.quote?.[0]?.close ?? [];
  const observations = (result.timestamp ?? []).flatMap((timestamp, index) => {
    const value = closes[index];
    return Number.isFinite(value)
      ? [
          [
            new Date(timestamp * 1000).toISOString().slice(0, 10),
            Number(value.toFixed(4)),
          ],
        ]
      : [];
  });
  return {
    id: symbol,
    name,
    category,
    unit,
    frequency,
    kind: "market",
    checkedAt: new Date().toISOString(),
    valueType: adjusted ? "adjusted_close" : "unadjusted_close",
    source,
    sourceUrl,
    provider,
    ...metadata,
    observations,
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
    return (await fetcher()).map((series) => ({ ...series, dataset }));
  } catch (error) {
    const cached = previous.series.filter(
      (series) =>
        series.dataset === dataset ||
        (dataset === "french-damodaran" &&
          !series.dataset &&
          series.historyType === "observed_public"),
    );
    if (!cached.length) throw error;
    console.warn(
      `${dataset}: retaining ${cached.length} series after ${error.message}`,
    );
    failures.push(...cached.map(({ id }) => id));
    return cached.map((series) => ({
      ...series,
      dataset,
      refreshStatus: "upstream-unavailable",
      checkedAt: series.checkedAt || previous.generatedAt,
    }));
  }
}

const [
  macro,
  markets,
  longHistory,
  shiller,
  factors,
  commodities,
  development,
] = marketsOnly
  ? [
      previous.series.filter(
        ({ id, historyType }) =>
          !marketIds.has(id) && historyType !== "proxy_splice",
      ),
      await mapWithConcurrency(marketSeries, fetchMarket, 2),
      [],
      [],
      [],
      [],
      [],
    ]
  : await Promise.all([
      mapWithConcurrency([...fredSeries, ...extendedFredSeries], fetchFred),
      mapWithConcurrency(marketSeries, fetchMarket, 2),
      fetchDataset("french-damodaran", fetchLongHistorySeries),
      fetchDataset("shiller", fetchShillerHistorySeries),
      fetchDataset("french-factors", fetchFactorHistorySeries),
      fetchDataset("worldbank-commodities", fetchCommodityHistorySeries),
      fetchDataset("worldbank-development", fetchWorldDevelopmentSeries),
    ]);

if (marketsOnly) {
  failures.push(
    ...(previous.refreshFailures || []).filter(
      (id) => !marketIds.has(id) && !id.endsWith("_SIM"),
    ),
  );
}

const generatedAt = new Date().toISOString();
const sourceSeries = [
  ...macro,
  ...markets,
  ...longHistory,
  ...shiller,
  ...factors,
  ...commodities,
  ...development,
];
const spliced = buildSplicedHistory(sourceSeries, generatedAt);
failures.push(
  ...spliced.filter((series) => series.refreshStatus).map(({ id }) => id),
);
const snapshot = {
  generatedAt,
  refreshFailures: [...new Set(failures)],
  methodology: marketsOnly
    ? previous.methodology
    : {
        fredStart,
        marketStart,
        marketValue: "Adjusted close when available; otherwise close.",
        missingValues:
          "Rows with missing or non-numeric observations are omitted.",
        normalization:
          "Indexed views divide each series by its first visible observation and multiply by 100.",
      },
  series: [...sourceSeries, ...spliced],
};

await mkdir("public/data", { recursive: true });
await writeFile("public/data/snapshot.json", `${JSON.stringify(snapshot)}\n`);
await writeFile(
  "public/data/version.json",
  `${JSON.stringify({ generatedAt: snapshot.generatedAt })}\n`,
);
await writeSourceInventory(snapshot);
console.log(
  `Wrote ${snapshot.series.length} series and ${snapshot.series.reduce((n, item) => n + item.observations.length, 0).toLocaleString()} observations${marketsOnly ? " (markets only)" : ""}.`,
);
