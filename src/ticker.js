import { change, changeSuffix } from "./analytics.js";
import { horizonLabel } from "./horizons.js";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const readingsCache = new WeakMap();
const priority = [
  "VT",
  "^GSPC",
  "^FTSE",
  "^N225",
  "^GDAXI",
  "^HSI",
  "UNRATE",
  "CPIAUCSL",
  "DGS10",
  "DTWEXBGS",
];

// Every bundled series participates; rates and signed indexes are never treated as price returns.
export function tickerReadings(snapshot, horizon = "365") {
  let cache = readingsCache.get(snapshot);
  if (!cache) {
    cache = new Map();
    readingsCache.set(snapshot, cache);
  }
  if (cache.has(horizon)) return cache.get(horizon);
  const rows = snapshot.series
    .map((series) => {
      const [date] = series.observations.at(-1);
      const value = change(series, horizon);
      const suffix = changeSuffix(series);
      return {
        id: series.id,
        name:
          series.bannerName ||
          (series.source === "Yahoo Finance"
            ? series.name.split(" · ")[0]
            : series.name),
        date,
        category: series.category,
        direction: value > 0 ? "positive" : value < 0 ? "negative" : "",
        value: Number.isFinite(value)
          ? `${value > 0 ? "+" : ""}${number.format(value)}${suffix}`
          : "Unavailable",
        detail: `${series.historyStatus === "archived" ? "Archive · " : series.historyType === "proxy_splice" ? "SIM · " : series.marketRole === "global_benchmark" ? "ETF proxy · " : ""}${horizonLabel(horizon)} change`,
        retained: series.refreshStatus === "upstream-unavailable",
      };
    })
    .sort((a, b) => {
      const rank = (row) => {
        const index = priority.indexOf(row.id);
        return index < 0 ? priority.length : index;
      };
      return (
        rank(a) - rank(b) ||
        a.category.localeCompare(b.category) ||
        a.name.localeCompare(b.name)
      );
    });
  cache.set(horizon, rows);
  return rows;
}
