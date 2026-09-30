import { createHash } from "node:crypto";
import https from "node:https";

const UN_BASE = "https://unstats.un.org/unsd/amaapi/api";
const UN_SOURCE_URL = "https://unstats.un.org/unsd/nationalaccount/ama.asp";
const UN_RIGHTS_URL = "https://data.un.org/Host.aspx?Content=UNdataUse";
const SPC_BASE = "https://stats-nsi-stable.pacificdata.org/rest";
const SPC_DATAFLOW = "SPC,DF_NATIONAL_ACCOUNTS,1.0";
const SPC_DATAFLOW_URL = `${SPC_BASE}/dataflow/SPC/DF_NATIONAL_ACCOUNTS/1.0?references=all`;
const SPC_SOURCE_URL =
  "https://pacificdata.org/data/dataset/gross-domestic-product-for-pacific-island-countries-and-territories-df-national-accounts";
const SPC_RIGHTS_URL = "https://docs.pacificdata.org/dotstat/api";
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
  return createHash("sha256").update(bodies.join("\n")).digest("hex");
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
      .map(({ indicator }) => `UN_AMA_${indicator.sourceIndicator}`),
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
    failures: [providerId],
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
      lon: cached?.lon ?? null,
      lat: cached?.lat ?? null,
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
 * World Bank roster. The IMF/Taiwan candidate is intentionally audit-only:
 * DataMapper values do not expose an actual/forecast cutoff, and this module
 * does not guess one.
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
    excluded: [
      {
        provider: "IMF WEO/DataMapper",
        countryCode: "TWN",
        status: "excluded",
        reason:
          "DataMapper provides Taiwan values but no observation-level actual/forecast flag. A verified WEO download carrying LATEST_ACTUAL_ANNUAL_DATA or a validated DGBAS extraction is not wired here; future values are therefore excluded rather than guessed as actuals.",
        sourceUrl: "https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH",
      },
    ],
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
