import { readFile } from "node:fs/promises";

const snapshot = JSON.parse(await readFile("public/data/snapshot.json", "utf8"));
if (snapshot.series.length < 32) throw new Error("Expected at least 32 series.");

for (const series of snapshot.series) {
  if (!series.id || !series.name || !series.category || !series.sourceUrl) {
    throw new Error(`Incomplete metadata for ${series.id ?? "unknown series"}.`);
  }
  if (series.observations.length < 24) throw new Error(`Too few observations for ${series.id}.`);
  let previous = "";
  for (const [date, value] of series.observations) {
    if (date <= previous) throw new Error(`${series.id} dates are not strictly increasing.`);
    if (!Number.isFinite(value)) throw new Error(`${series.id} has a non-finite value.`);
    previous = date;
  }
}

console.log(`Verified ${snapshot.series.length} series through ${snapshot.generatedAt}.`);
