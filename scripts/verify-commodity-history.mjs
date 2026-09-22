import assert from "node:assert/strict";
import { fetchCommodityHistorySeries } from "./commodity-history.mjs";

const series = await fetchCommodityHistorySeries({ includeAnnual: true });
assert.ok(
  series.length >= 160,
  `Expected both workbooks, got ${series.length}.`,
);

const byId = new Map(series.map((entry) => [entry.id, entry]));
assert.equal(byId.size, series.length, "Commodity identifiers must be unique.");

for (const id of [
  "WB_CMD_INDEX_TOTAL_INDEX",
  "WB_CMD_INDEX_ENERGY",
  "WB_CMD_INDEX_AGRICULTURE",
  "WB_CMD_INDEX_METALS_AND_MINERALS",
  "WB_CMD_CRUDE_OIL_BRENT",
  "WB_CMD_MAIZE",
  "WB_CMD_COPPER",
  "WB_CMD_GOLD",
]) {
  assert.ok(byId.has(id), `Missing representative monthly series ${id}.`);
}

for (const entry of series) {
  assert.ok(
    entry.id && entry.name && entry.category && entry.unit && entry.frequency,
    `Incomplete metadata for ${entry.id ?? "unknown"}.`,
  );
  assert.equal(
    entry.source,
    "World Bank Commodity Price Data (The Pink Sheet)",
    `${entry.id}: source changed unexpectedly`,
  );
  assert.match(entry.sourceUrl, /CMO-Historical-Data-(Monthly|Annual)\.xlsx$/);
  assert.match(entry.sourceHash, /^[a-f0-9]{64}$/);
  assert.match(entry.sourceAsOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(entry.provenance, `${entry.id}: missing provenance.`);
  assert.equal(entry.provenance.sourceHash, entry.sourceHash);
  assert.equal(entry.provenance.sourceAsOf, entry.sourceAsOf);
  assert.match(
    entry.provenance.observationSemantics,
    /not end-of-period/,
    `${entry.id}: end-period semantics were not made explicit.`,
  );
  assert.match(
    entry.methodology,
    /not.*total.?return|not an investable total-return/i,
    `${entry.id}: methodology must not imply total returns.`,
  );
  assert.ok(
    entry.observations.length >= (entry.frequency === "monthly" ? 24 : 12),
    `${entry.id}: unexpectedly short history (${entry.observations.length}).`,
  );

  let previous = "";
  for (const [date, value] of entry.observations) {
    assert.match(date, /^\d{4}-\d{2}-01$/);
    assert.ok(date > previous, `${entry.id}: observations are not increasing.`);
    assert.equal(typeof value, "number");
    assert.ok(Number.isFinite(value), `${entry.id}: non-finite value.`);
    previous = date;
  }
}

for (const id of [
  "WB_CMD_INDEX_TOTAL_INDEX",
  "WB_CMD_INDEX_ENERGY",
  "WB_CMD_CRUDE_OIL_BRENT",
  "WB_CMD_MAIZE",
  "WB_CMD_COPPER",
  "WB_CMD_GOLD",
]) {
  assert.equal(byId.get(id).observations[0][0], "1960-01-01", `${id}: start`);
}

for (const id of [
  "WB_CMD_BARLEY",
  "WB_CMD_SORGHUM",
  "WB_CMD_SHRIMPS_MEXICAN",
]) {
  const entry = byId.get(id);
  assert.equal(
    entry.historyStatus,
    "archived",
    `${id}: missing archived status.`,
  );
  assert.match(entry.archiveReason, /source workbook has no nonmissing/i);
  assert.equal(entry.provenance.historyStatus, "archived");
  assert.equal(entry.provenance.archiveReason, entry.archiveReason);
  assert.ok(
    entry.observations.at(-1)[0] < entry.provenance.sourceLatestDate,
    `${id}: archived series unexpectedly reaches source latest date.`,
  );
}

const lagged = byId.get("WB_CMD_TOBACCO_US_IMPORT_U_V");
assert.equal(lagged.historyStatus, "active");
assert.equal(lagged.availabilityStatus, "source_lagged");
assert.match(lagged.availabilityNote, /not classified as archived/i);

for (const entry of series) {
  if (entry.observations.at(-1)[0] < entry.provenance.sourceLatestDate)
    assert.ok(
      entry.historyStatus === "archived" ||
        entry.availabilityStatus === "source_lagged",
      `${entry.id}: unexpected stale tail was not explicitly classified.`,
    );
}

const monthly = series.filter((entry) => entry.frequency === "monthly");
const annual = series.filter((entry) => entry.frequency === "annual");
assert.ok(
  monthly.length >= 80,
  `Expected broad monthly coverage, got ${monthly.length}.`,
);
assert.ok(
  annual.length >= 80,
  `Expected annual coverage, got ${annual.length}.`,
);
assert.ok(
  annual.some((entry) => entry.observations.at(-1)[0] === "2025-01-01"),
  "Annual workbook did not include the latest published calendar year.",
);

const monthlyEnd = byId.get("WB_CMD_INDEX_TOTAL_INDEX").observations.at(-1)[0];
const annualEnd = byId
  .get("WB_CMD_INDEX_TOTAL_INDEX_ANNUAL")
  .observations.at(-1)[0];
const ageDays = (date) =>
  (Date.now() - Date.parse(`${date}T00:00:00Z`)) / (24 * 60 * 60 * 1000);
assert.ok(
  ageDays(monthlyEnd) >= 0 && ageDays(monthlyEnd) < 120,
  `Monthly Pink Sheet data is stale: ${monthlyEnd}.`,
);
assert.ok(
  ageDays(annualEnd) >= 0 && ageDays(annualEnd) < 800,
  `Annual Pink Sheet data is stale: ${annualEnd}.`,
);
console.log(
  `Verified ${series.length} World Bank Pink Sheet series: ${monthly.length} monthly through ${monthlyEnd}, ${annual.length} annual through ${annualEnd}.`,
);
