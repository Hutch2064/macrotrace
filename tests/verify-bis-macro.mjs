import assert from "node:assert/strict";
import {
  csvRows,
  bisDate,
  parseBisCsv,
  bisDatasets,
  fetchBisMacro,
} from "../scripts/bis-macro.mjs";

assert.deepEqual(csvRows('a,b\r\n"x,y","a""b\nc"\r\n'), [
  ["a", "b"],
  ["x,y", 'a"b\nc'],
]);
assert.equal(bisDate("2025-Q4", "Q"), "2025-10-01");
assert.equal(bisDate("2025", "A"), "2025-12-31");
assert.equal(bisDate("2025-03", "M"), "2025-03-01");
assert.equal(bisDate("2025-03", "D"), null);
const periods = Array.from(
  { length: 26 },
  (_, i) => `2024-${String(i + 1).padStart(2, "0")}-01`,
)
  .slice(0, 12)
  .concat(
    Array.from(
      { length: 12 },
      (_, i) => `2025-${String(i + 1).padStart(2, "0")}-01`,
    ),
  );
const countries = [{ id: "USA", iso2Code: "US", name: "United States" }];
const csv = `FREQ,REF_AREA,Reference area,COMPILATION,Series,${periods.join(",")},2027-01-01\nD,US,United States,"Published target; not an effective rate",D:US,${periods.map((_, i) => (i === 0 ? "0" : "2")).join(",")},9\n`;
const parsed = parseBisCsv(csv, bisDatasets[0], {
  countries,
  checkedAt: "2026-09-30T00:00:00Z",
  sourceHash: "fixture",
});
assert.equal(parsed[0].geography, "US");
assert.equal(parsed[0].countryCode, "USA");
assert.equal(parsed[0].unit, "%");
assert.equal(parsed[0].observations.length, 24);
assert.equal(parsed[0].observations[0][1], 0);
assert.equal(parsed[0].sourceSeriesKey, "D:US");
assert.equal(parsed[0].changeType, "basis-points");
assert.throws(
  () => parseBisCsv(csv, bisDatasets[0], { countries: [] }),
  /no usable/,
);
const previous = bisDatasets.map(([code]) => ({
  ...parsed[0],
  id: `BIS_${code}_TEST`,
  checkedAt: "2025-01-01T00:00:00Z",
}));
const retained = await fetchBisMacro({
  previousSeries: previous,
  countries,
  fetchImpl: async () => new Response("", { status: 503 }),
});
assert.equal(retained.length, bisDatasets.length);
assert.ok(
  retained.every(
    (entry) =>
      entry.checkedAt === "2025-01-01T00:00:00Z" &&
      entry.refreshStatus === "upstream-unavailable",
  ),
);
console.log(
  "Verified BIS CSV quoting, native dates, zero preservation, source identity, geography, future exclusion and topic-isolated retained cache.",
);
