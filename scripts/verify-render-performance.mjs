import snapshot from "../public/data/snapshot.json" with { type: "json" };
import { periodChanges, rollingHorizonChanges } from "../src/analytics.js";
import {
  breadthAcceleration,
  rollingAnnualReturn,
  rollingVolatilityPath,
} from "../src/diagnostics.js";

// This is a pure-function benchmark for the dashboard's selected-series
// analytics/diagnostic work. It intentionally excludes browser layout, uPlot,
// Chart.js, network/provider latency, and user interaction timing.
const groups = {
  currencies: snapshot.series.filter(
    ({ category }) => category === "Currencies",
  ),
  labor: snapshot.series.filter(({ category }) => category === "Labor"),
};

function dashboardLike(seriesList) {
  for (const series of seriesList) {
    rollingHorizonChanges(series, "1y");
    rollingAnnualReturn(series);
    rollingVolatilityPath(series);
    periodChanges(series, "month", "1y");
  }
  breadthAcceleration(seriesList, { horizon: "1y" });
  for (const series of seriesList) periodChanges(series, "month", "1y");
}

function measure(seriesList) {
  const started = performance.now();
  dashboardLike(seriesList);
  const coldMs = performance.now() - started;
  const repeatStarted = performance.now();
  dashboardLike(seriesList);
  const repeatMs = performance.now() - repeatStarted;
  return {
    series: seriesList.length,
    observations: seriesList.reduce(
      (total, { observations }) => total + observations.length,
      0,
    ),
    coldMs: Number(coldMs.toFixed(2)),
    repeatMs: Number(repeatMs.toFixed(2)),
  };
}

console.log(
  JSON.stringify(
    {
      node: process.version,
      generatedAt: snapshot.generatedAt,
      groups: Object.fromEntries(
        Object.entries(groups).map(([name, series]) => [name, measure(series)]),
      ),
      limitation:
        "Pure analytics/diagnostic timings only; no browser layout, chart-engine draw, network, or deployed production timing.",
    },
    null,
    2,
  ),
);
