import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";

// Deployment artifacts only; the reviewed snapshot remains the source of truth.
export async function buildData(directory = "public/data/runtime") {
  const snapshot = JSON.parse(
    await readFile("public/data/snapshot.json", "utf8"),
  );
  await mkdir(`${directory}/series`, { recursive: true });
  const series = [];
  for (const { observations, ...metadata } of snapshot.series) {
    const body = JSON.stringify(observations);
    const hash = createHash("sha256").update(body).digest("hex");
    const file = `series/${hash}.json`;
    await writeFile(`${directory}/${file}`, body);
    series.push({
      ...metadata,
      coverage: {
        count: observations.length,
        first: observations[0],
        latest: observations.at(-1),
      },
      history: { file, hash, bytes: Buffer.byteLength(body) },
    });
  }
  const catalog = { ...snapshot, schemaVersion: 1, series };
  await writeFile(`${directory}/catalog.json`, JSON.stringify(catalog));
  const retained = new Set(
    series.map((entry) => entry.history.file.split("/").at(-1)),
  );
  // This directory contains generated artifacts only. Removed securities must
  // not remain downloadable as orphaned chunks in a new macro-only deployment.
  for (const file of await readdir(`${directory}/series`)) {
    if (/^[a-f0-9]{64}\.json$/.test(file) && !retained.has(file))
      await unlink(`${directory}/series/${file}`);
  }
  console.log(
    `Packed ${series.length} lossless, content-addressed histories; catalog ${Buffer.byteLength(JSON.stringify(catalog))} bytes.`,
  );
  return catalog;
}
if (process.argv[1]?.endsWith("build-data.mjs")) await buildData();
