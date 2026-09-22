import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fredSeries, marketSeries } from "./catalog.mjs";
import { fetchLongHistorySeries } from "./long-history.mjs";

const start = "1800-01-01";
const startEpoch = Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000);
const endEpoch = Math.floor(Date.now() / 1000);
const previous = JSON.parse(
  await readFile("public/data/snapshot.json", "utf8").catch(
    () => '{"series":[]}',
  ),
);
const previousById = new Map(
  previous.series.map((series) => [series.id, series]),
);
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
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${start}`;
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

async function fetchMarket([symbol, name, category]) {
  const params = new URLSearchParams({
    period1: String(startEpoch),
    period2: String(endEpoch),
    interval: "1d",
    events: "history",
  });
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?${params}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 MacroTrace/1.0" },
  });
  if (!response.ok) throw new Error(`Yahoo ${symbol}: ${response.status}`);
  const result = (await response.json()).chart.result?.[0];
  if (!result) throw new Error(`Yahoo ${symbol}: no data`);
  const closes =
    result.indicators.adjclose?.[0]?.adjclose ??
    result.indicators.quote[0].close;
  const observations = result.timestamp.flatMap((timestamp, index) => {
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
    unit: "$",
    frequency: "daily",
    source: "Yahoo Finance",
    sourceUrl: `https://finance.yahoo.com/quote/${symbol}/history`,
    observations,
  };
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
          throw new Error(`Empty series ${item[0]}`);
      } catch (error) {
        try {
          results[index] = await mapper(item);
        } catch {
          const cached = previousById.get(item[0]);
          if (!cached) throw error;
          results[index] = {
            ...cached,
            refreshStatus: "upstream-unavailable",
            checkedAt: cached.checkedAt || previous.generatedAt,
          };
          failures.push(item[0]);
        }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

const [macro, markets, longHistory] = await Promise.all([
  mapWithConcurrency(fredSeries, fetchFred),
  mapWithConcurrency(marketSeries, fetchMarket),
  fetchLongHistorySeries().catch((error) => {
    const cached = previous.series.filter(
      ({ historyType }) => historyType === "observed_public",
    );
    if (!cached.length) throw error;
    failures.push("research histories");
    return cached.map((series) => ({
      ...series,
      refreshStatus: "upstream-unavailable",
      checkedAt: series.checkedAt || previous.generatedAt,
    }));
  }),
]);

const snapshot = {
  generatedAt: new Date().toISOString(),
  refreshFailures: failures,
  methodology: {
    start,
    marketValue: "Adjusted close when available; otherwise close.",
    missingValues: "Rows with missing or non-numeric observations are omitted.",
    normalization:
      "Indexed views divide each series by its first visible observation and multiply by 100.",
  },
  series: [...macro, ...markets, ...longHistory],
};

await mkdir("public/data", { recursive: true });
await writeFile("public/data/snapshot.json", `${JSON.stringify(snapshot)}\n`);
console.log(
  `Wrote ${snapshot.series.length} series and ${snapshot.series.reduce((n, item) => n + item.observations.length, 0).toLocaleString()} observations.`,
);
