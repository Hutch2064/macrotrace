import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  JST_PROVIDER,
  NYFED_GSCPI_DOWNLOAD_URL,
  RESEARCH_MACRO_VARIABLES,
  discoverMacrohistoryWorkbookUrl,
  fetchResearchMacro,
  parseGscpiRows,
  parseResearchMacroRows,
} from "../scripts/research-macro.mjs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const fixtureRows = [
  {
    year: 2019,
    country: "USA",
    iso: "USA",
    pop: 328_000_000,
    gdp: 21_000,
    ca: -420,
    cpi: 112,
    money: 17_000,
    stir: 2.1,
    tloans: 11_000,
    hpnom: 101,
    wage: 99,
    unemp: 3.7,
    debtgdp: 105,
    lev: 11.2,
    ltd: 80,
    noncore: 22,
    eq_tr: 1.1,
  },
  {
    year: 2020,
    country: "USA",
    iso: "USA",
    pop: 329_000_000,
    gdp: 20_000,
    ca: -600,
    cpi: 114,
    money: 19_000,
    stir: 1.5,
    tloans: 11_500,
    hpnom: 104,
    wage: 101,
    unemp: 8.1,
    debtgdp: 127,
    lev: 11.3,
    ltd: 82,
    noncore: 23,
    eq_tr: 1.2,
  },
  {
    year: 2027,
    country: "USA",
    iso: "USA",
    pop: 340_000_000,
    gdp: 30_000,
    cpi: 130,
  },
  {
    year: 2020,
    country: "UK",
    iso: "GBR",
    pop: 67_000_000,
    gdp: 2_000,
    cpi: 120,
    money: 2_400,
    stir: 0.2,
    hpnom: 115,
    unemp: 4.5,
    wage: 111,
    lev: 7.4,
  },
];

const parsed = parseResearchMacroRows(fixtureRows, {
  sourceHash: "fixture-hash",
  sourceDownloadUrl: "https://example.test/current.xlsx",
  checkedAt: "2026-09-30T00:00:00.000Z",
  lastYear: 2025,
});

assert.ok(
  parsed.length > 20,
  "multiple whitelisted macro indicators are retained",
);
assert.equal(
  parsed.every((series) => series.dataset === "research-macro"),
  true,
);
assert.equal(
  parsed.some((series) => series.id.includes("EQ_TR")),
  false,
);
assert.equal(
  parsed.some((series) => series.id.includes("RISKY_TR")),
  false,
);
assert.equal(
  parsed.find((series) => series.id === "JST_USA_GDP").geography,
  "US",
);
assert.equal(
  parsed.find((series) => series.id === "JST_USA_GDP").country,
  "United States",
);
assert.equal(
  parsed.find((series) => series.id === "JST_GBR_GDP").geography,
  "United Kingdom",
);
assert.deepEqual(
  parsed.find((series) => series.id === "JST_USA_GDP").observations,
  [
    ["2019-12-31", 21_000],
    ["2020-12-31", 20_000],
  ],
);
assert.equal(
  parsed.find((series) => series.id === "JST_USA_GDP").historyStatus,
  "archived",
);
assert.equal(
  parsed.find((series) => series.id === "JST_USA_GDP").sourceAsOf,
  "2020-12-31",
);
assert.match(
  parsed.find((series) => series.id === "JST_USA_GDP").rightsNote,
  /Jordà/,
);
assert.match(
  parsed.find((series) => series.id === "JST_USA_GDP").rightsNote,
  /CC BY-NC-SA 4.0/,
);
assert.match(
  parsed.find((series) => series.id === "JST_USA_LEV").methodology,
  /Jordà/,
);
assert.equal(
  parsed.find((series) => series.id === "JST_USA_MONEY").observations.length,
  2,
);
assert.equal(
  parsed.find((series) => series.id === "JST_USA_POP").unit,
  "thousands of people",
);
assert.equal(
  parsed.find((series) => series.id === "JST_USA_GDP").unit,
  "billions USD",
);
assert.equal(
  parsed.find((series) => series.id === "JST_USA_CA").changeType,
  "points",
);
assert.equal(
  parsed.find((series) => series.id === "JST_USA_CA").semantic,
  "point",
);
assert.equal(parsed.find((series) => series.id === "JST_USA_CA").signed, true);
assert.match(
  parsed.find((series) => series.id === "JST_USA_GDP").sourceDefinition,
  /billions USD/,
);

assert.throws(
  () =>
    parseResearchMacroRows([
      { year: 2020, iso: "ZZZ", country: "Unknown", gdp: 1 },
    ]),
  /canonical roster/,
);
assert.throws(
  () =>
    parseResearchMacroRows([
      { year: 2020, iso: "USA", gdp: 1 },
      { year: 2020, iso: "USA", gdp: 2 },
    ]),
  /Duplicate JST annual observation/,
);

const discovered = discoverMacrohistoryWorkbookUrl(
  '<a href="/app/download/123/JSTdatasetR6.xlsx?t=latest&amp;x=1">Excel</a>',
);
assert.equal(
  discovered,
  "https://www.macrohistory.net/app/download/123/JSTdatasetR6.xlsx?t=latest&x=1",
);
assert.throws(
  () =>
    discoverMacrohistoryWorkbookUrl(
      '<a href="https://evil.test/JSTdatasetR6.xlsx">x</a>',
    ),
  /official source hosts/,
);

const gscpi = parseGscpiRows(
  [
    { Date: "31-Jan-2020", GSCPI: "-0.25" },
    { Date: "29-Feb-2020", GSCPI: 0.3 },
    { Date: "31-Dec-2030", GSCPI: 4 },
    { Date: "31-Mar-2020", GSCPI: "" },
  ],
  {
    sourceHash: "gscpi-fixture",
    checkedAt: "2026-09-30T00:00:00.000Z",
    lastMonth: "2020-12-31",
  },
);
assert.equal(gscpi.id, "NYFED_GSCPI");
assert.equal(gscpi.dataset, "research-macro");
assert.equal(gscpi.geography, "Global");
assert.equal(gscpi.country, null);
assert.deepEqual(gscpi.observations, [
  ["2020-01-31", -0.25],
  ["2020-02-29", 0.3],
]);

const jstWorkbook = XLSX.write(
  {
    SheetNames: ["Sheet1"],
    Sheets: { Sheet1: XLSX.utils.json_to_sheet(fixtureRows) },
  },
  { type: "buffer", bookType: "xlsx" },
);
const gscpiWorkbook = XLSX.write(
  {
    SheetNames: ["GSCPI Monthly Data"],
    Sheets: {
      "GSCPI Monthly Data": XLSX.utils.json_to_sheet([
        { Date: "31-Jan-2020", GSCPI: -0.2 },
        { Date: "29-Feb-2020", GSCPI: 0.1 },
      ]),
    },
  },
  { type: "buffer", bookType: "xlsx" },
);
const page =
  '<a href="/app/download/123/JSTdatasetR6.xlsx?t=current">Excel</a>';
const successFetch = async (url) => {
  if (url === "https://www.macrohistory.net/database/")
    return new Response(page);
  if (url.includes("JSTdatasetR6.xlsx")) return new Response(jstWorkbook);
  if (url === NYFED_GSCPI_DOWNLOAD_URL) return new Response(gscpiWorkbook);
  throw new Error(`unexpected URL ${url}`);
};
const fetched = await fetchResearchMacro({
  fetchImpl: successFetch,
  checkedAt: "2026-09-30T00:00:00.000Z",
  lastYear: 2025,
  lastMonth: "2020-12-31",
});
assert.equal(
  fetched.some((series) => series.id === "JST_USA_GDP"),
  true,
);
assert.equal(
  fetched.some((series) => series.id === "NYFED_GSCPI"),
  true,
);
assert.equal(
  fetched.every((series) => series.dataset === "research-macro"),
  true,
);

const cachedJst = fetched.find((series) => series.id === "JST_USA_GDP");
const cachedGscpi = fetched.find((series) => series.id === "NYFED_GSCPI");
const retainedJst = await fetchResearchMacro({
  previousSeries: [cachedJst, cachedGscpi],
  fetchImpl: async () => {
    throw new Error("offline");
  },
  checkedAt: "2026-10-01T00:00:00.000Z",
});
assert.equal(retainedJst.length, 2);
assert.equal(
  retainedJst.find((series) => series.id === "JST_USA_GDP").refreshStatus,
  "upstream-unavailable",
);
assert.equal(
  retainedJst.find((series) => series.id === "JST_USA_GDP").checkedAt,
  cachedJst.checkedAt,
);
assert.equal(
  retainedJst.find((series) => series.id === "NYFED_GSCPI").refreshStatus,
  "upstream-unavailable",
);
assert.equal(
  retainedJst.find((series) => series.id === "NYFED_GSCPI").checkedAt,
  cachedGscpi.checkedAt,
);

const gscpiFailureFetch = async (url) => {
  if (url === "https://www.macrohistory.net/database/")
    return new Response(page);
  if (url.includes("JSTdatasetR6.xlsx")) return new Response(jstWorkbook);
  throw new Error("GSCPI unavailable");
};
const retainedGscpi = await fetchResearchMacro({
  previousSeries: [cachedGscpi],
  fetchImpl: gscpiFailureFetch,
  checkedAt: "2026-10-01T00:00:00.000Z",
  lastYear: 2025,
  lastMonth: "2020-12-31",
});
assert.equal(
  retainedGscpi.find((series) => series.id === "NYFED_GSCPI").refreshStatus,
  "upstream-unavailable",
);
assert.equal(
  retainedGscpi.find((series) => series.id === "NYFED_GSCPI").checkedAt,
  cachedGscpi.checkedAt,
);

await assert.rejects(
  fetchResearchMacro({
    fetchImpl: async () => {
      throw new Error("offline");
    },
  }),
  /JST provider failed on first import/,
);

if (process.argv.includes("--live")) {
  const live = await fetchResearchMacro();
  assert.ok(live.some((series) => series.id === "JST_USA_GDP"));
  assert.ok(live.some((series) => series.id === "NYFED_GSCPI"));
  assert.equal(
    live.find((series) => series.id === "JST_USA_GDP").sourceAsOf,
    "2020-12-31",
  );
  console.log(
    `Live research-macro import verified: ${live.length} series; no snapshot was written.`,
  );
}

assert.equal(
  RESEARCH_MACRO_VARIABLES.some(({ key }) => key === "eq_tr"),
  false,
);
assert.equal(JST_PROVIDER.includes("Macrohistory"), true);
console.log(
  "Verified JST R6 macro-only parsing, canonical country metadata, annual archival status, GSCPI parsing, discovery, and per-provider fallback.",
);
