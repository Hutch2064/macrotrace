import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  REPORT_IDS,
  annualChange,
  energyChange,
  buildMacroReport,
} from "../src/macro-report.js";

const snapshot = JSON.parse(
  await readFile(new URL("../public/data/snapshot.json", import.meta.url)),
);

const byId = new Map(snapshot.series.map((series) => [series.id, series]));
const source = (id) => byId.get(id);
const rows = (id) => source(id)?.observations || [];

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function shiftYear(date) {
  if (!isDate(date)) return null;
  const year = Number(date.slice(0, 4)) - 1;
  const candidate = `${year}${date.slice(4)}`;
  const parsed = Date.parse(`${candidate}T00:00:00Z`);
  return Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === candidate
    ? candidate
    : null;
}

// Independent implementation of the report's exact calendar-year formula;
// this intentionally does not import the production transform helper.
function expectedAnnual(observations) {
  const lookup = new Map(observations);
  return observations.flatMap(([date, value]) => {
    const priorDate = shiftYear(date);
    const prior = priorDate === null ? undefined : lookup.get(priorDate);
    if (!Number.isFinite(value) || !Number.isFinite(prior) || prior <= 0)
      return [];
    return [[date, (value / prior - 1) * 100]];
  });
}

// GDP's four-quarter lag is an exact calendar-date match to one year earlier.
function expectedQuarterly(observations) {
  return expectedAnnual(observations);
}

function expectedEnergy(observations) {
  return observations.flatMap(([date, value]) => {
    const boundary = shiftYear(date);
    if (!boundary) return [];
    const prior = observations
      .filter(([candidate]) => candidate <= boundary)
      .at(-1)?.[1];
    const priorDate = observations
      .filter(([candidate]) => candidate <= boundary)
      .at(-1)?.[0];
    if (
      !Number.isFinite(value) ||
      !Number.isFinite(prior) ||
      prior <= 0 ||
      !priorDate ||
      Date.parse(`${boundary}T00:00:00Z`) -
        Date.parse(`${priorDate}T00:00:00Z`) >
        7 * 86400000
    )
      return [];
    return [[date, (value / prior - 1) * 100]];
  });
}

function finiteRows(observations) {
  return observations.filter(
    ([date, value]) => isDate(date) && Number.isFinite(value),
  );
}

const report = buildMacroReport(snapshot);
assert.equal(REPORT_IDS.length, 11, "required macro source IDs");
assert.equal(new Set(REPORT_IDS).size, REPORT_IDS.length, "unique report IDs");
assert.equal(report.headlines.length, 4, "four labeled headlines");
assert.equal(report.findings.length, 8, "exactly eight macro findings");
assert.deepEqual(
  report.findings.map(({ id }) => id),
  [
    "inflation",
    "labor-unemployment",
    "jobs",
    "gdp",
    "monetary",
    "housing",
    "energy",
    "industrial",
  ],
  "required macro themes in stable order",
);
assert.ok(
  REPORT_IDS.every((id) => !/equity|stock|sp500|nasdaq|dow/i.test(id)),
  "no equity series in the report contract",
);
assert.equal(
  report.asOf.latest,
  REPORT_IDS.map((id) => rows(id).at(-1)?.[0])
    .filter(Boolean)
    .sort()
    .at(-1),
  "asOf uses latest observation date",
);
assert.notEqual(
  report.asOf.latest,
  snapshot.generatedAt,
  "asOf is not generatedAt",
);
assert.equal(
  report.methodDefinitions.length,
  7,
  "methods cover the model contract",
);
for (const finding of report.findings) {
  assert.equal(
    finding.paragraphs.length,
    2,
    `${finding.id}: two explanatory paragraphs`,
  );
  assert.ok(finding.paragraphs.every((paragraph) => paragraph.length > 20));
  assert.equal(
    new Set(finding.series.map(({ unit }) => unit)).size,
    1,
    `${finding.id}: chart series share one unit`,
  );
  assert.equal(finding.series.length, finding.points.length);
  for (const points of finding.points)
    assert.ok(
      points.every(([date, value]) => isDate(date) && Number.isFinite(value)),
    );
}

const finding = (id) => report.findings.find((entry) => entry.id === id);
const expectedByFinding = {
  inflation: [
    expectedAnnual(rows("CPIAUCSL")),
    expectedAnnual(rows("PCEPILFE")),
  ],
  "labor-unemployment": [finiteRows(rows("UNRATE"))],
  jobs: [finiteRows(rows("PAYEMS"))],
  gdp: [expectedQuarterly(rows("GDPC1"))],
  monetary: [finiteRows(rows("FEDFUNDS"))],
  housing: [finiteRows(rows("HOUST")), finiteRows(rows("PERMIT"))],
  energy: [expectedEnergy(rows("DCOILWTICO")), expectedEnergy(rows("GASREGW"))],
  industrial: [expectedAnnual(rows("INDPRO"))],
};
for (const [id, expected] of Object.entries(expectedByFinding)) {
  assert.deepEqual(
    finding(id).points,
    expected,
    `${id}: independent point calculation`,
  );
}

const headlineChecks = [
  ["Headline CPI (SA index) YoY", expectedAnnual(rows("CPIAUCSL"))],
  ["Core PCE (SA index) YoY", expectedAnnual(rows("PCEPILFE"))],
  ["Unemployment rate", finiteRows(rows("UNRATE"))],
  ["Real GDP growth", expectedQuarterly(rows("GDPC1"))],
];
for (const [label, expected] of headlineChecks) {
  const headline = report.headlines.find((entry) => entry.label === label);
  const last = expected.at(-1);
  assert.deepEqual(
    [headline.value, headline.date],
    [last[1], last[0]],
    `${label}: independent headline calculation`,
  );
}

// Synthetic boundary checks: exact calendar dates work, nearby/future rows do
// not become a silent substitute, and a nonpositive denominator is dropped.
const syntheticAnnual = [
  ["2019-01-01", 9],
  ["2019-12-31", 9],
  ["2020-01-01", 10],
  ["2020-01-02", 11],
  ["2021-01-01", 12],
  ["2021-01-03", 0],
  ["2022-01-03", 15],
];
assert.deepEqual(expectedAnnual(syntheticAnnual), [
  ["2020-01-01", (10 / 9 - 1) * 100],
  ["2021-01-01", (12 / 10 - 1) * 100],
]);
assert.equal(
  expectedAnnual([
    ["2020-01-01", 10],
    ["2021-01-02", 12],
  ]).length,
  0,
  "no nearest or future annual lag substitution",
);
assert.ok(
  Math.abs(
    expectedQuarterly([
      ["2020-04-01", 100],
      ["2021-04-01", 105],
    ])[0][1] - 5,
  ) < 1e-12,
  "exact four-quarter calendar boundary",
);
assert.equal(
  expectedEnergy([
    ["2020-09-20", 10],
    ["2021-09-27", 15],
  ])[0][1],
  50,
  "energy uses an observed prior boundary, never an invented row",
);

const negativeBaseline = [
  ["2020-04-20", -36.98],
  ["2021-04-20", 62.67],
];
assert.deepEqual(
  annualChange(negativeBaseline),
  [],
  "negative annual baseline unavailable",
);
assert.deepEqual(
  energyChange(negativeBaseline),
  [],
  "negative energy baseline unavailable",
);

const incomplete = buildMacroReport({
  generatedAt: "2099-01-01T00:00:00.000Z",
  series: [
    {
      id: "CPIAUCSL",
      name: "Synthetic CPI",
      frequency: "monthly",
      unit: "index",
      observations: [["2020-01-01", 100]],
    },
  ],
});
const unavailableInflation = incomplete.findings.find(
  ({ id }) => id === "inflation",
);
assert.equal(
  incomplete.headlines[1].value,
  null,
  "missing headline is unavailable",
);
assert.match(unavailableInflation.paragraphs[0], /Data unavailable/);
assert.match(unavailableInflation.note, /Unavailable/);
assert.equal(
  incomplete.sourceMetadata.find(({ id }) => id === "PCEPILFE").refreshStatus,
  "unavailable",
);

const fallbackSnapshot = {
  ...snapshot,
  refreshFailures: ["UNRATE"],
  series: snapshot.series.map((series) =>
    series.id === "UNRATE"
      ? { ...series, refreshStatus: "upstream-unavailable" }
      : series,
  ),
};
const fallbackSource = buildMacroReport(fallbackSnapshot).sourceMetadata.find(
  ({ id }) => id === "UNRATE",
);
assert.equal(
  fallbackSource.retainedSnapshot,
  true,
  "retained fallback is disclosed",
);
assert.match(fallbackSource.freshnessNote, /retained/i);

const regenerated = buildMacroReport({
  ...snapshot,
  generatedAt: "2099-12-31T00:00:00.000Z",
});
assert.deepEqual(
  regenerated,
  report,
  "generatedAt does not change report content",
);

console.log(
  `Verified ${report.findings.length} macro findings, ${report.headlines.length} headlines, exact calendar transforms, missing-data behavior, and freshness metadata.`,
);
