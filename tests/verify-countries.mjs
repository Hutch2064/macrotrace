import assert from "node:assert/strict";
import snapshot from "../public/data/snapshot.json" with { type: "json" };
import world from "../public/world.json" with { type: "json" };
import {
  countries,
  countryIds,
  countryReadout,
  countryMomentum,
} from "../src/countries.js";
import { valueText, unitLabel } from "../src/common.js";

assert.equal(countries.length, 16);
const byId = new Map(snapshot.series.map((series) => [series.id, series]));
const momentum = countryMomentum(snapshot);
for (const country of countries) {
  const growth = byId.get(`WDI_${country.id}_GDPGROWTH`).observations;
  const [date, value] = growth.at(-1);
  const prior = new Map(growth).get(
    `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`,
  );
  assert.equal(momentum.get(country.id).value, value);
  assert.equal(momentum.get(country.id).change, value - prior);
  assert.ok(
    world.countries.some(({ id }) => id === country.id),
    `${country.id}: actual map geometry`,
  );
  const readings = countryReadout(snapshot, country.id);
  assert.equal(readings.length, 4);
  for (const reading of readings) {
    assert.ok(
      Number.isFinite(reading.value),
      `${reading.id}: real observation`,
    );
    assert.ok(reading.sourceUrl.startsWith("https://"));
    const source = byId.get(reading.id);
    if (country.id !== "USA" || reading.id === "UNRATE") {
      assert.equal(reading.value, source.observations.at(-1)[1]);
      assert.equal(reading.date, source.observations.at(-1)[0]);
    }
    assert.ok(countryIds(country.id).includes(reading.id));
  }
}
const missing = countryReadout({ series: [] }, "CAN");
assert.equal(countryMomentum({ series: [] }).get("CAN").change, null);
assert.equal(
  countryMomentum({
    series: [
      {
        id: "WDI_CAN_GDPGROWTH",
        observations: [
          ["2022-12-31", 3],
          ["2024-12-31", 2],
        ],
      },
    ],
  }).get("CAN").change,
  null,
);
assert.ok(missing.every(({ value, date }) => value === null && date === null));
assert.equal(
  countryReadout(
    { series: [{ ...byId.get("UNRATE"), refreshStatus: "ok" }] },
    "USA",
  )[2].retained,
  false,
);
assert.equal(
  countryReadout(
    {
      series: [
        { ...byId.get("UNRATE"), refreshStatus: "upstream-unavailable" },
      ],
    },
    "USA",
  )[2].retained,
  true,
);
assert.equal(valueText(5, "%"), "5%");
assert.equal(valueText(0.25, "percentage points", true), "+0.25 pp");
assert.equal(unitLabel("index points"), "pts");
assert.equal(valueText(null, "%"), "—");
console.log(
  "Verified 16 country geometries, 64 source-bound headline readings, missing values, and consistent percent/point formatting.",
);
