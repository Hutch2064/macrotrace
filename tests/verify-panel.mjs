import assert from "node:assert/strict";
import { readSnapshot } from "../scripts/snapshot.mjs";
const snapshot = readSnapshot();
import { filterSeries, transformSeries } from "../src/panel.js";

const close = (actual, expected, tolerance = 1e-10) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`,
  );

const rate = {
  id: "RATE",
  name: "Policy Rate",
  category: "Rates",
  geography: "United States",
  frequency: "monthly",
  unit: "%",
  sourceUrl: "https://example.test/rate",
  observations: [
    ["2023-01-01", 4],
    ["2023-02-01", null],
    ["2024-01-01", 5],
    ["2024-02-01", 6],
  ],
};
const positive = {
  id: "PRICE",
  name: "Price Index",
  category: "Prices",
  geography: "United States",
  frequency: "monthly",
  unit: "index",
  observations: [
    ["2023-01-01", 100],
    ["2023-03-01", 110],
    ["2024-01-01", 110],
    ["2024-02-01", 120],
    ["2024-03-01", 121],
  ],
};
const signed = {
  id: "NFCI",
  name: "National Financial Conditions Index",
  category: "Credit",
  geography: "United States",
  frequency: "weekly",
  unit: "index",
  observations: [
    ["2023-01-05", -1],
    ["2024-01-05", 1],
    ["2024-01-12", 2],
  ],
};
const zeroBaseline = {
  id: "COUNT",
  name: "Count",
  category: "Activity",
  frequency: "annual",
  unit: "count",
  observations: [
    ["2023-01-01", 0],
    ["2024-01-01", 10],
  ],
};
const commodityWithHistoricalNegative = {
  id: "DCOILWTICO",
  name: "WTI Crude Oil",
  category: "Commodities",
  frequency: "daily",
  unit: "$/barrel",
  observations: [
    ["2019-01-01", 50],
    ["2020-01-01", 60],
    ["2020-01-02", -36],
    ["2021-01-01", 70],
  ],
};

// Metadata filters never need to inspect observations.
const metadataOnly = {
  id: "META",
  name: "Metadata only",
  category: "Rates",
  geography: "Canada",
  frequency: "monthly",
};
Object.defineProperty(metadataOnly, "observations", {
  get() {
    throw new Error("filterSeries must not read observations");
  },
});
assert.deepEqual(
  filterSeries([metadataOnly], {
    category: "rates",
    geography: "canada",
    frequency: "monthly",
    search: "meta canada",
  }),
  [metadataOnly],
);
assert.equal(
  filterSeries([rate, positive], {
    category: "all",
    geography: "all",
    frequency: "all",
    search: "price",
  }).length,
  1,
);

// Rates are differences in percentage points, not relative percent returns.
const rateYoY = transformSeries(rate, {
  measure: "yoy",
  start: "2024-01-01",
  end: "2024-02-01",
});
assert.deepEqual(rateYoY, [
  { date: "2024-01-01", raw: 5, value: 1, unit: "percentage points" },
  { date: "2024-02-01", raw: 6, value: null, unit: "percentage points" },
]);

// Positive levels use same-native-period matching. Missing February 2023 is
// unavailable; March compares to March and remains a real source date.
const priceYoY = transformSeries(positive, {
  measure: "yoy",
  start: "2024-01-01",
  end: "2024-03-01",
});

// Native non-percent rates and signed dollar quantities keep their units.
for (const [name, unit] of [
  ["Crude Birth Rate", "births per 1,000 people"],
  ["Total Fertility Rate", "births per woman"],
  ["Fiscal Deficit", "millions"],
  ["Credit Spread", "basis points"],
]) {
  const series = { ...positive, name, unit, changeType: "points" };
  const point = transformSeries(series, { measure: "yoy" })[2];
  assert.equal(point.value, 10);
  assert.equal(point.unit, unit);
}
const exchangeRate = transformSeries(
  { ...positive, name: "Exchange Rate", unit: "USD per EUR" },
  { measure: "yoy" },
)[2];
assert.equal(exchangeRate.unit, "%");
close(exchangeRate.value, 10);
assert.deepEqual(priceYoY, [
  { date: "2024-01-01", raw: 110, value: 10, unit: "%" },
  { date: "2024-02-01", raw: 120, value: null, unit: "%" },
  { date: "2024-03-01", raw: 121, value: 10, unit: "%" },
]);

// Signed diffusion indexes use native point changes even when crossing zero.
const signedYoY = transformSeries(signed, {
  measure: "yoy",
  start: "2024-01-01",
  end: "2024-01-12",
});
assert.deepEqual(signedYoY[0], {
  date: "2024-01-05",
  raw: 1,
  value: 2,
  unit: "index points",
});
assert.deepEqual(
  transformSeries(signed, { measure: "change" }).map(({ date, value }) => [
    date,
    value,
  ]),
  [
    ["2023-01-05", null],
    ["2024-01-05", 2],
    ["2024-01-12", 1],
  ],
);

// Daily/weekly YoY baselines are on or before the prior calendar boundary,
// never a future source point; a gap larger than seven days is unavailable.
const weeklyGap = {
  id: "WEEKLY",
  name: "Weekly level",
  category: "Activity",
  frequency: "weekly",
  unit: "index",
  observations: [
    ["2023-01-06", 100],
    ["2023-01-13", 110],
    ["2024-01-12", 121],
    ["2024-01-19", 130],
  ],
};
const weeklyGapRows = transformSeries(weeklyGap, {
  measure: "yoy",
  start: "2024-01-12",
});
close(weeklyGapRows[0].value, 21);
close(weeklyGapRows[1].value, (130 / 110 - 1) * 100);
const weeklyFutureOnly = {
  ...weeklyGap,
  observations: [
    ["2023-01-20", 100],
    ["2024-01-19", 110],
  ],
};
assert.equal(
  transformSeries(weeklyFutureOnly, { measure: "yoy" }).at(-1).value,
  null,
);

// A zero baseline makes a relative comparison unavailable; it is not a
// license to switch a positive count series to point semantics.
assert.deepEqual(transformSeries(zeroBaseline, { measure: "yoy" })[1], {
  date: "2024-01-01",
  raw: 10,
  value: null,
  unit: "%",
});
// One exceptional negative commodity price does not turn the price history
// into an index-point series; it remains relative with a strict baseline.
const commodityRows = transformSeries(commodityWithHistoricalNegative, {
  measure: "yoy",
});
assert.equal(commodityRows.at(-1).unit, "%");
close(commodityRows.at(-1).value, (70 / 60 - 1) * 100);

// Range boundaries are inclusive and only actual source dates are returned.
assert.deepEqual(
  transformSeries(positive, {
    measure: "level",
    start: "2024-02-01",
    end: "2024-02-15",
  }).map(({ date }) => date),
  ["2024-02-01"],
);

// A long daily history remains bounded by one indexed lookup plus a binary
// search per row rather than rescanning/sorting the entire history per point.
const dailyHistory = {
  id: "LONG-DAILY",
  name: "Long daily level",
  category: "Markets",
  frequency: "daily",
  unit: "index",
  observations: Array.from({ length: 12_000 }, (_, index) => {
    const date = new Date(Date.UTC(1990, 0, 1 + index));
    return [date.toISOString().slice(0, 10), 100 + index];
  }),
};
const dailyStart = performance.now();
const dailyRows = transformSeries(dailyHistory, { measure: "yoy" });
const dailyElapsed = performance.now() - dailyStart;
assert.equal(dailyRows.length, dailyHistory.observations.length);
assert.ok(
  dailyRows
    .slice(400)
    .every(({ date, value }) =>
      date.endsWith("-02-29") ? value === null : Number.isFinite(value),
    ),
  "daily calendar-year comparisons exclude unmatched leap days",
);
assert.ok(
  dailyElapsed < 1000,
  `12,000 daily YoY rows took ${dailyElapsed.toFixed(1)} ms`,
);

// Snapshot smoke checks use the shipped data and prove the helper preserves
// native dates/frequency without requiring any network or generated history.
assert.ok(snapshot.series.length >= 40);
const snapshotSeries = snapshot.series.find(({ id }) => id === "UNRATE");
assert.ok(snapshotSeries);
assert.equal(snapshotSeries.frequency, "monthly");
const snapshotLevel = transformSeries(snapshotSeries, {
  measure: "level",
  start: snapshotSeries.observations[0][0],
  end: snapshotSeries.observations[2][0],
});
assert.deepEqual(
  snapshotLevel.map(({ date }) => date),
  snapshotSeries.observations.slice(0, 3).map(([date]) => date),
);
assert.deepEqual(snapshotLevel.at(-1), {
  date: snapshotSeries.observations[2][0],
  raw: snapshotSeries.observations[2][1],
  value: snapshotSeries.observations[2][1],
  unit: snapshotSeries.unit,
});
assert.equal(
  filterSeries(snapshot.series, {
    category: "all",
    geography: "all",
    frequency: "all",
    search: "",
  }).length,
  snapshot.series.length,
);

console.log(
  `Verified panel transforms, null-preserving rows, metadata filters, calendar boundaries, long-history performance and ${snapshot.series.length} snapshot series.`,
);
