import assert from "node:assert/strict";
import snapshot from "../public/data/snapshot.json" with { type: "json" };
import {
  aggregateCalendar,
  alignedChanges,
  annualizedCagr,
  change,
  changeType,
  correlation,
  correlationDetails,
  drawdownPath,
  logVolatility,
  maxDrawdown,
  median,
  nativeChanges,
  percentileOfChanges,
  periodChanges,
  rollingHorizonChanges,
  sliceWindow,
} from "../src/analytics.js";

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`,
  );
const series = (observations, extra = {}) => ({ observations, ...extra });

// Calendar horizon: 365 means one calendar year, not 365 elapsed days. The
// leap-day observation therefore remains inside a 2024-02-29 one-year window.
const leap = series(
  [
    ["2023-02-28", 100],
    ["2023-03-01", 101],
    ["2024-02-29", 110],
  ],
  { frequency: "daily", unit: "index" },
);
const leapWindow = sliceWindow(leap, 365);
assert.deepEqual(
  leapWindow.observations.map(([date]) => date),
  ["2023-02-28", "2023-03-01", "2024-02-29"],
);
assert.equal(leapWindow.anchor, null);

// Boundary changes use the actual prior observation, while the anchor is not
// counted as an in-window observation.
const rate = series(
  [
    ["2024-01-01", 4.5],
    ["2024-02-01", 5],
  ],
  { frequency: "monthly", unit: "%", category: "Rates" },
);
assert.equal(changeType(rate), "basis-points");
close(change(rate, "1m"), 50);
assert.equal(sliceWindow(rate, "1m").anchor, null);

const signedIndex = series(
  [
    ["2024-01-01", -1],
    ["2024-02-01", 0.5],
  ],
  { frequency: "monthly", unit: "index", category: "Credit" },
);
assert.equal(changeType(signedIndex), "points");
close(change(signedIndex, "max"), 1.5);

const market = series(
  [
    ["2020-01-01", 100],
    ["2020-02-01", 110],
    ["2020-03-01", 99],
    ["2020-04-01", 110],
  ],
  { frequency: "monthly", kind: "market", unit: "research index" },
);
close(change(market, "max"), 10);
close(
  annualizedCagr(
    series(
      [
        ["2020-12-31", 100],
        ["2022-12-31", 121],
      ],
      { frequency: "annual", kind: "market", unit: "research index" },
    ),
    "max",
  ),
  10,
  1e-8,
);

// There is deliberately no trailing-window fallback: a one-point selected
// window cannot produce a sample volatility estimate.
const sparse = series(
  [
    ["2020-01-01", 100],
    ["2024-01-01", 110],
  ],
  { frequency: "monthly", kind: "market", unit: "research index" },
);
assert.equal(sliceWindow(sparse, "1m").observations.length, 1);
assert.ok(Number.isNaN(logVolatility(sparse, "1m")));
const tooShortMonthly = series(
  [
    ["2024-07-01", 100],
    ["2024-08-01", 110],
  ],
  { frequency: "monthly", kind: "market", unit: "research index" },
);
assert.ok(Number.isNaN(change(tooShortMonthly, "1w")));
assert.deepEqual(rollingHorizonChanges(tooShortMonthly, "1w"), []);
assert.deepEqual(drawdownPath(tooShortMonthly, "1w"), []);

// Sample standard deviation of ln returns, annualized by monthly frequency.
const logReturns = [
  Math.log(110 / 100),
  Math.log(99 / 110),
  Math.log(110 / 99),
];
const avg =
  logReturns.reduce((sum, value) => sum + value, 0) / logReturns.length;
const sampleSd = Math.sqrt(
  logReturns.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    (logReturns.length - 1),
);
close(logVolatility(market, "max"), sampleSd * Math.sqrt(12) * 100, 1e-8);

const drawdown = series(
  [
    ["2020-01-01", 100],
    ["2020-02-01", 80],
    ["2020-03-01", 120],
    ["2020-04-01", 90],
  ],
  { frequency: "monthly", kind: "market", unit: "research index" },
);
assert.deepEqual(
  drawdownPath(drawdown, "max").map(
    ([, value]) => Math.round(value * 100) / 100,
  ),
  [0, -20, 0, -25],
);
close(maxDrawdown(drawdown, "max"), -25);
const signedDrawdown = series(
  [
    ["2020-01-01", -2],
    ["2020-02-01", -1],
    ["2020-03-01", -3],
  ],
  { frequency: "monthly", unit: "index", category: "Credit" },
);
assert.deepEqual(drawdownPath(signedDrawdown, "max"), []);
assert.ok(Number.isNaN(maxDrawdown(signedDrawdown, "max")));

// Full calendar years require all source months. The partial 2025 year is
// excluded; no synthetic annual anchor becomes a reported observation.
const monthlyFull = series(
  [
    ...Array.from({ length: 12 }, (_, index) => [
      `2024-${String(index + 1).padStart(2, "0")}-01`,
      100 + index,
    ]),
    ["2025-01-01", 112],
    ["2025-02-01", 113],
  ],
  { frequency: "monthly", unit: "index" },
);
assert.deepEqual(
  aggregateCalendar(monthlyFull, "year").map(({ period }) => period),
  ["2024"],
);
assert.equal(periodChanges(monthlyFull, "year", "max").length, 0);
assert.deepEqual(
  periodChanges(monthlyFull, "month", "max").at(-1).period,
  "2025-02",
);
const twoYears = series(
  [
    ...Array.from({ length: 24 }, (_, index) => {
      const date = new Date(Date.UTC(2024, index, 1));
      return [date.toISOString().slice(0, 10), 100 + index];
    }),
  ],
  { frequency: "monthly", unit: "index" },
);
assert.equal(periodChanges(twoYears, "month", "1y").length, 12);

// Missing calendar periods are not bridged when calculating correlations.
const left = series(
  [
    ["2020-01-01", 100],
    ["2020-02-01", 101],
    ["2020-04-01", 103],
    ["2020-05-01", 104],
    ["2020-06-01", 105],
  ],
  { frequency: "monthly", kind: "market", unit: "research index" },
);
const right = series(
  [
    ["2020-01-01", 200],
    ["2020-02-01", 202],
    ["2020-04-01", 206],
    ["2020-05-01", 208],
    ["2020-06-01", 210],
  ],
  { frequency: "monthly", kind: "market", unit: "research index" },
);
const aligned = alignedChanges(left, right, {
  period: "month",
  horizon: "max",
});
assert.equal(aligned.n, 3); // Jan->Feb, Apr->May, May->Jun; Feb->Apr is a gap.
close(correlation(left, right, { period: "month", horizon: "max" }), 1);
assert.equal(correlationDetails(left, right, { period: "month" }).n, 3);

// Mixed frequencies use the coarsest common complete calendar period.
const annual = series(
  [
    ["2020-12-31", 100],
    ["2021-12-31", 110],
    ["2022-12-31", 121],
    ["2023-12-31", 133.1],
  ],
  { frequency: "annual", kind: "market", unit: "research index" },
);
const monthly = series(
  [
    ...Array.from({ length: 36 }, (_, index) => {
      const date = new Date(Date.UTC(2021, index, 1));
      return [
        date.toISOString().slice(0, 10),
        100 + Math.floor(index / 12) * 10,
      ];
    }),
  ],
  { frequency: "monthly", kind: "market", unit: "research index" },
);
assert.equal(
  alignedChanges(annual, monthly, { period: "auto" }).period,
  "year",
);

// Percentiles are midranked and use changes, not the trending level itself.
const percentileSeries = series(
  [
    ["2020-01-01", 100],
    ["2020-02-01", 110],
    ["2020-03-01", 99],
    ["2020-04-01", 108],
    ["2020-05-01", 108],
  ],
  { frequency: "monthly", kind: "market", unit: "research index" },
);
close(percentileOfChanges(percentileSeries, { period: "native" }), 37.5);
close(median([1, 2, 8, 10]), 5);

// The rolling API is O(n) and returns only actual current observations.
const rolling = rollingHorizonChanges(
  series(
    [
      ["2020-01-01", 100],
      ["2021-01-01", 110],
      ["2022-01-01", 121],
      ["2023-01-01", 133.1],
    ],
    { frequency: "annual", kind: "market", unit: "research index" },
  ),
  "1y",
);
assert.equal(rolling.length, 3);
close(rolling.at(-1)[1], 10, 1e-8);
assert.equal(
  rollingHorizonChanges(
    series(
      [
        ["2020-12-31", 100],
        ["2022-12-31", 121],
        ["2023-12-31", 133.1],
      ],
      { frequency: "annual", kind: "market", unit: "research index" },
    ),
    "1y",
  ).length,
  1,
);

// Snapshot smoke checks: all native rate/index semantics and no accidental
// missing-data fallback on the real 92-series bundle.
const byId = new Map(snapshot.series.map((item) => [item.id, item]));
assert.equal(changeType(byId.get("FEDFUNDS")), "basis-points");
assert.equal(changeType(byId.get("NFCI")), "points");
assert.equal(changeType(byId.get("CPIAUCSL")), "percent");
assert.ok(Number.isFinite(change(byId.get("FEDFUNDS"), "1y")));
assert.ok(Number.isFinite(percentileOfChanges(byId.get("CPIAUCSL"))));
const cpi = byId.get("CPIAUCSL");
const cpiLatest = cpi.observations.at(-1);
const cpiPrior = cpi.observations.find(
  ([date]) =>
    date === `${Number(cpiLatest[0].slice(0, 4)) - 1}${cpiLatest[0].slice(4)}`,
);
assert.ok(cpiPrior, "CPI fixture must contain an exact one-year observation");
close(change(cpi, "1y"), (cpiLatest[1] / cpiPrior[1] - 1) * 100, 1e-12);
const gold = byId.get("HIST_GOLD");
const goldLatest = gold.observations.at(-1);
const goldPrior = gold.observations.at(-2);
close(change(gold, "1y"), (goldLatest[1] / goldPrior[1] - 1) * 100, 1e-12);

console.log(
  `Analytics verification passed: ${snapshot.series.length} snapshot series, fixture checks complete.`,
);
