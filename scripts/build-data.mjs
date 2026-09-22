import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { change, changeSuffix } from "../src/analytics.js";
import { horizons } from "../src/horizons.js";

// Deployment artifacts only; the reviewed snapshot remains the source of truth.
export async function buildData(directory = "public/data/runtime") {
  const snapshot = JSON.parse(
    await readFile("public/data/snapshot.json", "utf8"),
  );
  await mkdir(`${directory}/series`, { recursive: true });
  const series = [];
  for (const { observations, ...metadata } of snapshot.series) {
    const original = { ...metadata, observations };
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
      bannerSuffix: changeSuffix(original),
      bannerChanges: Object.fromEntries(
        horizons.map(([horizon]) => [horizon, change(original, horizon)]),
      ),
    });
  }
  const catalog = { ...snapshot, schemaVersion: 1, series };
  await writeFile(`${directory}/catalog.json`, JSON.stringify(catalog));
  console.log(
    `Packed ${series.length} lossless, content-addressed histories; catalog ${Buffer.byteLength(JSON.stringify(catalog))} bytes.`,
  );
  return catalog;
}
if (process.argv[1]?.endsWith("build-data.mjs")) await buildData();
