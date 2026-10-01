import { readFileSync } from "node:fs";

// Country-specific rows share the same WDI definition and provider metadata.
// Store those definitions once without rounding or altering any observation.
export function compactSnapshot(snapshot) {
  const metadataTemplates = {};
  const series = snapshot.series.map((entry) => {
    if (!entry.id.startsWith("WDI_")) return entry;
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
      observations,
      ...shared
    } = entry;
    const key = entry.sourceIndicator;
    if (
      metadataTemplates[key] &&
      JSON.stringify(metadataTemplates[key]) !== JSON.stringify(shared)
    )
      throw new Error(`Inconsistent shared WDI metadata: ${key}`);
    metadataTemplates[key] = shared;
    return {
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
      metadataKey: key,
      observations,
    };
  });
  return { ...snapshot, metadataTemplates, series };
}

export function expandSnapshot(snapshot) {
  const { metadataTemplates, ...rest } = snapshot;
  return {
    ...rest,
    series: snapshot.series.map(({ metadataKey, ...entry }) => {
      if (!metadataKey) return entry;
      const shared = metadataTemplates?.[metadataKey];
      if (!shared) throw new Error(`Missing snapshot metadata: ${metadataKey}`);
      return { ...shared, ...entry };
    }),
  };
}

export function readSnapshot() {
  return expandSnapshot(
    JSON.parse(
      readFileSync(
        new URL("../public/data/snapshot.json", import.meta.url),
        "utf8",
      ),
    ),
  );
}
