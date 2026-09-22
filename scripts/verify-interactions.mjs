import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cumulativeView, latestChange } from "../src/series-view.js";
import { change, changeType, sliceWindow } from "../src/analytics.js";
import { horizons } from "../src/horizons.js";
import { tickerReadings } from "../src/ticker.js";

const snapshot = JSON.parse(
  await readFile("public/data/snapshot.json", "utf8"),
);
for (const series of snapshot.series) {
  for (const [horizon] of horizons) {
    const view = cumulativeView(series, horizon);
    const expected = change(series, horizon);
    assert.equal(
      view.points.length > 0,
      Number.isFinite(expected),
      `${series.id}/${horizon} coverage`,
    );
    if (view.points.length) {
      assert.ok(
        Math.abs(view.points.at(-1)[1] - expected) < 1e-7,
        `${series.id}/${horizon} cumulative endpoint`,
      );
      assert.equal(view.points[0][1], 0);
      if (changeType(series) === "percent") {
        const log = cumulativeView(series, horizon, true);
        assert.ok(
          Math.abs(log.valueTransform(log.points.at(-1)[1]) - expected) < 1e-7,
        );
      }
    }
    assert.equal(
      sliceWindow(series, horizon),
      sliceWindow(series, horizon),
      "Immutable window cache reused",
    );
  }
  const latest = latestChange(series);
  assert.equal(latest.date, series.observations.at(-1)[0]);
  if (series.frequency !== "daily") assert.notEqual(latest.label, "1D");
}
const spy = snapshot.series.find(({ id }) => id === "SPY");
const [before, after] = spy.observations.slice(-2);
assert.ok(
  Math.abs(latestChange(spy).value - (after[1] / before[1] - 1) * 100) < 1e-10,
);
assert.deepEqual(
  cumulativeView(spy, "12m").points,
  cumulativeView(spy, "365").points,
);
for (const [horizon] of horizons) {
  const readings = tickerReadings(snapshot, horizon);
  assert.equal(readings.length, snapshot.series.length);
  assert.equal(readings, tickerReadings(snapshot, horizon));
  assert.ok(readings.every((row) => !row.value.includes("NaN")));
}
const html = await readFile("dashboard.html", "utf8");
assert.ok(!html.includes("chart-kicker"));
console.log(
  `Verified ${snapshot.series.length} series across ${horizons.length} horizons, cumulative/log parity, native-period changes, banner caching, and clean chart headings.`,
);
