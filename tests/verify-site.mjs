import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

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
assert.match(report, /id="country-select"/);
assert.doesNotMatch(report, /Eight signals/);

console.log(
  "Verified two pages, country globe, report/dashboard DOM contracts, and Pages-only daily publication.",
);
