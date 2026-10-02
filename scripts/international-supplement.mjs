import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import https from "node:https";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const UN_BASE = "https://unstats.un.org/unsd/amaapi/api";
const UN_SOURCE_URL = "https://unstats.un.org/unsd/nationalaccount/ama.asp";
const UN_RIGHTS_URL = "https://data.un.org/Host.aspx?Content=UNdataUse";
const SPC_BASE = "https://stats-nsi-stable.pacificdata.org/rest";
const SPC_DATAFLOW = "SPC,DF_NATIONAL_ACCOUNTS,1.0";
const SPC_DATAFLOW_URL = `${SPC_BASE}/dataflow/SPC/DF_NATIONAL_ACCOUNTS/1.0?references=all`;
const SPC_SOURCE_URL =
  "https://pacificdata.org/data/dataset/gross-domestic-product-for-pacific-island-countries-and-territories-df-national-accounts";
const SPC_RIGHTS_URL = "https://docs.pacificdata.org/dotstat/api";
const IMF_WEO_PAGE_URL = "https://data.imf.org/en/Datasets/WEO";
const IMF_WEO_RIGHTS_URL = "https://www.imf.org/external/terms.htm";
// Verified on 2026-09-30. This is an emergency no-cache fallback only: normal
// refreshes discover the current workbook from IMF_WEO_PAGE_URL first.
const IMF_WEO_VERIFIED_FALLBACK_URL =
  "https://data.imf.org/-/media/iData/External-Storage/Documents/2F78EE59F79143A7921E5E203D3AAA80/en/WEOApr2026all.xlsx";
const REQUEST_TIMEOUT_MS = 30_000;
const RETRIES = 2;

const UN_ECONOMIES = Object.freeze([
  {
    sourceCode: 660,
    countryCode: "AIA",
    name: "Anguilla",
    region: "Caribbean",
  },
  {
    sourceCode: 184,
    countryCode: "COK",
    name: "Cook Islands",
    region: "Oceania",
  },
  {
    sourceCode: 500,
    countryCode: "MSR",
    name: "Montserrat",
    region: "Caribbean",
  },
]);

// The SPC dataflow's codelist uses two-character territory codes. These are
// Pacific territories outside the World Bank country roster; COK is deliberately
// covered by UN AMA instead to avoid silently choosing between duplicates.
const SPC_ECONOMIES = Object.freeze([
  { sourceCode: "AS", countryCode: "ASM", name: "American Samoa" },
  { sourceCode: "GU", countryCode: "GUM", name: "Guam" },
  { sourceCode: "MP", countryCode: "MNP", name: "Northern Mariana Islands" },
  { sourceCode: "NC", countryCode: "NCL", name: "New Caledonia" },
  { sourceCode: "NU", countryCode: "NIU", name: "Niue" },
  { sourceCode: "PF", countryCode: "PYF", name: "French Polynesia" },
  { sourceCode: "PN", countryCode: "PCN", name: "Pitcairn Islands" },
  { sourceCode: "TK", countryCode: "TKL", name: "Tokelau" },
  { sourceCode: "WF", countryCode: "WLF", name: "Wallis and Futuna" },
]);

const UN_INDICATORS = Object.freeze([
  {
    sourceIndicator: "2",
    indicatorKey: "GDP_NOMINAL",
    indicatorName: "Nominal GDP",
    expectedName: "GDP, at current prices - US Dollars",
    unit: "current USD",
    changeType: "percent",
    category: "Growth",
  },
  {
    sourceIndicator: "4",
    indicatorKey: "GDP",
    indicatorName: "Real GDP",
    expectedName: "GDP, at constant 2020 prices - US Dollars",
    unit: "constant 2020 USD",
    changeType: "percent",
    category: "Growth",
  },
  {
    sourceIndicator: "5",
    indicatorKey: "GDPPC_NOMINAL",
    indicatorName: "Nominal GDP per capita",
    expectedName: "GDP, Per Capita GDP - US Dollars",
    unit: "current USD/person",
    changeType: "percent",
    category: "Growth",
  },
  {
    sourceIndicator: "43",
    indicatorKey: "GDPPC",
    indicatorName: "Real GDP per capita",
    expectedName: "GDP, Per Capita GDP at constant 2020 prices - US Dollars",
    unit: "constant 2020 USD/person",
    changeType: "percent",
    category: "Growth",
  },
  {
    sourceIndicator: "8",
    indicatorKey: "GDPGROWTH",
    indicatorName: "Real GDP growth",
    expectedName: "GDP, Annual Rate of Growth - Percentage",
    unit: "%",
    changeType: "basis-points",
    category: "Growth",
  },
]);

const SPC_INDICATORS = Object.freeze([
  {
    sourceIndicator: "GDPC",
    indicatorKey: "GDP_NOMINAL",
    indicatorName: "Nominal GDP",
    unit: "thousands USD",
    sourceUnitMeasure: "USD",
    sourceUnitMultiplier: "3",
    changeType: "percent",
  },
  {
    sourceIndicator: "GDPCPC",
    indicatorKey: "GDPPC_NOMINAL",
    indicatorName: "Nominal GDP per capita",
    unit: "USD/person",
    sourceUnitMeasure: "USD_POP",
    sourceUnitMultiplier: "",
    changeType: "percent",
  },
  {
    sourceIndicator: "GDPCVR",
    indicatorKey: "GDPGROWTH_NOMINAL",
    indicatorName: "Nominal GDP growth",
    unit: "%",
    sourceUnitMeasure: "PERCENT",
    sourceUnitMultiplier: "",
    changeType: "basis-points",
  },
  {
    sourceIndicator: "GDPCPCVR",
    indicatorKey: "GDPPCGROWTH_NOMINAL",
    indicatorName: "Nominal GDP per capita growth",
    unit: "%",
    sourceUnitMeasure: "PERCENT",
    sourceUnitMultiplier: "",
    changeType: "basis-points",
  },
]);

const IMF_TWN_INDICATORS = Object.freeze([
  {
    sourceIndicator: "NGDP_RPCH",
    indicatorKey: "GDPGROWTH",
    indicatorName: "Real GDP growth",
    unit: "%",
    sourceUnit: "Percent",
    sourceScale: "Units",
    changeType: "basis-points",
    category: "Growth",
  },
  {
    sourceIndicator: "NGDPD",
    indicatorKey: "GDP_NOMINAL",
    indicatorName: "Nominal GDP",
    unit: "USD billions",
    sourceUnit: "US dollar",
    sourceScale: "Billions",
    changeType: "percent",
    category: "Growth",
  },
  {
    sourceIndicator: "NGDPDPC",
    indicatorKey: "GDPPC_NOMINAL",
    indicatorName: "Nominal GDP per capita",
    unit: "USD/person",
    sourceUnit: "US dollar",
    sourceScale: "Units",
    changeType: "percent",
    category: "Growth",
  },
  {
    sourceIndicator: "PCPIPCH",
    indicatorKey: "INFLATION",
    indicatorName: "Consumer price inflation",
    unit: "%",
    sourceUnit: "Percent",
    sourceScale: "Units",
    changeType: "basis-points",
    category: "Inflation",
  },
  {
    sourceIndicator: "LUR",
    indicatorKey: "UNEMPLOYMENT",
    indicatorName: "Unemployment rate",
    unit: "%",
    // WEO's LUR row has a blank UNIT field; retain that fact in sourceUnit.
    sourceUnit: null,
    sourceScale: "Units",
    changeType: "basis-points",
    category: "Labor",
  },
]);

const DGBAS_BASE = "https://nstatdb.dgbas.gov.tw/dgbasAll/webMain.aspx?sdmx/";
const DGBAS_API_GUIDE_URL =
  "https://nstatdb.dgbas.gov.tw/dgbasAll/download/API%E8%AA%AA%E6%98%8E%E6%96%87%E4%BB%B6.pdf";
const DGBAS_ECONOMY = Object.freeze({
  countryCode: "TWN",
  name: "Taiwan",
});
const DGBAS_START_YEAR = 1960;

const DGBAS_INDICATORS = Object.freeze([
  {
    id: "GDPGROWTH",
    sourceIndicator: "3",
    dataset: "A018101010",
    filter: "3...A",
    indicatorKey: "GDPGROWTH",
    indicatorName: "Real GDP growth",
    unit: "%",
    category: "Growth",
    changeType: "basis-points",
    expectedDimension: "fldid",
    expectedValueId: "3",
    expectedValueName: "經濟成長率(%)",
    sourceDefinition: "經濟成長率(%)",
    sourceUnit: "%",
    valueType: "rate",
  },
  {
    id: "GDP_NOMINAL",
    sourceIndicator: "5",
    dataset: "A018101010",
    filter: "5...A",
    indicatorKey: "GDP_NOMINAL",
    indicatorName: "Nominal GDP",
    unit: "million USD",
    category: "Growth",
    changeType: "percent",
    expectedDimension: "fldid",
    expectedValueId: "5",
    expectedValueName: "國內生產毛額GDP(名目值，百萬美元)",
    sourceDefinition: "國內生產毛額GDP(名目值，百萬美元)",
    sourceUnit: "million USD",
    valueType: "level",
  },
  {
    id: "GDPPC_NOMINAL",
    sourceIndicator: "7",
    dataset: "A018101010",
    filter: "7...A",
    indicatorKey: "GDPPC_NOMINAL",
    indicatorName: "Nominal GDP per capita",
    unit: "USD/person",
    category: "Growth",
    changeType: "percent",
    expectedDimension: "fldid",
    expectedValueId: "7",
    expectedValueName: "平均每人GDP(名目值，美元)",
    sourceDefinition: "平均每人GDP(名目值，美元)",
    sourceUnit: "USD/person",
    valueType: "level",
  },
  {
    id: "CPI_INDEX",
    sourceIndicator: "1",
    dataset: "A030101015",
    filter: "1...A",
    indicatorKey: "CPI_INDEX",
    indicatorName: "Consumer price index",
    unit: "index (2021=100)",
    category: "Inflation",
    changeType: "percent",
    expectedDimension: "fldid",
    expectedValueId: "1",
    expectedValueName: "總指數",
    sourceDefinition: "消費者物價基本分類指數 · 總指數 (民國110年=100)",
    sourceUnit: "index (2021=100)",
    valueType: "level",
    cpi: true,
  },
  {
    id: "UNEMPLOYMENT",
    sourceIndicator: "2",
    dataset: "A040108010",
    filter: "2.1.1.A",
    indicatorKey: "UNEMPLOYMENT",
    indicatorName: "Unemployment rate",
    unit: "%",
    category: "Labor",
    changeType: "basis-points",
    expectedDimensions: [
      ["fldid", "2", "失業率"],
      ["code1", "1", "合計"],
      ["code2", "1", "合計"],
    ],
    sourceDefinition: "勞參率及失業率-按教育程度分 · 失業率 · 合計",
    sourceUnit: "%",
    valueType: "rate",
    rejectZero: true,
  },
]);

function asText(value) {
  return String(value ?? "").trim();
}

export function finiteNumber(value) {
  if (value === null || value === undefined || typeof value === "boolean")
    return null;
  if (typeof value === "string" && value.trim() === "") return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseProviderTimestamp(value) {
  const timestamp = new Date(asText(value));
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
}

function yearEnd(year) {
  return `${year}-12-31`;
}

function sourceHash(...bodies) {
  const hash = createHash("sha256");
  for (const [index, body] of bodies.entries()) {
    if (index) hash.update("\n");
    hash.update(body);
  }
  return hash.digest("hex");
}

function previousFor(previousSeries, prefix, sourceIndicator) {
  return previousSeries.filter(
    (series) =>
      series?.id?.startsWith(prefix) &&
      (!sourceIndicator ||
        String(series.sourceIndicator) === String(sourceIndicator)),
  );
}

function cloneCached(series) {
  return { ...series, refreshStatus: "upstream-unavailable" };
}

function observationStatus(row) {
  return asText(
    row.obs_status ?? row.OBS_STATUS ?? row.observationStatus,
  ).toUpperCase();
}

async function requestText(url, fetchImpl, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...options,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (!body.trim()) throw new Error("empty upstream response");
      return { body, response };
    } catch (error) {
      lastError = error;
      if (attempt + 1 < RETRIES)
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * (attempt + 1)),
        );
    }
  }
  throw lastError || new Error("upstream request failed");
}

async function requestBytes(url, fetchImpl, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...options,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = Buffer.from(await response.arrayBuffer());
      if (!body.length) throw new Error("empty upstream response");
      return { body, response };
    } catch (error) {
      lastError = error;
      if (attempt + 1 < RETRIES)
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * (attempt + 1)),
        );
    }
  }
  throw lastError || new Error("upstream request failed");
}

function requestHttpsOnce(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const request = https.request(
      parsed,
      { method: options.method || "GET", headers: options.headers || {} },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          const headers = {
            get(name) {
              return response.headers[String(name).toLowerCase()] || null;
            },
          };
          if (response.statusCode < 200 || response.statusCode >= 300)
            reject(new Error(`HTTP ${response.statusCode}`));
          else if (!body.trim()) reject(new Error("empty upstream response"));
          else resolve({ body, response: { headers } });
        });
      },
    );
    request.setTimeout(REQUEST_TIMEOUT_MS, () =>
      request.destroy(new Error("request timeout")),
    );
    request.on("error", reject);
    request.end();
  });
}

async function requestNodeText(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      return await requestHttpsOnce(url, options);
    } catch (error) {
      lastError = error;
      if (attempt + 1 < RETRIES)
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * (attempt + 1)),
        );
    }
  }
  throw lastError || new Error("upstream request failed");
}

async function mapWithConcurrency(items, limit, worker) {
  const output = Array(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, runner),
  );
  return output;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else field += character;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((value) => value !== "")) rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0];
  return rows
    .slice(1)
    .map((values) =>
      Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? ""]),
      ),
    );
}

function dgbasSourceUrl(indicator) {
  return `https://nstatdb.dgbas.gov.tw/dgbasAll/webMain.aspx?funid=${indicator.dataset}&sys=210`;
}

function dgbasApiUrl(indicator, startYear, endYear) {
  return `${DGBAS_BASE}${indicator.dataset}/${indicator.filter}&startTime=${startYear}&endTime=${endYear}`;
}

function parseDgbasPrepared(value) {
  const match = asText(value).match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
  return match ? parseProviderTimestamp(`${match[1]}T${match[2]}+08:00`) : null;
}

function dgbasExpectedDimensions(indicator) {
  if (indicator.expectedDimensions) return indicator.expectedDimensions;
  return [
    [
      indicator.expectedDimension,
      indicator.expectedValueId,
      indicator.expectedValueName,
    ],
  ];
}

function parseDgbasResponse({
  body,
  indicator,
  startYear,
  lastYear,
  sourceDownloadUrl,
}) {
  let document;
  try {
    document = JSON.parse(body);
  } catch (error) {
    throw new Error(
      `DGBAS ${indicator.id} response is not JSON: ${error.message}`,
    );
  }
  const sender = document?.meta?.sender;
  if (asText(sender?.id).toLowerCase() !== "dgbas")
    throw new Error(`DGBAS ${indicator.id} sender metadata mismatch`);
  const data = document?.data;
  const structure = data?.structure;
  const dimensions = structure?.dimensions;
  const seriesDimensions = dimensions?.series;
  const observationDimension = dimensions?.observation?.[0];
  if (!Array.isArray(seriesDimensions) || seriesDimensions[0]?.id !== "fldid")
    throw new Error(`DGBAS ${indicator.id} missing fldid dimension`);
  if (!observationDimension || observationDimension.id !== "ym")
    throw new Error(`DGBAS ${indicator.id} missing annual ym dimension`);
  const periods = observationDimension.values || [];
  if (!periods.length || periods.some(({ id }) => !/^\d{4}$/.test(asText(id))))
    throw new Error(`DGBAS ${indicator.id} returned non-annual periods`);
  const expectedDimensions = dgbasExpectedDimensions(indicator);
  const indexes = expectedDimensions.map(
    ([dimensionId, valueId, valueName]) => {
      const dimension = seriesDimensions.find(({ id }) => id === dimensionId);
      const value = dimension?.values?.find(({ id }) => asText(id) === valueId);
      if (!dimension || !value || asText(value.name) !== valueName)
        throw new Error(`DGBAS ${indicator.id} dimension metadata mismatch`);
      return dimension.values.indexOf(value);
    },
  );
  const key = indexes.join(":");
  const dataSet = data?.dataSets?.[0];
  const selectedSeries = dataSet?.series?.[key];
  if (!selectedSeries)
    throw new Error(`DGBAS ${indicator.id} selected annual series missing`);
  const lowerYear = indicator.cpi ? startYear - 1 : startYear;
  const values = [];
  let invalidValues = 0;
  for (const [observationIndex, rawValue] of Object.entries(
    selectedSeries.observations || {},
  )) {
    const period = periods[Number(observationIndex)];
    const year = Number(period?.id);
    const value = finiteNumber(
      Array.isArray(rawValue) ? rawValue[0] : rawValue,
    );
    if (
      !Number.isInteger(year) ||
      year < lowerYear ||
      year > lastYear ||
      value === null
    )
      continue;
    if (
      (indicator.valueType === "level" || indicator.rejectZero) &&
      value <= 0
    ) {
      invalidValues += 1;
      continue;
    }
    values.push([yearEnd(year), value]);
  }
  values.sort(([left], [right]) => left.localeCompare(right));
  if (!values.length)
    throw new Error(
      `DGBAS ${indicator.id} has no valid completed observations`,
    );
  return {
    values,
    allValues: values,
    invalidValues,
    sourceDefinition: indicator.sourceDefinition,
    preparedAt: parseDgbasPrepared(document.meta.prepared),
    preparedRaw: asText(document.meta.prepared),
    sourceHash: sourceHash(body),
    metadataHash: sourceHash(JSON.stringify(structure)),
    sourceDownloadUrl,
  };
}

function makeDgbasSeries({ indicator, parsed, checkedAt }) {
  const observations = parsed.values.filter(
    ([date]) => Number(date.slice(0, 4)) >= DGBAS_START_YEAR,
  );
  if (!observations.length) return null;
  return {
    id: `DGBAS_TWN_${indicator.indicatorKey}`,
    name: `${indicator.indicatorName} · ${DGBAS_ECONOMY.name}`,
    indicatorKey: indicator.indicatorKey,
    indicatorName: indicator.indicatorName,
    sourceIndicator: indicator.sourceIndicator,
    category: indicator.category,
    frequency: "annual",
    releaseFrequency: "annual",
    unit: indicator.unit,
    changeType: indicator.changeType,
    country: DGBAS_ECONOMY.name,
    countryCode: DGBAS_ECONOMY.countryCode,
    sourceCountryCode: DGBAS_ECONOMY.countryCode,
    geography: DGBAS_ECONOMY.name,
    region: "East Asia & Pacific",
    incomeLevel: null,
    lon: 120.96,
    lat: 23.7,
    source: "Taiwan Directorate-General of Budget, Accounting and Statistics",
    sourceFamily: "Taiwan DGBAS",
    sourceUrl: dgbasSourceUrl(indicator),
    sourceDownloadUrl: parsed.sourceDownloadUrl,
    sourceColumn: `${indicator.dataset} / ${indicator.filter}`,
    sourceFile: "DGBAS Macro Database API JSON",
    sourceHash: parsed.sourceHash,
    metadataHash: parsed.metadataHash,
    checkedAt,
    ...(parsed.preparedAt ? { responsePreparedAt: parsed.preparedAt } : {}),
    providerPrepared: parsed.preparedRaw,
    sourceAsOf: observations.at(-1)[0],
    sourceDefinition: indicator.sourceDefinition,
    sourceOrganization:
      "Directorate-General of Budget, Accounting and Statistics, Executive Yuan, Taiwan",
    historyType: "published official Taiwan statistics",
    rightsNote: `Retain DGBAS attribution and review the current public-data terms before redistribution. ${DGBAS_API_GUIDE_URL}`,
    availabilityNote: `Annual published values are retained only for completed reference years ${DGBAS_START_YEAR} through the prior calendar year. Missing values are omitted; no interpolation or zero substitution is performed.`,
    methodology:
      "The DGBAS API's annual dimension is validated from the JSON structure and the requested period is capped at the prior calendar year. Native DGBAS units are preserved; level indicators reject non-positive values.",
    observations,
    sourceUnit: indicator.sourceUnit,
    sourceFrequency: "A",
    sourceMetadataNote: `DGBAS sender=dgbas; annual fldid selection validated; API metadata hash=${parsed.metadataHash}.`,
  };
}

function makeDgbasInflationSeries({ cpiSeries, checkedAt }) {
  const index = new Map(cpiSeries.observations);
  const observations = [];
  for (const [date] of cpiSeries.observations) {
    const year = Number(date.slice(0, 4));
    const current = index.get(yearEnd(year));
    const prior = index.get(yearEnd(year - 1));
    if (year < DGBAS_START_YEAR || prior === undefined || prior <= 0) continue;
    if (current === undefined || current <= 0) continue;
    observations.push([yearEnd(year), (current / prior - 1) * 100]);
  }
  if (!observations.length) return null;
  return {
    id: "DGBAS_TWN_INFLATION",
    name: `Consumer price inflation · ${DGBAS_ECONOMY.name}`,
    indicatorKey: "INFLATION",
    indicatorName: "Consumer price inflation",
    sourceIndicator: "A030101015/1:annual-change",
    category: "Inflation",
    frequency: "annual",
    releaseFrequency: "annual",
    unit: "%",
    changeType: "basis-points",
    country: DGBAS_ECONOMY.name,
    countryCode: DGBAS_ECONOMY.countryCode,
    sourceCountryCode: DGBAS_ECONOMY.countryCode,
    geography: DGBAS_ECONOMY.name,
    region: "East Asia & Pacific",
    incomeLevel: null,
    lon: 120.96,
    lat: 23.7,
    source: "Taiwan Directorate-General of Budget, Accounting and Statistics",
    sourceFamily: "Taiwan DGBAS",
    sourceUrl: cpiSeries.sourceUrl,
    sourceDownloadUrl: cpiSeries.sourceDownloadUrl,
    sourceColumn: "A030101015 / 1...A / annual change",
    sourceFile: "DGBAS Macro Database API JSON",
    sourceHash: cpiSeries.sourceHash,
    metadataHash: cpiSeries.metadataHash,
    checkedAt,
    ...(cpiSeries.responsePreparedAt
      ? { responsePreparedAt: cpiSeries.responsePreparedAt }
      : {}),
    providerPrepared: cpiSeries.providerPrepared,
    sourceAsOf: observations.at(-1)[0],
    sourceDefinition:
      "Derived annual CPI inflation from DGBAS total CPI index (2021=100)",
    sourceOrganization:
      "Directorate-General of Budget, Accounting and Statistics, Executive Yuan, Taiwan",
    historyType: "derived from published official Taiwan statistics",
    rightsNote: `Retain DGBAS attribution and review the current public-data terms before redistribution. ${DGBAS_API_GUIDE_URL}`,
    availabilityNote: `Derived only where the current and immediately prior calendar-year CPI indexes are both published and positive; source CPI index is retained separately.`,
    methodology:
      "Annual CPI inflation is exactly (CPI_t / CPI_t-1 - 1) × 100 using adjacent published calendar-year total CPI index observations. No interpolation, annualization, forecast substitution, or zero baseline is permitted.",
    observations,
    sourceUnit: "% derived from index",
    sourceFrequency: "A",
    derivedFrom: "DGBAS_TWN_CPI_INDEX",
    derivedMethod: "(CPI_t / CPI_t-1 - 1) * 100",
    sourceCpiIndexUnit: "index (2021=100)",
  };
}

async function fetchDgbasProvider({
  fetchImpl,
  checkedAt,
  lastYear,
  previousSeries,
}) {
  const audit = {
    provider: "Taiwan DGBAS",
    sourceFamily: "Taiwan DGBAS",
    status: "ok",
    requestedCountry: DGBAS_ECONOMY.countryCode,
    requestedIndicators: DGBAS_INDICATORS.map(({ id }) => id),
    checkedAt,
    completedLastYear: lastYear,
    startYear: DGBAS_START_YEAR,
    annualReferenceOnly: true,
    senderId: "dgbas",
  };
  const results = await mapWithConcurrency(
    DGBAS_INDICATORS,
    2,
    async (indicator) => {
      const previous = previousFor(previousSeries, "DGBAS_").filter(
        ({ indicatorKey }) => indicatorKey === indicator.indicatorKey,
      );
      const startYear = indicator.cpi ? DGBAS_START_YEAR - 1 : DGBAS_START_YEAR;
      const sourceDownloadUrl = dgbasApiUrl(indicator, startYear, lastYear);
      try {
        const result = await requestText(sourceDownloadUrl, fetchImpl, {
          headers: { accept: "application/json" },
        });
        const parsed = parseDgbasResponse({
          body: result.body,
          indicator,
          startYear,
          lastYear,
          sourceDownloadUrl,
        });
        const series = makeDgbasSeries({ indicator, parsed, checkedAt });
        if (!series) throw new Error("DGBAS produced no reference-year series");
        return {
          indicator,
          series,
          status: "ok",
          observations: series.observations.length,
          invalidValues: parsed.invalidValues,
          parsed,
        };
      } catch (error) {
        if (previous.length)
          return {
            indicator,
            series: cloneCached(previous[0]),
            status: "upstream-unavailable",
            error: error.message,
            observations: previous[0].observations?.length || 0,
            invalidValues: 0,
          };
        return {
          indicator,
          series: null,
          status: "upstream-unavailable",
          error: error.message,
          observations: 0,
          invalidValues: 0,
        };
      }
    },
  );
  const cpiResult = results.find(({ indicator }) => indicator.cpi);
  const growthResult = results.find(
    ({ indicator }) => indicator.id === "GDPGROWTH",
  );
  const nominalResult = results.find(
    ({ indicator }) => indicator.id === "GDP_NOMINAL",
  );
  if (growthResult?.series) {
    const nominalYears = new Map(nominalResult?.series?.observations || []);
    const originalCount = growthResult.series.observations.length;
    const observations = growthResult.series.observations.filter(
      ([date, value]) => value !== 0 || (nominalYears.get(date) || 0) > 0,
    );
    growthResult.series = observations.length
      ? {
          ...growthResult.series,
          observations,
          sourceAsOf: observations.at(-1)[0],
        }
      : null;
    growthResult.observations = observations.length;
    growthResult.invalidValues =
      (growthResult.invalidValues || 0) + (growthResult.series ? 0 : 1);
    growthResult.zeroRatesWithoutConfirmedGDP =
      originalCount - observations.length;
  }
  const previousInflation = previousFor(previousSeries, "DGBAS_").find(
    ({ indicatorKey }) => indicatorKey === "INFLATION",
  );
  let derivedInflation = null;
  if (cpiResult?.status !== "ok" && previousInflation) {
    derivedInflation = cloneCached(previousInflation);
  } else if (cpiResult?.series) {
    const cpiForDerivation = cpiResult.parsed?.values
      ? { ...cpiResult.series, observations: cpiResult.parsed.values }
      : cpiResult.series;
    derivedInflation = makeDgbasInflationSeries({
      cpiSeries: cpiForDerivation,
      checkedAt: cpiResult.series.checkedAt || checkedAt,
    });
    if (derivedInflation && cpiResult.status !== "ok")
      derivedInflation.refreshStatus = "upstream-unavailable";
  }
  if (!derivedInflation && previousInflation)
    derivedInflation = cloneCached(previousInflation);
  if (derivedInflation)
    results.push({
      indicator: {
        id: "INFLATION",
        indicatorKey: "INFLATION",
        sourceIndicator: "A030101015/1:annual-change",
      },
      series: derivedInflation,
      status: cpiResult?.status === "ok" ? "ok" : "upstream-unavailable",
      observations: derivedInflation.observations?.length || 0,
      invalidValues: 0,
    });
  const entries = results.flatMap(({ series }) => (series ? [series] : []));
  audit.responsePreparedAt = entries
    .map(({ responsePreparedAt }) => responsePreparedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  audit.series = results.map(
    ({ indicator, series, status, error, observations, invalidValues }) => ({
      indicator: indicator.id,
      sourceIndicator: indicator.sourceIndicator,
      indicatorKey: indicator.indicatorKey,
      seriesCount: series ? 1 : 0,
      observations,
      invalidValues,
      status,
      ...(error ? { error } : {}),
    }),
  );
  audit.seriesCount = entries.length;
  audit.countriesWithData = entries.length ? 1 : 0;
  audit.status = results.some(({ status }) => status === "upstream-unavailable")
    ? entries.length
      ? "partial-upstream-unavailable"
      : "upstream-unavailable"
    : "ok";
  if (!entries.length) {
    const error = new Error("DGBAS returned no valid Taiwan series");
    error.audit = audit;
    throw error;
  }
  return {
    series: entries,
    audit,
    failures: results
      .filter(({ status }) => status === "upstream-unavailable")
      .map(({ indicator }) => `DGBAS_TWN_${indicator.id}`),
  };
}

export function observationsFromRows(
  rows,
  predicate,
  valueField = "observationValue",
  maxYear = Number.POSITIVE_INFINITY,
) {
  const values = new Map();
  const notes = {};
  for (const row of rows) {
    if (observationStatus(row) === "F") continue;
    if (!predicate(row)) continue;
    const year = Number(row.fiscalYear ?? row.TIME_PERIOD);
    const value = finiteNumber(row[valueField] ?? row.OBS_VALUE);
    if (
      !Number.isInteger(year) ||
      year < 1900 ||
      year > maxYear ||
      value === null
    )
      continue;
    const date = yearEnd(year);
    if (values.has(date))
      throw new Error(`duplicate annual observation: ${date}`);
    values.set(date, value);
    const note = [row.observationNote, row.OBS_STATUS, row.OBS_COMMENT]
      .map(asText)
      .find(Boolean);
    if (note) notes[date] = note;
  }
  return {
    observations: [...values.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    notes,
  };
}

function withNotes(series, notes) {
  return Object.keys(notes).length
    ? { ...series, observationNotes: notes }
    : series;
}

function makeUnSeries({
  economy,
  indicator,
  rows,
  definition,
  providerUpdatedAt,
  checkedAt,
  hash,
}) {
  const { observations, notes } = observationsFromRows(
    rows,
    (row) =>
      row.countryCode === economy.sourceCode &&
      Number(row.serieCode) === Number(indicator.sourceIndicator),
  );
  if (!observations.length) return null;
  return withNotes(
    {
      id: `UN_${economy.countryCode}_${indicator.indicatorKey}`,
      name: `${indicator.indicatorName} · ${economy.name}`,
      indicatorKey: indicator.indicatorKey,
      indicatorName: indicator.indicatorName,
      sourceIndicator: indicator.sourceIndicator,
      category: indicator.category,
      frequency: "annual",
      releaseFrequency: "annual",
      unit: indicator.unit,
      changeType: indicator.changeType,
      country: economy.name,
      countryCode: economy.countryCode,
      sourceCountryCode: economy.sourceCode,
      geography: economy.name,
      region: economy.region,
      incomeLevel: null,
      source:
        "United Nations Statistics Division · National Accounts Main Aggregates",
      sourceFamily: "UN National Accounts Main Aggregates",
      sourceUrl: UN_SOURCE_URL,
      sourceDownloadUrl: `${UN_BASE}/Data/basic/${indicator.sourceIndicator}`,
      sourceColumn: `${economy.sourceCode} / series ${indicator.sourceIndicator}`,
      sourceFile: "UN AMA API JSON",
      sourceHash: hash,
      checkedAt,
      ...(providerUpdatedAt ? { providerUpdatedAt } : {}),
      sourceAsOf: observations.at(-1)[0],
      sourceDefinition: definition.serieName,
      sourceOrganization: "United Nations Statistics Division (UNSD)",
      historyType: "published official/UNSD estimates",
      rightsNote: `UNdata data and metadata are reusable with attribution; retain United Nations and source-database credit. ${UN_RIGHTS_URL}`,
      availabilityNote:
        "Annual fiscal-year observations as published by AMA; release timing and historical coverage vary by economy. No forecast rows are admitted.",
      methodology:
        "UNSD Annual National Accounts Main Aggregates combines country submissions with UNSD estimates where official data are incomplete or inconsistent. The API's native fiscalYear is retained as a December 31 reference label; no interpolation or synthetic substitution is performed.",
      observations,
    },
    notes,
  );
}

async function fetchUnProvider({
  fetchImpl,
  checkedAt,
  lastYear,
  previousSeries,
}) {
  const audit = {
    provider: "UN National Accounts Main Aggregates",
    sourceFamily: "UN National Accounts Main Aggregates",
    status: "ok",
    requestedCountries: UN_ECONOMIES.map(({ countryCode }) => countryCode),
    requestedIndicators: UN_INDICATORS.map(
      ({ sourceIndicator }) => sourceIndicator,
    ),
    checkedAt,
    completedLastYear: lastYear,
  };
  const metadataTasks = [
    { key: "countries", url: `${UN_BASE}/Country` },
    { key: "series", url: `${UN_BASE}/Series` },
    { key: "updated", url: `${UN_BASE}/Data/lastupdated` },
  ];
  const metadata = await mapWithConcurrency(metadataTasks, 2, async (task) => {
    try {
      return { ...task, ...(await requestText(task.url, fetchImpl)) };
    } catch (error) {
      return { ...task, error };
    }
  });
  const metadataErrors = metadata.filter(({ error }) => error);
  if (metadataErrors.some(({ key }) => key !== "updated")) {
    const message = metadataErrors
      .map(({ key, error }) => `${key}: ${error.message}`)
      .join("; ");
    throw new Error(`UN AMA metadata unavailable: ${message}`);
  }
  const countries = JSON.parse(
    metadata.find(({ key }) => key === "countries").body,
  );
  const definitions = JSON.parse(
    metadata.find(({ key }) => key === "series").body,
  );
  const countryByCode = new Map(
    countries.map((country) => [Number(country.countryCode), country]),
  );
  for (const economy of UN_ECONOMIES) {
    const source = countryByCode.get(economy.sourceCode);
    if (!source || asText(source.countryName) !== economy.name)
      throw new Error(
        `UN AMA country metadata mismatch for ${economy.countryCode}`,
      );
  }
  const definitionsByCode = new Map(
    definitions.map((definition) => [
      String(Number(definition.serieCode)),
      definition,
    ]),
  );
  for (const indicator of UN_INDICATORS) {
    const definition = definitionsByCode.get(indicator.sourceIndicator);
    if (!definition || definition.serieName !== indicator.expectedName)
      throw new Error(
        `UN AMA series metadata mismatch for ${indicator.sourceIndicator}`,
      );
    if (
      indicator.sourceIndicator === "8" &&
      definition.unitMeasureType !== "Percentage"
    )
      throw new Error("UN AMA growth-unit metadata mismatch");
    if (
      indicator.sourceIndicator !== "8" &&
      definition.unitMeasureType !== "US$"
    )
      throw new Error(
        `UN AMA dollar-unit metadata mismatch for ${indicator.sourceIndicator}`,
      );
  }
  const updatedBody = metadata.find(({ key }) => key === "updated")?.body;
  const providerUpdatedAt = parseProviderTimestamp(
    updatedBody?.replaceAll('"', ""),
  );
  const years = Array.from(
    { length: Math.max(0, lastYear - 1970 + 1) },
    (_, index) => 1970 + index,
  );
  const tasks = UN_INDICATORS.map((indicator) => ({
    indicator,
    definition: definitionsByCode.get(indicator.sourceIndicator),
  }));
  const responses = await mapWithConcurrency(
    tasks,
    2,
    async ({ indicator, definition }) => {
      const previous = previousFor(
        previousSeries,
        `UN_`,
        indicator.sourceIndicator,
      );
      try {
        const url = `${UN_BASE}/Data/basic/${indicator.sourceIndicator}`;
        const result = await requestText(url, fetchImpl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            paramCodes: UN_ECONOMIES.map(({ sourceCode }) => sourceCode),
            years,
          }),
        });
        const rows = JSON.parse(result.body).filter((row) =>
          years.includes(Number(row.fiscalYear)),
        );
        const hash = sourceHash(
          result.body,
          metadata.find(({ key }) => key === "series").body,
          metadata.find(({ key }) => key === "updated")?.body || "",
        );
        const series = UN_ECONOMIES.flatMap((economy) => {
          const source = makeUnSeries({
            economy,
            indicator,
            rows,
            definition,
            providerUpdatedAt,
            checkedAt,
            hash,
          });
          return source ? [source] : [];
        });
        if (!series.length && previous.length)
          return {
            indicator,
            series: previous.map(cloneCached),
            status: "upstream-unavailable",
            error: "empty upstream response produced no valid observations",
            rows: rows.length,
          };
        return {
          indicator,
          series,
          rows: rows.length,
          status: series.length ? "ok" : "no-data",
        };
      } catch (error) {
        if (previous.length)
          return {
            indicator,
            series: previous.map(cloneCached),
            status: "upstream-unavailable",
            error: error.message,
            rows: 0,
          };
        return {
          indicator,
          series: [],
          status: "upstream-unavailable",
          error: error.message,
          rows: 0,
        };
      }
    },
  );
  audit.providerUpdatedAt = providerUpdatedAt;
  audit.series = responses.map(
    ({ indicator, series, rows, status, error }) => ({
      sourceIndicator: indicator.sourceIndicator,
      indicatorKey: indicator.indicatorKey,
      countriesWithData: new Set(series.map(({ countryCode }) => countryCode))
        .size,
      seriesCount: series.length,
      observations: rows,
      status,
      ...(error ? { error } : {}),
    }),
  );
  audit.countriesWithData = new Set(
    responses.flatMap(({ series }) =>
      series.map(({ countryCode }) => countryCode),
    ),
  ).size;
  audit.seriesCount = responses.reduce(
    (count, result) => count + result.series.length,
    0,
  );
  return {
    series: responses.flatMap(({ series }) => series),
    audit,
    failures: responses
      .filter(({ status }) => status === "upstream-unavailable")
      .flatMap(({ indicator, series }) =>
        series.length
          ? series.map(({ id }) => id)
          : [`UN_AMA_${indicator.sourceIndicator}`],
      ),
  };
}

function makeSpcSeries({
  economy,
  indicator,
  rows,
  checkedAt,
  providerUpdatedAt,
  hash,
  lastYear,
  sourceDownloadUrl,
}) {
  const validRow = (row) =>
    row.GEO_PICT === economy.sourceCode &&
    row.INDICATOR === indicator.sourceIndicator &&
    asText(row.FREQ) === "A" &&
    asText(row.CURRENCY) === "USD" &&
    asText(row.UNIT_MEASURE) === indicator.sourceUnitMeasure &&
    asText(row.UNIT_MULT) === indicator.sourceUnitMultiplier;
  const { observations, notes } = observationsFromRows(
    rows,
    validRow,
    "OBS_VALUE",
    lastYear,
  );
  if (!observations.length) return null;
  const sourceRow = rows.find(validRow);
  const sourceUnit = sourceRow.UNIT_MEASURE;
  const sourceUnitMultiplier = asText(sourceRow.UNIT_MULT);
  const note = rows.some((row) => validRow(row) && observationStatus(row))
    ? "SPC observation status is retained in observationNotes."
    : "SPC does not supply an observation status for this row set; the source is retained as a published estimate.";
  const base = {
    id: `SPC_${economy.countryCode}_${indicator.indicatorKey}`,
    name: `${indicator.indicatorName} · ${economy.name}`,
    indicatorKey: indicator.indicatorKey,
    indicatorName: indicator.indicatorName,
    sourceIndicator: indicator.sourceIndicator,
    category: "Growth",
    frequency: "annual",
    releaseFrequency: "annual",
    unit: indicator.unit,
    changeType: indicator.changeType,
    country: economy.name,
    countryCode: economy.countryCode,
    sourceCountryCode: economy.sourceCode,
    geography: economy.name,
    region: "Oceania",
    incomeLevel: null,
    source:
      "SPC Statistics for Development Division · PDH.stat National Accounts",
    sourceFamily: "SPC Pacific Data Hub National Accounts",
    sourceUrl: SPC_SOURCE_URL,
    sourceDownloadUrl,
    sourceColumn: `${economy.sourceCode} / ${indicator.sourceIndicator}`,
    sourceFile: "SPC PDH.stat SDMX CSV",
    sourceHash: hash,
    checkedAt,
    ...(providerUpdatedAt ? { providerUpdatedAt } : {}),
    sourceAsOf: observations.at(-1)[0],
    sourceDefinition: `Gross Domestic Product for Pacific Island Countries and Territories · ${indicator.indicatorName}`,
    sourceOrganization: "SPC Statistics for Development Division (SDD)",
    historyType: "published national-accounts estimates",
    rightsNote: `The PDH.stat dataset is marked Other (Open); retain SPC/PDH attribution and review current terms before redistribution. ${SPC_RIGHTS_URL}`,
    availabilityNote:
      "Annual source years are uneven by territory. USD values and conversions remain at the provider's native unit multiplier. No interpolation or forecast rows are admitted.",
    methodology: `SPC national-accounts data are retained at native annual frequency. ${indicator.sourceIndicator === "GDPCVR" || indicator.sourceIndicator === "GDPCPCVR" ? "This indicator is variation at current prices and is nominal, not real GDP growth." : "The source does not provide a real-price series in this dataflow."} ${note}`,
    observations,
    sourceUnit,
    sourceUnitMultiplier,
    sourceFrequency: sourceRow.FREQ,
    sourceCurrency: sourceRow.CURRENCY,
  };
  return withNotes(base, notes);
}

async function fetchSpcProvider({
  fetchImpl,
  checkedAt,
  lastYear,
  previousSeries,
}) {
  const audit = {
    provider: "SPC Pacific Data Hub National Accounts",
    sourceFamily: "SPC Pacific Data Hub National Accounts",
    status: "ok",
    requestedCountries: SPC_ECONOMIES.map(({ countryCode }) => countryCode),
    requestedIndicators: SPC_INDICATORS.map(
      ({ sourceIndicator }) => sourceIndicator,
    ),
    checkedAt,
    completedLastYear: lastYear,
    rowFilter: {
      frequency: "A",
      currency: "USD",
      units: Object.fromEntries(
        SPC_INDICATORS.map((indicator) => [
          indicator.sourceIndicator,
          {
            unitMeasure: indicator.sourceUnitMeasure,
            unitMultiplier: indicator.sourceUnitMultiplier,
          },
        ]),
      ),
    },
  };
  const codes = SPC_ECONOMIES.map(({ sourceCode }) => sourceCode).join("+");
  const indicators = SPC_INDICATORS.map(
    ({ sourceIndicator }) => sourceIndicator,
  ).join("+");
  const dataUrl = `${SPC_BASE}/data/${SPC_DATAFLOW}/A.USD.${codes}.${indicators}?startPeriod=2005&endPeriod=${lastYear}&format=csvfile`;
  // Keep the structure request ahead of the data request. PDH.stat occasionally
  // returns HTTP 500 when a dataflow-with-references request and a large data
  // cube are opened simultaneously, even though each request succeeds alone.
  const requestSpc =
    fetchImpl === globalThis.fetch
      ? requestNodeText
      : (url, options) => requestText(url, fetchImpl, options);
  const metadataResult = await requestSpc(SPC_DATAFLOW_URL, {
    headers: { accept: "application/vnd.sdmx.structure+xml" },
  });
  const dataResult = await requestSpc(dataUrl, {
    headers: { accept: "text/csv" },
  });
  const rows = parseCsv(dataResult.body);
  if (!rows.length || !rows[0].GEO_PICT)
    throw new Error("SPC data response has no expected SDMX columns");
  const providerUpdatedAt = parseProviderTimestamp(
    metadataResult.response.headers?.get?.("last-modified"),
  );
  const hash = sourceHash(metadataResult.body, dataResult.body);
  const series = [];
  const audits = [];
  for (const economy of SPC_ECONOMIES) {
    for (const indicator of SPC_INDICATORS) {
      const source = makeSpcSeries({
        economy,
        indicator,
        rows,
        checkedAt,
        providerUpdatedAt,
        hash,
        lastYear,
        sourceDownloadUrl: dataUrl,
      });
      if (source) series.push(source);
    }
    audits.push({
      countryCode: economy.countryCode,
      sourceCountryCode: economy.sourceCode,
      seriesCount: series.filter(
        ({ countryCode }) => countryCode === economy.countryCode,
      ).length,
      observations: rows.filter((row) => row.GEO_PICT === economy.sourceCode)
        .length,
    });
  }
  audit.providerUpdatedAt = providerUpdatedAt;
  audit.series = audits;
  audit.countriesWithData = audits.filter(
    ({ seriesCount }) => seriesCount > 0,
  ).length;
  audit.seriesCount = series.length;
  if (!series.length)
    throw new Error(
      "SPC data response produced no valid annual USD series after unit filtering",
    );
  return { series, audit, failures: [] };
}

function discoveredImfDownloads(html) {
  return [
    ...html.matchAll(
      /(?:href|data-href)\s*=\s*["']([^"']+\.xlsx(?:\?[^"']*)?)["']/gi,
    ),
  ]
    .map((match) => match[1].replaceAll("&amp;", "&"))
    .map((href) => new URL(href, IMF_WEO_PAGE_URL).href)
    .filter((url) => {
      const parsed = new URL(url);
      return (
        parsed.protocol === "https:" &&
        (parsed.hostname === "imf.org" ||
          parsed.hostname.endsWith(".imf.org")) &&
        /WEO/i.test(url) &&
        /all\.xlsx(?:\?|$)/i.test(url)
      );
    })
    .sort((left, right) => {
      const vintage = (url) => {
        const match = url.match(/WEO(Apr|Oct)(\d{4})all\.xlsx/i);
        return match
          ? Number(match[2]) * 12 + (match[1].toLowerCase() === "oct" ? 10 : 4)
          : 0;
      };
      return vintage(right) - vintage(left);
    });
}

async function discoverImfWEO(fetchImpl) {
  const page = await requestText(IMF_WEO_PAGE_URL, fetchImpl, {
    headers: { accept: "text/html" },
  });
  const downloads = discoveredImfDownloads(page.body);
  if (!downloads.length)
    throw new Error("IMF WEO page has no full XLSX download link");
  return {
    downloadUrl: downloads[0],
    method: "official-page-html-link",
    pageUrl: IMF_WEO_PAGE_URL,
    pageHash: sourceHash(page.body),
  };
}

function readImfWEORows(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets.Countries;
  if (!sheet) throw new Error("IMF WEO workbook has no Countries sheet");
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
  if (!rows.length || !rows[0]["COUNTRY.ID"] || !rows[0]["INDICATOR.ID"])
    throw new Error("IMF WEO Countries sheet has no expected columns");
  return rows;
}

function makeImfSeries({
  economy,
  indicator,
  row,
  checkedAt,
  lastYear,
  providerUpdatedAt,
  hash,
  sourceDownloadUrl,
  sourcePublicationDate,
}) {
  const cutoff = finiteNumber(row.LATEST_ACTUAL_ANNUAL_DATA);
  if (!Number.isInteger(cutoff) || cutoff < 1900)
    return { series: null, reason: "missing-or-invalid-actual-cutoff" };
  if (asText(row.FREQUENCY) !== "Annual")
    return { series: null, reason: "non-annual-frequency" };
  if (
    asText(row.UNIT) !== asText(indicator.sourceUnit) ||
    asText(row.SCALE) !== indicator.sourceScale
  )
    return { series: null, reason: "unexpected-native-unit-or-scale" };
  const latestAllowedYear = Math.min(lastYear, cutoff);
  const observations = Object.keys(row)
    .filter((key) => /^\d{4}$/.test(key))
    .map(Number)
    .filter((year) => year >= 1900 && year <= latestAllowedYear)
    .sort((left, right) => left - right)
    .flatMap((year) => {
      const value = finiteNumber(row[String(year)]);
      return value === null ? [] : [[yearEnd(year), value]];
    });
  if (!observations.length)
    return { series: null, reason: "no-valid-actual-observations" };
  const series = {
    id: `IMF_TWN_${indicator.indicatorKey}`,
    name: `${indicator.indicatorName} · ${economy.name}`,
    indicatorKey: indicator.indicatorKey,
    indicatorName: indicator.indicatorName,
    sourceIndicator: indicator.sourceIndicator,
    category: indicator.category,
    frequency: "annual",
    releaseFrequency: "annual",
    unit: indicator.unit,
    changeType: indicator.changeType,
    country: economy.name,
    countryCode: economy.countryCode,
    sourceCountryCode: economy.countryCode,
    geography: economy.name,
    region: "East Asia & Pacific",
    incomeLevel: null,
    // Natural Earth Taiwan centroid, retained for the supplement roster.
    lon: 120.96,
    lat: 23.7,
    source: "International Monetary Fund · World Economic Outlook",
    sourceFamily: "IMF World Economic Outlook",
    sourceUrl: IMF_WEO_PAGE_URL,
    sourceDownloadUrl,
    sourceColumn: `Countries / COUNTRY.ID=TWN / INDICATOR.ID=${indicator.sourceIndicator}`,
    sourceFile: "IMF WEO full dataset XLSX · Countries",
    sourceHash: hash,
    checkedAt,
    ...(providerUpdatedAt ? { providerUpdatedAt } : {}),
    sourceAsOf: observations.at(-1)[0],
    sourceDefinition:
      asText(row["INDICATOR.Description"]) || asText(row.INDICATOR),
    sourceOrganization: `International Monetary Fund, Research Department${asText(row.HISTORICAL_DATA_SOURCE) ? ` · ${asText(row.HISTORICAL_DATA_SOURCE)}` : ""}`,
    historicalDataSource: asText(row.HISTORICAL_DATA_SOURCE) || null,
    historyType: "published IMF estimates with a per-series actual cutoff",
    rightsNote: `Retain IMF attribution and review the IMF terms before redistribution. ${IMF_WEO_RIGHTS_URL}`,
    availabilityNote:
      "The WEO workbook identifies the latest actual year per row. Only observations at or before that cutoff and the completed calendar year are admitted; later IMF staff projections are excluded.",
    methodology:
      "This adapter selects five Taiwan WEO annual rows and enforces LATEST_ACTUAL_ANNUAL_DATA for each row. Values remain in the workbook's native scale and unit; no interpolation, forecast substitution, or conversion is performed.",
    observations,
    actualCutoff: cutoff,
    sourceUnit: row.UNIT === null ? null : asText(row.UNIT),
    sourceScale: row.SCALE === null ? null : asText(row.SCALE),
    sourceFrequency: asText(row.FREQUENCY),
    providerReleaseFrequency: "semiannual",
    sourceCurrency: asText(row.CURRENCY) || null,
    sourcePublicationDate: parseProviderTimestamp(row.PUBLICATION_DATE),
  };
  return { series };
}

async function fetchImfProvider({
  fetchImpl,
  checkedAt,
  lastYear,
  previousSeries,
}) {
  const economy = {
    countryCode: "TWN",
    name: "Taiwan",
  };
  // This adapter owns Taiwan's five supplemental series only. The broader
  // IMF_WEO_ catalogue is refreshed by imf-macro and must never be relabeled
  // as international-supplement when this provider is unavailable.
  const cached = previousFor(previousSeries, "IMF_TWN_");
  const audit = {
    provider: "IMF World Economic Outlook",
    sourceFamily: "IMF World Economic Outlook",
    status: "ok",
    requestedCountries: [economy.countryCode],
    requestedIndicators: IMF_TWN_INDICATORS.map(
      ({ sourceIndicator }) => sourceIndicator,
    ),
    checkedAt,
    completedLastYear: lastYear,
    pageUrl: IMF_WEO_PAGE_URL,
    actualCutoffField: "LATEST_ACTUAL_ANNUAL_DATA",
  };
  let discovery;
  try {
    discovery = await discoverImfWEO(fetchImpl);
  } catch (error) {
    audit.discoveryStatus = "failed";
    audit.discoveryError = error.message;
    error.audit = audit;
    // A cached verified vintage is preferable to pretending a fixed April
    // URL is the latest WEO release. Only an empty cache may use the explicit,
    // verified emergency URL below, and it is marked in the audit.
    if (cached.length) throw error;
    discovery = {
      downloadUrl: IMF_WEO_VERIFIED_FALLBACK_URL,
      method: "verified-April-2026-fallback",
      pageUrl: IMF_WEO_PAGE_URL,
      warning:
        "The current WEO page could not be discovered; this explicit April 2026 URL is not asserted to be current.",
    };
  }
  audit.discoveryStatus = discovery.warning
    ? "verified-release-fallback"
    : "ok";
  if (discovery.warning) audit.status = "upstream-unavailable";
  audit.discoveryMethod = discovery.method;
  audit.downloadUrl = discovery.downloadUrl;
  if (discovery.pageHash) audit.pageHash = discovery.pageHash;
  if (discovery.warning) audit.discoveryWarning = discovery.warning;
  const download = await requestBytes(discovery.downloadUrl, fetchImpl);
  const workbookHash = sourceHash(download.body);
  const rows = readImfWEORows(download.body);
  const selectedRows = new Map(
    rows
      .filter((row) => asText(row["COUNTRY.ID"]) === economy.countryCode)
      .map((row) => [asText(row["INDICATOR.ID"]), row]),
  );
  const results = IMF_TWN_INDICATORS.map((indicator) => {
    const row = selectedRows.get(indicator.sourceIndicator);
    if (!row)
      return {
        indicator,
        series: null,
        reason: "indicator-row-not-found",
      };
    return {
      indicator,
      ...makeImfSeries({
        economy,
        indicator,
        row,
        checkedAt,
        lastYear,
        providerUpdatedAt: parseProviderTimestamp(row.UPDATE_DATE),
        hash: sourceHash(workbookHash, discovery.downloadUrl),
        sourceDownloadUrl: discovery.downloadUrl,
        sourcePublicationDate: row.PUBLICATION_DATE,
      }),
    };
  });
  const series = results.flatMap(({ series: entry }) => (entry ? [entry] : []));
  if (discovery.warning)
    for (const entry of series) entry.refreshStatus = "upstream-unavailable";
  if (!series.length) {
    const error = new Error(
      "IMF WEO workbook produced no valid Taiwan actual series",
    );
    error.audit = audit;
    throw error;
  }
  audit.series = results.map(({ indicator, series: entry, reason }) => ({
    sourceIndicator: indicator.sourceIndicator,
    indicatorKey: indicator.indicatorKey,
    actualCutoff: entry?.actualCutoff ?? null,
    seriesCount: entry ? 1 : 0,
    observations: entry?.observations.length ?? 0,
    status: entry ? "ok" : "excluded",
    ...(reason ? { reason } : {}),
  }));
  audit.actualCutoffs = Object.fromEntries(
    series.map((entry) => [entry.sourceIndicator, entry.actualCutoff]),
  );
  audit.providerUpdatedAt = series
    .map(({ providerUpdatedAt }) => providerUpdatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  audit.sourceHash = workbookHash;
  audit.countriesWithData = series.length ? 1 : 0;
  audit.seriesCount = series.length;
  audit.sourcePublicationDate = series
    .map(({ sourcePublicationDate }) => sourcePublicationDate)
    .filter(Boolean)
    .sort()
    .at(-1);
  return {
    series,
    audit,
    failures: [],
  };
}

function fallbackProvider({
  prefix,
  previousSeries,
  audit,
  error,
  providerId,
}) {
  const cached = previousFor(previousSeries, prefix);
  audit.status = cached.length
    ? "upstream-unavailable"
    : "upstream-unavailable-no-cache";
  audit.error = error.message;
  audit.cachedSeriesCount = cached.length;
  return {
    series: cached.map(cloneCached),
    countries: [],
    failures: cached.length ? cached.map(({ id }) => id) : [providerId],
  };
}

function buildCountries(series, previousCountries) {
  const byCode = new Map();
  for (const entry of series) {
    const countryCode = entry.countryCode;
    if (!countryCode || byCode.has(countryCode)) continue;
    const cached = previousCountries.find(
      (country) => country.id === countryCode,
    );
    byCode.set(countryCode, {
      ...(cached || {}),
      id: countryCode,
      name: entry.country,
      lon: cached?.lon ?? entry.lon ?? null,
      lat: cached?.lat ?? entry.lat ?? null,
      region: entry.region,
      incomeLevel: null,
      seriesCount: series.filter(
        ({ countryCode: code }) => code === countryCode,
      ).length,
      headlineCount: 0,
      sourceFamily: entry.sourceFamily,
    });
  }
  return [...byCode.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

/**
 * Fetch annual, non-forecast macro histories for economies absent from the
 * World Bank roster. IMF Taiwan values are admitted only from WEO workbook
 * rows carrying a valid LATEST_ACTUAL_ANNUAL_DATA cutoff.
 */
export async function fetchInternationalSupplement({
  fetchImpl = globalThis.fetch,
  previousSeries = [],
  previousCountries = [],
  now = new Date(),
} = {}) {
  const checkedAt = now.toISOString();
  const lastYear = Number(checkedAt.slice(0, 4)) - 1;
  const audit = {
    checkedAt,
    completedLastYear: lastYear,
    providers: [],
    excluded: [],
  };
  const providerResults = await mapWithConcurrency(
    [
      {
        prefix: "UN_",
        id: "UN_AMA",
        run: () =>
          fetchUnProvider({ fetchImpl, checkedAt, lastYear, previousSeries }),
      },
      {
        prefix: "SPC_",
        id: "SPC_PDH",
        run: () =>
          fetchSpcProvider({ fetchImpl, checkedAt, lastYear, previousSeries }),
      },
      {
        prefix: "DGBAS_",
        id: "DGBAS_TWN",
        run: () =>
          fetchDgbasProvider({
            fetchImpl,
            checkedAt,
            lastYear,
            previousSeries,
          }),
      },
      {
        prefix: "IMF_TWN_",
        id: "IMF_WEO",
        run: () =>
          fetchImfProvider({ fetchImpl, checkedAt, lastYear, previousSeries }),
      },
    ],
    2,
    async (provider) => {
      try {
        const result = await provider.run();
        audit.providers.push(result.audit);
        return { ...result, provider };
      } catch (error) {
        const providerAudit = {
          provider: provider.id,
          status: "upstream-unavailable",
          checkedAt,
          error: error.message,
          ...(error.audit || {}),
        };
        const fallback = fallbackProvider({
          prefix: provider.prefix,
          previousSeries,
          audit: providerAudit,
          error,
          providerId: provider.id,
        });
        audit.providers.push(providerAudit);
        return { ...fallback, audit: providerAudit, provider };
      }
    },
  );
  const series = providerResults
    .flatMap(({ series: entries }) => entries)
    .sort((left, right) => left.id.localeCompare(right.id));
  const countries = buildCountries(series, previousCountries);
  const failures = providerResults.flatMap(({ failures: entries }) => entries);
  audit.providers.sort((left, right) =>
    left.provider.localeCompare(right.provider),
  );
  audit.seriesCount = series.length;
  audit.countriesWithData = countries.length;
  audit.coverage = Object.fromEntries(
    countries.map((country) => [
      country.id,
      {
        name: country.name,
        seriesCount: country.seriesCount,
        latest: series
          .filter(({ countryCode }) => countryCode === country.id)
          .reduce((latest, entry) => {
            const sourceAsOf =
              entry.sourceAsOf || entry.observations?.at(-1)?.[0] || "";
            return latest > sourceAsOf ? latest : sourceAsOf;
          }, ""),
      },
    ]),
  );
  return { series, countries, failures, audit };
}
