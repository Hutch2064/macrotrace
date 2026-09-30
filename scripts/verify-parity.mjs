import assert from "node:assert/strict";
import snapshot from "../public/data/snapshot.json" with { type: "json" };
import { buildMacroReport } from "../src/macro-report.js";
import { transformSeries } from "../src/panel.js";

const byId = new Map(snapshot.series.map((series) => [series.id, series]));
const report = buildMacroReport(snapshot);
let checked = 0;
for (const finding of report.findings) {
  finding.series.forEach((series, index) => {
    const native = byId.get(series.id);
    const measure =
      finding.suffix.trim().startsWith("%") && series.unit.includes("YoY")
        ? "yoy"
        : "level";
    const panel = new Map(
      transformSeries(native, { measure }).map(({ date, value }) => [
        date,
        value,
      ]),
    );
    for (const [date, value] of finding.points[index]) {
      const comparison = panel.get(date);
      assert.ok(
        Number.isFinite(comparison),
        `${series.id} ${date}: panel counterpart exists`,
      );
      assert.ok(
        Math.abs(comparison - value) < 1e-8,
        `${series.id} ${date}: report/panel parity (${value} vs ${comparison})`,
      );
      checked++;
    }
  });
}
assert.equal(report.findings.length, 8);
assert.equal(report.headlines.length, 4);
console.log(
  `Verified ${checked.toLocaleString()} report points against the dashboard transforms across all eight findings.`,
);
