import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  spliceHistory,
  completedPeriodCloses,
  spliceSpecs,
} from "./spliced-history.mjs";
import { shillerMonth } from "./shiller-history.mjs";
import { externalSeries } from "./source-inventory.mjs";

assert.equal(
  shillerMonth(1871.1),
  "1871-10-31",
  "Excel decimal .10 means October, not January",
);
assert.equal(shillerMonth(1900.02), "1900-02-28");
assert.equal(shillerMonth(2000.02), "2000-02-29");
assert.equal(shillerMonth("NA"), null);
assert.deepEqual(
  completedPeriodCloses(
    [
      ["2020-01-30", 2],
      ["2020-01-31", 3],
      ["2020-02-20", 4],
    ],
    "monthly",
    "2020-02-21",
  ),
  [["2020-01-31", 3]],
);

const snapshot = JSON.parse(
  await readFile("public/data/snapshot.json", "utf8"),
);
const byId = new Map(snapshot.series.map((series) => [series.id, series]));
const close = (actual, expected, message) =>
  assert.ok(
    Math.abs(actual - expected) <= Math.max(1e-10, Math.abs(expected) * 1e-10),
    message,
  );
for (const [ticker, proxyId, label, caveat] of spliceSpecs) {
  const proxy = byId.get(proxyId),
    security = byId.get(ticker),
    output = byId.get(`${ticker}_SIM`);
  assert.ok(output, `Missing ${ticker} extension`);
  assert.deepEqual(
    spliceHistory(proxy, security, snapshot.generatedAt, label, caveat),
    output,
    `${ticker}: deterministic complete reconstruction`,
  );
  assert.equal(output.historyType, "proxy_splice");
  assert.ok(output.name.includes("SIM"));
  assert.ok(output.observations[0][0] < security.observations[0][0]);
  assert.equal(output.observations[0][1], 100);
  const anchor = output.splice.anchorDate;
  const actual = new Map(
    completedPeriodCloses(
      security.observations,
      proxy.frequency,
      snapshot.generatedAt,
    ),
  );
  const original = new Map(proxy.observations);
  for (let i = 1; i < output.observations.length; i++) {
    const [date, value] = output.observations[i],
      [prior, previous] = output.observations[i - 1];
    const reference = date <= anchor ? original : actual;
    close(
      value / previous,
      reference.get(date) / reference.get(prior),
      `${ticker}: return parity at ${date}`,
    );
    assert.ok(date > prior && value > 0);
  }
  assert.ok(
    output.splice.overlap.pairedReturns >=
      (proxy.frequency === "annual" ? 10 : 36),
  );
  assert.ok(
    output.splice.overlap.correlation >= -1 &&
      output.splice.overlap.correlation <= 1,
  );
  assert.throws(
    () =>
      spliceHistory(
        proxy,
        { ...security, valueType: "unadjusted_close" },
        snapshot.generatedAt,
      ),
    /adjusted-close/,
  );
  const skippedPeriod = completedPeriodCloses(
    security.observations,
    proxy.frequency,
    snapshot.generatedAt,
  )[3][0].slice(0, proxy.frequency === "annual" ? 4 : 7);
  assert.throws(
    () =>
      spliceHistory(
        proxy,
        {
          ...security,
          observations: security.observations.filter(
            ([date]) => !date.startsWith(skippedPeriod),
          ),
        },
        snapshot.generatedAt,
      ),
    /Missing or duplicated/,
  );
}
assert.equal(byId.get("SHILLER_PRICE").observations[0][0], "1871-01-31");
assert.equal(byId.get("SHILLER_HOME_REAL").observations[0][0], "1890-12-31");
const real = new Map(byId.get("SHILLER_REAL_TR").observations),
  nominal = byId.get("SHILLER_TR").observations,
  cpi = new Map(byId.get("SHILLER_CPI").observations);
for (const [date, value] of nominal)
  close(
    value / nominal[0][1],
    ((real.get(date) / real.get(nominal[0][0])) * cpi.get(date)) /
      cpi.get(nominal[0][0]),
    `Shiller real/nominal parity ${date}`,
  );
const inventory = await readFile("public/data/source-inventory.md", "utf8");
for (const series of externalSeries(snapshot))
  assert.ok(
    inventory.includes(`[${series.id}]`) &&
      inventory.includes(series.observations[0][0]) &&
      inventory.includes(series.observations.at(-1)[0]),
    `Inventory coverage ${series.id}`,
  );
console.log(
  `Verified ${spliceSpecs.length} explicit proxy joins, every pre/post-splice return, Shiller dates/deflation, and complete non-Yahoo inventory.`,
);
