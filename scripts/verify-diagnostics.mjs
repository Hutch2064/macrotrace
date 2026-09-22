import assert from "node:assert/strict";
import {
  breadthAcceleration,
  changeDistribution,
  rollingAnnualReturn,
  rollingVolatilityPath,
} from "../src/diagnostics.js";

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`,
  );

const series = (observations, extra = {}) => ({ observations, ...extra });

// Positive market-style levels: rolling annual returns are simple percentage
// returns, while volatility is annualized log-return sample deviation.
const market = series(
  [
    ["2020-01-01", 100],
    ["2020-02-01", 110],
    ["2020-03-01", 99],
    ["2020-04-01", 110],
    ["2020-05-01", 121],
    ["2020-06-01", 108],
    ["2020-07-01", 120],
    ["2020-08-01", 130],
    ["2020-09-01", 125],
    ["2020-10-01", 140],
    ["2020-11-01", 145],
    ["2020-12-01", 150],
    ["2021-01-01", 155],
    ["2021-02-01", 160],
    ["2021-03-01", 170],
  ],
  { id: "MARKET", frequency: "monthly", kind: "market", unit: "index" },
);

const annualReturn = rollingAnnualReturn(market);
assert.equal(annualReturn.unit, "percent");
assert.deepEqual(
  annualReturn.rows.map(({ date }) => date),
  ["2021-01-01", "2021-02-01", "2021-03-01"],
);
close(annualReturn.rows.at(-1).value, (170 / 99 - 1) * 100);

const volatility = rollingVolatilityPath(market);
assert.equal(volatility.unit, "percent annualized");
assert.equal(volatility.method, "log-return");
assert.ok(volatility.rows.length > 0);
assert.ok(volatility.rows.every(({ count }) => count >= 3));
assert.ok(volatility.rows.every(({ value }) => Number.isFinite(value)));

// A missing native interval is not bridged. This also proves that duplicate
// and unsorted fixture points are harmless to the pure diagnostic contract.
const gapMarket = series(
  [
    ["2020-05-01", 105],
    ["2020-01-01", 100],
    ["2020-02-01", 101],
    ["2020-04-01", 103],
    ["2020-05-01", 105],
  ],
  { id: "GAP", frequency: "monthly", kind: "market", unit: "index" },
);
const gapDistribution = changeDistribution(gapMarket, { bins: 3 });
assert.equal(gapDistribution.n, 2); // Jan->Feb and Apr->May only.
assert.equal(
  gapDistribution.observations.some(({ date }) => date === "2020-04-01"),
  false,
);

// Zero-crossing/signed levels use point changes rather than invalid ratios.
const signed = series(
  [
    ["2020-01-01", -1],
    ["2020-02-01", 0],
    ["2020-03-01", 2],
    ["2020-05-01", -3],
    ["2020-06-01", 1],
  ],
  { id: "SIGNED", frequency: "monthly", category: "Credit", unit: "index" },
);
const signedDistribution = changeDistribution(signed, { bins: 3 });
assert.equal(signedDistribution.type, "points");
assert.deepEqual(
  signedDistribution.values,
  [1, 2, 4], // The missing Apr gap is intentionally omitted.
);
assert.equal(signedDistribution.summary.minimum, 1);
assert.equal(signedDistribution.summary.maximum, 4);
assert.equal(signedDistribution.summary.downsideProbabilityPct, 0);
const signedVolatility = rollingVolatilityPath(signed, {
  horizon: "max",
  minimumObservations: 3,
});
assert.equal(signedVolatility.unit, "points annualized");
assert.ok(signedVolatility.rows.length >= 1);

// Cross-series breadth keeps source units separate and aggregates only signs,
// counts, and within-series percentile ranks. Rate changes are basis points;
// the signed index uses points. Missing April prevents a false acceleration
// from March directly to May.
const macroA = series(
  [
    ["2020-01-01", 100],
    ["2020-02-01", 101],
    ["2020-03-01", 100],
    ["2020-05-01", 101],
  ],
  { id: "A", frequency: "monthly", unit: "index" },
);
const macroRate = series(
  [
    ["2020-01-01", 4],
    ["2020-02-01", 3],
    ["2020-03-01", 3],
    ["2020-04-01", 2],
    ["2020-05-01", 4],
  ],
  { id: "RATE", frequency: "monthly", unit: "%", category: "Rates" },
);
const breadth = breadthAcceleration([macroA, macroRate], {
  period: "month",
});
assert.equal(breadth.period, "month");
assert.ok(
  breadth.series.every(({ unit }) =>
    ["percent", "basis points"].includes(unit),
  ),
);
const february = breadth.rows.find(({ period }) => period === "2020-02");
assert.equal(february.positiveSharePct, 50);
assert.equal(february.validCount, 2);
const march = breadth.rows.find(({ period }) => period === "2020-03");
assert.equal(march.positiveSharePct, 0);
assert.equal(march.accelerationPositiveSharePct, 50);
const may = breadth.rows.find(({ period }) => period === "2020-05");
assert.equal(may.accelerationValidCount, 1); // rate only; A has a missing April.
assert.ok(
  breadth.rows.every(
    ({ percentileUnit }) => percentileUnit === "percentile rank (0-100)",
  ),
);

// Bins reconcile exactly to the unmodified observation count; no clipping or
// replacement of the minimum/maximum event is allowed.
for (const diagnostic of [gapDistribution, signedDistribution]) {
  assert.equal(
    diagnostic.rows.reduce((sum, row) => sum + row.count, 0),
    diagnostic.n,
  );
  assert.equal(diagnostic.summary.minimum, Math.min(...diagnostic.values));
  assert.equal(diagnostic.summary.maximum, Math.max(...diagnostic.values));
}

console.log(
  "Diagnostics verification passed: four pure panel contracts and independent edge-case fixtures.",
);
