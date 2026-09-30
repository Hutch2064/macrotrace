import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { geoArea, geoOrthographic, geoPath } from "d3-geo";
import { displayGeometry } from "../src/globe-geometry.js";

const world = JSON.parse(
  await readFile(new URL("../public/world.json", import.meta.url)),
);
for (const radius of [140, 320]) {
  for (const country of world.countries) {
    const geometry = displayGeometry(country.polygons, radius);
    assert.equal(geometry.coordinates.length, country.polygons.length);
    geometry.coordinates.forEach((polygon, i) => {
      assert.equal(
        polygon.length,
        country.polygons[i].length,
        `${country.id}: preserve islands and holes`,
      );
      polygon.forEach((ring, j) => {
        assert.ok(
          ring.length >= 4,
          `${country.id}: a ring must remain a polygon`,
        );
        assert.deepEqual(ring[0], ring.at(-1));
        const area = geoArea({ type: "Polygon", coordinates: [ring] });
        assert.ok(
          j ? area >= 2 * Math.PI : area <= 2 * Math.PI,
          `${country.id}: normalize ring winding`,
        );
      });
    });
  }
}
// Exercise the same clipped Canvas path at both poles and several tilted views.
const radius = 200;
let points = 0;
const check = (x, y) => {
  assert.ok(Number.isFinite(x) && Number.isFinite(y));
  assert.ok(
    Math.hypot(x, y) <= radius + 1e-6,
    "No path can escape the front disc",
  );
  points++;
};
const context = {
  moveTo: check,
  lineTo: check,
  closePath() {},
  arc(x, y, r) {
    assert.ok(r <= radius);
  },
};
const projection = geoOrthographic()
  .scale(radius)
  .translate([0, 0])
  .clipAngle(90)
  .precision(0.4);
const path = geoPath(projection, context);
for (const pitch of [-90, -75, 0, 75, 90])
  for (const yaw of [-180, -90, 0, 90]) {
    projection.rotate([-yaw, -pitch]);
    for (const country of world.countries)
      path(displayGeometry(country.polygons, radius));
  }
assert.ok(points > 10000);
console.log(
  `Verified all ${world.countries.length} land units, ring winding and ${points} polar/horizon path coordinates.`,
);
