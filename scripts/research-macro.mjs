import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

export const JST_SOURCE_URL = "https://www.macrohistory.net/database/";
export const JST_PROVIDER = "Jordà–Schularick–Taylor Macrohistory Database R6";
export const NYFED_GSCPI_SOURCE_URL =
  "https://www.newyorkfed.org/research/policy/gscpi";
export const NYFED_GSCPI_DOWNLOAD_URL =
  "https://www.newyorkfed.org/medialibrary/Research/Interactives/gscpi/downloads/gscpi_data.xlsx";

const DATASET = "research-macro";
const REQUEST_TIMEOUT_MS = 45_000;
const MACROHISTORY_LICENSE = "CC BY-NC-SA 4.0";
const JST_AUTHORS_CITATION =
  "Òscar Jordà, Moritz Schularick, and Alan M. Taylor. 2017. “Macrofinancial History and the New Business Cycle Facts.” NBER Macroeconomics Annual 2016, volume 31.";
const JST_BANK_CITATION =
  "Òscar Jordà, Björn Richter, Moritz Schularick, and Alan M. Taylor. 2021. “Bank capital redux: solvency, liquidity, and crisis.” The Review of Economic Studies, 88(1), 260–286.";

/**
 * The JST workbook also contains equity, bond, bill, housing-return, and
 * wealth-return columns. Keep the source's macroeconomic variables explicit so
 * an upstream workbook addition cannot silently turn into asset data here.
 */
export const RESEARCH_MACRO_VARIABLES = Object.freeze([
  {
    key: "pop",
    name: "Population",
    category: "Demography",
    unit: "thousands of people",
    changeType: "percent",
    definition:
      "Population in thousands of people at the JST R6 source-native scale.",
  },
  {
    key: "rgdpmad",
    name: "Real GDP per capita · Maddison",
    category: "Growth",
    unit: "1990 international $/person",
    changeType: "percent",
    definition:
      "Real GDP per capita in 1990 international dollars from the Maddison historical series.",
  },
  {
    key: "rgdpbarro",
    name: "Real GDP per capita · Barro-Ursúa",
    category: "Growth",
    unit: "index (2005=100)",
    changeType: "percent",
    definition: "Real GDP per capita index, 2005=100.",
  },
  {
    key: "rconsbarro",
    name: "Real consumption per capita · Barro-Ursúa",
    category: "Growth",
    unit: "index (2006=100)",
    changeType: "percent",
    definition: "Real consumption per capita index, 2006=100.",
  },
  {
    key: "gdp",
    name: "Nominal GDP",
    category: "Growth",
    unit: "source-native local currency",
    changeType: "percent",
    definition:
      "Nominal GDP in local currency and the country-specific source scale.",
    nativeCurrency: true,
  },
  {
    key: "iy",
    name: "Investment-to-GDP ratio",
    category: "Growth",
    unit: "%",
    changeType: "basis-points",
    definition: "Gross investment as a share of GDP.",
  },
  {
    key: "cpi",
    name: "Consumer prices",
    category: "Inflation",
    unit: "index (1990=100)",
    changeType: "percent",
    definition: "Consumer prices index, 1990=100.",
  },
  {
    key: "ca",
    name: "Current account",
    category: "Growth",
    subcategory: "Trade",
    unit: "source-native local currency",
    changeType: "points",
    semantic: "point",
    signed: true,
    definition:
      "Current account balance in nominal local currency and the country-specific source scale.",
    nativeCurrency: true,
  },
  {
    key: "imports",
    name: "Imports",
    category: "Growth",
    subcategory: "Trade",
    unit: "source-native local currency",
    changeType: "percent",
    definition:
      "Imports in nominal local currency and the country-specific source scale.",
    nativeCurrency: true,
  },
  {
    key: "exports",
    name: "Exports",
    category: "Growth",
    subcategory: "Trade",
    unit: "source-native local currency",
    changeType: "percent",
    definition:
      "Exports in nominal local currency and the country-specific source scale.",
    nativeCurrency: true,
  },
  {
    key: "narrowm",
    name: "Narrow money",
    category: "Credit",
    unit: "source-native local currency",
    changeType: "percent",
    definition:
      "Narrow money in nominal local currency and the country-specific source scale.",
    nativeCurrency: true,
  },
  {
    key: "money",
    name: "Broad money",
    category: "Credit",
    unit: "source-native local currency",
    changeType: "percent",
    definition:
      "Broad money in nominal local currency and the country-specific source scale.",
    nativeCurrency: true,
  },
  {
    key: "stir",
    name: "Short-term interest rate",
    category: "Rates",
    unit: "%",
    changeType: "basis-points",
    definition: "Short-term nominal interest rate, percent per year.",
  },
  {
    key: "ltrate",
    name: "Long-term interest rate",
    category: "Rates",
    unit: "%",
    changeType: "basis-points",
    definition: "Long-term nominal interest rate, percent per year.",
  },
  {
    key: "hpnom",
    name: "House prices",
    category: "Housing",
    unit: "index (1990=100)",
    changeType: "percent",
    definition: "Nominal house price index, 1990=100.",
  },
  {
    key: "unemp",
    name: "Unemployment rate",
    category: "Labor",
    unit: "%",
    changeType: "basis-points",
    definition: "Unemployment rate, percent.",
  },
  {
    key: "wage",
    name: "Wages",
    category: "Labor",
    unit: "index (1990=100)",
    changeType: "percent",
    definition: "Wage index, 1990=100.",
  },
  {
    key: "debtgdp",
    name: "Public debt-to-GDP ratio",
    category: "Fiscal",
    unit: "%",
    changeType: "basis-points",
    definition: "Public debt as a share of GDP.",
  },
  {
    key: "revenue",
    name: "Government revenue",
    category: "Fiscal",
    unit: "source-native local currency",
    changeType: "percent",
    definition:
      "Government revenues in nominal local currency and the country-specific source scale.",
    nativeCurrency: true,
  },
  {
    key: "expenditure",
    name: "Government expenditure",
    category: "Fiscal",
    unit: "source-native local currency",
    changeType: "percent",
    definition:
      "Government expenditure in nominal local currency and the country-specific source scale.",
    nativeCurrency: true,
  },
  {
    key: "xrusd",
    name: "USD exchange rate",
    category: "Currencies",
    unit: "local currency/USD",
    changeType: "percent",
    definition: "Exchange rate in local currency per U.S. dollar.",
  },
  {
    key: "tloans",
    name: "Total loans to non-financial private sector",
    category: "Credit",
    unit: "source-native local currency",
    changeType: "percent",
    definition:
      "Total loans to the non-financial private sector in nominal local currency and the country-specific source scale.",
    nativeCurrency: true,
  },
  {
    key: "tmort",
    name: "Mortgage loans to non-financial private sector",
    category: "Credit",
    unit: "source-native local currency",
    changeType: "percent",
    definition:
      "Mortgage loans to the non-financial private sector in nominal local currency and the country-specific source scale.",
    nativeCurrency: true,
  },
  {
    key: "thh",
    name: "Total loans to households",
    category: "Credit",
    unit: "source-native local currency",
    changeType: "percent",
    definition:
      "Total loans to households in nominal local currency and the country-specific source scale.",
    nativeCurrency: true,
  },
  {
    key: "tbus",
    name: "Total loans to business",
    category: "Credit",
    unit: "source-native local currency",
    changeType: "percent",
    definition:
      "Total loans to business in nominal local currency and the country-specific source scale.",
    nativeCurrency: true,
  },
  {
    key: "bdebt",
    name: "Corporate debt",
    category: "Credit",
    unit: "source-native local currency",
    changeType: "percent",
    definition:
      "Corporate debt in nominal local currency and the country-specific source scale.",
    nativeCurrency: true,
  },
  {
    key: "lev",
    name: "Bank capital ratio",
    category: "Credit",
    unit: "%",
    changeType: "basis-points",
    definition: "Banks' capital ratio, percent.",
    bankRatio: true,
  },
  {
    key: "ltd",
    name: "Bank loans-to-deposits ratio",
    category: "Credit",
    unit: "%",
    changeType: "basis-points",
    definition: "Banks' loans-to-deposits ratio, percent.",
    bankRatio: true,
  },
  {
    key: "noncore",
    name: "Bank noncore funding ratio",
    category: "Credit",
    unit: "%",
    changeType: "basis-points",
    definition: "Banks' noncore funding ratio, percent.",
    bankRatio: true,
  },
]);

// Names and geography labels intentionally follow the current snapshot's
// country contract: USA is displayed as US, while other economies use their
// roster name. JST's workbook calls Great Britain "UK".
export const JST_COUNTRIES = Object.freeze({
  AUS: "Australia",
  BEL: "Belgium",
  CAN: "Canada",
  CHE: "Switzerland",
  DEU: "Germany",
  DNK: "Denmark",
  ESP: "Spain",
  FIN: "Finland",
  FRA: "France",
  GBR: "United Kingdom",
  IRL: "Ireland",
  ITA: "Italy",
  JPN: "Japan",
  NLD: "Netherlands",
  NOR: "Norway",
  PRT: "Portugal",
  SWE: "Sweden",
  USA: "United States",
});

// Source-native level scales documented for each JST R6 country section. The
// workbook values are not uniformly raw currency units.
export const JST_NATIVE_UNITS = Object.freeze({
  AUS: "millions AUD",
  BEL: "millions BEF",
  CAN: "billions CAD",
  CHE: "millions CHF",
  DEU: "billions DM",
  DNK: "billions DKK",
  ESP: "millions ESP",
  FIN: "millions FIM (New Markaa)",
  FRA: "billions FRF (new francs)",
  GBR: "billions GBP",
  IRL: "millions IEP",
  ITA: "billions ITL",
  JPN: "trillions JPY",
  NLD: "millions NLG",
  NOR: "millions NOK",
  PRT: "millions PTE",
  SWE: "millions SEK",
  USA: "billions USD",
});

const JST_COUNTRY_CODES = Object.freeze(Object.keys(JST_COUNTRIES));

function finiteNumber(value) {
  if (value === null || value === undefined || typeof value === "boolean")
    return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function sourceHash(...values) {
  const hash = createHash("sha256");
  for (const [index, value] of values.entries()) {
    if (index) hash.update("\n");
    hash.update(typeof value === "string" ? value : Buffer.from(value));
  }
  return hash.digest("hex");
}

function yearValue(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const text = String(value ?? "").trim();
  return /^\d{4}$/.test(text) ? Number(text) : null;
}

function yearEnd(year) {
  return `${year}-12-31`;
}

function lastCompletedYear() {
  return new Date().getUTCFullYear() - 1;
}

function normalizeCountryRoster(countryRoster) {
  const roster = new Map(
    JST_COUNTRY_CODES.map((code) => [code, JST_COUNTRIES[code]]),
  );
  for (const entry of countryRoster || []) {
    const code = String(entry?.id || entry?.countryCode || "")
      .trim()
      .toUpperCase();
    if (code && roster.has(code) && entry?.name) roster.set(code, entry.name);
  }
  return roster;
}

function canonicalCountry(code, countryRoster) {
  const countryCode = String(code ?? "")
    .trim()
    .toUpperCase();
  const country = countryRoster.get(countryCode);
  if (!country) return null;
  return {
    countryCode,
    country,
    geography: countryCode === "USA" ? "US" : country,
  };
}

function normalizeWorkbookRows(rows) {
  if (!Array.isArray(rows)) throw new TypeError("JST rows must be an array.");
  if (!rows.length) return [];
  if (!Array.isArray(rows[0])) return rows;
  const [header, ...values] = rows;
  return values.map((row) =>
    Object.fromEntries(
      header.map((key, index) => [String(key ?? ""), row[index]]),
    ),
  );
}

function metadataForJst({
  variable,
  country,
  sourceHash: hash,
  sourceDownloadUrl,
  checkedAt,
  sourceAsOf,
  sourceFile,
}) {
  const bankCitation = variable.bankRatio ? ` ${JST_BANK_CITATION}` : "";
  const sourceUnit = variable.nativeCurrency
    ? JST_NATIVE_UNITS[country.countryCode]
    : variable.unit;
  if (!sourceUnit) {
    throw new Error(
      `No JST native unit is documented for ${country.countryCode}.`,
    );
  }
  const sourceDefinition = variable.nativeCurrency
    ? `${variable.definition.replace(/ and the country-specific source scale\.$/, ".")} Source-native unit: ${sourceUnit}.`
    : variable.definition;
  return {
    id: `JST_${country.countryCode}_${variable.key.toUpperCase()}`,
    name: `${variable.name} · ${country.country}`,
    indicatorKey: variable.key,
    indicatorName: variable.name,
    category: variable.category,
    frequency: "annual",
    releaseFrequency: "annual",
    unit: sourceUnit,
    changeType: variable.changeType,
    ...(variable.semantic ? { semantic: variable.semantic } : {}),
    ...(variable.signed ? { signed: true } : {}),
    ...(variable.subcategory ? { subcategory: variable.subcategory } : {}),
    geography: country.geography,
    country: country.country,
    countryCode: country.countryCode,
    source: JST_PROVIDER,
    sourceFamily: JST_PROVIDER,
    provider: JST_PROVIDER,
    sourceUrl: JST_SOURCE_URL,
    sourceDownloadUrl,
    sourceFile,
    sourceHash: hash,
    sourceColumn: `${country.countryCode} / ${variable.key}`,
    sourceDefinition,
    sourceOrganization: `${JST_AUTHORS_CITATION}${bankCitation}`,
    sourceAsOf,
    checkedAt,
    historyType: "archived published observations",
    historyStatus: "archived",
    availabilityNote: `JST Macrohistory Database R6 is an archived annual source ending in ${sourceAsOf.slice(0, 4)}; it is not a current estimate and is not spliced into modern series.`,
    rightsNote: `${JST_AUTHORS_CITATION}${bankCitation} Licensed under ${MACROHISTORY_LICENSE}; MacroTrace's use is non-commercial and any adaptation must retain attribution and the same license. ${JST_SOURCE_URL}`,
    methodology: `Native annual JST R6 observations only; each completed reference year is labeled December 31. Missing values are omitted, no interpolation or synthetic splicing into modern series is performed. Cite ${JST_AUTHORS_CITATION}${bankCitation} The source is archived through ${sourceAsOf.slice(0, 4)}.`,
    dataset: DATASET,
  };
}

/**
 * Pure parser for a JST workbook sheet represented as objects or a 2-D array.
 * The parser deliberately does not fetch, write files, or combine definitions
 * with other providers.
 */
export function parseResearchMacroRows(
  inputRows,
  {
    sourceHash: hash = "fixture",
    sourceDownloadUrl = JST_SOURCE_URL,
    sourceFile = "JSTdatasetR6.xlsx",
    checkedAt = new Date().toISOString(),
    lastYear = lastCompletedYear(),
    countryRoster,
  } = {},
) {
  const rows = normalizeWorkbookRows(inputRows);
  const roster = normalizeCountryRoster(countryRoster);
  const byCountryYear = new Map();
  for (const row of rows) {
    const country = canonicalCountry(row.iso, roster);
    if (!country) {
      if (row.iso || row.country) {
        throw new Error(
          `JST country is outside the canonical roster: ${row.iso || row.country}`,
        );
      }
      continue;
    }
    const year = yearValue(row.year);
    if (!year || year > lastYear) continue;
    const key = `${country.countryCode}/${year}`;
    if (byCountryYear.has(key))
      throw new Error(`Duplicate JST annual observation: ${key}`);
    byCountryYear.set(key, row);
  }
  const years = [...byCountryYear.keys()]
    .map((key) => Number(key.slice(key.indexOf("/") + 1)))
    .filter(Number.isInteger);
  if (!years.length)
    throw new Error("JST workbook has no completed annual rows.");
  const sourceAsOf = yearEnd(Math.max(...years));
  const series = [];
  for (const countryCode of JST_COUNTRY_CODES) {
    const country = canonicalCountry(countryCode, roster);
    const countryRows = [...byCountryYear]
      .filter(([key]) => key.startsWith(`${countryCode}/`))
      .sort(
        ([a], [b]) =>
          Number(a.slice(a.indexOf("/") + 1)) -
          Number(b.slice(b.indexOf("/") + 1)),
      )
      .map(([, row]) => row);
    if (!countryRows.length) continue;
    for (const variable of RESEARCH_MACRO_VARIABLES) {
      const observations = countryRows.flatMap((row) => {
        const year = yearValue(row.year);
        const value = finiteNumber(row[variable.key]);
        return year && value !== null ? [[yearEnd(year), value]] : [];
      });
      if (!observations.length) continue;
      series.push({
        ...metadataForJst({
          variable,
          country,
          sourceHash: hash,
          sourceDownloadUrl,
          checkedAt,
          sourceAsOf,
          sourceFile,
        }),
        observations,
      });
    }
  }
  if (!series.length)
    throw new Error("JST workbook has no supported macro series.");
  return series;
}

export function parseResearchMacroWorkbook(buffer, options = {}) {
  const bytes = Buffer.from(buffer);
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("JST workbook has no worksheet.");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: null,
    raw: true,
  });
  return parseResearchMacroRows(rows, {
    ...options,
    sourceHash: options.sourceHash || sourceHash(bytes),
  });
}

function parseGscpiDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime()))
    return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d)
      return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function gscpiLastCompletedMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
    .toISOString()
    .slice(0, 10);
}

export function parseGscpiRows(
  inputRows,
  {
    sourceHash: hash = "fixture",
    sourceDownloadUrl = NYFED_GSCPI_DOWNLOAD_URL,
    sourceFile = "gscpi_data.xlsx",
    checkedAt = new Date().toISOString(),
    lastMonth = gscpiLastCompletedMonth(),
  } = {},
) {
  const rows = normalizeWorkbookRows(inputRows);
  const observations = [];
  const seen = new Set();
  for (const row of rows) {
    const date = parseGscpiDate(row.Date ?? row.date ?? row.DATE);
    const value = finiteNumber(row.GSCPI ?? row.gscpi ?? row.value);
    if (!date || date > lastMonth || value === null) continue;
    if (seen.has(date)) throw new Error(`Duplicate GSCPI observation: ${date}`);
    seen.add(date);
    observations.push([date, value]);
  }
  observations.sort(([a], [b]) => a.localeCompare(b));
  if (!observations.length)
    throw new Error("NY Fed GSCPI workbook has no completed observations.");
  return {
    id: "NYFED_GSCPI",
    name: "Global Supply Chain Pressure Index",
    indicatorKey: "GSCPI",
    indicatorName: "Global Supply Chain Pressure Index",
    category: "Growth",
    frequency: "monthly",
    releaseFrequency: "monthly",
    unit: "standard deviations",
    changeType: "points",
    geography: "Global",
    country: null,
    source: "Federal Reserve Bank of New York",
    sourceFamily: "New York Fed Global Supply Chain Pressure Index",
    provider: "Federal Reserve Bank of New York",
    sourceUrl: NYFED_GSCPI_SOURCE_URL,
    sourceDownloadUrl,
    sourceFile,
    sourceHash: hash,
    sourceColumn: "GSCPI Monthly Data / GSCPI",
    sourceDefinition:
      "Global Supply Chain Pressure Index (GSCPI), a New York Fed index tracking global supply-chain conditions using transportation and manufacturing data.",
    sourceOrganization: "Federal Reserve Bank of New York",
    sourceAsOf: observations.at(-1)[0],
    checkedAt,
    historyType: "published index",
    historyStatus: "current",
    availabilityNote:
      "Monthly observations are retained at the source's native frequency; the latest available month is not interpreted as a forecast.",
    rightsNote: `Federal Reserve Bank of New York Global Supply Chain Pressure Index. See the official source and download page: ${NYFED_GSCPI_SOURCE_URL}`,
    methodology:
      "Published New York Fed GSCPI observations without interpolation or synthetic splicing. Date labels are the source month-end dates.",
    dataset: DATASET,
    observations,
  };
}

export function parseGscpiWorkbook(buffer, options = {}) {
  const bytes = Buffer.from(buffer);
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames.find((name) =>
    /monthly data/i.test(name),
  );
  if (!sheetName)
    throw new Error("NY Fed GSCPI workbook has no monthly data sheet.");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: null,
    raw: true,
    range: 0,
  });
  return parseGscpiRows(rows, {
    ...options,
    sourceHash: options.sourceHash || sourceHash(bytes),
  });
}

export function discoverMacrohistoryWorkbookUrl(
  html,
  pageUrl = JST_SOURCE_URL,
) {
  const source = String(html ?? "");
  const match = source.match(
    /href\s*=\s*["']([^"']*JSTdatasetR6\.xlsx(?:\?[^"']*)?)["']/i,
  );
  if (!match)
    throw new Error(
      "Official JST source page did not expose JSTdatasetR6.xlsx.",
    );
  const href = match[1].replaceAll("&amp;", "&").replaceAll("\\/", "/");
  const resolved = new URL(href, pageUrl).href;
  const hostname = new URL(resolved).hostname.toLowerCase();
  if (!(
    hostname === "macrohistory.net" ||
    hostname.endsWith(".macrohistory.net") ||
    hostname.endsWith(".jimcontent.com")
  ))
    throw new Error(
      `JST workbook URL is outside the official source hosts: ${resolved}`,
    );
  return resolved;
}

async function readResponseBody(response, asBytes = false) {
  if (!response?.ok) throw new Error(`HTTP ${response?.status ?? "unknown"}`);
  if (asBytes && typeof response.arrayBuffer === "function")
    return Buffer.from(await response.arrayBuffer());
  const text = await response.text();
  return asBytes ? Buffer.from(text) : text;
}

async function fetchSource(url, fetchImpl, asBytes = false) {
  const response = await fetchImpl(url, {
    signal:
      typeof AbortSignal?.timeout === "function"
        ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        : undefined,
  });
  return readResponseBody(response, asBytes);
}

function isJstSeries(series) {
  return (
    series?.dataset === DATASET &&
    (series?.sourceFamily === JST_PROVIDER ||
      String(series?.id || "").startsWith("JST_"))
  );
}

function isGscpiSeries(series) {
  return (
    series?.dataset === DATASET &&
    (series?.id === "NYFED_GSCPI" ||
      /GSCPI/i.test(String(series?.sourceFamily || "")))
  );
}

function retained(series) {
  return {
    ...series,
    dataset: DATASET,
    refreshStatus: "upstream-unavailable",
  };
}

/**
 * Fetch JST R6 and the optional NY Fed GSCPI supplement. Each provider is
 * isolated: a failed refresh retains only that provider's prior series with
 * their original checkedAt. A first JST failure is fatal so the caller cannot
 * mistake an empty result for a successful import; the optional GSCPI source
 * is reported and skipped when it has no cached history.
 */
export async function fetchResearchMacro({
  previousSeries = [],
  fetchImpl = globalThis.fetch,
  countryRoster,
  lastYear,
  lastMonth,
  checkedAt = new Date().toISOString(),
} = {}) {
  if (typeof fetchImpl !== "function")
    throw new TypeError("fetchImpl must be a function.");
  const previous = Array.isArray(previousSeries)
    ? previousSeries.filter((series) => series?.dataset === DATASET)
    : [];
  const previousJst = previous.filter(isJstSeries);
  const previousGscpi = previous.filter(isGscpiSeries);
  let jstSeries;
  try {
    const pageHtml = await fetchSource(JST_SOURCE_URL, fetchImpl);
    const workbookUrl = discoverMacrohistoryWorkbookUrl(
      pageHtml,
      JST_SOURCE_URL,
    );
    const bytes = await fetchSource(workbookUrl, fetchImpl, true);
    jstSeries = parseResearchMacroWorkbook(bytes, {
      sourceDownloadUrl: workbookUrl,
      checkedAt,
      lastYear,
      countryRoster,
    });
  } catch (error) {
    if (!previousJst.length) {
      throw new Error(
        `research-macro JST provider failed on first import: ${error.message}`,
        {
          cause: error,
        },
      );
    }
    console.warn(
      `research-macro JST provider unavailable; retaining ${previousJst.length} cached series: ${error.message}`,
    );
    jstSeries = previousJst.map(retained);
  }

  let gscpiSeries = [];
  try {
    const bytes = await fetchSource(NYFED_GSCPI_DOWNLOAD_URL, fetchImpl, true);
    gscpiSeries = [
      parseGscpiWorkbook(bytes, {
        checkedAt,
        lastMonth,
      }),
    ];
  } catch (error) {
    if (previousGscpi.length) {
      console.warn(
        `research-macro NY Fed GSCPI unavailable; retaining cached series: ${error.message}`,
      );
      gscpiSeries = previousGscpi.map(retained);
    } else {
      console.warn(
        `research-macro NY Fed GSCPI first import unavailable; no series fabricated: ${error.message}`,
      );
    }
  }
  return [...jstSeries, ...gscpiSeries].map((series) => ({
    ...series,
    dataset: DATASET,
  }));
}
