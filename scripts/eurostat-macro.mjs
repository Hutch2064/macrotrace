// Eurostat's dissemination API uses JSON-stat 2.0.  This module deliberately
// keeps the parser dependency-free: Eurostat occasionally returns sparse value
// objects, while test fixtures and older exports may use dense arrays.

export const EUROSTAT_API_BASE =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/";

const EUROSTAT_BROWSER_BASE = "https://ec.europa.eu/eurostat/databrowser/view/";
const EUROSTAT_LEGAL_URL = "https://ec.europa.eu/eurostat/about/legal-notices";
const SOURCE = "Eurostat (European Commission)";
const RIGHTS = `Eurostat dissemination data; reuse and attribution terms: ${EUROSTAT_LEGAL_URL}`;
const DEFAULT_START = Object.freeze({
  quarterly: "2000-Q1",
  monthly: "2000-01",
});

// Eurostat uses EL (not GR) for Greece.  The fallback is intentionally small:
// the refreshed World Bank roster supplies authoritative iso2Code values, but
// accepting ISO-3 ids makes the importer safe during the roster transition.
const ISO3_TO_EUROSTAT = Object.freeze({
  AUT: "AT",
  BEL: "BE",
  BGR: "BG",
  CYP: "CY",
  CZE: "CZ",
  DEU: "DE",
  DNK: "DK",
  ESP: "ES",
  EST: "EE",
  FIN: "FI",
  FRA: "FR",
  GBR: "UK",
  GRC: "EL",
  HRV: "HR",
  HUN: "HU",
  IRL: "IE",
  ITA: "IT",
  LTU: "LT",
  LUX: "LU",
  LVA: "LV",
  MLT: "MT",
  NLD: "NL",
  POL: "PL",
  PRT: "PT",
  ROU: "RO",
  SVK: "SK",
  SVN: "SI",
  SWE: "SE",
});

const EUROSTAT_COUNTRY_CODES = new Set(Object.values(ISO3_TO_EUROSTAT));
const GEO_AREA = "EA20";

const DATASET_CONFIGS = Object.freeze([
  {
    code: "namq_10_gdp",
    frequency: "quarterly",
    startParam: "sinceTimePeriod",
    params: {
      freq: ["Q"],
      // These are the GDP aggregate and the principal expenditure components.
      // The response labels are used below as the authoritative display text.
      na_item: ["B1GQ", "P3", "P5G", "P6", "P7"],
      // Include current and prior chain-link bases plus the documented
      // contribution unit. Empty/unavailable codes are ignored by the API.
      unit: [
        "CLV20_MEUR",
        "CLV15_MEUR",
        "CLV10_MEUR",
        "CON_PPCH_PRE",
        "CON_PPCH_SM",
      ],
      s_adj: ["SCA", "SA", "NSA"],
    },
    parse: parseGdp,
  },
  {
    code: "sts_inpr_m",
    frequency: "monthly",
    startParam: "sinceTimePeriod",
    params: {
      freq: ["M"],
      indic_bt: ["PRD"],
      nace_r2: ["B-D"],
      unit: ["I21", "I15", "I10"],
      s_adj: ["SCA", "CA", "NSA"],
    },
    parse: parseIndustrial,
  },
  {
    code: "sts_trtu_m",
    frequency: "monthly",
    startParam: "sinceTimePeriod",
    params: {
      freq: ["M"],
      indic_bt: ["VOL_SLS"],
      nace_r2: ["G47"],
      unit: ["I21", "I15", "I10"],
      s_adj: ["SCA", "CA", "NSA"],
    },
    parse: parseRetail,
  },
  {
    code: "gov_10q_ggnfa",
    frequency: "quarterly",
    startParam: "sinceTimePeriod",
    params: {
      freq: ["Q"],
      sector: ["S13"],
      na_item: ["B9"],
      unit: ["PC_GDP"],
      s_adj: ["SCA", "SA", "NSA"],
    },
    parse: parseFiscalBalance,
  },
  {
    code: "gov_10q_ggdebt",
    frequency: "quarterly",
    startParam: "sinceTimePeriod",
    params: {
      freq: ["Q"],
      sector: ["S13"],
      na_item: ["GD"],
      unit: ["PC_GDP"],
    },
    parse: parseFiscalDebt,
  },
  {
    // Main Balance of Payments and International Investment Position items
    // as a share of GDP (BPM6). One bounded slice covers current account,
    // net-IIP, and the corresponding end-period asset/liability positions.
    code: "bop_gdp6_q",
    frequency: "quarterly",
    startParam: "sinceTimePeriod",
    params: {
      freq: ["Q"],
      unit: ["PC_GDP"],
      s_adj: ["SCA", "NSA"],
      bop_item: ["CA", "FA", "FA__NENDI"],
      stk_flow: ["BAL", "N_LE", "A_LE", "L_LE"],
      partner: ["WRL_REST"],
    },
    parse: parseBpm6,
  },
  {
    code: "une_rt_m",
    frequency: "monthly",
    startParam: "sinceTimePeriod",
    params: {
      freq: ["M"],
      age: ["TOTAL"],
      sex: ["T"],
      unit: ["PC_ACT"],
      s_adj: ["SA", "TC", "NSA"],
    },
    parse: parseUnemployment,
  },
]);

function text(value) {
  return String(value ?? "").trim();
}

function finiteNumber(value) {
  if (typeof value === "boolean" || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function categoryCodes(dimension) {
  const category = dimension?.category || {};
  const index = category.index;
  if (Array.isArray(index)) return index.map(String);
  if (index && typeof index === "object")
    return Object.entries(index)
      .sort(([, left], [, right]) => Number(left) - Number(right))
      .map(([code]) => String(code));
  if (category.label && typeof category.label === "object")
    return Object.keys(category.label).map(String);
  return [];
}

function categoryLabels(dimension) {
  const labels = dimension?.category?.label;
  return labels && typeof labels === "object" ? labels : {};
}

function dimensionIndex(dimension, code) {
  const index = dimension?.category?.index;
  if (Array.isArray(index)) return index.indexOf(code);
  if (index && typeof index === "object") {
    const result = index[code];
    return Number.isInteger(Number(result)) ? Number(result) : -1;
  }
  return categoryCodes(dimension).indexOf(code);
}

function sparseValue(values, index) {
  if (Array.isArray(values)) return values[index];
  if (values && typeof values === "object") return values[String(index)];
  return undefined;
}

function periodDate(period) {
  const value = text(period);
  const quarterly = value.match(/^(\d{4})-Q([1-4])$/);
  if (quarterly)
    return `${quarterly[1]}-${String((Number(quarterly[2]) - 1) * 3 + 1).padStart(2, "0")}-01`;
  const monthly = value.match(/^(\d{4})-(\d{2})$/);
  if (monthly) return `${monthly[1]}-${monthly[2]}-01`;
  const annual = value.match(/^(\d{4})$/);
  return annual ? `${annual[1]}-12-31` : null;
}

function currentPeriodLimit(frequency, now = new Date()) {
  const year = now.getUTCFullYear();
  if (frequency === "quarterly")
    return `${year}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
  return `${year}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodIsCurrentOrEarlier(period, frequency, now) {
  const date = periodDate(period);
  const limit = periodDate(currentPeriodLimit(frequency, now));
  return Boolean(date && limit && date <= limit);
}

/**
 * Convert a JSON-stat 2.0 dataset into sparse, labelled rows.  No values are
 * imputed: absent sparse keys, nulls and nonnumeric cells are omitted.
 */
export function parseJsonStat(payload, { frequency, now = new Date() } = {}) {
  if (!payload || !Array.isArray(payload.id) || !Array.isArray(payload.size))
    return [];
  const dimensions = payload.id.map(String);
  const sizes = payload.size.map((size) => Number(size));
  if (
    dimensions.length !== sizes.length ||
    dimensions.some(
      (dimension, index) => !dimension || !Number.isInteger(sizes[index]),
    )
  )
    return [];
  const records = [];
  const total = sizes.reduce((product, size) => product * Math.max(0, size), 1);
  for (let flatIndex = 0; flatIndex < total; flatIndex += 1) {
    let remainder = flatIndex;
    const coordinates = new Array(dimensions.length);
    for (let index = dimensions.length - 1; index >= 0; index -= 1) {
      const size = sizes[index] || 1;
      coordinates[index] = remainder % size;
      remainder = Math.floor(remainder / size);
    }
    const values = {};
    const labels = {};
    let time = null;
    for (let index = 0; index < dimensions.length; index += 1) {
      const id = dimensions[index];
      const dimension = payload.dimension?.[id];
      const codes = categoryCodes(dimension);
      const code = codes[coordinates[index]];
      if (code === undefined) continue;
      values[id] = code;
      labels[id] = categoryLabels(dimension)[code] ?? code;
      if (id === "time") time = code;
    }
    if (!time || (frequency && !periodIsCurrentOrEarlier(time, frequency, now)))
      continue;
    const value = finiteNumber(sparseValue(payload.value, flatIndex));
    if (value === null) continue;
    const rawStatus = sparseValue(payload.status, flatIndex);
    records.push({
      dimensions: values,
      labels,
      time,
      date: periodDate(time),
      value,
      status: rawStatus == null ? null : text(rawStatus),
      flatIndex,
    });
  }
  return records;
}

export const parseEurostatJsonStat = parseJsonStat;
export const parseJsonStatDataset = parseJsonStat;

function repeatedSearchParams(params) {
  const search = new URLSearchParams();
  search.set("format", "JSON");
  search.set("lang", "en");
  for (const [key, values] of Object.entries(params || {}))
    for (const value of Array.isArray(values) ? values : [values])
      if (value !== undefined && value !== null && value !== "")
        search.append(key, String(value));
  return search;
}

function requestUrl(config, geos, startPeriod) {
  const params = repeatedSearchParams({
    ...config.params,
    [config.startParam]: startPeriod,
    geo: geos,
  });
  return `${EUROSTAT_API_BASE}${config.code}?${params.toString()}`;
}

function countryRoster(countries) {
  const entries = [];
  const seen = new Set();
  for (const country of Array.isArray(countries) ? countries : []) {
    const rawIso2 =
      country?.iso2Code ||
      country?.iso2 ||
      country?.eurostatCode ||
      ISO3_TO_EUROSTAT[text(country?.countryCode || country?.id).toUpperCase()];
    const geo =
      text(rawIso2).toUpperCase() === "GR" ? "EL" : text(rawIso2).toUpperCase();
    if (!EUROSTAT_COUNTRY_CODES.has(geo) || seen.has(geo)) continue;
    seen.add(geo);
    entries.push({
      geo,
      countryCode: text(country?.countryCode || country?.id) || null,
      name:
        text(country?.name || country?.country || country?.sourceName) || geo,
    });
  }
  if (!seen.has(GEO_AREA))
    entries.push({ geo: GEO_AREA, countryCode: null, name: "Euro Area" });
  return entries;
}

function latestPreviousStart(previousSeries, frequency, datasetCode) {
  const values = (Array.isArray(previousSeries) ? previousSeries : [])
    .filter(
      (series) =>
        series?.dataset === "eurostat-macro" &&
        (!datasetCode ||
          series.sourceDataset === datasetCode ||
          series.sourceMetadata?.datasetCode === datasetCode ||
          text(series.sourceRequest).includes(`/data/${datasetCode}?`)),
    )
    .flatMap((series) =>
      Array.isArray(series.observations) ? series.observations : [],
    )
    .map(([date]) => text(date))
    .filter(Boolean)
    .sort();
  if (!values.length) return DEFAULT_START[frequency];
  const first = values[0];
  if (frequency === "quarterly")
    return `${first.slice(0, 4)}-Q${Math.floor((Number(first.slice(5, 7)) - 1) / 3) + 1}`;
  return first.slice(0, 7);
}

function unitLabel(row, dimension) {
  return (
    row.labels?.[dimension] ||
    row.dimensions?.[dimension] ||
    "Published source unit"
  );
}

function seasonalRank(row) {
  const code = row.dimensions?.s_adj;
  return { SCA: 0, SA: 1, CA: 2, TC: 3, NSA: 4 }[code] ?? 8;
}

function baseYear(label) {
  const match = text(label).match(/(?:=|\()\s*(20\d{2}|19\d{2})/);
  return match ? Number(match[1]) : 0;
}

function unitRank(row, kind) {
  const code = text(row.dimensions?.unit);
  const label = text(unitLabel(row, "unit"));
  if (kind === "contribution")
    return /contribution to GDP growth/i.test(label) ? 0 : 9;
  if (kind === "gdp-level") {
    if (!/chain linked volumes/i.test(label) || !/million euro/i.test(label))
      return 20;
    return 100 - baseYear(label);
  }
  if (kind === "index") {
    if (!/^index\b/i.test(label)) return 20;
    return 100 - baseYear(label);
  }
  if (kind === "percent-gdp")
    return /percentage of gross domestic product/i.test(label) ? 0 : 9;
  if (kind === "percent-activity")
    return /percentage of .*labour force/i.test(label) ? 0 : 9;
  return code ? 0 : 9;
}

function sourceDatasetUrl(code) {
  return `${EUROSTAT_BROWSER_BASE}${code}/default/table?lang=en`;
}

function geoMetadata(row, roster) {
  const geo = row.dimensions?.geo;
  const match = roster.find((entry) => entry.geo === geo);
  return (
    match || {
      geo,
      countryCode: geo === GEO_AREA ? null : geo,
      name: row.labels?.geo || geo,
    }
  );
}

function metricDisplay(configCode, row, kind) {
  const metric = row.dimensions?.na_item;
  const label = text(row.labels?.na_item || metric);
  if (configCode === "namq_10_gdp") {
    if (kind === "contribution") return `GDP contribution · ${label}`;
    if (metric === "B1GQ") return "Real GDP";
    return label;
  }
  if (configCode === "sts_inpr_m") return "Industrial production";
  if (configCode === "sts_trtu_m") return "Retail sales volume";
  if (configCode === "gov_10q_ggnfa") return "General government balance";
  if (configCode === "gov_10q_ggdebt") return "General government gross debt";
  if (configCode === "bop_gdp6_q") {
    const item = row.dimensions?.bop_item;
    const flow = row.dimensions?.stk_flow;
    if (item === "CA" && flow === "BAL") return "Current account balance";
    if (item === "FA__NENDI" && flow === "N_LE")
      return "Net international investment position";
    if (item === "FA" && flow === "A_LE") return "External assets";
    if (item === "FA" && flow === "L_LE") return "External liabilities";
  }
  if (configCode === "une_rt_m") return "Unemployment rate";
  return text(row.labels?.na_item || row.dimensions?.na_item || configCode);
}

function addCandidate(candidates, key, row, kind, metricCode = null) {
  let candidate = candidates.get(key);
  if (!candidate) {
    candidate = {
      key,
      row,
      kind,
      metricCode,
      observations: [],
      status: {},
      score: [unitRank(row, kind), seasonalRank(row)],
    };
    candidates.set(key, candidate);
  }
  candidate.observations.push([row.date, row.value]);
  if (row.status) candidate.status[row.date] = row.status;
  return candidate;
}

function candidateSeries(
  candidates,
  config,
  roster,
  payload,
  checkedAt,
  sourceRequest,
) {
  const selected = new Map();
  for (const candidate of candidates.values()) {
    if (!candidate.observations.length) continue;
    const identity = `${candidate.row.dimensions.geo}|${candidate.metricCode || config.code}|${candidate.kind}`;
    const current = selected.get(identity);
    if (
      !current ||
      candidate.score[0] < current.score[0] ||
      (candidate.score[0] === current.score[0] &&
        candidate.score[1] < current.score[1]) ||
      (candidate.score[0] === current.score[0] &&
        candidate.score[1] === current.score[1] &&
        candidate.observations.length > current.observations.length)
    )
      selected.set(identity, candidate);
  }

  const result = [];
  for (const candidate of selected.values()) {
    const row = candidate.row;
    const geography = geoMetadata(row, roster);
    const indicatorName = metricDisplay(config.code, row, candidate.kind);
    const unit = unitLabel(row, "unit");
    const observations = [...new Map(candidate.observations).entries()]
      .filter(([date]) => date)
      .sort(([left], [right]) => left.localeCompare(right));
    if (!observations.length) continue;
    const idMetric = candidate.metricCode || config.code;
    const suffix = candidate.kind === "contribution" ? "_CONTRIBUTION" : "";
    const id = `EUROSTAT_${geography.geo}_${idMetric}${suffix}`;
    const category =
      config.code === "gov_10q_ggnfa" || config.code === "gov_10q_ggdebt"
        ? "Fiscal"
        : config.code === "une_rt_m"
          ? "Labor"
          : "Growth";
    const sourceDefinition =
      config.code === "namq_10_gdp" && row.labels?.na_item
        ? `${payload.label || config.code}; ${row.labels.na_item}`
        : payload.label || config.code;
    result.push({
      id,
      name: `${indicatorName} · ${geography.name}`,
      indicatorKey:
        config.code === "namq_10_gdp"
          ? candidate.kind === "contribution"
            ? `GDP_CONTRIBUTION_${idMetric}`
            : idMetric === "B1GQ"
              ? "GDP"
              : `GDP_COMPONENT_${idMetric}`
          : config.code === "sts_inpr_m"
            ? "INDUSTRIAL_PRODUCTION"
            : config.code === "sts_trtu_m"
              ? "RETAIL_SALES_VOLUME"
              : config.code === "gov_10q_ggnfa"
                ? "GOV_BALANCE"
                : config.code === "gov_10q_ggdebt"
                  ? "GOV_DEBT"
                  : config.code === "bop_gdp6_q"
                    ? candidate.metricCode
                    : "UNEMPLOYMENT",
      indicatorName,
      sourceIndicator: idMetric,
      sourceDataset: config.code,
      category,
      frequency: config.frequency,
      releaseFrequency: config.frequency,
      unit,
      changeType:
        candidate.kind === "contribution" || /percentage|percent|%/i.test(unit)
          ? "basis-points"
          : "percent",
      geography: geography.geo === GEO_AREA ? "Euro Area" : geography.name,
      country: geography.geo === GEO_AREA ? null : geography.name,
      countryCode: geography.countryCode,
      provider: "Eurostat",
      source: SOURCE,
      sourceFamily: SOURCE,
      sourceUrl: sourceDatasetUrl(config.code),
      sourceRequest,
      sourceDefinition,
      sourceOrganization: SOURCE,
      sourceUnit: unit,
      sourceFrequency:
        row.labels?.freq || row.dimensions?.freq || config.frequency,
      sourceSeasonalAdjustment:
        row.labels?.s_adj || row.dimensions?.s_adj || null,
      providerUpdatedAt: payload.updated || null,
      sourceAsOf: payload.updated ? text(payload.updated).slice(0, 10) : null,
      checkedAt,
      historyType: "published observations",
      rightsNote: RIGHTS,
      availabilityNote:
        "Native Eurostat periods are retained. Missing/non-numeric observations are omitted; no interpolation or zero substitution is performed.",
      methodology: `Eurostat ${payload.label || config.code}; values are retained at native ${config.frequency} frequency and the selected source adjustment/unit metadata. ${
        row.labels?.s_adj || row.dimensions?.s_adj
          ? `Seasonal adjustment: ${row.labels.s_adj || row.dimensions.s_adj}.`
          : ""
      } Missing observations are omitted and source status flags are preserved.`,
      observations,
      ...(Object.keys(candidate.status).length
        ? { observationStatus: candidate.status }
        : {}),
      sourceMetadata: {
        datasetCode: config.code,
        datasetLabel: payload.label || config.code,
        updated: payload.updated || null,
        dimensions: row.dimensions,
        labels: row.labels,
        provider: payload.source || "ESTAT",
      },
      dataset: "eurostat-macro",
    });
  }
  return result;
}

function parseConfiguredPayload(payload, config, context) {
  const rows = parseJsonStat(payload, {
    frequency: config.frequency,
    now: context.now,
  });
  const candidates = new Map();
  for (const row of rows) config.parse(row, candidates);
  return candidateSeries(
    candidates,
    config,
    context.roster,
    payload,
    context.checkedAt,
    context.sourceRequest,
  );
}

function parseGdp(row, candidates) {
  const item = row.dimensions?.na_item;
  if (!["B1GQ", "P3", "P5G", "P6", "P7"].includes(item)) return;
  const label = text(row.labels?.unit);
  const kind = /contribution to GDP growth/i.test(label)
    ? item === "B1GQ"
      ? null
      : "contribution"
    : /chain linked volumes/i.test(label) && /million euro/i.test(label)
      ? "gdp-level"
      : null;
  if (!kind) return;
  addCandidate(
    candidates,
    `${row.dimensions.geo}|${item}|${kind}|${row.dimensions.unit}|${row.dimensions.s_adj}`,
    row,
    kind,
    item,
  );
}

function parseIndustrial(row, candidates) {
  if (
    row.dimensions?.nace_r2 !== "B-D" ||
    !/^index\b/i.test(text(row.labels?.unit))
  )
    return;
  addCandidate(
    candidates,
    `${row.dimensions.geo}|industrial|${row.dimensions.unit}|${row.dimensions.s_adj}`,
    row,
    "index",
    "INDUSTRIAL_PRODUCTION",
  );
}

function parseRetail(row, candidates) {
  if (
    row.dimensions?.nace_r2 !== "G47" ||
    !/^index\b/i.test(text(row.labels?.unit))
  )
    return;
  addCandidate(
    candidates,
    `${row.dimensions.geo}|retail|${row.dimensions.unit}|${row.dimensions.s_adj}`,
    row,
    "index",
    "RETAIL_SALES_VOLUME",
  );
}

function parseFiscalBalance(row, candidates) {
  if (
    row.dimensions?.sector !== "S13" ||
    row.dimensions?.na_item !== "B9" ||
    !/percentage of gross domestic product/i.test(text(row.labels?.unit))
  )
    return;
  addCandidate(
    candidates,
    `${row.dimensions.geo}|balance|${row.dimensions.s_adj}`,
    row,
    "percent-gdp",
    "GOV_BALANCE",
  );
}

function parseFiscalDebt(row, candidates) {
  if (
    row.dimensions?.sector !== "S13" ||
    row.dimensions?.na_item !== "GD" ||
    !/percentage of gross domestic product/i.test(text(row.labels?.unit))
  )
    return;
  addCandidate(
    candidates,
    `${row.dimensions.geo}|debt`,
    row,
    "percent-gdp",
    "GOV_DEBT",
  );
}

function parseBpm6(row, candidates) {
  const item = row.dimensions?.bop_item;
  const flow = row.dimensions?.stk_flow;
  const valid =
    (item === "CA" && flow === "BAL") ||
    (item === "FA" && ["A_LE", "L_LE"].includes(flow)) ||
    (item === "FA__NENDI" && ["N_LE", "A_LE", "L_LE"].includes(flow));
  if (
    !valid ||
    !/percentage of gross domestic product/i.test(text(row.labels?.unit))
  )
    return;
  const metricCode =
    item === "CA"
      ? "CURRENT_ACCOUNT_BALANCE"
      : item === "FA__NENDI" && flow === "N_LE"
        ? "NET_IIP"
        : item === "FA" && flow === "A_LE"
          ? "EXTERNAL_ASSETS"
          : "EXTERNAL_LIABILITIES";
  addCandidate(
    candidates,
    `${row.dimensions.geo}|${metricCode}|${row.dimensions.s_adj}`,
    row,
    "percent-gdp",
    metricCode,
  );
}

function parseUnemployment(row, candidates) {
  if (
    row.dimensions?.age !== "TOTAL" ||
    row.dimensions?.sex !== "T" ||
    !/percentage of .*labour force/i.test(text(row.labels?.unit))
  )
    return;
  addCandidate(
    candidates,
    `${row.dimensions.geo}|unemployment|${row.dimensions.s_adj}`,
    row,
    "percent-activity",
    "UNEMPLOYMENT",
  );
}

function previousForDataset(previousSeries) {
  return (Array.isArray(previousSeries) ? previousSeries : []).filter(
    (series) => series?.dataset === "eurostat-macro",
  );
}

function mergeHistoricalSeries(current, previous) {
  if (!previous || !Array.isArray(previous.observations)) return current;
  const previousUnit = text(previous.sourceUnit || previous.unit);
  const currentUnit = text(current.sourceUnit || current.unit);
  // Never splice observations expressed in a changed native unit/base into a
  // new series. Otherwise, combine by date so an API slice can safely be
  // shorter than an earlier complete history.
  if (previousUnit && currentUnit && previousUnit !== currentUnit)
    return current;
  const values = new Map(previous.observations);
  for (const observation of current.observations || [])
    values.set(observation[0], observation[1]);
  const oldStatus = previous.observationStatus || {};
  const newStatus = current.observationStatus || {};
  return {
    ...current,
    observations: [...values.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    ...(Object.keys({ ...oldStatus, ...newStatus }).length
      ? { observationStatus: { ...oldStatus, ...newStatus } }
      : {}),
  };
}

async function fetchOne(config, context) {
  const startPeriod = latestPreviousStart(
    context.previousSeries,
    config.frequency,
    config.code,
  );
  const sourceRequest = requestUrl(config, context.geos, startPeriod);
  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  const timeout = setTimeout(() => controller?.abort(), 45_000);
  try {
    const response = await context.fetchImpl(
      sourceRequest,
      controller ? { signal: controller.signal } : undefined,
    );
    if (!response?.ok)
      throw new Error(
        `Eurostat ${config.code}: HTTP ${response?.status ?? "unknown"}`,
      );
    const payload = await response.json();
    const series = parseConfiguredPayload(payload, config, {
      ...context,
      sourceRequest,
    });
    if (!series.length)
      throw new Error(`Eurostat ${config.code}: no usable observations`);
    return series;
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency(items, mapper, limit = 3) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/**
 * Fetch a bounded, all-geographies-per-dataset Eurostat macro slice.
 * Retrieval failures retain the prior Eurostat provider series and their
 * checkedAt values. No snapshot files are read or written here.
 */
export async function fetchEurostatMacro({
  previousSeries = [],
  countries = [],
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function")
    throw new TypeError("fetchImpl must be a function");
  const roster = countryRoster(countries);
  const geos = roster.map(({ geo }) => geo);
  const now = new Date();
  const checkedAt = now.toISOString();
  const previous = previousForDataset(previousSeries);
  const failures = [];
  const success = [];
  const unattributed = previous.filter(
    (series) =>
      !series.sourceDataset &&
      !series.sourceMetadata?.datasetCode &&
      !text(series.sourceRequest).match(/\/data\/[^?]+\?/),
  );
  const previousForConfig = (config) => {
    const tagged = previous.filter(
      (series) =>
        series.sourceDataset === config.code ||
        series.sourceMetadata?.datasetCode === config.code ||
        text(series.sourceRequest).includes(`/data/${config.code}?`),
    );
    // Pre-Eurostat fixtures may not carry sourceDataset. Treat those as a
    // legacy slice only for the first configured dataset, once, rather than
    // replaying it for every failed request.
    return tagged.length || config === DATASET_CONFIGS[0]
      ? tagged.concat(config === DATASET_CONFIGS[0] ? unattributed : [])
      : [];
  };
  const context = { previousSeries, roster, geos, fetchImpl, now, checkedAt };
  const fetched = await mapWithConcurrency(DATASET_CONFIGS, async (config) => {
    try {
      const current = await fetchOne(config, context);
      success.push(config.code);
      return current;
    } catch (error) {
      // A failed dataset must never erase a prior provider slice. The retained
      // copy keeps checkedAt exactly as received from the previous snapshot.
      const cached = previousForConfig(config);
      if (!cached.length) {
        failures.push({ dataset: config.code, error: error.message });
        console.warn(`Eurostat ${config.code}: ${error.message}`);
      }
      return cached.map((series) => ({
        ...series,
        refreshStatus: "upstream-unavailable",
        checkedAt: series.checkedAt,
      }));
    }
  });
  const byId = new Map();
  const previousById = new Map(previous.map((series) => [series.id, series]));
  for (const series of fetched.flat())
    if (!byId.has(series.id))
      byId.set(
        series.id,
        mergeHistoricalSeries(series, previousById.get(series.id)),
      );
  // If a successful current response does not contain a prior geography or
  // metric, keep that prior id instead of silently deleting published history.
  // Current data always wins; a successful response can never be overwritten
  // by a retained copy from a different failed dataset.
  for (const series of previous)
    if (!byId.has(series.id)) byId.set(series.id, series);
  if (!success.length && !byId.size)
    throw new Error(
      `Eurostat unavailable with no retained series: ${failures
        .map(({ dataset, error }) => `${dataset} (${error})`)
        .join("; ")}`,
    );
  return [...byId.values()];
}

export const eurostatDatasetConfigs = DATASET_CONFIGS;
