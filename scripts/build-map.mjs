import { writeFile } from "node:fs/promises";

// Natural Earth's 10m country and map-unit files are the detailed geometry
// source. Map units are deliberately retained as separate entries: a map
// piece is a geographic identity, while economicId is the optional link to a
// World Bank/economic roster entry.
const countrySource =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson";
const mapUnitSource =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_map_units.geojson";
const rosterSource = "https://unstats.un.org/unsd/methodology/m49/overview/";
const isoRosterSource = "https://www.iso.org/obp/ui/#iso:code:3166";

const [countryResponse, mapUnitResponse, rosterResponse] = await Promise.all([
  fetch(countrySource),
  fetch(mapUnitSource),
  fetch(rosterSource),
]);
if (!countryResponse.ok)
  throw new Error(`Natural Earth 10m countries: ${countryResponse.status}`);
if (!mapUnitResponse.ok)
  throw new Error(`Natural Earth 10m map units: ${mapUnitResponse.status}`);
if (!rosterResponse.ok)
  throw new Error(`UN M49 roster: ${rosterResponse.status}`);
const [countryData, mapUnitData, rosterHtml] = await Promise.all([
  countryResponse.json(),
  mapUnitResponse.json(),
  rosterResponse.text(),
]);

const isCode = (value) => typeof value === "string" && /^[A-Z]{3}$/.test(value);
const mapAliases = { KOS: "XKX", PSX: "PSE" };
const economicAliases = {
  GGY: "CHI",
  JEY: "CHI",
  KOS: "XKX",
  PSX: "PSE",
};
const economicNames = { CHI: "Channel Islands" };
const canonicalMapId = (value) => mapAliases[value] || value;
const canonicalEconomicId = (value) => economicAliases[value] || value;

// The first UN M49 table is the English Country or Area table. Its ISO-alpha3
// column gives an auditable UN M49 roster rather than a hand-maintained
// subset of map labels. The page is HTML, so keep this parser intentionally
// small and dependency-free for the build script.
const decodeHtml = (value) =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/\s+/g, " ")
    .trim();
const firstTable = rosterHtml.match(/<table\b[\s\S]*?<\/table>/i)?.[0];
if (!firstTable) throw new Error("UN M49 roster table was not found");
const roster = [];
for (const row of firstTable.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
  const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
    (cell) => decodeHtml(cell[1]),
  );
  // The table columns are global/region/sub-region/intermediate-region,
  // Country or Area, M49, ISO-alpha2, ISO-alpha3, and status flags.
  const code = cells[11];
  if (cells.length >= 12 && isCode(code)) {
    roster.push({
      name: cells[8],
      isoCode: code,
      m49Code: cells[9],
      region: cells[3],
      subRegion: cells[5],
    });
  }
}
const unM49Count = roster.length;
if (unM49Count !== 248) {
  throw new Error(`UN M49 roster expected 248 rows, found ${unM49Count}`);
}

// UN M49's statistical table omits Taiwan, while ISO-3166 implementations
// expose TWN. Keep the official ISO geography in the audit and document the
// source distinction rather than silently treating it as mainland China.
if (!roster.some((entry) => entry.isoCode === "TWN")) {
  roster.push({
    name: "Taiwan, Province of China",
    isoCode: "TWN",
    m49Code: null,
    region: "Asia",
    subRegion: "Eastern Asia",
    rosterNote: "ISO-3166 geography; absent from UN M49 statistical table",
  });
}
const isoRosterCount = roster.length;
if (isoRosterCount !== 249) {
  throw new Error(`ISO-3166 roster expected 249 rows, found ${isoRosterCount}`);
}

// Kosovo is not assigned an official ISO-3166 alpha-3 code, but Natural Earth
// and the economic roster use XKX for this separately represented geography.
// Audit it as an additional map identity without claiming it is the 249th
// official ISO row.
if (!roster.some((entry) => entry.isoCode === "XKX")) {
  roster.push({
    name: "Kosovo",
    isoCode: "XKX",
    m49Code: null,
    region: "Europe",
    subRegion: "Southern Europe",
    rosterNote:
      "Natural Earth/economic map identity; not an official ISO-3166 assignment",
  });
}
const auditedAreaCount = roster.length;
if (auditedAreaCount !== 250) {
  throw new Error(
    `Audited geography roster expected 250 rows, found ${auditedAreaCount}`,
  );
}
const rosterById = new Map(roster.map((entry) => [entry.isoCode, entry]));

const normalizeLongitude = (value) => {
  let longitude = value;
  while (longitude > 180) longitude -= 360;
  while (longitude < -180) longitude += 360;
  return longitude;
};
const uniquePoints = (points) => {
  const result = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) {
      result.push(point);
    }
  }
  if (
    result.length > 1 &&
    result[0][0] === result.at(-1)[0] &&
    result[0][1] === result.at(-1)[1]
  ) {
    result.pop();
  }
  return result;
};

// Simplify in an unwrapped longitude space. This keeps polygons crossing
// +/-180 degrees continuous; the globe renderer normalizes their longitudes
// when drawing. No ring is discarded, and tiny rings get a finer fallback
// quantization if a coarse step would collapse their shape.
const simplifyRing = (ring, tolerance = 0.025) => {
  if (!Array.isArray(ring) || ring.length < 4) return ring;
  const closed =
    ring[0]?.[0] === ring.at(-1)?.[0] && ring[0]?.[1] === ring.at(-1)?.[1];
  const source = (closed ? ring.slice(0, -1) : ring).map((point) => [
    Number(point[0]),
    Number(point[1]),
  ]);
  if (source.length < 3) return ring;

  const unwrapped = [];
  let offset = 0;
  let previousLongitude = null;
  for (const [longitude, latitude] of source) {
    let unwrappedLongitude = longitude + offset;
    if (previousLongitude !== null) {
      while (unwrappedLongitude - previousLongitude > 180) {
        offset -= 360;
        unwrappedLongitude = longitude + offset;
      }
      while (unwrappedLongitude - previousLongitude < -180) {
        offset += 360;
        unwrappedLongitude = longitude + offset;
      }
    }
    unwrapped.push([unwrappedLongitude, latitude]);
    previousLongitude = unwrappedLongitude;
  }

  const distanceToSegment = (point, start, end) => {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    if (dx === 0 && dy === 0) {
      return Math.hypot(point[0] - start[0], point[1] - start[1]);
    }
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
          (dx * dx + dy * dy),
      ),
    );
    return Math.hypot(
      point[0] - (start[0] + t * dx),
      point[1] - (start[1] + t * dy),
    );
  };
  const simplify = (points) => {
    if (points.length <= 2) return points;
    let maxDistance = tolerance;
    let splitAt = -1;
    const start = points[0];
    const end = points.at(-1);
    for (let index = 1; index < points.length - 1; index += 1) {
      const distance = distanceToSegment(points[index], start, end);
      if (distance > maxDistance) {
        maxDistance = distance;
        splitAt = index;
      }
    }
    if (splitAt < 0) return [start, end];
    return [
      ...simplify(points.slice(0, splitAt + 1)).slice(0, -1),
      ...simplify(points.slice(splitAt)),
    ];
  };
  const reduced = simplify(unwrapped);
  const candidate = reduced.map(([longitude, latitude]) => [
    normalizeLongitude(longitude),
    latitude,
  ]);
  candidate.push(candidate[0]);
  return candidate;
};

const MAX_RING_POINTS = 2500;
const quantizeRing = (ring) => {
  const simplified = simplifyRing(ring);
  const quantize = (value, scale) => Math.round(value * scale) / scale;
  const quantizeAt = (source, scale) => {
    const points = uniquePoints(
      source.map(([longitude, latitude]) => [
        quantize(normalizeLongitude(longitude), scale),
        quantize(latitude, scale),
      ]),
    );
    if (points.length) points.push(points[0]);
    return points;
  };
  let points = quantizeAt(simplified, 10_000);
  if (points.length < 4 && ring.length >= 4)
    points = quantizeAt(simplified, 100_000);
  // Very small polygons (the Holy See is the common example) can be reduced
  // below three unique vertices by the tolerance itself. Preserve the source
  // ring at fine precision rather than turning it into a coordinate-only pin.
  if (points.length < 4 && ring.length >= 4)
    points = quantizeAt(ring, 1_000_000);
  if (points.length < 4) return [];
  if (points.length <= MAX_RING_POINTS) return points;

  // A deterministic cap bounds payload and hit-test work on unusually dense
  // Natural Earth rings while retaining the first/last closure points.
  const stride = Math.ceil((points.length - 1) / (MAX_RING_POINTS - 1));
  const bounded = [points[0]];
  for (let index = stride; index < points.length - 1; index += stride) {
    bounded.push(points[index]);
  }
  bounded.push(points.at(-1));
  return bounded;
};

const geometryPolygons = (geometry) => {
  if (!geometry) return [];
  const rawPolygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];
  return rawPolygons
    .map((polygon) =>
      polygon.map(quantizeRing).filter((ring) => ring.length >= 4),
    )
    .filter((polygon) => polygon.length > 0);
};

const centroidFromGeometry = (geometry) => {
  const polygons = geometryPolygons(geometry);
  const points = polygons.flat(2).filter((point) => point.length === 2);
  if (!points.length) return null;
  return {
    lon: normalizeLongitude(
      points.reduce((sum, [longitude]) => sum + longitude, 0) / points.length,
    ),
    lat:
      points.reduce((sum, [, latitude]) => sum + latitude, 0) / points.length,
  };
};

const labelFor = (feature) => {
  const longitude = Number(feature.properties?.LABEL_X);
  const latitude = Number(feature.properties?.LABEL_Y);
  if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
    return {
      lon: normalizeLongitude(longitude),
      lat: latitude,
      source: "Natural Earth 10m label",
    };
  }
  const centroid = centroidFromGeometry(feature.geometry);
  return centroid
    ? { ...centroid, source: "Natural Earth 10m geometry centroid" }
    : null;
};

const rawPieceIdFor = (properties) =>
  [
    properties.GU_A3,
    properties.SU_A3,
    properties.ADM0_A3,
    properties.ISO_A3,
  ].find(isCode);
const rawEconomicIdFor = (properties, rawPieceId) => {
  const iso = isCode(properties.ISO_A3) ? properties.ISO_A3 : null;
  const parent = isCode(properties.ADM0_A3) ? properties.ADM0_A3 : null;
  // ISO_A3 is the best identity for map units such as French Guiana, the
  // Caribbean Netherlands, Svalbard, and South Sudan. Geo-unit pieces with
  // no ISO code inherit their Natural Earth ADM0_A3 parent.
  return canonicalEconomicId(iso || parent || rawPieceId);
};

const occupiedIds = new Set();
const countries = [];
const addFeature = (
  feature,
  { fallbackId = null, source = "Natural Earth 10m map unit" } = {},
) => {
  const properties = feature.properties || {};
  const rawPieceId = rawPieceIdFor(properties) || fallbackId;
  if (!isCode(rawPieceId)) return null;
  let id = canonicalMapId(rawPieceId);
  if (occupiedIds.has(id)) {
    // A canonical alias can collide with a real map-unit code. Keep the
    // source piece readable rather than overwriting an existing geometry.
    id = rawPieceId;
  }
  if (occupiedIds.has(id)) return null;
  const polygons = geometryPolygons(feature.geometry);
  const label = labelFor(feature);
  if (!polygons.length && !label) return null;
  const economicId = canonicalEconomicId(
    rawEconomicIdFor(properties, rawPieceId),
  );
  const country = {
    id,
    name:
      properties.NAME_LONG ||
      properties.NAME ||
      properties.ADMIN ||
      rosterById.get(economicId)?.name ||
      id,
    ...(label
      ? { lon: label.lon, lat: label.lat, coordinateSource: label.source }
      : {}),
    polygons,
    ...(economicId && economicId !== id ? { economicId } : {}),
    ...(economicId &&
    economicId !== id &&
    (rosterById.get(economicId) || economicNames[economicId])
      ? {
          economicName:
            rosterById.get(economicId)?.name || economicNames[economicId],
        }
      : {}),
    ...(source ? { geometrySource: source } : {}),
  };
  countries.push(country);
  occupiedIds.add(id);
  return country;
};

// Every 10m map unit is retained, including tiny territories, dependencies,
// disputed units, Antarctica, and uninhabited land. Do not merge GGY/JEY:
// their economic relationship is represented by economicId: CHI instead.
for (const feature of mapUnitData.features) addFeature(feature);

const findCountryFeature = (isoCode) =>
  countryData.features.find((feature) => {
    const properties = feature.properties || {};
    return [properties.ISO_A3, properties.ADM0_A3, properties.GU_A3]
      .filter(isCode)
      .map(canonicalEconomicId)
      .includes(isoCode);
  });

// A few ISO countries/areas are represented only by a sovereign aggregate in
// map_units (notably UMI). Add a country-level 10m feature only when no map
// piece already covers that economic roster code.
for (const entry of roster) {
  const covered = countries.some(
    (country) =>
      country.id === entry.isoCode || country.economicId === entry.isoCode,
  );
  if (covered) continue;
  const feature = findCountryFeature(entry.isoCode);
  if (feature)
    addFeature(feature, {
      fallbackId: entry.isoCode,
      source: "Natural Earth 10m country",
    });
}

const geometryIdsFor = (isoCode) =>
  countries
    .filter(
      (country) => country.id === isoCode || country.economicId === isoCode,
    )
    .map((country) => country.id);
const coverage = roster.map((entry) => {
  const geometryIds = geometryIdsFor(entry.isoCode);
  const polygonIds = geometryIds.filter(
    (id) => countries.find((country) => country.id === id)?.polygons.length,
  );
  const coordinateIds = geometryIds.filter((id) => {
    const country = countries.find((candidate) => candidate.id === id);
    return (
      country && Number.isFinite(country.lon) && Number.isFinite(country.lat)
    );
  });
  return {
    isoCode: entry.isoCode,
    name: entry.name,
    m49Code: entry.m49Code,
    region: entry.region,
    subRegion: entry.subRegion,
    ...(entry.rosterNote ? { rosterNote: entry.rosterNote } : {}),
    geometryIds,
    polygonCount: polygonIds.length,
    coordinateCount: coordinateIds.length,
    status:
      polygonIds.length > 0
        ? "polygon"
        : coordinateIds.length > 0
          ? "coordinate-only"
          : "missing",
  };
});
const missingIsoCodes = coverage
  .filter((entry) => entry.status === "missing")
  .map((entry) => entry.isoCode);
if (missingIsoCodes.length)
  throw new Error(`Missing geographic outlines: ${missingIsoCodes.join(", ")}`);

const geometryNote =
  "Natural Earth 10m admin-0 map units are retained as independent geographic pieces, including tiny territories, dependencies, disputed units, Antarctica, and uninhabited land. Each entry has an id/name and optional economicId link; map identities are not a claim of sovereignty or economic-data availability. Guernsey (GGY) and Jersey (JEY) remain separate pieces and link to the World Bank Channel Islands aggregate (CHI); Gaza and West Bank likewise link to the Palestine aggregate (PSE), while UK constituent pieces link to the United Kingdom aggregate (GBR). Natural Earth KOS and PSX identities are canonically exposed as XKX and PSE. Rings are antimeridian-safe, quantized to bounded precision, and simplified without dropping source polygons. The audit covers the 249 ISO-3166 geographies plus the separately documented Natural Earth/economic XKX identity.";

const world = {
  source: countrySource,
  mapUnitSource,
  rosterSource,
  isoRosterSource,
  rosterCount: auditedAreaCount,
  license:
    "Public domain (Natural Earth); roster attribution: United Nations Statistics Division",
  geometryNote,
  countries,
};
await writeFile("public/world.json", `${JSON.stringify(world)}\n`);
await writeFile(
  "public/data/geographic-coverage.json",
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      rosterSource,
      isoRosterSource,
      geometrySource: mapUnitSource,
      countrySource,
      unM49Count,
      isoRosterCount,
      additionalGeographyCount: auditedAreaCount - isoRosterCount,
      rosterCount: auditedAreaCount,
      naturalEarthCountryFeatureCount: countryData.features.length,
      naturalEarthMapUnitFeatureCount: mapUnitData.features.length,
      geometryEntryCount: countries.length,
      countriesWithPolygons: coverage.filter((entry) => entry.polygonCount > 0)
        .length,
      coordinateOnly: coverage.filter(
        (entry) => entry.status === "coordinate-only",
      ).length,
      missingIsoCodes,
      aliases: { map: mapAliases, economic: economicAliases },
      entries: coverage,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `Packed ${countries.length} Natural Earth 10m geography entries for ${isoRosterCount} ISO rows plus ${auditedAreaCount - isoRosterCount} documented map identity (${missingIsoCodes.length} missing; ${coverage.filter((entry) => entry.status === "coordinate-only").length} coordinate-only).`,
);
