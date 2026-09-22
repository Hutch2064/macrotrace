import { change, changeType } from "./analytics.js";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
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
export function tickerReadings(snapshot) {
  return snapshot.series
    .map((series) => {
      const [date, latest] = series.observations.at(-1);
      const isReturn = changeType(series) === "percent";
      const value = isReturn ? change(series, "1y") : latest;
      const suffix = isReturn || series.unit === "%" ? "%" : ` ${series.unit}`;
      return {
        id: series.id,
        name:
          series.bannerName ||
          (series.source === "Yahoo Finance"
            ? series.name.split(" · ")[0]
            : series.name),
        date,
        category: series.category,
        value: Number.isFinite(value)
          ? `${isReturn && value >= 0 ? "+" : ""}${number.format(value)}${suffix}`
          : "Unavailable",
        detail: isReturn
          ? series.marketRole === "global_benchmark"
            ? "ETF proxy · 1Y change"
            : "1Y change"
          : "latest level",
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
}
