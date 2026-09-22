import { readFile } from "node:fs/promises";

const snapshot = JSON.parse(
  await readFile("public/data/snapshot.json", "utf8"),
);
const page = await readFile("sources.html", "utf8");
const module = await readFile("src/sources.js", "utf8");

if (!Array.isArray(snapshot.series) || !snapshot.series.length)
  throw new Error("Source snapshot does not contain any series.");

const ids = new Set();
for (const series of snapshot.series) {
  if (!series.id || ids.has(series.id))
    throw new Error(
      `Source snapshot contains a duplicate or missing ID: ${series.id}`,
    );
  ids.add(series.id);
  for (const field of ["name", "source", "sourceUrl", "frequency"]) {
    if (!series[field]) throw new Error(`${series.id} is missing ${field}.`);
  }
  if (!Array.isArray(series.observations) || !series.observations.length)
    throw new Error(`${series.id} has no observations.`);
  const latest = series.observations.at(-1);
  if (!latest?.[0] || !Number.isFinite(latest[1]))
    throw new Error(`${series.id} has an invalid latest observation.`);
}

for (const required of [
  'id="source-catalog"',
  'id="methodology"',
  'id="sources-search"',
  'id="export-catalog"',
  'href="/src/styles.css"',
  'href="/src/sources.css"',
  'src="/src/sources.js"',
]) {
  if (!page.includes(required))
    throw new Error(`sources.html is missing ${required}.`);
}

for (const required of [
  "loadSnapshot",
  'mountChrome(snapshot, "sources")',
  "sourceFamily",
  "sourceDownloadUrl",
  "dataRole",
  "sourceHash",
  "readCachedSeries",
  "yahoo",
  "downloadCsv",
]) {
  if (!module.includes(required))
    throw new Error(`sources.js is missing ${required}.`);
}

console.log(
  `Verified ${snapshot.series.length} snapshot source entries and source-page wiring.`,
);
