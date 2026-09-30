import { writeFile } from "node:fs/promises";

// Public-domain Natural Earth 1:110m geometry; economic data is kept separate.
const source =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";
const detailSource =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";
const pinSource =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson";
const pinMapUnitSource =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_map_units.geojson";
const response = await fetch(source);
if (!response.ok) throw new Error(`Natural Earth 110m: ${response.status}`);
const data = await response.json();
const detailResponse = await fetch(detailSource);
if (!detailResponse.ok)
  throw new Error(`Natural Earth 50m: ${detailResponse.status}`);
const detailData = await detailResponse.json();
const [pinResponse, pinMapUnitResponse] = await Promise.all([
  fetch(pinSource),
  fetch(pinMapUnitSource),
]);
if (!pinResponse.ok)
  throw new Error(`Natural Earth 10m countries: ${pinResponse.status}`);
if (!pinMapUnitResponse.ok)
  throw new Error(`Natural Earth 10m map units: ${pinMapUnitResponse.status}`);
const pinData = await pinResponse.json();
const pinMapUnitData = await pinMapUnitResponse.json();

// Natural Earth's map identifiers differ from the World Bank roster for a few
// economies. Keep the canonical roster IDs in the client-facing geometry.
const aliases = { GGY: "CHI", JEY: "CHI", KOS: "XKX", PSX: "PSE" };
const canonicalId = (id) => aliases[id] || id;
const pinIds = new Set([
  "GIB",
  "AIA",
  "COK",
  "MSR",
  "NIU",
  "PCN",
  "SSD",
  "TKL",
  "WLF",
]);
const round = (coordinates) =>
  typeof coordinates[0] === "number"
    ? coordinates.map((value) => Math.round(value * 100) / 100)
    : coordinates.map(round);
const geometryFor = ({ properties, geometry }, coordinateSource) => {
  const lon = Number(properties.LABEL_X);
  const lat = Number(properties.LABEL_Y);
  return {
    id: canonicalId(properties.ADM0_A3),
    ...(Number.isFinite(lon) && Number.isFinite(lat)
      ? { lon, lat, coordinateSource }
      : {}),
    polygons: round(
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.coordinates,
    ),
  };
};
const pinIdFor = (properties) =>
  canonicalId(
    (properties.ISO_A3 && properties.ISO_A3 !== "-99"
      ? properties.ISO_A3
      : null) ||
      properties.GU_A3 ||
      properties.SU_A3 ||
      properties.ADM0_A3,
  );
const pinFor = ({ properties }, coordinateSource) => {
  const id = pinIdFor(properties);
  const lon = Number(properties.LABEL_X);
  const lat = Number(properties.LABEL_Y);
  return Number.isFinite(lon) && Number.isFinite(lat)
    ? {
        id,
        lon,
        lat,
        coordinateSource,
        polygons: [],
      }
    : null;
};
const countries = data.features.map((feature) =>
  geometryFor(feature, "Natural Earth 110m label"),
);
const byId = new Map(countries.map((country) => [country.id, country]));
let added = 0;
let merged = 0;
for (const feature of detailData.features) {
  const country = geometryFor(feature, "Natural Earth 50m label");
  const existing = byId.get(country.id);
  if (existing) {
    if (country.id === "CHI") existing.polygons.push(...country.polygons);
    if (!Number.isFinite(existing.lon) && Number.isFinite(country.lon)) {
      existing.lon = country.lon;
      existing.lat = country.lat;
      existing.coordinateSource = country.coordinateSource;
    }
    if (country.id === "CHI") merged += 1;
    continue;
  }
  countries.push(country);
  byId.set(country.id, country);
  added += 1;
}
let pinsAdded = 0;
for (const [features, coordinateSource] of [
  [pinData.features, "Natural Earth 10m country label (coordinate pin)"],
  [
    pinMapUnitData.features,
    "Natural Earth 10m map-unit label (coordinate pin)",
  ],
]) {
  for (const feature of features) {
    const pin = pinFor(feature, coordinateSource);
    if (!pin || !pinIds.has(pin.id)) continue;
    const existing = byId.get(pin.id);
    if (existing) {
      if (!Number.isFinite(existing.lon)) {
        existing.lon = pin.lon;
        existing.lat = pin.lat;
        existing.coordinateSource = pin.coordinateSource;
      }
      continue;
    }
    countries.push(pin);
    byId.set(pin.id, pin);
    pinsAdded += 1;
  }
}
await writeFile(
  "public/world.json",
  JSON.stringify({
    source,
    detailSource,
    pinSource,
    pinMapUnitSource,
    license: "Public domain",
    geometryNote:
      "Natural Earth 1:110m outlines plus only missing 1:50m economy outlines; coordinate-only pins use official Natural Earth 1:10m labels without importing 1:10m polygons. Label coordinates are visualization-only positions. Jersey and Guernsey are merged into the World Bank Channel Islands roster entry; roster economies without an outline remain selectable when the catalog supplies coordinates.",
    countries,
  }),
);
console.log(
  `Packed ${countries.length} Natural Earth country outlines (${added} added, ${merged} merged from 50m detail, ${pinsAdded} coordinate pins).`,
);
