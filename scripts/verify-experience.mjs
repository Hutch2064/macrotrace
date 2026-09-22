import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tickerReadings } from "../src/ticker.js";
import { reportTitles } from "../src/report-readings.js";

const snapshot = JSON.parse(
  await readFile("public/data/snapshot.json", "utf8"),
);
const readings = tickerReadings(snapshot);
assert.equal(
  readings.length,
  snapshot.series.length,
  "Every bundled source appears in the tape",
);
assert.equal(new Set(readings.map(({ id }) => id)).size, readings.length);
const activity = readings.find(({ id }) => id === "CFNAI");
assert.equal(activity.detail, "latest level");
assert.ok(
  !activity.value.includes("%"),
  "Signed activity indexes are not percentage returns",
);
assert.equal(readings.find(({ id }) => id === "UNRATE").detail, "latest level");
assert.equal(readings.find(({ id }) => id === "CPIAUCSL").detail, "1Y change");
assert.ok(
  readings.every(
    ({ date, name, value }) => date && name && !value.includes("NaN"),
  ),
);

const titles = reportTitles(snapshot);
assert.equal(titles.length, 8);
assert.ok(titles.every((title) => !title.includes("unavailable")));
const next = structuredClone(snapshot);
const ids = [
  "UNRATE",
  "CPIAUCSL",
  "GDPC1",
  "DGS10",
  "HOUST",
  "DCOILWTICO",
  "NFCI",
  "USEHS",
];
ids.forEach((id) => {
  next.series.find((series) => series.id === id).observations.at(-1)[1] += 10;
});
const changed = reportTitles(next);
assert.ok(
  changed.every((title, index) => title !== titles[index]),
  "Every report finding updates deterministically with new observations",
);
const oil = snapshot.series.find(({ id }) => id === "DCOILWTICO");
const [date, value] = oil.observations.at(-1);
const yearBefore = `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
const prior = oil.observations.filter(([day]) => day <= yearBefore).at(-1)[1];
assert.ok(
  titles[5].includes(
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
      (value / prior - 1) * 100,
    ),
  ),
);
const dashboard = await readFile("dashboard.html", "utf8");
assert.ok(!dashboard.includes("The numbers behind the charts"));
const workflow = await readFile(".github/workflows/refresh-data.yml", "utf8");
assert.match(workflow, /cron: "17 11 \* \* \*"/);
assert.match(workflow, /gh workflow run pages.yml/);
assert.match(workflow, /gh workflow run vercel.yml/);
assert.match(workflow, /public\/data\/version.json/);
console.log(
  `Verified ${readings.length} tape entries, eight dynamic report findings, source-only detail, and daily publication wiring.`,
);
