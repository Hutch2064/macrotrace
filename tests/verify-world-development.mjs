import assert from "node:assert/strict";
import {
  countryRoster,
  fetchPages,
  observationsFor,
} from "../scripts/world-development.mjs";

// Country metadata is source-derived.  Aggregation rows are deliberately not
// economies, while zero is a valid coordinate (and must not become null).
const roster = countryRoster([
  {
    id: "AAA",
    name: "Alpha",
    region: { id: "SSF", value: " Sub-Saharan Africa " },
    incomeLevel: { value: "Lower middle income" },
    longitude: "0",
    latitude: "0",
  },
  {
    id: "BBB",
    name: "Beta",
    region: { id: "ECS", value: " Europe & Central Asia " },
    incomeLevel: { value: "High income" },
    longitude: "",
    latitude: " ",
  },
  {
    id: "CCC",
    name: "Gamma",
    region: { id: "LAC", value: " Latin America & Caribbean " },
    incomeLevel: { value: "Upper middle income" },
    longitude: "not-a-coordinate",
    latitude: "NaN",
  },
  {
    id: "AGG",
    name: "An aggregate",
    region: { id: "NA", value: "Aggregates" },
    incomeLevel: { value: "Aggregates" },
    longitude: "10",
    latitude: "20",
  },
]);
assert.deepEqual(
  roster.map(({ id }) => id),
  ["AAA", "BBB", "CCC"],
  "World Bank aggregate rows are excluded from the economy roster",
);
assert.deepEqual(
  roster.find(({ id }) => id === "AAA"),
  {
    id: "AAA",
    name: "Alpha",
    sourceName: "Alpha",
    region: "Sub-Saharan Africa",
    incomeLevel: "Lower middle income",
    lon: 0,
    lat: 0,
  },
  "zero coordinates are retained as zero",
);
assert.equal(roster.find(({ id }) => id === "BBB").lon, null);
assert.equal(roster.find(({ id }) => id === "BBB").lat, null);
assert.equal(roster.find(({ id }) => id === "CCC").lon, null);
assert.equal(roster.find(({ id }) => id === "CCC").lat, null);

const inflationIndicator = "FP.CPI.TOTL.ZG";
const rows = [
  // Deliberately reversed input: output must be chronological.
  {
    countryiso3code: "AAA",
    indicator: { id: inflationIndicator },
    date: "2022",
    value: 500,
  },
  {
    countryiso3code: "AAA",
    indicator: { id: inflationIndicator },
    date: "2020",
    value: 0,
  },
  {
    countryiso3code: "AAA",
    indicator: { id: inflationIndicator },
    date: "2021",
    value: -250,
  },
  // Forecast, null, non-finite, malformed, and future rows are not source
  // observations for a completed-year snapshot.
  {
    countryiso3code: "AAA",
    indicator: { id: inflationIndicator },
    date: "2023",
    value: 12,
    obs_status: "F",
  },
  {
    countryiso3code: "AAA",
    indicator: { id: inflationIndicator },
    date: "2024",
    value: null,
  },
  {
    countryiso3code: "AAA",
    indicator: { id: inflationIndicator },
    date: "2025",
    value: Number.NaN,
  },
  {
    countryiso3code: "AAA",
    indicator: { id: inflationIndicator },
    date: "2026",
    value: 14,
  },
  {
    countryiso3code: "AAA",
    indicator: { id: inflationIndicator },
    date: "20x2",
    value: 15,
  },
  {
    countryiso3code: "BBB",
    indicator: { id: "TEST" },
    date: "2022",
    value: 99,
  },
  {
    countryiso3code: "AAA",
    indicator: { id: "OTHER" },
    date: "2022",
    value: 99,
  },
];
assert.deepEqual(
  observationsFor(rows, "AAA", inflationIndicator, 2025),
  [
    ["2020-12-31", 0],
    ["2021-12-31", -250],
    ["2022-12-31", 500],
  ],
  "only finite, completed, non-forecast rows are retained and sorted",
);

assert.throws(
  () =>
    observationsFor(
      [
        {
          countryiso3code: "AAA",
          indicator: { id: inflationIndicator },
          date: "2022",
          value: 1,
        },
        {
          countryiso3code: "AAA",
          indicator: { id: inflationIndicator },
          date: "2022",
          value: 2,
        },
      ],
      "AAA",
      inflationIndicator,
      2025,
    ),
  /Duplicate World Bank observation/,
  "duplicate source years fail closed",
);

function response(metadata, values) {
  return new Response(JSON.stringify([metadata, values]), {
    headers: { "content-type": "application/json" },
  });
}

const pageBodies = new Map([
  [
    1,
    response({ page: "1", pages: "2", total: "3", lastupdated: "2026-09-30" }, [
      { id: "one" },
      { id: "two" },
    ]),
  ],
  [
    2,
    response({ page: "2", pages: "2", total: "3", lastupdated: "2026-09-30" }, [
      { id: "three" },
    ]),
  ],
]);
const paged = await fetchPages(
  "https://example.test/data?format=json",
  async (url) => pageBodies.get(Number(new URL(url).searchParams.get("page"))),
);
assert.deepEqual(paged.rows, [{ id: "one" }, { id: "two" }, { id: "three" }]);
assert.equal(paged.metadata.total, "3");
assert.match(paged.sourceHash, /^[a-f0-9]{64}$/);

const mixedRelease = new Map([
  [
    1,
    response({ page: 1, pages: 2, total: 2, lastupdated: "2026-09-30" }, [
      { id: "one" },
    ]),
  ],
  [
    2,
    response({ page: 2, pages: 2, total: 2, lastupdated: "2026-10-01" }, [
      { id: "two" },
    ]),
  ],
]);
await assert.rejects(
  fetchPages("https://example.test/mixed", async (url) =>
    mixedRelease.get(Number(new URL(url).searchParams.get("page"))),
  ),
  /mixed release/i,
  "pagination refuses a changed provider release",
);

await assert.rejects(
  fetchPages("https://example.test/short", async () =>
    response({ page: 1, pages: 1, total: 2, lastupdated: "2026-09-30" }, [
      { id: "one" },
    ]),
  ),
  /incomplete page coverage/i,
  "pagination refuses a total/row-count mismatch",
);

console.log(
  "Verified World Bank roster filtering, coordinate nullability, source-row filtering, duplicate protection, and paginated release integrity with mocked responses.",
);
