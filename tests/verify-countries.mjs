import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import snapshot from "../public/data/snapshot.json" with { type: "json" };
import world from "../public/world.json" with { type: "json" };
import {
  countriesFor,
  countryIds,
  countryReadout,
  countryMomentum,
} from "../src/countries.js";

const runtime = JSON.parse(
  await readFile(
    new URL("../public/data/runtime/catalog.json", import.meta.url),
  ),
);
const countries = countriesFor(snapshot);
const runtimeCountries = countriesFor(runtime);
const byId = new Map(snapshot.series.map((series) => [series.id, series]));
const countryById = new Map(countries.map((country) => [country.id, country]));
const geometryIds = new Set(
  world.countries.flatMap(({ id, economicId }) =>
    [id, economicId].filter(Boolean),
  ),
);

assert.ok(
  countries.length >= 200,
  `Expected the current World Bank roster, received ${countries.length} economies`,
);
assert.equal(
  new Set(countries.map(({ id }) => id)).size,
  countries.length,
  "country IDs are unique",
);
assert.ok(countries.every(({ id }) => /^[A-Z0-9]{3}$/.test(id)));
assert.ok(
  !countryById.has("WLD"),
  "provider aggregate is not a country selector",
);

for (const country of countries) {
  assert.ok(country.name, `${country.id}: source country name`);
  assert.ok(country.region, `${country.id}: source region`);
  assert.ok(
    country.lon === null || Number.isFinite(country.lon),
    `${country.id}: longitude is finite or null`,
  );
  assert.ok(
    country.lat === null || Number.isFinite(country.lat),
    `${country.id}: latitude is finite or null`,
  );

  const actual = snapshot.series.filter(
    (series) =>
      (series.countryCode === country.id ||
        series.id.startsWith(`WDI_${country.id}_`)) &&
      Array.isArray(series.observations) &&
      series.observations.length > 0,
  );
  assert.ok(
    actual.length >= 1,
    `${country.id}: at least one actual country history`,
  );

  // Every economy remains reachable by globe, including small territory pins.
  assert.ok(
    geometryIds.has(country.id) ||
      (Number.isFinite(country.lon) && Number.isFinite(country.lat)),
    `${country.id}: geometry or coordinate pin representation`,
  );

  const readings = countryReadout(snapshot, country.id);
  assert.equal(readings.length, 4, `${country.id}: four readout slots`);
  for (const reading of readings) {
    const source = byId.get(reading.id);
    const observations = source?.observations || [];
    const latest = observations.at(-1);
    if (!source || !latest) {
      assert.equal(
        reading.value,
        null,
        `${country.id}/${reading.id}: missing value is null`,
      );
      assert.equal(
        reading.date,
        null,
        `${country.id}/${reading.id}: missing date is null`,
      );
      continue;
    }
    let expectedValue = latest[1];
    if (
      country.id === "USA" &&
      reading.id !== "UNRATE" &&
      /^\d{4}-\d{2}-\d{2}$/.test(latest[0])
    ) {
      const priorDate = `${Number(latest[0].slice(0, 4)) - 1}${latest[0].slice(4)}`;
      const prior = observations.find(([date]) => date === priorDate)?.[1];
      expectedValue =
        Number.isFinite(prior) && prior > 0
          ? ((latest[1] - prior) / prior) * 100
          : null;
    }
    assert.equal(
      reading.value,
      expectedValue,
      `${country.id}/${reading.id}: readout uses actual latest value`,
    );
    assert.equal(
      reading.date,
      latest[0],
      `${country.id}/${reading.id}: readout uses actual source date`,
    );
    assert.ok(reading.sourceUrl?.startsWith("https://"));
    assert.equal(
      reading.sourceUrl,
      source.sourceUrl,
      `${country.id}/${reading.id}: readout retains exact source URL`,
    );
  }
}

// The complete snapshot and the lazy runtime catalog must produce identical
// map momentum.  This catches a lost previous-year coverage field as well as
// a topic-bundle member/hash lookup that points at the wrong history.
const completeMomentum = countryMomentum(snapshot, countries);
const runtimeMomentum = countryMomentum(
  runtime,
  runtimeCountries.length ? runtimeCountries : countries,
);
for (const country of countries)
  assert.deepEqual(
    runtimeMomentum.get(country.id),
    completeMomentum.get(country.id),
    `${country.id}: complete/runtime country momentum parity`,
  );

// Independent formula: GDP growth change is latest year minus the exact
// prior calendar year, never the previous array element.
for (const country of countries) {
  const countryGrowth = snapshot.series.filter(
    (series) =>
      (series.countryCode === country.id ||
        series.id.startsWith(`WDI_${country.id}_`)) &&
      (series.indicatorKey === "GDPGROWTH" || series.id.endsWith("_GDPGROWTH")),
  );
  const growth =
    countryGrowth.find(
      (series) => series.id === `WDI_${country.id}_GDPGROWTH`,
    ) || countryGrowth[0];
  const rows = (growth?.observations || []).filter(
    ([date, value]) => /^\d{4}-12-31$/.test(date) && Number.isFinite(value),
  );
  const latest = rows.at(-1);
  const prior = latest
    ? rows.find(
        ([date]) =>
          date.slice(0, 4) === String(Number(latest[0].slice(0, 4)) - 1),
      )
    : null;
  const expected =
    latest && prior && Number.isFinite(latest[1]) && Number.isFinite(prior[1])
      ? latest[1] - prior[1]
      : null;
  assert.equal(
    completeMomentum.get(country.id)?.change,
    expected,
    `${country.id}: independently calculated GDP change`,
  );
}

// Unknown IDs must not create synthetic WDI requests. Known IDs retain only
// the IDs present in the source snapshot; missing indicators use other actual
// readings, or remain null when no alternative exists.
assert.deepEqual(countryIds("ZZZ"), [], "unknown country IDs are filtered");

const partial = {
  countries: [{ id: "ZZZ", name: "Fixture", region: "Test", seriesCount: 3 }],
  series: [
    ["GDPGROWTH", "Real GDP growth", "%", 2.5],
    ["POP", "Population", "people", 123456],
    ["GDPNOMINAL", "Nominal GDP", "current USD", 987654321],
  ].map(([key, name, unit, value]) => ({
    id: `WDI_ZZZ_${key}`,
    countryCode: "ZZZ",
    indicatorKey: key,
    indicatorName: name,
    unit,
    frequency: "annual",
    sourceUrl: `https://data.worldbank.org/indicator/${key}`,
    observations: [["2025-12-31", value]],
  })),
};
const filled = countryReadout(partial, "ZZZ");
assert.deepEqual(
  filled.map(({ value }) => value),
  [123456, 987654321, 2.5, null],
);
assert.equal(
  filled[0].label,
  "Population",
  "fallback keeps its own actual label",
);
assert.equal(filled[0].unit, "people");
assert.equal(filled[0].date, "2025-12-31");
assert.ok(filled[0].fallbackFor, "fallback provenance retains replaced slot");
assert.equal(
  new Set(filled.filter(({ value }) => value !== null).map(({ id }) => id))
    .size,
  3,
  "fallback readings are not repeated",
);
const partialRuntime = {
  ...partial,
  series: partial.series.map(({ observations, ...series }) => ({
    ...series,
    coverage: { latest: observations.at(-1) },
  })),
};
assert.deepEqual(
  countryReadout(partialRuntime, "ZZZ"),
  filled,
  "fallbacks work instantly from catalog metadata without history loading",
);
const territorialFixture = {
  ...partial,
  countries: [
    { ...partial.countries[0], sourceFamily: "Official fixture statistics" },
  ],
  series: partial.series.map((series) => ({
    ...series,
    id: series.id.replace("WDI_", "TERR_"),
    sourceFamily: "Official fixture statistics",
  })),
};
assert.deepEqual(
  countryReadout(territorialFixture, "ZZZ").map(({ value }) => value),
  [123456, 987654321, 2.5, null],
  "official supplementary providers follow the same core-slot fallback rules",
);

const geographyAudit = JSON.parse(
  await readFile(
    new URL("../public/data/geographic-coverage.json", import.meta.url),
  ),
);
assert.equal(geographyAudit.isoRosterCount, 249);
assert.equal(geographyAudit.rosterCount, 250);
assert.deepEqual(geographyAudit.missingIsoCodes, []);
assert.equal(
  new Set(world.countries.map(({ id }) => id)).size,
  world.countries.length,
);
for (const entry of geographyAudit.entries) {
  assert.ok(
    entry.geometryIds.length,
    `${entry.isoCode}: audited geographic representation`,
  );
  assert.ok(
    entry.geometryIds.every((id) =>
      world.countries.some(
        (country) => country.id === id && country.polygons.length,
      ),
    ),
    `${entry.isoCode}: real polygon outline, not just a pin`,
  );
}
for (const country of world.countries) {
  assert.ok(
    country.name &&
      Number.isFinite(country.lon) &&
      Number.isFinite(country.lat),
    `${country.id}: hover identity and position`,
  );
  for (const polygon of country.polygons)
    for (const ring of polygon) {
      assert.ok(ring.length >= 4, `${country.id}: noncollapsed island ring`);
      assert.deepEqual(ring[0], ring.at(-1), `${country.id}: closed boundary`);
      assert.ok(
        ring.every(
          ([lon, lat]) =>
            Number.isFinite(lon) &&
            Number.isFinite(lat) &&
            Math.abs(lon) <= 180 &&
            Math.abs(lat) <= 90,
        ),
      );
    }
}

console.log(
  `Verified ${countries.length} source-rostered economies, actual-history/readout contracts, geometry-or-pin availability, complete/runtime momentum parity, exact-year GDP changes, and unknown-ID filtering.`,
);
