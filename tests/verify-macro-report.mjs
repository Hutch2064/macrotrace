import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  REPORT_CANDIDATES,
  REPORT_IDS,
  buildMacroReport,
  methodDefinitions,
} from "../src/macro-report.js";
import { transformSeries } from "../src/panel.js";

const snapshot = JSON.parse(
  await readFile(new URL("../public/data/snapshot.json", import.meta.url)),
);

const byId = new Map(snapshot.series.map((series) => [series.id, series]));
const source = (id) => byId.get(id);
const rows = (id) => source(id)?.observations || [];

function validDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return false;
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return (
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === date
  );
}

function shiftYear(date) {
  if (!validDate(date)) return null;
  const candidate = `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
  const parsed = Date.parse(`${candidate}T00:00:00Z`);
  return Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === candidate
    ? candidate
    : null;
}

function exactAnnual(observations) {
  const lookup = new Map(observations);
  return observations.flatMap(([date, value]) => {
    const priorDate = shiftYear(date);
    const prior = priorDate === null ? undefined : lookup.get(priorDate);
    if (!Number.isFinite(value) || !Number.isFinite(prior) || prior <= 0)
      return [];
    return [[date, ((value - prior) / prior) * 100]];
  });
}

function dailyWeeklyYearOnYear(observations) {
  const ordered = finiteRows(observations).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return ordered.flatMap(([date, value]) => {
    const boundary = shiftYear(date);
    if (!boundary || !Number.isFinite(value)) return [];
    const boundaryTime = Date.parse(`${boundary}T00:00:00Z`);
    let prior = null;
    for (const candidate of ordered) {
      const candidateTime = Date.parse(`${candidate[0]}T00:00:00Z`);
      if (candidateTime > boundaryTime) break;
      prior = candidate;
    }
    if (!prior) return [];
    const gapDays =
      (boundaryTime - Date.parse(`${prior[0]}T00:00:00Z`)) / 86400000;
    if (gapDays > 7 || !(prior[1] > 0)) return [];
    return [[date, ((value - prior[1]) / prior[1]) * 100]];
  });
}

function expectedPoints(series, measure) {
  const observations = finiteRows(series?.observations || []);
  if (measure === "level") return observations;
  if (measure === "yoy") {
    return ["daily", "weekly"].includes(series?.frequency)
      ? dailyWeeklyYearOnYear(observations)
      : exactAnnual(observations);
  }
  return observations
    .slice(1)
    .map(([date, value], index) => [date, value - observations[index][1]]);
}

function finiteRows(observations) {
  return observations.filter(
    ([date, value]) => validDate(date) && Number.isFinite(value),
  );
}

function expectedSuffix(unit) {
  const text = String(unit || "").toLowerCase();
  if (text.includes("percentage point")) return " pp";
  if (text.includes("index point")) return " pts";
  if (text.includes("%") || text.includes("percent")) return "%";
  if (text.includes("thousand")) return " thousand";
  if (text.includes("million")) return " million";
  return ` ${unit || "reported units"}`;
}

const report = buildMacroReport(snapshot);
const inflationReport = buildMacroReport({
  ...snapshot,
  series: snapshot.series.filter(({ id }) =>
    ["CPIAUCSL", "PCEPILFE"].includes(id),
  ),
});
assert.match(inflationReport.findings[0].title, /core PCE/);
assert.doesNotMatch(inflationReport.findings[0].title, /core CPI/);
const candidateInputIds = new Set(REPORT_CANDIDATES.flatMap(({ ids }) => ids));
assert.equal(REPORT_CANDIDATES.length, 16, "curated candidate count");
assert.equal(new Set(REPORT_IDS).size, REPORT_IDS.length, "unique load IDs");
for (const id of candidateInputIds)
  assert.ok(REPORT_IDS.includes(id), `${id}: candidate input is loadable`);
assert.ok(REPORT_IDS.includes("PCEPILFE"), "separate PCE headline is loadable");
assert.ok(
  REPORT_IDS.every((id) => !/equity|stock|sp500|nasdaq|dow/i.test(id)),
  "no equity series in the report contract",
);

assert.ok(report.headlines.length >= 4, "at least four US headlines");
assert.equal(
  report.headlineExistingUS.length,
  report.headlines.length,
  "existing US headlines remain separate and complete",
);
assert.ok(report.findings.length >= 8, "at least eight selected findings");
assert.ok(report.findings.length <= 10, "selection target is bounded at ten");
assert.equal(report.findings.length, report.selection.selectedCount);
assert.equal(report.selection.candidateCount, REPORT_CANDIDATES.length);
assert.equal(
  report.selection.selectedIds.length,
  report.findings.length,
  "selected IDs match rendered findings",
);
assert.equal(
  new Set(report.findings.map(({ id }) => id)).size,
  report.findings.length,
  "selected findings cover distinct candidate themes",
);
assert.equal(report.methodDefinitions.length, methodDefinitions.length);
for (const method of [
  "native",
  "YoY",
  "percentage[ -]point",
  "median",
  "percentile",
  "source",
])
  assert.match(
    methodDefinitions.map(({ definition }) => definition).join(" "),
    new RegExp(method, "i"),
    `methods disclose ${method}`,
  );

for (const finding of report.findings) {
  assert.ok(finding.id && finding.topic && finding.title);
  assert.equal(finding.paragraphs.length, 2, `${finding.id}: two paragraphs`);
  assert.ok(finding.paragraphs.every((paragraph) => paragraph.length > 20));
  assert.equal(finding.series.length, finding.points.length);
  assert.equal(
    new Set(finding.series.map(({ unit }) => unit)).size,
    1,
    `${finding.id}: chart units are comparable`,
  );
  assert.equal(
    finding.suffix,
    expectedSuffix(finding.series[0]?.unit),
    `${finding.id}: chart suffix matches transformed unit`,
  );
  for (const points of finding.points)
    assert.ok(
      points.every(
        ([date, value]) => validDate(date) && Number.isFinite(value),
      ),
      `${finding.id}: finite dated chart points`,
    );
  assert.ok(
    finding.asOf.every(({ date }) => date === null || validDate(date)),
    `${finding.id}: observed dates only`,
  );
  const candidate = REPORT_CANDIDATES.find(({ id }) => id === finding.id);
  assert.ok(candidate, `${finding.id}: selected candidate definition`);
  finding.series.forEach((series, index) => {
    const expected = expectedPoints(source(series.id), candidate.measure);
    assert.deepEqual(
      finding.points[index],
      expected,
      `${finding.id}/${series.id}: independent source formula`,
    );
  });
}

// Hero values are independently checked against exact native-period formulas.
const cpiExpected = exactAnnual(rows("CPIAUCSL"));
const pceExpected = exactAnnual(rows("PCEPILFE"));
const gdpExpected = exactAnnual(rows("GDPC1"));
const unrateExpected = finiteRows(rows("UNRATE"));
for (const [label, expected] of [
  ["Headline CPI (SA index) YoY", cpiExpected],
  ["Core PCE (SA index) YoY", pceExpected],
  ["Real GDP growth", gdpExpected],
  ["Unemployment rate", unrateExpected],
]) {
  const headline = report.headlines.find((entry) => entry.label === label);
  const last = expected.at(-1);
  assert.ok(headline, `${label}: present`);
  assert.deepEqual(
    [headline.value, headline.date],
    [last[1], last[0]],
    `${label}: source-backed value and date`,
  );
}

assert.equal(
  report.asOf.latest,
  REPORT_IDS.map((id) => rows(id).at(-1)?.[0])
    .filter(Boolean)
    .sort()
    .at(-1),
  "asOf uses latest observed date",
);
assert.notEqual(
  report.asOf.latest,
  snapshot.generatedAt,
  "asOf is not generatedAt",
);
assert.equal(report.dataset.indicatorCount, snapshot.series.length);
assert.equal(
  report.dataset.topicCount,
  new Set(snapshot.series.map(({ category }) => category).filter(Boolean)).size,
);
assert.equal(
  report.dataset.geographyCount,
  new Set(
    snapshot.series
      .map(({ geography, country, region }) => geography || country || region)
      .filter(Boolean),
  ).size,
);
assert.ok(
  report.summary.includes(snapshot.series.length.toLocaleString("en-US")),
);
assert.match(report.summary, /topics/);
assert.match(report.summary, /geograph/i);
assert.match(report.summary, /freshness|movement/i);

// A source update changes the candidate score/order inputs without changing
// the candidate contract; this guards against a silently fixed report list.
const trade = source("WDI_WLD_TRADE");
const tradeUpdated = {
  ...trade,
  observations: trade.observations.map(([date, value], index, all) =>
    index === all.length - 1 ? [date, value * 1.5] : [date, value],
  ),
};
const updatedSnapshot = {
  ...snapshot,
  series: snapshot.series.map((series) =>
    series.id === "WDI_WLD_TRADE" ? tradeUpdated : series,
  ),
};
const updated = buildMacroReport(updatedSnapshot);
const originalTradeScore = report.selection.candidates.find(
  ({ id }) => id === "trade",
).score;
const updatedTradeScore = updated.selection.candidates.find(
  ({ id }) => id === "trade",
).score;
assert.notEqual(
  updatedTradeScore,
  originalTradeScore,
  "selection responds to data movement",
);

// Missing required inputs are explicit and never replaced by another theme.
const incomplete = buildMacroReport({
  generatedAt: "2099-01-01T00:00:00.000Z",
  series: [
    {
      id: "CPIAUCSL",
      name: "Synthetic CPI",
      category: "Inflation",
      frequency: "monthly",
      unit: "index",
      observations: [
        ["2020-01-01", 100],
        ["2021-01-01", 102],
      ],
    },
  ],
});
assert.equal(
  incomplete.headlines[1].value,
  null,
  "missing headline unavailable",
);
assert.equal(incomplete.findings.length, 0, "no invented selected theme");
assert.ok(
  incomplete.selection.candidates.every(
    ({ available, missingIds }) => !available && missingIds.length,
  ),
  "missing candidates disclose required IDs",
);
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
  "retained fallback disclosed",
);
assert.match(fallbackSource.freshnessNote, /retained/i);

// Synthetic boundary checks: exact annual dates work, nearby dates do not,
// and panel semantics preserve point differences for rates.
assert.deepEqual(
  exactAnnual([
    ["2019-01-01", 9],
    ["2019-12-31", 9],
    ["2020-01-01", 10],
    ["2021-01-01", 12],
  ]),
  [
    ["2020-01-01", ((10 - 9) / 9) * 100],
    ["2021-01-01", ((12 - 10) / 10) * 100],
  ],
  "exact annual boundary only",
);
assert.equal(
  exactAnnual([
    ["2020-01-01", 10],
    ["2021-01-02", 12],
  ]).length,
  0,
  "no nearest or future annual substitution",
);
const syntheticRate = {
  id: "SYNTH_RATE",
  frequency: "monthly",
  unit: "%",
  observations: [
    ["2020-01-01", 2],
    ["2020-02-01", 3],
  ],
};
const ratePoint = transformSeries(syntheticRate, { measure: "change" }).at(-1);
assert.equal(
  ratePoint.value,
  1,
  "rate change is a percentage-point difference",
);
const syntheticDaily = {
  id: "SYNTH_DAILY",
  frequency: "daily",
  unit: "$",
  observations: [
    ["2020-01-01", 100],
    ["2020-01-05", 101],
    ["2020-01-11", 102],
    ["2021-01-10", 110],
    ["2021-01-20", 120],
  ],
};
const expectedDaily = dailyWeeklyYearOnYear(syntheticDaily.observations);
assert.deepEqual(
  expectedDaily,
  [["2021-01-10", ((110 - 101) / 101) * 100]],
  "daily YoY uses prior on-or-before boundary within seven days",
);
assert.deepEqual(
  transformSeries(syntheticDaily, { measure: "yoy" })
    .filter(({ value }) => Number.isFinite(value))
    .map(({ date, value }) => [date, value]),
  expectedDaily,
  "daily transform rejects remote or future boundary substitutes",
);

const regenerated = buildMacroReport({
  ...snapshot,
  generatedAt: "2099-12-31T00:00:00.000Z",
});
assert.deepEqual(regenerated, report, "generatedAt does not change the report");

console.log(
  `Verified ${report.findings.length} dynamically selected findings from ${report.selection.availableCount} available candidates, ${report.headlines.length} US headlines, exact boundaries, missing-data behavior, and freshness metadata.`,
);
