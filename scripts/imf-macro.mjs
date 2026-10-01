import { createHash } from "node:crypto";
import XLSX from "xlsx";

export const DATASET = "imf-macro";
export const IMF_WEO_PAGE_URL = "https://data.imf.org/en/Datasets/WEO";
export const IMF_WEO_RIGHTS_URL = "https://www.imf.org/external/terms.htm";

// This is a verified release URL used only when the official page cannot be
// reached. It is deliberately never described as the current WEO vintage.
export const IMF_WEO_VERIFIED_FALLBACK_URL =
  "https://data.imf.org/-/media/iData/External-Storage/Documents/2F78EE59F79143A7921E5E203D3AAA80/en/WEOApr2026all.xlsx";

const REQUEST_TIMEOUT_MS = 30_000;

function text(value) {
  return String(value ?? "").trim();
}

export function finiteNumber(value) {
  if (value === null || value === undefined || typeof value === "boolean")
    return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function yearEnd(year) {
  return `${year}-12-31`;
}

function sourceHash(...values) {
  const hash = createHash("sha256");
  for (const [index, value] of values.entries()) {
    if (index) hash.update("\n");
    hash.update(value);
  }
  return hash.digest("hex");
}

function providerSeries(previousSeries) {
  return (Array.isArray(previousSeries) ? previousSeries : []).filter(
    (series) =>
      series?.dataset === DATASET ||
      String(series?.id || "").startsWith("IMF_WEO_"),
  );
}

function retained(series) {
  return {
    ...series,
    dataset: DATASET,
    refreshStatus: "upstream-unavailable",
    // The prior checkedAt is a freshness fact and must not be advanced on a
    // failed refresh.
    checkedAt: series.checkedAt,
  };
}

/**
 * WEO indicator rows are used as published. No indicator below is calculated
 * from another row; in particular, interest expense is not inferred from
 * debt, revenue, expenditure, or primary balance.
 */
export const IMF_INDICATORS = Object.freeze([
  {
    sourceIndicator: "NGDP_RPCH",
    indicatorKey: "GDP_REAL_GROWTH",
    indicatorName: "Real GDP growth",
    category: "Growth",
    unit: "%",
    sourceUnit: "Percent",
    sourceScale: "Units",
    changeType: "basis-points",
  },
  {
    sourceIndicator: "NGDP_R",
    indicatorKey: "GDP_REAL",
    indicatorName: "Real GDP",
    category: "Growth",
    unit: "domestic currency billions",
    sourceUnit: "Domestic currency",
    sourceScale: "Billions",
    acceptedScales: ["Billions", "Millions"],
    changeType: "percent",
  },
  {
    sourceIndicator: "NGDPD",
    indicatorKey: "GDP_NOMINAL",
    indicatorName: "Nominal GDP",
    category: "Growth",
    unit: "USD billions",
    sourceUnit: "US dollar",
    sourceScale: "Billions",
    acceptedScales: ["Billions", "Millions"],
    changeType: "percent",
  },
  {
    sourceIndicator: "NGDPDPC",
    indicatorKey: "GDP_NOMINAL_PER_CAPITA",
    indicatorName: "Nominal GDP per capita",
    category: "Growth",
    unit: "USD/person",
    sourceUnit: "US dollar",
    sourceScale: "Units",
    changeType: "percent",
  },
  {
    sourceIndicator: "NGDP_D",
    indicatorKey: "GDP_DEFLATOR",
    indicatorName: "GDP price deflator",
    category: "Inflation",
    unit: "index",
    sourceUnit: "Index",
    sourceScale: "Units",
    changeType: "percent",
  },
  {
    sourceIndicator: "PCPIPCH",
    indicatorKey: "INFLATION",
    indicatorName: "Consumer price inflation",
    category: "Inflation",
    unit: "%",
    sourceUnit: "Percent",
    sourceScale: "Units",
    changeType: "basis-points",
  },
  {
    sourceIndicator: "LUR",
    indicatorKey: "UNEMPLOYMENT",
    indicatorName: "Unemployment rate",
    category: "Labor",
    unit: "%",
    sourceUnit: null,
    sourceScale: "Units",
    changeType: "basis-points",
  },
  {
    sourceIndicator: "TM_RPCH",
    indicatorKey: "IMPORTS_VOLUME_GROWTH",
    indicatorName: "Imports of goods and services, volume growth",
    category: "International Growth",
    unit: "%",
    sourceUnit: "Percent",
    sourceScale: "Units",
    changeType: "basis-points",
  },
  {
    sourceIndicator: "TX_RPCH",
    indicatorKey: "EXPORTS_VOLUME_GROWTH",
    indicatorName: "Exports of goods and services, volume growth",
    category: "International Growth",
    unit: "%",
    sourceUnit: "Percent",
    sourceScale: "Units",
    changeType: "basis-points",
  },
  {
    sourceIndicator: "BCA",
    indicatorKey: "CURRENT_ACCOUNT_USD",
    indicatorName: "Current account balance",
    category: "International Growth",
    unit: "USD billions",
    sourceUnit: "US dollar",
    sourceScale: "Billions",
    changeType: "percent",
  },
  {
    sourceIndicator: "BCA_NGDPD",
    indicatorKey: "CURRENT_ACCOUNT_GDP",
    indicatorName: "Current account balance",
    category: "International Growth",
    unit: "% of GDP",
    sourceUnit: "Percent",
    sourceScale: "Units",
    changeType: "basis-points",
  },
  {
    sourceIndicator: "NID_NGDP",
    indicatorKey: "GROSS_CAPITAL_FORMATION_GDP",
    indicatorName: "Gross capital formation",
    category: "Growth",
    unit: "% of GDP",
    sourceUnit: "Percent",
    sourceScale: "Units",
    changeType: "basis-points",
  },
  {
    sourceIndicator: "NGSD_NGDP",
    indicatorKey: "GROSS_NATIONAL_SAVINGS_GDP",
    indicatorName: "Gross national savings",
    category: "Growth",
    unit: "% of GDP",
    sourceUnit: "Percent",
    sourceScale: "Units",
    changeType: "basis-points",
  },
  {
    sourceIndicator: "GGR",
    indicatorKey: "GENERAL_GOVERNMENT_REVENUE",
    indicatorName: "General government revenue",
    category: "Fiscal",
    unit: "domestic currency billions",
    sourceUnit: "Domestic currency",
    sourceScale: "Billions",
    acceptedScales: ["Billions", "Millions"],
    changeType: "percent",
  },
  {
    sourceIndicator: "GGR_NGDP",
    indicatorKey: "GENERAL_GOVERNMENT_REVENUE_GDP",
    indicatorName: "General government revenue",
    category: "Fiscal",
    unit: "% of GDP",
    sourceUnit: "Percent",
    sourceScale: "Units",
    changeType: "basis-points",
  },
  {
    sourceIndicator: "GGX",
    indicatorKey: "GENERAL_GOVERNMENT_EXPENDITURE",
    indicatorName: "General government expenditure",
    category: "Fiscal",
    unit: "domestic currency billions",
    sourceUnit: "Domestic currency",
    sourceScale: "Billions",
    acceptedScales: ["Billions", "Millions"],
    changeType: "percent",
  },
  {
    sourceIndicator: "GGX_NGDP",
    indicatorKey: "GENERAL_GOVERNMENT_EXPENDITURE_GDP",
    indicatorName: "General government expenditure",
    category: "Fiscal",
    unit: "% of GDP",
    sourceUnit: "Percent",
    sourceScale: "Units",
    changeType: "basis-points",
  },
  {
    sourceIndicator: "GGXCNL",
    indicatorKey: "GENERAL_GOVERNMENT_NET_LENDING",
    indicatorName: "General government net lending (+) / net borrowing (-)",
    category: "Fiscal",
    unit: "domestic currency billions",
    sourceUnit: "Domestic currency",
    sourceScale: "Billions",
    acceptedScales: ["Billions", "Millions"],
    changeType: "percent",
  },
  {
    sourceIndicator: "GGXCNL_NGDP",
    indicatorKey: "GENERAL_GOVERNMENT_NET_LENDING_GDP",
    indicatorName: "General government net lending (+) / net borrowing (-)",
    category: "Fiscal",
    unit: "% of GDP",
    sourceUnit: "Percent",
    sourceScale: "Units",
    changeType: "basis-points",
  },
  {
    sourceIndicator: "GGXONLB",
    indicatorKey: "GENERAL_GOVERNMENT_PRIMARY_BALANCE",
    indicatorName:
      "General government primary net lending (+) / net borrowing (-)",
    category: "Fiscal",
    unit: "domestic currency billions",
    sourceUnit: "Domestic currency",
    sourceScale: "Billions",
    acceptedScales: ["Billions", "Millions"],
    changeType: "percent",
  },
  {
    sourceIndicator: "GGXONLB_NGDP",
    indicatorKey: "GENERAL_GOVERNMENT_PRIMARY_BALANCE_GDP",
    indicatorName:
      "General government primary net lending (+) / net borrowing (-)",
    category: "Fiscal",
    unit: "% of GDP",
    sourceUnit: "Percent",
    sourceScale: "Units",
    changeType: "basis-points",
  },
  {
    sourceIndicator: "GGXWDG",
    indicatorKey: "GENERAL_GOVERNMENT_GROSS_DEBT",
    indicatorName: "General government gross debt",
    category: "Fiscal",
    unit: "domestic currency billions",
    sourceUnit: "Domestic currency",
    sourceScale: "Billions",
    acceptedScales: ["Billions", "Millions"],
    changeType: "percent",
  },
  {
    sourceIndicator: "GGXWDG_NGDP",
    indicatorKey: "GENERAL_GOVERNMENT_GROSS_DEBT_GDP",
    indicatorName: "General government gross debt",
    category: "Fiscal",
    unit: "% of GDP",
    sourceUnit: "Percent",
    sourceScale: "Units",
    changeType: "basis-points",
  },
  {
    sourceIndicator: "GGXWDN_NGDP",
    indicatorKey: "GENERAL_GOVERNMENT_NET_DEBT_GDP",
    indicatorName: "General government net debt",
    category: "Fiscal",
    unit: "% of GDP",
    sourceUnit: "Percent",
    sourceScale: "Units",
    changeType: "basis-points",
  },
]);

function valueMatches(row, indicator) {
  if (text(row.FREQUENCY) !== "Annual") return false;
  const rowUnit = text(row.UNIT);
  const rowScale = text(row.SCALE);
  const expectedUnit =
    indicator.sourceUnit === null ? "" : indicator.sourceUnit;
  const acceptedScales = indicator.acceptedScales || [indicator.sourceScale];
  return rowUnit === expectedUnit && acceptedScales.includes(rowScale);
}

function displayUnit(row, indicator) {
  if (row.SCALE === "Millions") {
    return indicator.unit.replace(/\bbillions\b/i, "millions");
  }
  return indicator.unit;
}

function rowObservations(row, lastYear, actualCutoff) {
  const latestAllowedYear = Math.min(lastYear, actualCutoff);
  return Object.keys(row)
    .filter((key) => /^\d{4}$/.test(key))
    .map(Number)
    .filter((year) => year >= 1900 && year <= latestAllowedYear)
    .sort((left, right) => left - right)
    .flatMap((year) => {
      const value = finiteNumber(row[String(year)]);
      return value === null ? [] : [[yearEnd(year), value]];
    });
}

function preferRow(next, current, indicator) {
  // The workbook's declared scale is part of the source identity. Prefer the
  // indicator's canonical scale when duplicate rows appear; then prefer the
  // row with the newer actual cutoff and the most complete actual history.
  const nextExactScale =
    text(next.row.SCALE) === text(indicator.sourceScale) ? 1 : 0;
  const currentExactScale =
    text(current.row.SCALE) === text(indicator.sourceScale) ? 1 : 0;
  if (nextExactScale !== currentExactScale)
    return nextExactScale > currentExactScale;
  if (next.cutoff !== current.cutoff) return next.cutoff > current.cutoff;
  if (next.observations.length !== current.observations.length)
    return next.observations.length > current.observations.length;
  const nextSeries = text(next.row.SERIES_CODE);
  const currentSeries = text(current.row.SERIES_CODE);
  return nextSeries.localeCompare(currentSeries) < 0;
}

function countryMetadata(row, roster) {
  const code = text(row["COUNTRY.ID"]);
  const supplied = roster.get(code);
  return {
    countryCode: code,
    country: supplied?.name || text(row.COUNTRY),
    geography: supplied?.name || text(row.COUNTRY),
    region: supplied?.region ?? null,
    incomeLevel: supplied?.incomeLevel ?? null,
    lon: supplied?.lon ?? null,
    lat: supplied?.lat ?? null,
  };
}

/**
 * Parse the IMF WEO Countries sheet. Rows with invalid units, missing actual
 * cutoffs, non-annual frequency, null values, and projected years are omitted.
 */
export function parseImfWEO(
  rows,
  {
    countries = [],
    checkedAt = new Date().toISOString(),
    lastYear = Number(checkedAt.slice(0, 4)) - 1,
    sourceDownloadUrl = IMF_WEO_VERIFIED_FALLBACK_URL,
    providerSnapshotHash = "",
    sourcePageHash = null,
    discoveryMethod = "fixture",
    sourcePublicationDate = null,
  } = {},
) {
  if (!Array.isArray(rows) || !rows.length)
    throw new Error("IMF WEO Countries sheet has no rows");
  const roster = new Map(
    (Array.isArray(countries) ? countries : [])
      .map((country) => [text(country?.id || country?.countryCode), country])
      .filter(([code]) => /^[A-Z]{3}$/.test(code)),
  );
  const requestedCodes = roster.size ? new Set(roster.keys()) : null;
  const byIndicator = new Map(
    IMF_INDICATORS.map((indicator) => [indicator.sourceIndicator, indicator]),
  );
  const selectedRows = new Map();
  for (const row of rows) {
    const countryCode = text(row?.["COUNTRY.ID"]);
    const sourceIndicator = text(row?.["INDICATOR.ID"]);
    if (!/^[A-Z]{3}$/.test(countryCode) || !byIndicator.has(sourceIndicator))
      continue;
    if (requestedCodes && !requestedCodes.has(countryCode)) continue;
    const indicator = byIndicator.get(sourceIndicator);
    const cutoff = finiteNumber(row.LATEST_ACTUAL_ANNUAL_DATA);
    if (!Number.isInteger(cutoff) || cutoff < 1900) continue;
    if (!valueMatches(row, indicator)) continue;
    const observations = rowObservations(row, lastYear, cutoff);
    if (!observations.length) continue;
    const key = `${countryCode}|${sourceIndicator}`;
    const candidate = { row, cutoff, observations };
    const current = selectedRows.get(key);
    if (!current || preferRow(candidate, current, indicator))
      selectedRows.set(key, candidate);
  }
  const series = [];
  for (const { row, cutoff, observations } of selectedRows.values()) {
    const countryCode = text(row["COUNTRY.ID"]);
    const sourceIndicator = text(row["INDICATOR.ID"]);
    const indicator = byIndicator.get(sourceIndicator);
    const metadata = countryMetadata(row, roster);
    const rowDefinition =
      text(row["INDICATOR.Description"]) || text(row.INDICATOR);
    const rowPublicationDate =
      text(row.PUBLICATION_DATE) || sourcePublicationDate;
    const id = `IMF_WEO_${countryCode}_${indicator.indicatorKey}`;
    series.push({
      id,
      name: `${indicator.indicatorName} · ${metadata.country}`,
      indicatorKey: indicator.indicatorKey,
      indicatorName: indicator.indicatorName,
      sourceIndicatorName: text(row.INDICATOR) || indicator.indicatorName,
      sourceIndicator,
      category: indicator.category,
      frequency: "annual",
      releaseFrequency: "semiannual",
      unit: displayUnit(row, indicator),
      changeType: indicator.changeType,
      ...(["BCA", "GGXCNL", "GGXONLB"].includes(sourceIndicator)
        ? { changeType: "points", semantic: "point", signed: true }
        : {}),
      ...metadata,
      source: "International Monetary Fund",
      provider: "International Monetary Fund",
      sourceFamily: "IMF World Economic Outlook",
      sourceUrl: IMF_WEO_PAGE_URL,
      sourceDownloadUrl,
      exactDownloadUrl: sourceDownloadUrl,
      sourceFile: "IMF WEO full dataset XLSX · Countries",
      sourceColumn: `Countries / COUNTRY.ID=${countryCode} / INDICATOR.ID=${sourceIndicator}`,
      sourceHash: providerSnapshotHash,
      providerSnapshotHash,
      sourceDefinition: rowDefinition,
      sourceOrganization: "International Monetary Fund",
      historicalDataSource: text(row.HISTORICAL_DATA_SOURCE) || null,
      historyType: "published IMF WEO actual observations",
      rightsNote: `IMF data reproduced with attribution; review the IMF terms before redistribution. ${IMF_WEO_RIGHTS_URL}`,
      license: IMF_WEO_RIGHTS_URL,
      availabilityNote:
        "Only completed calendar years at or before the row's LATEST_ACTUAL_ANNUAL_DATA are admitted. Later WEO staff projections are excluded.",
      methodology:
        "The IMF WEO Countries row is used without interpolation, forecast substitution, unit conversion, or derived interest estimate. The row's native scale and unit are retained.",
      checkedAt,
      sourceAsOf: observations.at(-1)[0],
      actualCutoff: cutoff,
      sourceUnit: row.UNIT === null ? null : text(row.UNIT),
      sourceScale: row.SCALE === null ? null : text(row.SCALE),
      sourceFrequency: text(row.FREQUENCY),
      sourceCurrency: text(row.CURRENCY) || null,
      sourcePublicationDate: rowPublicationDate || null,
      providerUpdatedAt: text(row.UPDATE_DATE) || null,
      countryUpdateDate: text(row.COUNTRY_UPDATE_DATE) || null,
      sourcePageHash,
      discoveryMethod,
      observations,
      dataset: DATASET,
    });
  }
  return series.sort((left, right) => left.id.localeCompare(right.id));
}

export function discoveredImfDownloads(html, pageUrl = IMF_WEO_PAGE_URL) {
  return [
    ...String(html || "").matchAll(
      /(?:href|data-href)\s*=\s*["']([^"']+\.xlsx(?:\?[^"']*)?)["']/gi,
    ),
  ]
    .map((match) => match[1].replaceAll("&amp;", "&").replaceAll("\\/", "/"))
    .map((href) => new URL(href, pageUrl).href)
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

export function readImfWEORows(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: true });
  const sheet = workbook.Sheets.Countries;
  if (!sheet) throw new Error("IMF WEO workbook has no Countries sheet");
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
  if (!rows.length || !rows[0]["COUNTRY.ID"] || !rows[0]["INDICATOR.ID"])
    throw new Error("IMF WEO Countries sheet has no expected columns");
  return rows;
}

async function responseBody(response, asBytes = false) {
  if (!response?.ok) throw new Error(`HTTP ${response?.status ?? "unknown"}`);
  const body = asBytes
    ? Buffer.from(await response.arrayBuffer())
    : await response.text();
  if (!body.length) throw new Error("empty upstream response");
  return body;
}

async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { accept: "text/html" },
    signal:
      typeof AbortSignal?.timeout === "function"
        ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        : undefined,
  });
  return responseBody(response);
}

async function fetchBytes(url, fetchImpl) {
  const response = await fetchImpl(url, {
    signal:
      typeof AbortSignal?.timeout === "function"
        ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        : undefined,
  });
  return responseBody(response, true);
}

async function discoverImfWEO(fetchImpl) {
  const pageBody = await fetchText(IMF_WEO_PAGE_URL, fetchImpl);
  const downloads = discoveredImfDownloads(pageBody);
  if (!downloads.length)
    throw new Error("IMF WEO page has no full XLSX download link");
  return {
    downloadUrl: downloads[0],
    pageHash: sourceHash(pageBody),
    pageUrl: IMF_WEO_PAGE_URL,
    method: "official-page-html-link",
  };
}

/**
 * Fetch the full-country IMF WEO annual actual-only dataset. A first import
 * fails closed if both discovery and the verified emergency URL fail. When a
 * prior provider slice exists, its original checkedAt is retained on failure.
 */
export async function fetchImfMacro({
  previousSeries = [],
  countries = [],
  fetchImpl = globalThis.fetch,
  now = new Date(),
} = {}) {
  if (typeof fetchImpl !== "function")
    throw new TypeError("fetchImpl must be a function");
  const checkedAt = now.toISOString();
  const lastYear = now.getUTCFullYear() - 1;
  const previous = providerSeries(previousSeries);
  let discovery;
  try {
    discovery = await discoverImfWEO(fetchImpl);
  } catch (error) {
    if (previous.length) {
      console.warn(
        `IMF WEO discovery unavailable; retaining ${previous.length} cached series: ${error.message}`,
      );
      return previous
        .map(retained)
        .sort((left, right) => left.id.localeCompare(right.id));
    }
    discovery = {
      downloadUrl: IMF_WEO_VERIFIED_FALLBACK_URL,
      pageHash: null,
      pageUrl: IMF_WEO_PAGE_URL,
      method: "verified-release-fallback",
      warning:
        "The official WEO page could not be discovered; this verified release URL is not asserted to be current.",
    };
  }
  try {
    const workbook = await fetchBytes(discovery.downloadUrl, fetchImpl);
    const providerSnapshotHash = sourceHash(workbook);
    const rows = readImfWEORows(workbook);
    const parsed = parseImfWEO(rows, {
      countries,
      checkedAt,
      lastYear,
      sourceDownloadUrl: discovery.downloadUrl,
      providerSnapshotHash,
      sourcePageHash: discovery.pageHash,
      discoveryMethod: discovery.method,
    });
    if (!parsed.length)
      throw new Error("workbook produced no valid actual series");
    if (discovery.warning)
      return parsed.map((series) => ({
        ...series,
        refreshStatus: "upstream-unavailable",
      }));
    return parsed;
  } catch (error) {
    if (previous.length) {
      console.warn(
        `IMF WEO refresh unavailable; retaining ${previous.length} cached series: ${error.message}`,
      );
      return previous
        .map(retained)
        .sort((left, right) => left.id.localeCompare(right.id));
    }
    throw new Error(
      `IMF WEO provider failed on first import: ${error.message}`,
      {
        cause: error,
      },
    );
  }
}
