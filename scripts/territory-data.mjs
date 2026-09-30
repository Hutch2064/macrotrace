import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const REQUEST_TIMEOUT_MS = 30_000;
const TERRITORY_PREFIX = "TERR_";

const JERSEY_GDP_URL =
  "https://opendata.gov.je/dataset/a8d377e2-a584-4f16-8d9f-8f26e6933b95/resource/69bc3b4b-9c2f-470f-a42b-97daab3271ec/download/gdp-in-real-terms-constant-2023-values-million-average.csv";
const JERSEY_RPI_URL =
  "https://opendata.gov.je/dataset/4d789cae-cd00-4377-8246-83db3638971a/resource/0501a918-9e04-4e82-b2f5-87568109660b/download/rpi-and-rpix-index-numbers-and-percentage-changes.csv";
const JERSEY_GDP_PAGE =
  "https://opendata.gov.je/dataset/national-accounts/resource/69bc3b4b-9c2f-470f-a42b-97daab3271ec?inner_span=True";
const JERSEY_RPI_PAGE =
  "https://opendata.gov.je/dataset/rpi-rpi-x-rpi-y-rpi-pensioners-and-rpi-low-income-percentage-changes";
const JERSEY_CKAN_API = "https://opendata.gov.je/api/3/action/package_show";
const JERSEY_GDP_DATASET = "national-accounts";
const JERSEY_RPI_DATASET =
  "rpi-rpi-x-rpi-y-rpi-pensioners-and-rpi-low-income-percentage-changes";

const INSEE_PAGE = "https://www.insee.fr/fr/statistiques/8391986";
const INSEE_CATALOG_URL =
  "https://api.insee.fr/melodi/catalog/DS_COMPTES_REGIONAUX";
const INSEE_DATA_URL = "https://api.insee.fr/melodi/data/DS_COMPTES_REGIONAUX";
const INSEE_WORKBOOK_URL =
  "https://www.insee.fr/fr/statistiques/fichier/8391986/PIB_REG_fr.xlsx";

const ASUB_API_BASE = "https://pxweb.asub.ax/PXWeb/api/v1/en";
const ASUB_GDP_API = `${ASUB_API_BASE}/Statistik/NA/Bruttonationalprodukt/NA039.px`;
const ASUB_CPI_API = `${ASUB_API_BASE}/Statistik/KO/KO007.px`;
const ASUB_GDP_PAGE =
  "https://pxweb.asub.ax/PXWeb/pxweb/en/Statistik/Statistik__NA__Bruttonationalprodukt/NA039.px/";
const ASUB_CPI_PAGE =
  "https://pxweb.asub.ax/PXWeb/pxweb/en/Statistik/Statistik__KO/KO007.px/";

const CBS_GDP_TABLE = "84789NED";
const CBS_CPI_TABLE = "84046ENG";
const CBS_GDP_PAGE = "https://www.cbs.nl/en-gb/figures/detail/84789ENG";
const CBS_CPI_PAGE = "https://www.cbs.nl/en-gb/figures/detail/84046ENG";
const CBS_BASE = "https://opendata.cbs.nl/ODataApi/OData";

const INSEE_TERRITORIES = Object.freeze([
  {
    code: "GLP",
    sourceCode: "FRY1",
    geo: "2024-OTHER-01_COMER978",
    name: "Guadeloupe",
    row: "Guadeloupe (y compris Saint-Martin)",
    region: "Latin America & Caribbean",
  },
  {
    code: "MTQ",
    sourceCode: "FRY2",
    geo: "2024-REG-02",
    name: "Martinique",
    row: "Martinique",
    region: "Latin America & Caribbean",
  },
  {
    code: "GUF",
    sourceCode: "FRY3",
    geo: "2024-REG-03",
    name: "French Guiana",
    row: "Guyane",
    region: "Latin America & Caribbean",
  },
  {
    code: "REU",
    sourceCode: "FRY4",
    geo: "2024-REG-04",
    name: "Réunion",
    row: "La Réunion",
    region: "Sub-Saharan Africa",
  },
  {
    code: "MYT",
    sourceCode: "FRY5",
    geo: "2024-REG-06",
    name: "Mayotte",
    row: "Mayotte",
    region: "Sub-Saharan Africa",
  },
]);

const BES_ISLANDS = Object.freeze([
  { sourceCode: "GM9001", name: "Bonaire" },
  { sourceCode: "GM9002", name: "Sint Eustatius" },
  { sourceCode: "GM9003", name: "Saba" },
]);

function text(value) {
  return String(value ?? "").trim();
}

export function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return null;
  const number = Number(String(value).replaceAll(",", "").trim());
  return Number.isFinite(number) ? number : null;
}

function checkedDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date;
}

function isoDate(date) {
  return checkedDate(date).toISOString();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceHash(value) {
  return sha256(typeof value === "string" ? value : Buffer.from(value));
}

function csvRows(textValue) {
  const contents = String(textValue ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index];
    if (character === '"') {
      if (quoted && contents[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && contents[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => text(value))) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => text(value))) rows.push(row);
  }
  if (!rows.length) throw new Error("CSV has no rows");
  const headers = rows.shift().map((value) => text(value));
  if (headers.some((header) => !header))
    throw new Error("CSV has a blank header");
  const duplicate = headers.find(
    (header, index) => headers.indexOf(header) !== index,
  );
  if (duplicate) throw new Error(`CSV duplicate header: ${duplicate}`);
  return rows.map((values) =>
    Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    ),
  );
}

function requireFields(record, fields, label) {
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(record, field))
      throw new Error(`${label} missing field ${field}`);
  }
}

function annualDate(year) {
  return `${year}-12-31`;
}

function monthDate(year, month) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function quarterDate(year, quarter) {
  return `${year}-${String(quarter * 3).padStart(2, "0")}-01`;
}

function completedYear(now) {
  return checkedDate(now).getUTCFullYear() - 1;
}

function sortObservations(observations) {
  return [...observations].sort((left, right) =>
    left[0].localeCompare(right[0]),
  );
}

function uniqueObservations(observations, label) {
  const seen = new Set();
  for (const [date] of observations) {
    if (seen.has(date))
      throw new Error(`${label} duplicate observation ${date}`);
    seen.add(date);
  }
  return sortObservations(observations);
}

function deriveAnnualGrowth(observations) {
  const byYear = new Map(
    observations.map(([date, value]) => [
      Number(date.slice(0, 4)),
      [date, value],
    ]),
  );
  const derived = [];
  for (const [year, [date, value]] of byYear) {
    const previous = byYear.get(year - 1);
    if (!previous || previous[1] <= 0 || value === null) continue;
    derived.push([date, (value / previous[1] - 1) * 100]);
  }
  return sortObservations(derived);
}

function yearMonthKey(date) {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
}

function deriveMonthlyInflation(observations) {
  const byPeriod = new Map(
    observations.map(([date, value]) => [yearMonthKey(date), value]),
  );
  return sortObservations(
    observations.flatMap(([date, value]) => {
      const previous = byPeriod.get(yearMonthKey(date) - 12);
      return previous !== undefined && previous > 0
        ? [[date, (value / previous - 1) * 100]]
        : [];
    }),
  );
}

function quarterKey(date) {
  return (
    Number(date.slice(0, 4)) * 4 +
    Math.floor((Number(date.slice(5, 7)) - 1) / 3)
  );
}

function deriveQuarterlyInflation(observations) {
  const byPeriod = new Map(
    observations.map(([date, value]) => [quarterKey(date), value]),
  );
  return sortObservations(
    observations.flatMap(([date, value]) => {
      const previous = byPeriod.get(quarterKey(date) - 4);
      return previous !== undefined && previous > 0
        ? [[date, (value / previous - 1) * 100]]
        : [];
    }),
  );
}

function mapStatus(value) {
  const normalized = text(value).toLowerCase();
  if (!normalized) return null;
  if (normalized === "sd" || normalized.includes("semi"))
    return "semi-definitive";
  if (
    normalized === "prov" ||
    normalized.includes("provis") ||
    normalized.includes("voorlop")
  )
    return "provisional";
  if (
    normalized === "d" ||
    normalized.includes("definit") ||
    normalized.includes("final")
  )
    return "definitive";
  return normalized;
}

function dateStatus(statusByDate, observations) {
  const values = observations
    .map(([date]) => statusByDate?.[date])
    .filter(Boolean);
  const distinct = [...new Set(values)];
  return distinct.length === 1
    ? distinct[0]
    : distinct.length
      ? "mixed; see observationStatus"
      : null;
}

function latestObservationStatus(statusByDate, observations) {
  return observations.length
    ? statusByDate?.[observations.at(-1)[0]] || null
    : null;
}

function makeSeries({
  id,
  name,
  indicatorKey,
  indicatorName = name,
  country,
  countryCode,
  sourceCountryCode = countryCode,
  region,
  category,
  frequency,
  unit,
  changeType,
  observations,
  source,
  sourceFamily,
  provider,
  sourceUrl,
  sourceDownloadUrl,
  sourceHash: hash,
  sourceDefinition,
  sourceAsOf,
  checkedAt,
  providerUpdatedAt,
  historyType = "published official statistics",
  historyStatus,
  observationStatus,
  availabilityNote,
  methodology,
  sourceColumn,
  priceType,
  refreshStatus,
}) {
  const cleanObservations = uniqueObservations(observations, id);
  if (!cleanObservations.length)
    throw new Error(`Empty territory series ${id}`);
  return {
    id: `${TERRITORY_PREFIX}${id}`,
    name,
    indicatorKey,
    indicatorName,
    category,
    frequency,
    releaseFrequency: frequency,
    unit,
    changeType,
    country,
    countryCode,
    sourceCountryCode,
    geography: country,
    region,
    source,
    sourceOrganization: source,
    sourceFamily,
    provider,
    sourceUrl,
    sourceDownloadUrl,
    sourceHash: hash,
    sourceDefinition,
    sourceAsOf,
    checkedAt,
    providerUpdatedAt,
    historyType,
    ...(historyStatus ? { historyStatus } : {}),
    ...(observationStatus ? { observationStatus } : {}),
    ...(observationStatus
      ? {
          latestStatus: latestObservationStatus(
            observationStatus,
            cleanObservations,
          ),
        }
      : {}),
    ...(availabilityNote ? { availabilityNote } : {}),
    ...(methodology ? { methodology } : {}),
    ...(sourceColumn ? { sourceColumn } : {}),
    ...(priceType ? { priceType } : {}),
    ...(refreshStatus ? { refreshStatus } : {}),
    observations: cleanObservations,
  };
}

function makeCountry({
  code,
  name,
  region,
  sourceFamily,
  provider,
  sourceUrl,
  checkedAt,
  series,
}) {
  return {
    id: code,
    name,
    sourceName: name,
    region,
    incomeLevel: null,
    lon: null,
    lat: null,
    sourceFamily,
    provider,
    sourceUrl,
    checkedAt,
    seriesCount: series.filter((entry) => entry.countryCode === code).length,
  };
}

async function request(fetchImpl, url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        ...options,
        signal: controller.signal,
      });
      if (!response || !response.ok) {
        throw new Error(
          `${url} HTTP ${response?.status ?? "invalid response"}`,
        );
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function requestJson(fetchImpl, url, options = {}) {
  const response = await request(fetchImpl, url, options);
  const data = await response.json();
  if (!data || typeof data !== "object")
    throw new Error(`${url} returned no JSON object`);
  return data;
}

async function requestText(fetchImpl, url, options = {}) {
  return request(fetchImpl, url, options).then((response) => response.text());
}

async function requestBuffer(fetchImpl, url, options = {}) {
  const response = await request(fetchImpl, url, options);
  return Buffer.from(await response.arrayBuffer());
}

function providerStatusMap(observations, sourceStatus = {}) {
  return Object.fromEntries(
    observations.flatMap(([date]) =>
      sourceStatus[date] ? [[date, sourceStatus[date]]] : [],
    ),
  );
}

function absoluteUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return null;
  }
}

function bestJerseyResource(result, predicate, label) {
  const resources = result?.resources;
  if (!Array.isArray(resources))
    throw new Error(`Jersey ${label} discovery missing resources`);
  const candidates = resources.filter(
    (resource) =>
      text(resource.format).toLowerCase() === "csv" && predicate(resource),
  );
  if (!candidates.length)
    throw new Error(`Jersey ${label} discovery found no CSV resource`);
  return candidates.sort((left, right) =>
    text(right.last_modified).localeCompare(text(left.last_modified)),
  )[0];
}

function inseeMelodiUrl(sourceCode, geo, prices) {
  const url = new URL(INSEE_DATA_URL);
  url.searchParams.set("REF_AREA", sourceCode);
  url.searchParams.set("GEO", geo);
  url.searchParams.set("STO", "B1GQ");
  url.searchParams.set("ACTIVITY", "_T");
  url.searchParams.set("ACCOUNTING_ENTRY", "B");
  url.searchParams.set("UNIT_MEASURE", "XDC");
  url.searchParams.set("FREQ", "A");
  url.searchParams.set("PRICES", prices);
  url.searchParams.set("maxResult", "10000");
  return url.href;
}

async function discoverJerseyResource(
  fetchImpl,
  dataset,
  predicate,
  label,
  fallbackUrl,
  fallbackName,
) {
  try {
    const document = await requestJson(
      fetchImpl,
      `${JERSEY_CKAN_API}?id=${encodeURIComponent(dataset)}`,
    );
    if (document.success !== true)
      throw new Error(`Jersey ${label} discovery unsuccessful`);
    const resource = bestJerseyResource(document.result, predicate, label);
    if (!resource.url) throw new Error(`Jersey ${label} resource has no URL`);
    return {
      url: resource.url,
      name: text(resource.name),
      updatedAt:
        resource.last_modified || document.result.metadata_modified || null,
      refreshStatus: null,
    };
  } catch (error) {
    return {
      url: fallbackUrl,
      name: fallbackName,
      updatedAt: null,
      refreshStatus: "discovery-fallback",
      discoveryError: error.message,
    };
  }
}

async function discoverInseeWorkbook(fetchImpl) {
  try {
    const catalog = await requestJson(fetchImpl, INSEE_CATALOG_URL);
    if (catalog.identifier !== "DS_COMPTES_REGIONAUX")
      throw new Error("INSEE Melodi catalog identifier mismatch");
    const relationUrls = (catalog.relations || []).flatMap((relation) =>
      (relation.url || []).flatMap((entry) =>
        typeof entry === "string" ? entry : entry?.content || [],
      ),
    );
    const pageUrl = relationUrls.find((url) =>
      /^https:\/\/www\.insee\.fr\/fr\/statistiques\//i.test(url),
    );
    if (!pageUrl)
      throw new Error(
        "INSEE Melodi catalog has no French regional-accounts page",
      );
    const page = await requestText(fetchImpl, pageUrl);
    const match = page.match(/href=["']([^"']*PIB_REG_fr\.xlsx[^"']*)["']/i);
    const url = match && absoluteUrl(match[1], pageUrl);
    if (!url)
      throw new Error(
        "INSEE latest regional accounts page has no PIB_REG_fr.xlsx link",
      );
    return {
      url,
      pageUrl,
      catalogUrl: INSEE_CATALOG_URL,
      providerUpdatedAt:
        catalog.product
          ?.map((product) => product.modified)
          .filter(Boolean)
          .sort()
          .at(-1) ||
        catalog.modified ||
        null,
      refreshStatus: null,
    };
  } catch (error) {
    return {
      url: INSEE_WORKBOOK_URL,
      pageUrl: INSEE_PAGE,
      catalogUrl: INSEE_CATALOG_URL,
      providerUpdatedAt: null,
      refreshStatus: "discovery-fallback",
      discoveryError: error.message,
    };
  }
}

function baseProviderMetadata({
  checkedAt,
  hash,
  sourceAsOf,
  providerUpdatedAt,
}) {
  return { checkedAt, sourceHash: hash, sourceAsOf, providerUpdatedAt };
}

export function parseJerseyGdpCsv(
  csv,
  {
    now = new Date(),
    checkedAt = isoDate(now),
    hash = sourceHash(csv),
    sourceDownloadUrl = JERSEY_GDP_URL,
    sourceDefinition = "GDP in real terms, source-native constant-price values, million GBP; GDP column.",
    unit = "GBP million (source-discovered constant-price base year)",
    providerUpdatedAt = checkedAt,
    refreshStatus,
  } = {},
) {
  const rows = csvRows(csv);
  if (!rows.length) throw new Error("Jersey GDP CSV has no observations");
  requireFields(rows[0], ["Year", "GDP"], "Jersey GDP CSV");
  const cutoff = completedYear(now);
  const observations = rows.flatMap((row) => {
    const year = Number(text(row.Year));
    const value = finiteNumber(row.GDP);
    return Number.isInteger(year) && year <= cutoff && value !== null
      ? [[annualDate(year), value]]
      : [];
  });
  const levels = uniqueObservations(observations, "Jersey GDP");
  const metadata = baseProviderMetadata({
    checkedAt,
    hash,
    sourceAsOf: levels.at(-1)?.[0],
    providerUpdatedAt,
  });
  const common = {
    country: "Jersey",
    countryCode: "JEY",
    sourceCountryCode: "JEY",
    region: "Europe & Central Asia",
    source: "Government of Jersey Statistics",
    sourceFamily: "Government of Jersey Statistics",
    provider: "Government of Jersey Statistics",
    sourceUrl: JERSEY_GDP_PAGE,
    sourceDownloadUrl,
    sourceDefinition,
    methodology:
      "Official Jersey National Accounts CSV. Annual rows dated at calendar year-end; future reference years are excluded.",
    availabilityNote:
      "Source-native real GDP is retained in GBP millions at the resource’s discovered constant-price base year; no currency conversion is applied.",
    priceType: "real",
    providerUpdatedAt,
    refreshStatus,
    ...metadata,
  };
  return [
    makeSeries({
      id: "JEY_GDP_REAL",
      name: "Real GDP · Jersey",
      indicatorKey: "GDP_REAL",
      indicatorName: "Real GDP",
      category: "Growth",
      frequency: "annual",
      unit,
      changeType: "percent",
      observations: levels,
      ...common,
      sourceColumn: "GDP",
    }),
    makeSeries({
      id: "JEY_GDP_GROWTH",
      name: "Real GDP growth · Jersey",
      indicatorKey: "GDPGROWTH",
      indicatorName: "Real GDP growth",
      category: "Growth",
      frequency: "annual",
      unit: "%",
      changeType: "basis-points",
      observations: deriveAnnualGrowth(levels),
      ...common,
      sourceDefinition:
        "Derived only from exact adjacent-year Jersey real GDP levels: (GDP_t / GDP_t-1 - 1) × 100.",
      sourceColumn: "GDP",
      priceType: "real",
    }),
  ];
}

export function parseJerseyRpiCsv(
  csv,
  {
    now = new Date(),
    checkedAt = isoDate(now),
    hash = sourceHash(csv),
    sourceDownloadUrl = JERSEY_RPI_URL,
    sourceDefinition = "Jersey Retail Prices Index, RPI index numbers; source-native quarterly reference dates.",
    providerUpdatedAt = checkedAt,
    refreshStatus,
  } = {},
) {
  const rows = csvRows(csv);
  if (!rows.length) throw new Error("Jersey RPI CSV has no observations");
  requireFields(
    rows[0],
    ["Quarter reference date", "RPI index numbers"],
    "Jersey RPI CSV",
  );
  const cutoff = checkedDate(now);
  const observations = rows.flatMap((row) => {
    const date = text(row["Quarter reference date"]);
    const value = finiteNumber(row["RPI index numbers"]);
    const parsed = new Date(`${date}T00:00:00Z`);
    return date &&
      !Number.isNaN(parsed.getTime()) &&
      parsed <= cutoff &&
      value !== null
      ? [[date, value]]
      : [];
  });
  const levels = uniqueObservations(observations, "Jersey RPI");
  const metadata = baseProviderMetadata({
    checkedAt,
    hash,
    sourceAsOf: levels.at(-1)?.[0],
    providerUpdatedAt,
  });
  const common = {
    country: "Jersey",
    countryCode: "JEY",
    sourceCountryCode: "JEY",
    region: "Europe & Central Asia",
    category: "Inflation",
    frequency: "quarterly",
    source: "Government of Jersey Statistics",
    sourceFamily: "Government of Jersey Statistics",
    provider: "Government of Jersey Statistics",
    sourceUrl: JERSEY_RPI_PAGE,
    sourceDownloadUrl,
    sourceDefinition,
    methodology:
      "Official Jersey RPI index. Inflation is derived only from exact same-quarter observations four quarters apart.",
    ...metadata,
    providerUpdatedAt,
    refreshStatus,
  };
  return [
    makeSeries({
      id: "JEY_RPI_INDEX",
      name: "Retail price index · Jersey",
      indicatorKey: "CPI_INDEX",
      indicatorName: "Retail price index",
      unit: "index points (Jersey RPI)",
      changeType: "percent",
      observations: levels,
      ...common,
      sourceColumn: "RPI index numbers",
    }),
    makeSeries({
      id: "JEY_RPI_INFLATION",
      name: "RPI inflation · Jersey",
      indicatorKey: "INFLATION",
      indicatorName: "RPI inflation",
      unit: "%",
      changeType: "basis-points",
      observations: deriveQuarterlyInflation(levels),
      ...common,
      sourceDefinition:
        "Derived only from exact same-quarter Jersey RPI levels four quarters apart: (RPI_t / RPI_t-4 - 1) × 100.",
      sourceColumn: "RPI index numbers",
    }),
  ];
}

function sheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`INSEE workbook missing sheet ${sheetName}`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
}

function inseeSheet(sheetName, rows) {
  const headerIndex = rows.findIndex((row) =>
    row.some((value) => text(value) === "1990"),
  );
  if (headerIndex < 0)
    throw new Error(`INSEE ${sheetName} missing year header`);
  const yearColumns = new Map(
    rows[headerIndex].flatMap((value, index) => {
      const year = Number(text(value));
      return Number.isInteger(year) ? [[index, year]] : [];
    }),
  );
  if (yearColumns.size < 5)
    throw new Error(`INSEE ${sheetName} has too few annual columns`);
  const rowsByName = new Map(
    rows.flatMap((row) => {
      const name = text(row[0]);
      return name ? [[name, row]] : [];
    }),
  );
  return { headerIndex, yearColumns, rowsByName };
}

function inseeMetadata(workbook) {
  const rows = sheetRows(workbook, "Métadonnées");
  const values = new Map(
    rows.flatMap((row) =>
      row[0] && row[1] ? [[text(row[0]), text(row[1])]] : [],
    ),
  );
  return values;
}

export function parseInseeRegionalWorkbook(
  input,
  {
    now = new Date(),
    checkedAt = isoDate(now),
    hash = sourceHash(input),
    sourceDownloadUrl = INSEE_WORKBOOK_URL,
    sourceUrl = INSEE_PAGE,
    providerUpdatedAt = checkedAt,
    discoveryNote = "",
    refreshStatus,
  } = {},
) {
  const workbook = XLSX.read(input, { type: "buffer" });
  const metadata = inseeMetadata(workbook);
  const nominalRows = inseeSheet(
    "PIB en valeur",
    sheetRows(workbook, "PIB en valeur"),
  );
  const realRows = inseeSheet(
    "PIB en volume ",
    sheetRows(workbook, "PIB en volume "),
  );
  const cutoff = completedYear(now);
  const nominalUnit = "EUR million";
  const realUnit = "EUR million (chained volume)";
  const creationDate = metadata.get("Date de création du fichier");
  const series = [];
  for (const territory of INSEE_TERRITORIES) {
    const nominalRow = nominalRows.rowsByName.get(territory.row);
    const realRow = realRows.rowsByName.get(territory.row);
    if (!nominalRow || !realRow)
      throw new Error(`INSEE workbook missing ${territory.row}`);
    const nominal = uniqueObservations(
      [...nominalRows.yearColumns].flatMap(([column, year]) => {
        const value = finiteNumber(nominalRow[column]);
        return year <= cutoff && value !== null
          ? [[annualDate(year), value]]
          : [];
      }),
      `${territory.code} INSEE nominal GDP`,
    );
    const real = uniqueObservations(
      [...realRows.yearColumns].flatMap(([column, year]) => {
        const value = finiteNumber(realRow[column]);
        return year <= cutoff && value !== null
          ? [[annualDate(year), value]]
          : [];
      }),
      `${territory.code} INSEE real GDP`,
    );
    const statuses = Object.fromEntries(
      [...new Set([...nominal, ...real].map(([date]) => date.slice(0, 4)))].map(
        (year) => [
          annualDate(Number(year)),
          Number(year) <= 2021
            ? "definitive"
            : Number(year) <= 2023
              ? "semi-definitive"
              : "provisional",
        ],
      ),
    );
    const historyStatus =
      "Official INSEE regional national accounts: 1990–2021 definitive; 2022–2023 semi-definitive; 2024 provisional.";
    const sourceAsOf = [...new Set([...nominal, ...real].map(([date]) => date))]
      .sort()
      .at(-1);
    const common = {
      country: territory.name,
      countryCode: territory.code,
      sourceCountryCode: territory.code,
      region: territory.region,
      source:
        "Institut national de la statistique et des études économiques (INSEE)",
      sourceFamily: "INSEE regional accounts",
      provider: "INSEE",
      sourceUrl,
      sourceDownloadUrl,
      sourceHash: hash,
      sourceAsOf,
      checkedAt,
      providerUpdatedAt: creationDate || providerUpdatedAt,
      historyStatus,
      observationStatus: statuses,
      historyType: "published official regional national accounts",
      availabilityNote:
        "Guadeloupe’s regional account includes Saint-Martin; no Saint-Martin value is copied into this territory series.",
      methodology:
        "INSEE PIB_REG_fr.xlsx, base 2020 regional accounts. Annual values are retained only through the last completed reference year; source revision status is preserved.",
      refreshStatus,
    };
    series.push(
      makeSeries({
        id: `${territory.code}_GDP_NOMINAL`,
        name: `Nominal GDP · ${territory.name}`,
        indicatorKey: "GDP_NOMINAL",
        indicatorName:
          territory.code === "GLP"
            ? "Nominal GDP · Guadeloupe (incl. Saint-Martin)"
            : "Nominal GDP",
        category: "Growth",
        frequency: "annual",
        unit: nominalUnit,
        changeType: "percent",
        observations: nominal,
        sourceDefinition: `PIB en valeur (prix courants); unité: millions d’euros; source row: ${territory.row}${territory.code === "GLP" ? "; Guadeloupe’s regional account includes Saint-Martin." : "."}${discoveryNote}`,
        sourceColumn: `PIB en valeur / ${territory.row}`,
        priceType: "nominal",
        ...common,
      }),
      makeSeries({
        id: `${territory.code}_GDP_REAL`,
        name: `Real GDP · ${territory.name}`,
        indicatorKey: "GDP_REAL",
        indicatorName:
          territory.code === "GLP"
            ? "Real GDP · Guadeloupe (incl. Saint-Martin)"
            : "Real GDP",
        category: "Growth",
        frequency: "annual",
        unit: realUnit,
        changeType: "percent",
        observations: real,
        sourceDefinition: `PIB en volume (au prix de l’année précédente chaînés); unité: millions d’euros 2020.${discoveryNote}`,
        sourceColumn: `PIB en volume / ${territory.row}`,
        priceType: "real",
        ...common,
      }),
      makeSeries({
        id: `${territory.code}_GDP_GROWTH`,
        name: `Real GDP growth · ${territory.name}`,
        indicatorKey: "GDPGROWTH",
        indicatorName:
          territory.code === "GLP"
            ? "Real GDP growth · Guadeloupe (incl. Saint-Martin)"
            : "Real GDP growth",
        category: "Growth",
        frequency: "annual",
        unit: "%",
        changeType: "basis-points",
        observations: deriveAnnualGrowth(real),
        sourceDefinition: `Derived only from exact adjacent-year INSEE real GDP levels: (GDP_t / GDP_t-1 - 1) × 100.${discoveryNote}`,
        sourceColumn: `PIB en volume / ${territory.row}`,
        priceType: "real",
        ...common,
      }),
    );
  }
  return series;
}

function melodiObservations(document, { sourceCode, geo, prices, now }) {
  if (
    !document ||
    document.identifier !== "DS_COMPTES_REGIONAUX" ||
    !Array.isArray(document.observations)
  )
    throw new Error(
      `INSEE Melodi ${sourceCode} response missing observations schema`,
    );
  const cutoff = completedYear(now);
  const statusByDate = {};
  const observations = document.observations.flatMap((observation) => {
    const dimensions = observation?.dimensions || {};
    const unitMultiplier = text(observation.attributes?.UNIT_MULT);
    if (unitMultiplier !== "6")
      throw new Error(
        `INSEE Melodi ${sourceCode} unexpected UNIT_MULT ${unitMultiplier || "missing"}`,
      );
    if (
      dimensions.REF_AREA !== sourceCode ||
      dimensions.GEO !== geo ||
      dimensions.STO !== "B1GQ" ||
      dimensions.ACTIVITY !== "_T" ||
      dimensions.ACCOUNTING_ENTRY !== "B" ||
      dimensions.UNIT_MEASURE !== "XDC" ||
      dimensions.FREQ !== "A" ||
      dimensions.PRICES !== prices
    )
      return [];
    const year = Number(dimensions.TIME_PERIOD);
    const value = finiteNumber(observation.measures?.OBS_VALUE_NIVEAU?.value);
    if (!Number.isInteger(year) || year > cutoff || value === null) return [];
    const date = annualDate(year);
    const status = mapStatus(
      observation.attributes?.OBS_STATUS_FR ||
        observation.attributes?.OBS_STATUS,
    );
    if (status) statusByDate[date] = status;
    return [[date, value]];
  });
  return {
    observations: uniqueObservations(
      observations,
      `INSEE Melodi ${sourceCode} ${prices}`,
    ),
    statusByDate,
  };
}

export function parseInseeMelodi(
  documents,
  {
    now = new Date(),
    checkedAt = isoDate(now),
    hash = sourceHash(JSON.stringify(documents)),
    sourceUrl = INSEE_CATALOG_URL,
    sourceDownloadUrl = INSEE_DATA_URL,
    providerUpdatedAt = checkedAt,
    discoveryNote = " Downloaded through the official INSEE Melodi DS_COMPTES_REGIONAUX API.",
    refreshStatus,
  } = {},
) {
  const series = [];
  for (const territory of INSEE_TERRITORIES) {
    const documentsForTerritory = documents?.[territory.sourceCode];
    const nominal = melodiObservations(documentsForTerritory?.nominal, {
      sourceCode: territory.sourceCode,
      geo: territory.geo,
      prices: "V",
      now,
    });
    const real = melodiObservations(documentsForTerritory?.real, {
      sourceCode: territory.sourceCode,
      geo: territory.geo,
      prices: "L",
      now,
    });
    const statusByDate = { ...nominal.statusByDate, ...real.statusByDate };
    const sourceAsOf = [
      ...new Set(
        [...nominal.observations, ...real.observations].map(([date]) => date),
      ),
    ]
      .sort()
      .at(-1);
    const common = {
      country: territory.name,
      countryCode: territory.code,
      sourceCountryCode: territory.code,
      region: territory.region,
      source:
        "Institut national de la statistique et des études économiques (INSEE)",
      sourceFamily: "INSEE regional accounts",
      provider: "INSEE Melodi",
      sourceUrl,
      sourceDownloadUrl,
      sourceHash: hash,
      sourceAsOf,
      checkedAt,
      providerUpdatedAt,
      historyStatus:
        "Official INSEE regional national accounts; OBS_STATUS is retained per observation (D definitive, SD semi-definitive, PROV provisional).",
      observationStatus: statusByDate,
      historyType: "published official regional national accounts",
      availabilityNote:
        "Guadeloupe’s selected GEO is the regional account including Saint-Martin; no separate Saint-Martin GDP is claimed.",
      methodology:
        "INSEE Melodi DS_COMPTES_REGIONAUX filtered to STO=B1GQ (GDP), ACTIVITY=_T (total), ACCOUNTING_ENTRY=B, UNIT_MEASURE=XDC, FREQ=A; PRICES V is current values and PRICES L is chained volume.",
      refreshStatus,
    };
    series.push(
      makeSeries({
        id: `${territory.code}_GDP_NOMINAL`,
        name: `Nominal GDP · ${territory.name}`,
        indicatorKey: "GDP_NOMINAL",
        indicatorName:
          territory.code === "GLP"
            ? "Nominal GDP · Guadeloupe (incl. Saint-Martin)"
            : "Nominal GDP",
        category: "Growth",
        frequency: "annual",
        unit: "EUR million",
        changeType: "percent",
        observations: nominal.observations,
        sourceDefinition: `INSEE Melodi B1GQ GDP at current prices (PRICES=V); unit multiplier 10^6 euros.${discoveryNote}`,
        sourceColumn: "STO=B1GQ / ACTIVITY=_T / PRICES=V",
        priceType: "nominal",
        ...common,
        sourceDownloadUrl: inseeMelodiUrl(
          territory.sourceCode,
          territory.geo,
          "V",
        ),
      }),
      makeSeries({
        id: `${territory.code}_GDP_REAL`,
        name: `Real GDP · ${territory.name}`,
        indicatorKey: "GDP_REAL",
        indicatorName:
          territory.code === "GLP"
            ? "Real GDP · Guadeloupe (incl. Saint-Martin)"
            : "Real GDP",
        category: "Growth",
        frequency: "annual",
        unit: "EUR million (chained volume)",
        changeType: "percent",
        observations: real.observations,
        sourceDefinition: `INSEE Melodi B1GQ GDP in chained previous-year volume (PRICES=L); unit multiplier 10^6 euros.${discoveryNote}`,
        sourceColumn: "STO=B1GQ / ACTIVITY=_T / PRICES=L",
        priceType: "real",
        ...common,
        sourceDownloadUrl: inseeMelodiUrl(
          territory.sourceCode,
          territory.geo,
          "L",
        ),
      }),
      makeSeries({
        id: `${territory.code}_GDP_GROWTH`,
        name: `Real GDP growth · ${territory.name}`,
        indicatorKey: "GDPGROWTH",
        indicatorName:
          territory.code === "GLP"
            ? "Real GDP growth · Guadeloupe (incl. Saint-Martin)"
            : "Real GDP growth",
        category: "Growth",
        frequency: "annual",
        unit: "%",
        changeType: "basis-points",
        observations: deriveAnnualGrowth(real.observations),
        sourceDefinition: `Derived only from exact adjacent-year INSEE Melodi real GDP levels: (GDP_t / GDP_t-1 - 1) × 100.${discoveryNote}`,
        sourceColumn: "STO=B1GQ / ACTIVITY=_T / PRICES=L",
        priceType: "real",
        ...common,
        sourceDownloadUrl: inseeMelodiUrl(
          territory.sourceCode,
          territory.geo,
          "L",
        ),
      }),
    );
  }
  return series;
}

function jsonStatEntries(document) {
  if (!document || !Array.isArray(document.id) || !Array.isArray(document.size))
    throw new Error("PxWeb response missing id/size schema");
  if (!Array.isArray(document.value))
    throw new Error("PxWeb response missing value array");
  const dimensions = document.id.map((id) => {
    const dimension = document.dimension?.[id];
    if (!dimension?.category)
      throw new Error(`PxWeb response missing dimension ${id}`);
    const index = dimension.category.index;
    const keys = Array.isArray(index)
      ? index
      : Object.keys(index || {}).sort((a, b) => index[a] - index[b]);
    return {
      id,
      keys,
      labels: dimension.category.label || {},
    };
  });
  const expected = document.size.reduce((product, size) => product * size, 1);
  if (document.value.length !== expected)
    throw new Error(
      `PxWeb response value length ${document.value.length} != ${expected}`,
    );
  return document.value.flatMap((value, flatIndex) => {
    if (finiteNumber(value) === null) return [];
    let remainder = flatIndex;
    const cells = {};
    for (let index = dimensions.length - 1; index >= 0; index -= 1) {
      const size = document.size[index];
      const cellIndex = remainder % size;
      remainder = Math.floor(remainder / size);
      const dimension = dimensions[index];
      const key = dimension.keys[cellIndex];
      cells[dimension.id] = { key, label: dimension.labels[key] || key };
    }
    return [{ cells, value: finiteNumber(value) }];
  });
}

function pxWebQuery(values) {
  return {
    query: Object.entries(values).map(([code, selected]) => ({
      code,
      selection: { filter: "item", values: selected },
    })),
    response: { format: "json-stat2" },
  };
}

async function pxWebMetadata(fetchImpl, url) {
  const document = await requestJson(fetchImpl, url);
  if (!document.title || !Array.isArray(document.variables))
    throw new Error(`${url} missing PxWeb metadata schema`);
  return document;
}

async function pxWebData(fetchImpl, url, query) {
  return requestJson(fetchImpl, url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(query),
  });
}

function variable(meta, code) {
  const value = meta.variables.find((entry) => entry.code === code);
  if (!value?.values?.length)
    throw new Error(`PxWeb metadata missing variable ${code}`);
  return value;
}

export function parseAsubPxWeb(
  { gdpMeta, gdpData, cpiMeta, cpiData },
  {
    now = new Date(),
    checkedAt = isoDate(now),
    hash = sourceHash(JSON.stringify({ gdpMeta, gdpData, cpiMeta, cpiData })),
  } = {},
) {
  const cutoff = checkedDate(now);
  const gdpEntries = jsonStatEntries(gdpData);
  const gdpByMeasure = (measure) =>
    uniqueObservations(
      gdpEntries.flatMap(({ cells, value }) => {
        const year = Number(cells.år?.key);
        return cells.uppgift?.key === measure &&
          cells.bransch?.key === "BNPMRK" &&
          Number.isInteger(year) &&
          year <= completedYear(now)
          ? [[annualDate(year), value]]
          : [];
      }),
      `ÅSUB GDP ${measure}`,
    );
  const nominal = gdpByMeasure("lopande");
  const real = gdpByMeasure("fasta");
  const cpiEntries = jsonStatEntries(cpiData);
  const cpiVariable = variable(cpiMeta, "indexserie");
  // The newly rebased 2025=100 series only has observations from 2025 onward;
  // use the longest stable 2015=100 history when the table exposes it.
  const preferredIndex =
    cpiVariable.values.find((value, index) =>
      text(cpiVariable.valueTexts?.[index] || value).startsWith("2015=100"),
    ) || cpiVariable.values[0];
  const preferredLabel = text(
    cpiVariable.valueTexts?.[cpiVariable.values.indexOf(preferredIndex)] ||
      preferredIndex,
  );
  const cpi = uniqueObservations(
    cpiEntries.flatMap(({ cells, value }) => {
      const period = text(cells.månad?.key);
      const year = Number(cells.år?.key);
      const match = /^(\d{2})$/.exec(period);
      const date =
        match && Number.isInteger(year)
          ? monthDate(year, Number(match[1]))
          : null;
      return cells.indexserie?.key === preferredIndex &&
        date &&
        new Date(`${date}T00:00:00Z`) <= cutoff
        ? [[date, value]]
        : [];
    }),
    "ÅSUB CPI",
  );
  if (!nominal.length || !real.length || !cpi.length)
    throw new Error("ÅSUB returned an empty required series");
  const sourceAsOf = [nominal, real, cpi]
    .flat()
    .map(([date]) => date)
    .sort()
    .at(-1);
  const common = {
    country: "Åland",
    countryCode: "ALA",
    sourceCountryCode: "ALA",
    region: "Europe & Central Asia",
    source: "Statistics and Research Åland (ÅSUB)",
    sourceFamily: "ÅSUB PxWeb",
    provider: "ÅSUB",
    sourceHash: hash,
    sourceAsOf,
    checkedAt,
    providerUpdatedAt: checkedAt,
    historyType: "published official ÅSUB statistics",
    methodology:
      "ÅSUB PxWeb NA039 and KO007. GDP growth is derived only from exact adjacent-year real GDP levels; CPI inflation is derived only from exact prior-calendar-12-month index values.",
  };
  return [
    makeSeries({
      id: "ALA_GDP_NOMINAL",
      name: "Nominal GDP · Åland",
      indicatorKey: "GDP_NOMINAL",
      indicatorName: "Nominal GDP",
      category: "Growth",
      frequency: "annual",
      unit: "EUR million",
      changeType: "percent",
      observations: nominal,
      sourceUrl: ASUB_GDP_PAGE,
      sourceDownloadUrl: ASUB_GDP_API,
      sourceDefinition:
        "ÅSUB NA039; GDP at market prices, current prices (lopande).",
      sourceColumn: "uppgift=lopande; bransch=BNPMRK",
      priceType: "nominal",
      ...common,
    }),
    makeSeries({
      id: "ALA_GDP_REAL",
      name: "Real GDP · Åland",
      indicatorKey: "GDP_REAL",
      indicatorName: "Real GDP",
      category: "Growth",
      frequency: "annual",
      unit: "EUR million (constant latest reported prices)",
      changeType: "percent",
      observations: real,
      sourceUrl: ASUB_GDP_PAGE,
      sourceDownloadUrl: ASUB_GDP_API,
      sourceDefinition:
        "ÅSUB NA039; GDP at market prices, fixed prices (fasta).",
      sourceColumn: "uppgift=fasta; bransch=BNPMRK",
      priceType: "real",
      ...common,
    }),
    makeSeries({
      id: "ALA_GDP_GROWTH",
      name: "Real GDP growth · Åland",
      indicatorKey: "GDPGROWTH",
      indicatorName: "Real GDP growth",
      category: "Growth",
      frequency: "annual",
      unit: "%",
      changeType: "basis-points",
      observations: deriveAnnualGrowth(real),
      sourceUrl: ASUB_GDP_PAGE,
      sourceDownloadUrl: ASUB_GDP_API,
      sourceDefinition:
        "Derived only from exact adjacent-year ÅSUB real GDP levels.",
      sourceColumn: "uppgift=fasta; bransch=BNPMRK",
      priceType: "real",
      ...common,
    }),
    makeSeries({
      id: "ALA_CPI_INDEX",
      name: "Consumer price index · Åland",
      indicatorKey: "CPI_INDEX",
      indicatorName: "Consumer price index",
      category: "Inflation",
      frequency: "monthly",
      unit: `index (${preferredLabel})`,
      changeType: "percent",
      observations: cpi,
      sourceUrl: ASUB_CPI_PAGE,
      sourceDownloadUrl: ASUB_CPI_API,
      sourceDefinition: `ÅSUB KO007; consumer price index, index series ${preferredIndex}.`,
      sourceColumn: `indexserie=${preferredIndex}`,
      ...common,
    }),
    makeSeries({
      id: "ALA_CPI_INFLATION",
      name: "CPI inflation · Åland",
      indicatorKey: "INFLATION",
      indicatorName: "Consumer price inflation",
      category: "Inflation",
      frequency: "monthly",
      unit: "%",
      changeType: "basis-points",
      observations: deriveMonthlyInflation(cpi),
      sourceUrl: ASUB_CPI_PAGE,
      sourceDownloadUrl: ASUB_CPI_API,
      sourceDefinition:
        "Derived only from exact prior-calendar-12-month ÅSUB CPI index values.",
      sourceColumn: `indexserie=${preferredIndex}`,
      ...common,
    }),
  ];
}

function odataValues(document, label) {
  if (!Array.isArray(document?.value))
    throw new Error(`${label} missing OData value array`);
  return document.value;
}

function cbsYear(period) {
  const match = /^(\d{4})JJ00$/.exec(text(period));
  return match ? Number(match[1]) : null;
}

function cbsQuarter(period) {
  const match = /^(\d{4})KW0?([1-4])$/.exec(text(period));
  return match ? { year: Number(match[1]), quarter: Number(match[2]) } : null;
}

export function parseCbsTerritoryData(
  {
    gdpData,
    gdpIslands,
    gdpPeriods,
    gdpTable,
    cpiData,
    cpiIslands,
    cpiPeriods,
    cpiTable,
  },
  {
    now = new Date(),
    checkedAt = isoDate(now),
    hash = sourceHash(
      JSON.stringify({
        gdpData,
        gdpIslands,
        gdpPeriods,
        gdpTable,
        cpiData,
        cpiIslands,
        cpiPeriods,
        cpiTable,
      }),
    ),
  } = {},
) {
  const cutoff = completedYear(now);
  const gdpRows = odataValues(gdpData, "CBS GDP");
  const islandRows = odataValues(gdpIslands, "CBS GDP islands");
  const periodRows = odataValues(gdpPeriods, "CBS GDP periods");
  const islandMap = new Map(islandRows.map((row) => [text(row.Key), row]));
  const statusMap = new Map(
    periodRows.map((row) => [text(row.Key), mapStatus(row.Status)]),
  );
  const cpiIslandRows = odataValues(cpiIslands, "CBS CPI islands");
  const cpiPeriodRows = odataValues(cpiPeriods, "CBS CPI periods");
  const cpiStatusMap = new Map(
    cpiPeriodRows.map((row) => [text(row.Key), mapStatus(row.Status)]),
  );
  const common = {
    country: "Caribbean Netherlands",
    countryCode: "BES",
    sourceCountryCode: "BES",
    region: "Latin America & Caribbean",
    source: "Statistics Netherlands (CBS)",
    sourceFamily: "Statistics Netherlands (CBS)",
    provider: "CBS",
    sourceHash: hash,
    checkedAt,
    providerUpdatedAt: gdpTable?.Modified || checkedAt,
    historyType: "published official CBS statistics",
  };
  const series = [];
  for (const island of BES_ISLANDS) {
    const islandTitle = islandMap.get(island.sourceCode)?.Title || island.name;
    const rows = gdpRows.filter(
      (row) => text(row.CaribischNederland) === island.sourceCode,
    );
    if (!rows.length) throw new Error(`CBS GDP missing ${island.sourceCode}`);
    const nominal = uniqueObservations(
      rows.flatMap((row) => {
        const year = cbsYear(row.Perioden);
        const value = finiteNumber(row.BbpWaardeInWerkelijkePrijzen_1);
        return year && year <= cutoff && value !== null
          ? [[annualDate(year), value]]
          : [];
      }),
      `CBS ${island.sourceCode} nominal GDP`,
    );
    const real = uniqueObservations(
      rows.flatMap((row) => {
        const year = cbsYear(row.Perioden);
        const value = finiteNumber(row.BbpWaardePrijsniveau2017_2);
        return year && year <= cutoff && value !== null
          ? [[annualDate(year), value]]
          : [];
      }),
      `CBS ${island.sourceCode} real GDP`,
    );
    const statuses = Object.fromEntries(
      rows.flatMap((row) => {
        const year = cbsYear(row.Perioden);
        return year && year <= cutoff
          ? [[annualDate(year), statusMap.get(text(row.Perioden))]]
          : [];
      }),
    );
    const islandCommon = {
      ...common,
      sourceCountryCode: island.sourceCode,
      sourceAsOf: [...nominal, ...real]
        .map(([date]) => date)
        .sort()
        .at(-1),
      sourceUrl: CBS_GDP_PAGE,
      sourceDownloadUrl: `${CBS_BASE}/${CBS_GDP_TABLE}/TypedDataSet`,
      sourceDefinition: `CBS table 84789NED; ${islandTitle}; annual GDP. The CBS table reports island GDP separately; no aggregate is constructed here.`,
      observationStatus: statuses,
      historyStatus: dateStatus(statuses, nominal),
      methodology:
        "Official CBS Caribbean Netherlands national accounts. Island level values are retained under BES without averaging island growth rates or inventing an aggregate.",
    };
    series.push(
      makeSeries({
        id: `BES_${island.sourceCode}_GDP_NOMINAL`,
        name: `Nominal GDP · ${island.name} (BES)`,
        indicatorKey: "GDP_NOMINAL",
        indicatorName: `Nominal GDP · ${island.name}`,
        category: "Growth",
        frequency: "annual",
        unit: "USD million (current prices)",
        changeType: "percent",
        observations: nominal,
        sourceColumn: "BbpWaardeInWerkelijkePrijzen_1",
        priceType: "nominal",
        ...islandCommon,
      }),
      makeSeries({
        id: `BES_${island.sourceCode}_GDP_REAL`,
        name: `Real GDP · ${island.name} (BES)`,
        indicatorKey: "GDP_REAL",
        indicatorName: `Real GDP · ${island.name}`,
        category: "Growth",
        frequency: "annual",
        unit: "USD million (2017 prices)",
        changeType: "percent",
        observations: real,
        sourceColumn: "BbpWaardePrijsniveau2017_2",
        priceType: "real",
        ...islandCommon,
      }),
      makeSeries({
        id: `BES_${island.sourceCode}_GDP_GROWTH`,
        name: `Real GDP growth · ${island.name} (BES)`,
        indicatorKey: "GDPGROWTH",
        indicatorName: `Real GDP growth · ${island.name}`,
        category: "Growth",
        frequency: "annual",
        unit: "%",
        changeType: "basis-points",
        observations: deriveAnnualGrowth(real),
        sourceDefinition:
          "Derived only from exact adjacent-year CBS real GDP levels for this island.",
        sourceColumn: "BbpWaardePrijsniveau2017_2",
        priceType: "real",
        ...islandCommon,
      }),
    );

    const cpiRows = odataValues(cpiData, "CBS CPI").filter(
      (row) =>
        text(row.CaribbeanNetherlands) === island.sourceCode &&
        text(row.SpendingCategory).trim() === "T001112",
    );
    if (!cpiRows.length)
      throw new Error(`CBS CPI missing all-items ${island.sourceCode}`);
    const cpi = uniqueObservations(
      cpiRows.flatMap((row) => {
        const period = cbsQuarter(row.Periods);
        if (!period) return [];
        const date = quarterDate(period.year, period.quarter);
        const value = finiteNumber(row.ConsumerPriceIndexCPI_1);
        const periodDate = new Date(`${date}T00:00:00Z`);
        return periodDate <= checkedDate(now) && value !== null
          ? [[date, value]]
          : [];
      }),
      `CBS ${island.sourceCode} CPI`,
    );
    const cpiStatuses = Object.fromEntries(
      cpiRows.flatMap((row) => {
        const period = cbsQuarter(row.Periods);
        return period
          ? [
              [
                quarterDate(period.year, period.quarter),
                cpiStatusMap.get(text(row.Periods)),
              ],
            ]
          : [];
      }),
    );
    const cpiCommon = {
      ...common,
      sourceAsOf: cpi.at(-1)?.[0],
      sourceUrl: CBS_CPI_PAGE,
      sourceDownloadUrl: `${CBS_BASE}/${CBS_CPI_TABLE}/TypedDataSet`,
      sourceDefinition: `CBS table 84046ENG; ${islandTitle}; all-items CPI (2017=100). Regular quarterly observations only; CBS flash estimates are excluded.`,
      observationStatus: providerStatusMap(cpi, cpiStatuses),
      historyStatus: dateStatus(providerStatusMap(cpi, cpiStatuses), cpi),
      providerUpdatedAt: cpiTable?.Modified || checkedAt,
      methodology:
        "Official CBS quarterly CPI. Inflation is derived only from exact same-quarter observations four quarters apart.",
    };
    series.push(
      makeSeries({
        id: `BES_${island.sourceCode}_CPI_INDEX`,
        name: `Consumer price index · ${island.name} (BES)`,
        indicatorKey: "CPI_INDEX",
        indicatorName: `Consumer price index · ${island.name}`,
        category: "Inflation",
        frequency: "quarterly",
        unit: "index (2017=100)",
        changeType: "percent",
        observations: cpi,
        sourceColumn: "ConsumerPriceIndexCPI_1",
        ...cpiCommon,
      }),
      makeSeries({
        id: `BES_${island.sourceCode}_CPI_INFLATION`,
        name: `CPI inflation · ${island.name} (BES)`,
        indicatorKey: "INFLATION",
        indicatorName: `Consumer price inflation · ${island.name}`,
        category: "Inflation",
        frequency: "quarterly",
        unit: "%",
        changeType: "basis-points",
        observations: deriveQuarterlyInflation(cpi),
        sourceDefinition:
          "Derived only from exact same-quarter CBS CPI levels four quarters apart.",
        sourceColumn: "ConsumerPriceIndexCPI_1",
        ...cpiCommon,
      }),
    );
  }
  return series;
}

async function fetchJersey({ fetchImpl, now, checkedAt }) {
  const [gdpResource, rpiResource] = await Promise.all([
    discoverJerseyResource(
      fetchImpl,
      JERSEY_GDP_DATASET,
      (resource) =>
        /^GDP in real terms in constant \d{4} values(?: \(£ million\))?$/i.test(
          text(resource.name),
        ),
      "GDP",
      JERSEY_GDP_URL,
      "GDP in real terms in constant 2023 values (archived fallback)",
    ),
    discoverJerseyResource(
      fetchImpl,
      JERSEY_RPI_DATASET,
      (resource) =>
        /^Jersey RPI and RPIX percentage change and index numbers$/i.test(
          text(resource.name),
        ),
      "RPI",
      JERSEY_RPI_URL,
      "Jersey RPI and RPIX (archived fallback)",
    ),
  ]);
  const [gdp, rpi] = await Promise.all([
    requestText(fetchImpl, gdpResource.url),
    requestText(fetchImpl, rpiResource.url),
  ]);
  const gdpBaseYear =
    text(gdpResource.name).match(/constant (\d{4}) values/i)?.[1] || "2023";
  const gdpDefinition = `${gdpResource.name}; GDP column.${gdpResource.refreshStatus ? ` Latest-resource discovery failed (${gdpResource.discoveryError}); this is an archived fallback.` : ""}`;
  const rpiDefinition = `${rpiResource.name}; RPI index numbers.${rpiResource.refreshStatus ? ` Latest-resource discovery failed (${rpiResource.discoveryError}); this is an archived fallback.` : ""}`;
  const series = [
    ...parseJerseyGdpCsv(gdp, {
      now,
      checkedAt,
      hash: sourceHash(gdp),
      sourceDownloadUrl: gdpResource.url,
      sourceDefinition: gdpDefinition,
      providerUpdatedAt: gdpResource.updatedAt || checkedAt,
      unit: `GBP million (constant ${gdpBaseYear} prices)`,
      refreshStatus: gdpResource.refreshStatus,
    }),
    ...parseJerseyRpiCsv(rpi, {
      now,
      checkedAt,
      hash: sourceHash(rpi),
      sourceDownloadUrl: rpiResource.url,
      sourceDefinition: rpiDefinition,
      providerUpdatedAt: rpiResource.updatedAt || checkedAt,
      refreshStatus: rpiResource.refreshStatus,
    }),
  ];
  return {
    series,
    countries: [
      makeCountry({
        code: "JEY",
        name: "Jersey",
        region: "Europe & Central Asia",
        sourceFamily: "Government of Jersey Statistics",
        provider: "Government of Jersey Statistics",
        sourceUrl: JERSEY_GDP_PAGE,
        checkedAt,
        series,
      }),
    ],
    audit: {
      source: "Government of Jersey Statistics",
      checkedAt,
      sourceUrls: [gdpResource.url, rpiResource.url],
      discovery: {
        GDP: gdpResource.refreshStatus
          ? "archived-fallback"
          : "current-CKAN-resource",
        RPI: rpiResource.refreshStatus
          ? "archived-fallback"
          : "current-CKAN-resource",
      },
    },
  };
}

async function fetchInsee({ fetchImpl, now, checkedAt }) {
  try {
    const catalog = await requestJson(fetchImpl, INSEE_CATALOG_URL);
    if (catalog.identifier !== "DS_COMPTES_REGIONAUX")
      throw new Error("INSEE Melodi catalog identifier mismatch");
    const providerUpdatedAt =
      catalog.product
        ?.map((product) => product.modified)
        .filter(Boolean)
        .sort()
        .at(-1) ||
      catalog.modified ||
      checkedAt;
    const requests = INSEE_TERRITORIES.flatMap((territory) =>
      ["V", "L"].map(async (prices) => {
        const url = inseeMelodiUrl(territory.sourceCode, territory.geo, prices);
        const document = await requestJson(fetchImpl, url);
        if (document.paging?.next || document.observations?.length >= 10_000)
          throw new Error(
            `INSEE Melodi response is paginated or truncated: ${url}`,
          );
        return [territory.sourceCode, prices, document];
      }),
    );
    const documents = {};
    for (const [sourceCode, prices, document] of await Promise.all(requests)) {
      documents[sourceCode] ||= {};
      documents[sourceCode][prices === "V" ? "nominal" : "real"] = document;
    }
    const series = parseInseeMelodi(documents, {
      now,
      checkedAt,
      hash: sourceHash(JSON.stringify(documents)),
      sourceUrl: INSEE_CATALOG_URL,
      sourceDownloadUrl: INSEE_DATA_URL,
      providerUpdatedAt,
    });
    const sourceUrls = [
      INSEE_CATALOG_URL,
      ...INSEE_TERRITORIES.flatMap((territory) =>
        ["V", "L"].map((prices) =>
          inseeMelodiUrl(territory.sourceCode, territory.geo, prices),
        ),
      ),
    ];
    return {
      series,
      countries: INSEE_TERRITORIES.map((territory) =>
        makeCountry({
          code: territory.code,
          name: territory.name,
          region: territory.region,
          sourceFamily: "INSEE regional accounts",
          provider: "INSEE Melodi",
          sourceUrl: INSEE_CATALOG_URL,
          checkedAt,
          series,
        }),
      ),
      audit: {
        source: "INSEE Melodi regional accounts",
        checkedAt,
        providerUpdatedAt,
        sourceUrls,
        discovery: "current-Melodi-data-api",
      },
    };
  } catch (error) {
    const discovery = await discoverInseeWorkbook(fetchImpl);
    const workbook = await requestBuffer(fetchImpl, discovery.url);
    const discoveryNote = ` Latest INSEE Melodi API retrieval failed (${error.message}); this is an archived workbook fallback.${discovery.refreshStatus ? ` Workbook discovery also failed (${discovery.discoveryError}).` : ""}`;
    const series = parseInseeRegionalWorkbook(workbook, {
      now,
      checkedAt,
      hash: sourceHash(workbook),
      sourceDownloadUrl: discovery.url,
      sourceUrl: discovery.pageUrl || INSEE_PAGE,
      providerUpdatedAt: discovery.providerUpdatedAt || checkedAt,
      discoveryNote,
      refreshStatus: "discovery-fallback",
    });
    return {
      series,
      countries: INSEE_TERRITORIES.map((territory) =>
        makeCountry({
          code: territory.code,
          name: territory.name,
          region: territory.region,
          sourceFamily: "INSEE regional accounts",
          provider: "INSEE",
          sourceUrl: discovery.pageUrl || INSEE_PAGE,
          checkedAt,
          series,
        }),
      ),
      audit: {
        source: "INSEE regional accounts workbook fallback",
        checkedAt,
        sourceUrls: [
          INSEE_CATALOG_URL,
          discovery.pageUrl || INSEE_PAGE,
          discovery.url,
        ],
        discovery: "api-unavailable-workbook-fallback",
      },
    };
  }
}

async function fetchAsub({ fetchImpl, now, checkedAt }) {
  const [gdpMeta, cpiMeta] = await Promise.all([
    pxWebMetadata(fetchImpl, ASUB_GDP_API),
    pxWebMetadata(fetchImpl, ASUB_CPI_API),
  ]);
  const gdpYear = variable(gdpMeta, "år");
  const gdpMeasure = variable(gdpMeta, "uppgift");
  const gdpIndustry = variable(gdpMeta, "bransch");
  const cpiYear = variable(cpiMeta, "år");
  const cpiMonth = variable(cpiMeta, "månad");
  const gdpYears = gdpYear.values.filter(
    (value) => Number(value) <= completedYear(now),
  );
  // KO007 has a 500-cell request limit on the public PxWeb instance.  The
  // 1986+ monthly index history is 41*12=492 cells, stays under that limit,
  // and is sufficient for exact prior-12-month inflation derivation.
  const cpiYears = cpiYear.values.filter((year) => Number(year) >= 1986);
  const indexVariable = variable(cpiMeta, "indexserie");
  const indexCode =
    indexVariable.values.find((value, index) =>
      text(indexVariable.valueTexts?.[index] || value).startsWith("2015=100"),
    ) || indexVariable.values[0];
  const [gdpData, cpiData] = await Promise.all([
    pxWebData(
      fetchImpl,
      ASUB_GDP_API,
      pxWebQuery({
        uppgift: gdpMeasure.values.filter((value) =>
          ["lopande", "fasta"].includes(value),
        ),
        bransch: gdpIndustry.values.filter((value) => value === "BNPMRK"),
        år: gdpYears,
      }),
    ),
    pxWebData(
      fetchImpl,
      ASUB_CPI_API,
      pxWebQuery({
        år: cpiYears,
        månad: cpiMonth.values.filter((value) => /^\d{2}$/.test(value)),
        indexserie: [indexCode],
      }),
    ),
  ]);
  const series = parseAsubPxWeb(
    { gdpMeta, gdpData, cpiMeta, cpiData },
    {
      now,
      checkedAt,
      hash: sourceHash(JSON.stringify({ gdpMeta, gdpData, cpiMeta, cpiData })),
    },
  );
  return {
    series,
    countries: [
      makeCountry({
        code: "ALA",
        name: "Åland",
        region: "Europe & Central Asia",
        sourceFamily: "ÅSUB PxWeb",
        provider: "ÅSUB",
        sourceUrl: ASUB_GDP_PAGE,
        checkedAt,
        series,
      }),
    ],
    audit: {
      source: "ÅSUB PxWeb",
      checkedAt,
      sourceUrls: [ASUB_GDP_API, ASUB_CPI_API],
    },
  };
}

async function fetchCbs({ fetchImpl, now, checkedAt }) {
  const endpoints = {
    gdpData: `${CBS_BASE}/${CBS_GDP_TABLE}/TypedDataSet`,
    gdpIslands: `${CBS_BASE}/${CBS_GDP_TABLE}/CaribischNederland`,
    gdpPeriods: `${CBS_BASE}/${CBS_GDP_TABLE}/Perioden`,
    gdpTable: `${CBS_BASE}/${CBS_GDP_TABLE}/TableInfos`,
    cpiData: `${CBS_BASE}/${CBS_CPI_TABLE}/TypedDataSet`,
    cpiIslands: `${CBS_BASE}/${CBS_CPI_TABLE}/CaribbeanNetherlands`,
    cpiPeriods: `${CBS_BASE}/${CBS_CPI_TABLE}/Periods`,
    cpiTable: `${CBS_BASE}/${CBS_CPI_TABLE}/TableInfos`,
  };
  const keys = Object.keys(endpoints);
  const values = await Promise.all(
    keys.map((key) => requestJson(fetchImpl, endpoints[key])),
  );
  const documents = Object.fromEntries(
    keys.map((key, index) => [key, values[index]]),
  );
  const series = parseCbsTerritoryData(documents, {
    now,
    checkedAt,
    hash: sourceHash(JSON.stringify(documents)),
  });
  return {
    series,
    countries: [
      makeCountry({
        code: "BES",
        name: "Caribbean Netherlands",
        region: "Latin America & Caribbean",
        sourceFamily: "Statistics Netherlands (CBS)",
        provider: "CBS",
        sourceUrl: CBS_GDP_PAGE,
        checkedAt,
        series,
      }),
    ],
    audit: {
      source: "Statistics Netherlands (CBS)",
      checkedAt,
      sourceUrls: [CBS_GDP_PAGE, CBS_CPI_PAGE],
    },
  };
}

const PROVIDERS = Object.freeze([
  ["jersey", fetchJersey, "Government of Jersey Statistics"],
  ["insee", fetchInsee, "INSEE regional accounts"],
  ["asub", fetchAsub, "ÅSUB PxWeb"],
  ["cbs", fetchCbs, "Statistics Netherlands (CBS)"],
]);

function retainedForProvider(previousSeries, providerName) {
  return previousSeries.filter(
    (series) =>
      series.id?.startsWith(TERRITORY_PREFIX) &&
      (series.sourceFamily === providerName ||
        series.provider === providerName),
  );
}

function retainedCountries(previousCountries, providerName) {
  return previousCountries.filter(
    (country) =>
      country.sourceFamily === providerName ||
      country.provider === providerName,
  );
}

export async function fetchTerritoryData({
  fetchImpl = globalThis.fetch,
  previousSeries = [],
  previousCountries = [],
  now = new Date(),
} = {}) {
  if (typeof fetchImpl !== "function")
    throw new Error("fetchTerritoryData requires fetch");
  const effectiveNow = checkedDate(now);
  const checkedAt = effectiveNow.toISOString();
  const settled = await Promise.all(
    PROVIDERS.map(async ([name, fetcher, sourceFamily]) => {
      try {
        const result = await fetcher({
          fetchImpl,
          now: effectiveNow,
          checkedAt,
        });
        return { name, sourceFamily, status: "ok", result };
      } catch (error) {
        return { name, sourceFamily, status: "error", error };
      }
    }),
  );
  const series = [];
  const countries = [];
  const failures = [];
  const providers = {};
  for (const entry of settled) {
    if (entry.status === "ok") {
      const accepted = entry.result.series.map((candidate) => {
        const cached =
          candidate.refreshStatus &&
          previousSeries.find((item) => item.id === candidate.id);
        // An archived download must not replace a newer verified API history.
        return cached
          ? { ...cached, refreshStatus: "upstream-unavailable" }
          : candidate;
      });
      series.push(...accepted);
      failures.push(
        ...accepted.filter((item) => item.refreshStatus).map((item) => item.id),
      );
      countries.push(...entry.result.countries);
      providers[entry.name] = {
        status: accepted.some((item) => item.refreshStatus) ? "degraded" : "ok",
        seriesCount: entry.result.series.length,
        countryCount: entry.result.countries.length,
        ...entry.result.audit,
      };
      continue;
    }
    const retainedSeries = retainedForProvider(
      previousSeries,
      entry.sourceFamily,
    ).map((item) => ({
      ...item,
      refreshStatus: "upstream-unavailable",
      checkedAt:
        item.checkedAt ||
        previousSeries.find((candidate) => candidate.id === item.id)?.checkedAt,
    }));
    const retained = retainedCountries(
      previousCountries,
      entry.sourceFamily,
    ).map((item) => ({
      ...item,
      refreshStatus: "upstream-unavailable",
    }));
    series.push(...retainedSeries);
    countries.push(...retained);
    if (retainedSeries.length)
      failures.push(...retainedSeries.map(({ id }) => id));
    else failures.push(entry.name);
    providers[entry.name] = {
      status: "upstream-unavailable",
      error: entry.error?.message || String(entry.error),
      retainedSeries: retainedSeries.length,
      retainedCountries: retained.length,
    };
  }
  return {
    series,
    countries,
    failures: [...new Set(failures)],
    audit: {
      checkedAt,
      providers,
      sourceCount: series.length,
      countryCount: countries.length,
      timeoutMs: REQUEST_TIMEOUT_MS,
      actualCutoff: `${completedYear(effectiveNow)}-12-31`,
    },
  };
}

export {
  ASUB_CPI_API,
  ASUB_GDP_API,
  CBS_BASE,
  CBS_CPI_TABLE,
  CBS_GDP_TABLE,
  INSEE_CATALOG_URL,
  INSEE_DATA_URL,
  INSEE_WORKBOOK_URL,
  JERSEY_GDP_URL,
  JERSEY_RPI_URL,
  TERRITORY_PREFIX,
};
