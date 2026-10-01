import assert from "node:assert/strict";
import { fredSeries } from "../scripts/catalog.mjs";
import { extendedFredSeries } from "../scripts/extended-macro-catalog.mjs";
import {
  additionalInternationalFredSeries,
  internationalExpansionVerification,
} from "../scripts/international-macro-expansion.mjs";

const existingIds = new Set(
  [...fredSeries, ...extendedFredSeries].map((series) => series[0]),
);
const ids = new Set();
const expectedFamilyCounts = {
  hicp: 23,
  emergingCpi: 2,
  harmonizedUnemployment: 20,
  manufacturingGrowth: 28,
  retailGrowth: 26,
  leadingIndicators: 16,
  consumerConfidence: 26,
  quarterlyRealGdp: 16,
};

assert.equal(
  additionalInternationalFredSeries.length,
  157,
  "the expansion should retain the researched 100-250 series target",
);
assert.deepEqual(
  internationalExpansionVerification.familyCounts,
  expectedFamilyCounts,
);
assert.equal(internationalExpansionVerification.seriesCount, 157);
assert.equal(internationalExpansionVerification.verificationDate, "2026-09-30");

for (const series of additionalInternationalFredSeries) {
  assert.ok(Array.isArray(series) && series.length === 7);
  const [id, name, category, unit, frequency, transform, metadata] = series;
  assert.match(id, /^[A-Z0-9_]+$/);
  assert.ok(!ids.has(id), `duplicate expansion identifier: ${id}`);
  assert.ok(
    !existingIds.has(id),
    `expansion duplicates existing catalog: ${id}`,
  );
  ids.add(id);

  assert.ok(name && category && unit && frequency);
  assert.equal(transform, "identity");
  assert.ok(
    [
      "International Growth",
      "International Inflation",
      "International Labor",
    ].includes(category),
    `unexpected category for ${id}`,
  );
  assert.ok(["monthly", "quarterly"].includes(frequency));
  assert.ok(metadata && typeof metadata === "object");
  assert.match(metadata.countryCode, /^[A-Z]{3}$/);
  assert.equal(metadata.country, metadata.geography);
  assert.ok(metadata.country && metadata.geography);
  assert.ok(metadata.provider);
  assert.ok(metadata.sourceFamily);
  assert.ok(metadata.publishedUnit);
  assert.ok(metadata.methodology);
  assert.ok(metadata.rightsNote);
  assert.equal(metadata.validationDate, "2026-09-30");
  assert.match(
    metadata.lastVerifiedObservation,
    /^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/,
  );
  assert.ok(metadata.availabilityNote);
  assert.ok(
    Number.isInteger(metadata.observationCount) || !metadata.observationCount,
  );
}

const family = (prefix) =>
  additionalInternationalFredSeries.filter(([id]) => id.startsWith(prefix));

assert.equal(family("CP0000").length, 23);
assert.equal(
  additionalInternationalFredSeries.filter(([id]) =>
    /^CPALTT01(?:IN|CN)M659N$/.test(id),
  ).length,
  2,
);
assert.equal(family("LRHUTTTT").length, 20);
assert.equal(
  additionalInternationalFredSeries.filter(([id]) => /PRMNTO01GYSAM$/.test(id))
    .length,
  28,
);
assert.equal(
  additionalInternationalFredSeries.filter(([id]) => /SLRTTO01GYSAM$/.test(id))
    .length,
  26,
);
assert.equal(
  additionalInternationalFredSeries.filter(([id]) => /LOLITOAASTSAM$/.test(id))
    .length,
  16,
);
assert.equal(
  additionalInternationalFredSeries.filter(([id]) => /^CSCICP02/.test(id))
    .length,
  26,
);
assert.equal(
  additionalInternationalFredSeries.filter(([id]) => /^CLVMNACSCAB1GQ/.test(id))
    .length,
  16,
);

for (const [id, , , unit, frequency, , metadata] of family("CP0000")) {
  assert.equal(unit, "index");
  assert.equal(frequency, "monthly");
  assert.equal(metadata.sourceFamily, "Eurostat HICP via FRED");
  assert.equal(metadata.lastVerifiedObservation, "2026-08-01");
  assert.match(id, /^CP0000[A-Z]{2}M086NEST$/);
}
for (const [id, , , unit, frequency, , metadata] of family("LRHUTTTT")) {
  assert.equal(unit, "%");
  assert.equal(frequency, "monthly");
  assert.equal(metadata.sourceFamily, "OECD Main Economic Indicators via FRED");
  assert.equal(metadata.lastVerifiedObservation, "2026-07-01");
  assert.match(id, /^LRHUTTTT[A-Z]{2}M156S$/);
}
for (const [
  id,
  ,
  ,
  unit,
  frequency,
  ,
  metadata,
] of additionalInternationalFredSeries.filter(([candidate]) =>
  /^CPALTT01(?:IN|CN)M659N$/.test(candidate),
)) {
  assert.equal(unit, "%");
  assert.equal(frequency, "monthly");
  assert.equal(metadata.historyStatus, "historical");
  assert.equal(metadata.sourceFamily, "OECD Main Economic Indicators via FRED");
  assert.match(metadata.archiveReason, /ends at 2025-(03|04)-01/);
  assert.match(id, /^CPALTT01(?:IN|CN)M659N$/);
}
for (const [
  id,
  ,
  ,
  unit,
  frequency,
  ,
  metadata,
] of additionalInternationalFredSeries.filter(([candidate]) =>
  /PRMNTO01GYSAM$/.test(candidate),
)) {
  assert.equal(unit, "%");
  assert.equal(frequency, "monthly");
  assert.equal(metadata.changeType, "basis-points");
  assert.match(id, /^[A-Z]{3}PRMNTO01GYSAM$/);
}
for (const [
  id,
  ,
  ,
  unit,
  frequency,
  ,
  metadata,
] of additionalInternationalFredSeries.filter(([candidate]) =>
  /^CLVMNACSCAB1GQ/.test(candidate),
)) {
  assert.equal(unit, "millions chained 2010 euros");
  assert.equal(frequency, "quarterly");
  assert.equal(metadata.sourceFamily, "Eurostat National Accounts via FRED");
  assert.match(id, /^CLVMNACSCAB1GQ[A-Z]{2}$/);
}

console.log(
  `Verified ${additionalInternationalFredSeries.length} unique international FRED tuples across ${Object.keys(expectedFamilyCounts).length} current Eurostat/OECD families; every entry has explicit country, geography, ISO3 code, source, methodology, rights, frequency/unit, and CSV freshness metadata.`,
);
