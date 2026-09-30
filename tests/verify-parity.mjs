import assert from "node:assert/strict";
import snapshot from "../public/data/snapshot.json" with { type: "json" };
import { buildMacroReport } from "../src/macro-report.js";
import { transformSeries } from "../src/panel.js";

const byId = new Map(snapshot.series.map((series) => [series.id, series]));
const report = buildMacroReport(snapshot);
let checked = 0;

for (const finding of report.findings) {
  assert.ok(
    ["level", "yoy", "change"].includes(finding.measure),
    `${finding.id}: explicit dashboard measure`,
  );
  finding.series.forEach((series, index) => {
    const native = byId.get(series.id);
    assert.ok(native, `${series.id}: source row exists`);
    const panel = new Map(
      transformSeries(native, { measure: finding.measure })
        .filter(({ value }) => Number.isFinite(value))
        .map(({ date, value }) => [date, value]),
    );
    for (const [date, value] of finding.points[index]) {
      const counterpart = panel.get(date);
      assert.ok(
        Number.isFinite(counterpart),
        `${series.id} ${date}: dashboard counterpart exists`,
      );
      assert.ok(
        Math.abs(counterpart - value) < 1e-8,
        `${series.id} ${date}: report/dashboard parity (${value} vs ${counterpart})`,
      );
      checked += 1;
    }
    const panelUnit = transformSeries(native, { measure: finding.measure })[0]
      ?.unit;
    assert.equal(
      series.unit,
      panelUnit,
      `${series.id}: transformed unit parity`,
    );
  });
}

assert.ok(
  report.findings.length >= 8,
  "dynamic report keeps at least eight findings",
);
assert.ok(
  report.findings.length <= 10,
  "dynamic report target remains bounded",
);
assert.equal(report.headlines.length, 4, "four existing US headlines");
console.log(
  `Verified ${checked.toLocaleString()} report points against dashboard transforms across ${report.findings.length} dynamic findings.`,
);
