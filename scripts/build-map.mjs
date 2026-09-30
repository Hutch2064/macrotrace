import { writeFile } from "node:fs/promises";

// Public-domain Natural Earth 1:110m geometry; economic data is kept separate.
const source =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";
const response = await fetch(source);
if (!response.ok) throw new Error(`Natural Earth: ${response.status}`);
const data = await response.json();
const round = (coordinates) =>
  typeof coordinates[0] === "number"
    ? coordinates.map((value) => Math.round(value * 100) / 100)
    : coordinates.map(round);
const countries = data.features.map(({ properties, geometry }) => ({
  id: properties.ADM0_A3,
  polygons: round(
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates,
  ),
}));
await writeFile(
  "public/world.json",
  JSON.stringify({ source, license: "Public domain", countries }),
);
console.log(`Packed ${countries.length} Natural Earth country outlines.`);
