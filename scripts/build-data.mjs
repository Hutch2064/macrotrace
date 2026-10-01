import { mkdir, writeFile, readdir, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readSnapshot } from "./snapshot.mjs";

// Deployment artifacts only; the reviewed snapshot remains the source of truth.
export async function buildData(directory = "public/data/runtime") {
  const snapshot = readSnapshot();
  await mkdir(`${directory}/series`, { recursive: true });
  const series = [];
  const metadataTemplates = {};
  const templateKeys = new Map();
  const sharedFields = new Set([
    "category",
    "frequency",
    "unit",
    "changeType",
    "source",
    "provider",
    "sourceFamily",
    "sourceUrl",
    "sourceDownloadUrl",
    "exactDownloadUrl",
    "sourceFile",
    "sourceHash",
    "providerSnapshotHash",
    "sourceDefinition",
    "sourceOrganization",
    "historyType",
    "rightsNote",
    "license",
    "availabilityNote",
    "methodology",
    "checkedAt",
    "indicatorKey",
    "indicatorName",
    "sourceFrequency",
    "dataset",
    "originalCategory",
    "semanticType",
    "signed",
    "releaseFrequency",
  ]);
  const bundles = new Map();
  const bundleFor = (entry) =>
    entry.id.startsWith("WDI_")
      ? entry.sourceIndicator || entry.id.slice(8)
      : entry.dataset === "bis-macro" && entry.frequency !== "daily"
        ? `${entry.id
            .split("_")
            .slice(0, entry.id.startsWith("BIS_CREDIT_GAP_") ? 3 : 2)
            .join("_")}_${entry.frequency}`
        : entry.dataset === "eurostat-macro"
          ? `EUROSTAT_${entry.sourceDataset || entry.sourceIndicator || entry.category}_${entry.frequency}`
          : ["imf-macro", "research-macro"].includes(entry.dataset)
            ? `${entry.dataset}_${entry.indicatorKey}_${entry.unit}_${entry.frequency}`
            : null;
  for (const entry of snapshot.series) {
    const key = bundleFor(entry);
    if (!key) continue;
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
    const bundle = bundleFor(metadata);
    const history = await writeHistory(
      bundle || metadata.id,
      bundle ? bundles.get(bundle) : observations,
    );
    const latest = observations.at(-1);
    const previousYear =
      metadata.frequency === "annual" &&
      (metadata.indicatorKey === "GDPGROWTH" ||
        metadata.id.endsWith("_GDPGROWTH"))
        ? observations.find(
            ([date]) =>
              date ===
              `${Number(latest[0].slice(0, 4)) - 1}${latest[0].slice(4)}`,
          )
        : null;
    let entryMetadata = metadata;
    const shared = Object.fromEntries(
      Object.entries(metadata).filter(([field]) => sharedFields.has(field)),
    );
    const template = JSON.stringify(shared);
    if (!templateKeys.has(template)) {
      const key = String(templateKeys.size);
      templateKeys.set(template, key);
      metadataTemplates[key] = shared;
    }
    entryMetadata = {
      ...Object.fromEntries(
        Object.entries(metadata).filter(([field]) => !sharedFields.has(field)),
      ),
      metadataKey: templateKeys.get(template),
    };
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
  const packedCatalog = JSON.stringify(catalog);
  await writeFile(`${directory}/catalog.json`, packedCatalog);
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
    `Packed ${series.length} lossless, content-addressed histories; catalog ${Buffer.byteLength(packedCatalog)} bytes.`,
  );
  return catalog;
}
if (process.argv[1]?.endsWith("build-data.mjs")) await buildData();
