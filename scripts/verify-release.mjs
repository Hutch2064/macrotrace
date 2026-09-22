import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { change, rollingHorizonChanges } from "../src/analytics.js";

const snapshot = JSON.parse(
  await readFile("public/data/snapshot.json", "utf8"),
);
for (const id of ["CPIAUCSL", "PCEPI", "PAYEMS", "FF_US_MARKET", "HIST_GOLD"]) {
  const series = snapshot.series.find((item) => item.id === id);
  const [date, value] = series.observations.at(-1);
  const boundary = `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
  const prior = series.observations.find(([day]) => day === boundary);
  assert.ok(prior, `${id} has the independently checked annual boundary`);
  const expected = (value / prior[1] - 1) * 100;
  assert.ok(
    Math.abs(change(series, "1y") - expected) < 1e-9,
    `${id}: exact annual boundary`,
  );
  assert.ok(
    Math.abs(rollingHorizonChanges(series, "1y").at(-1)[1] - expected) < 1e-9,
    `${id}: rolling/summary parity`,
  );
  assert.ok(
    Number.isNaN(change(series, "7")),
    `${id}: no weekly return from monthly/annual observations`,
  );
}
assert.equal(
  new Set(snapshot.series.map(({ id }) => id)).size,
  snapshot.series.length,
  "Unique series identifiers",
);
for (const series of snapshot.series) {
  if (series.historyStatus === "archived") {
    assert.ok(
      series.archiveReason && series.methodology,
      `${series.id}: archives require documented status and methodology`,
    );
    continue;
  }
  const latestDate = series.observations.at(-1)[0];
  const year = Number(latestDate.slice(0, 4)),
    month = Number(latestDate.slice(5, 7));
  // FRED labels many annual/quarterly/monthly periods by their first day.
  // Freshness is measured from the covered period's end, not that label.
  const periodEnd =
    series.frequency === "annual" && latestDate.endsWith("-01-01")
      ? Date.UTC(year, 12, 0)
      : series.frequency === "quarterly"
        ? Date.UTC(year, Math.ceil(month / 3) * 3, 0)
        : series.frequency === "monthly"
          ? Date.UTC(year, month, 0)
          : Date.parse(latestDate);
  const age = (Date.parse(snapshot.generatedAt) - periodEnd) / 86400000;
  const maximumAge = {
    daily: 30,
    weekly: 60,
    monthly: 180,
    quarterly: 300,
    annual: 800,
  }[series.frequency];
  assert.ok(
    age <= maximumAge,
    `${series.id}: latest observation is ${Math.floor(age)} days old; verify the feed is still active`,
  );
}
for (const id of snapshot.refreshFailures || []) {
  assert.equal(
    snapshot.series.find((series) => series.id === id)?.refreshStatus,
    "upstream-unavailable",
    `${id}: retained data must disclose the unsuccessful refresh`,
  );
}
console.log(
  "Verified independent source-boundary calculations, sparse-window behavior, unique IDs, and refresh health.",
);
