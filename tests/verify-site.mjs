import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { transformSeries } from "../src/panel.js";

const htmlFiles = (await readdir(".")).filter((file) => file.endsWith(".html"));
assert.deepEqual(
  htmlFiles.sort(),
  ["dashboard.html", "index.html"],
  "MacroTrace has exactly the report and dashboard pages",
);

const [report, dashboard, vite] = await Promise.all([
  readFile("index.html", "utf8"),
  readFile("dashboard.html", "utf8"),
  readFile("vite.config.js", "utf8"),
]);

assert.match(report, /<body[^>]+data-page="report"/);
for (const marker of [
  'id="report-sections"',
  'id="headline-metrics"',
  'id="sources"',
  'id="source-catalog"',
  'src="\/src\/report\.js"',
])
  assert.match(report, new RegExp(marker), `Report source contract: ${marker}`);

assert.match(dashboard, /<body[^>]+data-page="dashboard"/);
const dashboardScript = await readFile("src/dashboard.js", "utf8");
const cardTemplate = dashboardScript.match(
  /return (`<article class="chart-card indicator-card"[^\n]+`);/,
)[1];
const renderCard = new Function(
  "series",
  "points",
  "latest",
  "escape",
  "unitLabel",
  "valueText",
  "changeClass",
  "dateLabel",
  "expandIcon",
  "state",
  `return ${cardTemplate}`,
);
const snapshot = JSON.parse(
  await readFile("public/data/snapshot.json", "utf8"),
);
for (const id of [
  "WDI_LBN_GOV_REVENUE",
  "WDI_MNG_GOV_DEBT",
  "WDI_NPL_GOV_REVENUE",
  "WDI_SOM_GOV_DEBT",
]) {
  const series = snapshot.series.find((series) => series.id === id);
  const points = transformSeries(series, {
    measure: "yoy",
    start: "2021-09-30",
  });
  const latest = points.filter((point) => Number.isFinite(point.value)).at(-1);
  const card = renderCard(
    series,
    points,
    latest,
    String,
    String,
    String,
    () => "",
    String,
    "",
    { measure: "yoy" },
  );
  if (latest && latest.date !== points.at(-1).date)
    assert.ok(
      !card.includes(points.at(-1).date),
      `${id}: never attribute an older comparison to a newer raw observation date`,
    );
}
for (const copy of [
  "Calendar-year change:",
  "Native units, shared dates.",
  "Same indicators as the time-series panel",
  "daily source checks",
  "observation dates vary",
  "histories retained after upstream retrieval failures",
])
  assert.ok(
    !dashboard.includes(copy) && !dashboardScript.includes(copy),
    `Removed dashboard helper copy: ${copy}`,
  );
for (const id of ["measure-note", "breadth-note", "heatmap-unit"])
  assert.ok(
    !dashboard.includes(`id="${id}"`) && !dashboardScript.includes(`#${id}`),
    `Removed helper hooks: ${id}`,
  );
assert.match(
  dashboardScript,
  /`As of: \$\{dateLabel\(snapshot\.generatedAt\)\}`/,
);
for (const marker of [
  'id="category-filter"',
  'id="geography-filter"',
  'id="frequency-filter"',
  'id="period-filter"',
  'id="measure-filter"',
  'id="group-filter"',
  'id="series-charts"',
  'id="panel-heatmap"',
  'id="observations-table"',
  'src="\/src\/dashboard\.js"',
])
  assert.match(
    dashboard,
    new RegExp(marker),
    `Dashboard source contract: ${marker}`,
  );

for (const source of [report, dashboard, vite]) {
  assert.doesNotMatch(source, /sources\.html/);
  assert.doesNotMatch(source, /\/api\//);
}
assert.match(vite, /report:\s*resolve\([^\n]+index\.html/);
assert.match(vite, /dashboard:\s*resolve\([^\n]+dashboard\.html/);
assert.doesNotMatch(vite, /sources:/);

const workflows = await readdir(".github/workflows");
assert.deepEqual(workflows.sort(), ["pages.yml", "refresh-data.yml"]);
for (const name of workflows) {
  const workflow = await readFile(`.github/workflows/${name}`, "utf8");
  assert.doesNotMatch(workflow, /VERCEL|vercel|MARKET_API/);
}
const refresh = await readFile(".github/workflows/refresh-data.yml", "utf8");
assert.match(refresh, /schedule:/);
assert.match(refresh, /npm run data:refresh/);
assert.match(refresh, /gh workflow run pages.yml/);
assert.match(report, /id="economic-globe"/);
assert.doesNotMatch(report, /id="country-select"/);
assert.match(report, /id="globe-country-name"/);
assert.match(report, /Economies with\s+data/);
assert.match(report, /No data/);
assert.doesNotMatch(report, /Eight signals/);
assert.match(await readFile("src/dashboard.js", "utf8"), /const PAGE_SIZE = 8/);
assert.deepEqual(
  (await readFile("SUBMISSION.txt", "utf8")).trimEnd().split("\n"),
  [
    "Aiden Hutchison",
    "Student ID: 010963714",
    "https://github.com/Hutch2064/macrotrace",
    "https://hutch2064.github.io/macrotrace/",
  ],
);

console.log(
  "Verified two pages, country globe, report/dashboard DOM contracts, and Pages-only daily publication.",
);
