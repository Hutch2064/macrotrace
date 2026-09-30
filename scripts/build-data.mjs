import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";

// Deployment artifacts only; the reviewed snapshot remains the source of truth.
export async function buildData(directory = "public/data/runtime") {
  const snapshot = JSON.parse(
    await readFile("public/data/snapshot.json", "utf8"),
  );
  await mkdir(`${directory}/series`, { recursive: true });
  const series = [];
  const metadataTemplates = {};
  const bundles = new Map();
  for (const entry of snapshot.series) {
    if (!entry.id.startsWith("WDI_")) continue;
    const key = entry.sourceIndicator || entry.id.slice(8);
    if (!bundles.has(key)) bundles.set(key, {});
    bundles.get(key)[entry.id] = entry.observations;
  }
  const files = new Map();
  const writeHistory = async (key, observations) => {
    if (files.has(key)) return files.get(key);
    const body = JSON.stringify(observations);
    const hash = createHash("sha256").update(body).digest("hex");
    const file = `series/${hash}.json`;
    await writeFile(`${directory}/${file}`, body);
    const history = { file, hash, bytes: Buffer.byteLength(body) };
    files.set(key, history);
    return history;
  };
  for (const { observations, ...metadata } of snapshot.series) {
    const bundle = metadata.id.startsWith("WDI_")
      ? metadata.sourceIndicator || metadata.id.slice(8)
      : null;
    const history = await writeHistory(
      bundle || metadata.id,
      bundle ? bundles.get(bundle) : observations,
    );
    const latest = observations.at(-1);
    const previousYear =
      metadata.frequency === "annual"
        ? observations.find(
            ([date]) =>
              date ===
              `${Number(latest[0].slice(0, 4)) - 1}${latest[0].slice(4)}`,
          )
        : null;
    let entryMetadata = metadata;
    if (bundle) {
      const {
        id,
        name,
        country,
        countryCode,
        geography,
        region,
        incomeLevel,
        sourceAsOf,
        sourceColumn,
        refreshStatus,
        ...shared
      } = metadata;
      metadataTemplates[bundle] ??= shared;
      entryMetadata = {
        id,
        name,
        country,
        countryCode,
        geography,
        region,
        incomeLevel,
        sourceAsOf,
        sourceColumn,
        ...(refreshStatus ? { refreshStatus } : {}),
        metadataKey: bundle,
      };
    }
    series.push({
      ...entryMetadata,
      coverage: {
        count: observations.length,
        first: observations[0],
        latest,
        ...(previousYear ? { previousYear } : {}),
      },
      history: { ...history, ...(bundle ? { member: metadata.id } : {}) },
    });
  }
  const catalog = { ...snapshot, schemaVersion: 1, metadataTemplates, series };
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
