import { createHash } from "node:crypto";
import * as XLSX from "xlsx";

/**
 * World Bank Prospects Group "Pink Sheet" workbooks.
 *
 * The document identifier is part of the current World Bank publication URL.
 * Update these constants when the World Bank publishes a new workbook vintage;
 * the verification script intentionally downloads both files to make that
 * change visible rather than silently falling back to an old copy.
 */
export const WORLD_BANK_PINK_SHEET = {
  source: "World Bank Commodity Price Data (The Pink Sheet)",
  provider: "World Bank Prospects Group",
  sourcePageUrl: "https://www.worldbank.org/en/research/commodity-markets",
  termsUrl: "https://data.worldbank.org/summary-terms-of-use",
  monthlyUrl:
    "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx",
  annualUrl:
    "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Annual.xlsx",
};

// The current workbooks have four named price columns with an empty tail.
// Keep this list explicit: a newly stale column must be investigated rather
// than being silently classified as archived.
export const ARCHIVED_PINK_SHEET_SERIES = Object.freeze([
  "WB_CMD_BARLEY",
  "WB_CMD_SORGHUM",
  "WB_CMD_SHRIMPS_MEXICAN",
]);

const ARCHIVED_PINK_SHEET_IDS = new Set(ARCHIVED_PINK_SHEET_SERIES);
export const LAGGED_PINK_SHEET_SERIES = Object.freeze([
  "WB_CMD_TOBACCO_US_IMPORT_U_V",
]);
const LAGGED_PINK_SHEET_IDS = new Set(LAGGED_PINK_SHEET_SERIES);

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MISSING_VALUES = new Set(["", "…", "...", "-", "—", "n/a", "na"]);
const REQUEST_TIMEOUT_MS = 45_000;

function cleanText(value) {
  return String(value ?? "")
    .replaceAll("\n", " ")
    .replaceAll("\r", " ")
    .replace(/\*{1,2}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceText(value) {
  return String(value ?? "")
    .replaceAll("\n", " ")
    .replaceAll("\r", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numeric(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (MISSING_VALUES.has(text)) return null;
  const parsed = Number(text.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function monthlyDate(value) {
  const text = String(value ?? "").trim();
  const match = /^(\d{4})M(0[1-9]|1[0-2])$/.exec(text);
  if (!match) return null;
  return `${match[1]}-${match[2]}-01`;
}

function annualDate(value) {
  const text = String(value ?? "").trim();
  const year = /^\d{4}$/.test(text) ? Number(text) : null;
  if (!year || year < 1900 || year > 2200) return null;
  return `${year}-01-01`;
}

function request(fetchImpl, url) {
  const signal =
    typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      : undefined;
  return signal ? fetchImpl(url, { signal }) : fetchImpl(url);
}

function parseSourceAsOf(rows) {
  const line = rows
    .slice(0, 10)
    .flat()
    .find((value) => typeof value === "string" && /updated on/i.test(value));
  const match = /updated on\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i.exec(
    String(line ?? ""),
  );
  if (!match) return null;
  const month = MONTH_NAMES.findIndex(
    (name) => name.toLowerCase() === match[1].toLowerCase(),
  );
  if (month < 0) return null;
  return `${match[3]}-${String(month + 1).padStart(2, "0")}-${String(
    Number(match[2]),
  ).padStart(2, "0")}`;
}

function workbookRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Pink Sheet workbook is missing ${sheetName}.`);
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
}

function sourceFile(url) {
  return url.includes("Monthly")
    ? "CMO-Historical-Data-Monthly.xlsx"
    : "CMO-Historical-Data-Annual.xlsx";
}

/** Resolve the currently linked workbook vintages without requiring a hash update. */
export async function discoverPinkSheetUrls({
  fetchImpl = globalThis.fetch,
  pageUrl = WORLD_BANK_PINK_SHEET.sourcePageUrl,
} = {}) {
  if (typeof fetchImpl !== "function") return WORLD_BANK_PINK_SHEET;
  try {
    const response = await request(fetchImpl, pageUrl);
    if (!response.ok) return WORLD_BANK_PINK_SHEET;
    const html = await response.text();
    const matches = [
      ...html.matchAll(
        /href=["']([^"']*CMO-Historical-Data-(Monthly|Annual)\.xlsx[^"']*)["']/gi,
      ),
    ];
    const links = new Map(
      matches.map((match) => [
        match[2].toLowerCase(),
        new URL(match[1], pageUrl).href,
      ]),
    );
    return {
      ...WORLD_BANK_PINK_SHEET,
      monthlyUrl: links.get("monthly") ?? WORLD_BANK_PINK_SHEET.monthlyUrl,
      annualUrl: links.get("annual") ?? WORLD_BANK_PINK_SHEET.annualUrl,
    };
  } catch {
    // Keep the last tested URLs as a deterministic fallback for offline runs.
    return WORLD_BANK_PINK_SHEET;
  }
}

function categoryForPriceColumn(sourceColumn) {
  const name = cleanText(sourceColumn).toLowerCase();
  if (/crude oil|coal|natural gas|liquefied natural gas/.test(name))
    return "Energy";
  if (/cocoa|coffee|tea/.test(name)) return "Beverages";
  if (
    /coconut|groundnut|fish meal|palm|soybean|rapeseed|sunflower|barley|maize|sorghum|rice|wheat|banana|orange|beef|chicken|lamb|shrimp|sugar/.test(
      name,
    )
  )
    return "Agriculture";
  if (/phosphate|\bdap\b|\btsp\b|urea|potassium/.test(name))
    return "Fertilizers";
  if (/aluminum|iron ore|copper|\blead\b|\btin\b|nickel|zinc/.test(name))
    return "Metals & Minerals";
  if (/gold|platinum|silver/.test(name)) return "Precious Metals";
  if (/tobacco|logs|sawnwood|plywood|cotton|rubber/.test(name))
    return "Raw Materials";
  return "Commodities";
}

function categoryForIndexName(name) {
  if (name === "Total Index" || name === "World Bank Commodity Price Index")
    return "Commodities";
  if (name === "Non-energy") return "Non-energy";
  if (name.includes("Agriculture")) return "Agriculture";
  if (name.includes("Beverages")) return "Beverages";
  if (name.includes("Food")) return "Food";
  if (name.includes("Oils & Meals")) return "Oils & Meals";
  if (name.includes("Grains")) return "Grains";
  if (name.includes("Raw Materials") || name.includes("Other Raw Mat"))
    return "Raw Materials";
  if (name.includes("Timber")) return "Timber";
  if (name.includes("Fertilizers")) return "Fertilizers";
  if (name.includes("Precious")) return "Precious Metals";
  if (name.includes("Metals")) return "Metals & Minerals";
  if (name === "Energy") return "Energy";
  return "Commodities";
}

function slug(value) {
  return cleanText(value)
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function indexHeader(rows, column, { annual = false } = {}) {
  const headerRows = annual ? [5, 6, 7, 8] : [5, 6, 7, 8];
  const parts = headerRows
    .map((row) => sourceText(rows[row]?.[column]))
    .filter((part) => part && part !== " ");
  // The hierarchy repeats parent names in some workbook vintages. Preserve a
  // readable label while removing exact duplicate fragments.
  return [...new Set(parts)].join(" · ");
}

function makeSeries({
  id,
  name,
  category,
  unit,
  frequency,
  observations,
  sourceUrl,
  sourceHash,
  sourceAsOf,
  sourceLatestDate,
  archived = false,
  sourceFileName,
  sheet,
  sourceColumn,
  valueType,
  methodology,
  observationSemantics,
  baseYear,
  checkedAt = new Date().toISOString(),
  sourceLagged = false,
}) {
  if (observations.length === 0) return null;
  const archiveReason = archived
    ? `Source workbook has no nonmissing observations after ${observations.at(-1)[0]}; no tail values were imputed.`
    : null;
  const availabilityNote = archived
    ? `Archived source-empty-tail classification; last observed value is ${observations.at(-1)[0]}.`
    : sourceLagged
      ? `Source-lagged availability; the latest nonmissing value is ${observations.at(-1)[0]} and trailing workbook rows are absent. This is not classified as archived.`
      : `Source workbook contains nonmissing observations through ${sourceLatestDate}.`;
  return {
    id,
    name,
    category,
    unit,
    frequency,
    kind: "market",
    historyType: "observed_public",
    historyStatus: archived ? "archived" : "active",
    archiveReason,
    availabilityStatus: sourceLagged ? "source_lagged" : "available",
    assetClass: "commodity",
    dataRole: valueType === "nominal_index" ? "price_index" : "benchmark_price",
    valueType,
    dividendTreatment:
      "not_applicable; source is a price or price-index level, not total return",
    source: WORLD_BANK_PINK_SHEET.source,
    sourceUrl,
    sourceAsOf,
    sourceHash,
    sourceFile: sourceFileName,
    sourceColumn,
    sourceFamily: WORLD_BANK_PINK_SHEET.source,
    rightsNote:
      "World Bank Data Catalog terms generally permit CC BY 4.0 reuse with attribution; check source metadata for third-party conditions.",
    availabilityNote,
    checkedAt,
    checkTimestamp: checkedAt,
    methodology,
    provenance: {
      provider: WORLD_BANK_PINK_SHEET.provider,
      dataset: WORLD_BANK_PINK_SHEET.source,
      sourceFamily: WORLD_BANK_PINK_SHEET.source,
      sourcePageUrl: WORLD_BANK_PINK_SHEET.sourcePageUrl,
      termsUrl: WORLD_BANK_PINK_SHEET.termsUrl,
      sourceFile: sourceFileName,
      sheet,
      sourceColumn,
      sourceUnit: unit,
      valueType,
      baseYear: baseYear ?? null,
      observationSemantics,
      sourceAsOf,
      sourceLatestDate,
      historyStatus: archived ? "archived" : "active",
      archiveReason,
      availabilityStatus: sourceLagged ? "source_lagged" : "available",
      availabilityNote,
      checkedAt,
      checkTimestamp: checkedAt,
      rightsNote:
        "World Bank Data Catalog terms generally permit CC BY 4.0 reuse with attribution; check source metadata for third-party conditions.",
      sourceHash,
    },
    observations,
  };
}

function parsePriceSheet({
  rows,
  sourceUrl,
  sourceHash,
  frequency,
  sheet,
  includeAnnual = false,
}) {
  const dateParser = includeAnnual ? annualDate : monthlyDate;
  const headerRow = includeAnnual ? 6 : 4;
  const unitRow = includeAnnual ? 7 : 5;
  const firstDataRow = includeAnnual ? 8 : 6;
  const sourceAsOf = parseSourceAsOf(rows);
  const sourceDates = rows
    .slice(firstDataRow)
    .map((row) => dateParser(row[0]))
    .filter(Boolean);
  const sourceLatestDate = sourceDates.at(-1) ?? null;
  const out = [];

  for (let column = 1; column < (rows[headerRow]?.length ?? 0); column += 1) {
    const sourceColumn = cleanText(rows[headerRow]?.[column]);
    const sourceColumnRaw = sourceText(rows[headerRow]?.[column]);
    if (!sourceColumn) continue;
    const unit = cleanText(rows[unitRow]?.[column]);
    const observations = [];
    for (const row of rows.slice(firstDataRow)) {
      const date = dateParser(row[0]);
      const value = numeric(row[column]);
      if (date && value !== null) observations.push([date, value]);
    }
    if (!observations.length) continue;
    const suffix = includeAnnual ? "_ANNUAL" : "";
    const baseId = `WB_CMD_${slug(sourceColumn)}`;
    const sourceTailMissing = observations.at(-1)[0] < sourceLatestDate;
    out.push(
      makeSeries({
        id: `${baseId}${suffix}`,
        name: `World Bank · ${sourceColumn}`,
        category: categoryForPriceColumn(sourceColumn),
        unit,
        frequency,
        observations,
        sourceUrl,
        sourceHash,
        sourceAsOf,
        sourceLatestDate,
        sourceFileName: sourceFile(sourceUrl),
        sheet,
        sourceColumn: sourceColumnRaw,
        valueType: "nominal_price",
        methodology: includeAnnual
          ? "World Bank Pink Sheet annual nominal benchmark price in the source unit. The annual row is a source-published calendar-year value, not an end-of-period quote; it is a price level with no dividend, financing, storage, or total-return adjustment. Benchmark definitions and delivery bases may change through time; consult the workbook Description sheet."
          : "World Bank Pink Sheet monthly nominal benchmark price in the source unit. The source reports monthly averages, not end-of-month closes; this is a price level with no dividend, financing, storage, or total-return adjustment. Benchmark definitions and delivery bases may change through time; consult the workbook Description sheet.",
        observationSemantics: includeAnnual
          ? "source-published annual calendar-year value; not end-of-period"
          : "source-reported monthly average; not end-of-period",
        archived: sourceTailMissing && ARCHIVED_PINK_SHEET_IDS.has(baseId),
        sourceLagged: sourceTailMissing && LAGGED_PINK_SHEET_IDS.has(baseId),
      }),
    );
  }
  return out.filter(Boolean);
}

function parseIndexSheet({
  rows,
  sourceUrl,
  sourceHash,
  frequency,
  sheet,
  includeAnnual = false,
  real = false,
}) {
  const dateParser = includeAnnual ? annualDate : monthlyDate;
  const firstDataRow = 9;
  const sourceAsOf = parseSourceAsOf(rows);
  const sourceDates = rows
    .slice(firstDataRow)
    .map((row) => dateParser(row[0]))
    .filter(Boolean);
  const sourceLatestDate = sourceDates.at(-1) ?? null;
  const out = [];
  for (let column = 1; column < (rows[5]?.length ?? 0); column += 1) {
    const sourceColumnRaw = indexHeader(rows, column, {
      annual: includeAnnual,
    });
    const sourceColumn = cleanText(sourceColumnRaw);
    if (!sourceColumn) continue;
    const displayName =
      sourceColumn === "World Bank Commodity Price Index"
        ? "Total Index"
        : sourceColumn;
    const observations = [];
    for (const row of rows.slice(firstDataRow)) {
      const date = dateParser(row[0]);
      const value = numeric(row[column]);
      if (date && value !== null) observations.push([date, value]);
    }
    if (!observations.length) continue;
    const suffix = includeAnnual ? "_ANNUAL" : "";
    const realSuffix = real ? "_REAL" : "";
    const nominalText = real ? "real 2010-dollar" : "nominal";
    out.push(
      makeSeries({
        id: `WB_CMD_INDEX_${slug(displayName)}${suffix}${realSuffix}`,
        name: `World Bank · ${displayName}${real ? " · Real" : ""}`,
        category: categoryForIndexName(displayName),
        unit: "index (2010=100)",
        frequency,
        observations,
        sourceUrl,
        sourceHash,
        sourceAsOf,
        sourceLatestDate,
        sourceFileName: sourceFile(sourceUrl),
        sheet,
        sourceColumn: sourceColumnRaw,
        valueType: "nominal_index",
        baseYear: 2010,
        methodology: includeAnnual
          ? `World Bank Pink Sheet annual ${nominalText} Laspeyres commodity-price index (2010=100), using source-defined commodity weights. The annual row is a source-published calendar-year index, not an end-of-period quote; it is a price index, not an investable total-return index.`
          : `World Bank Pink Sheet monthly ${nominalText} Laspeyres commodity-price index (2010=100), using source-defined commodity weights. The source reports monthly index observations rather than end-of-month closes; it is a price index, not an investable total-return index.`,
        observationSemantics: includeAnnual
          ? "source-published annual calendar-year index; not end-of-period"
          : "source-reported monthly average index; not end-of-period",
        archived: observations.at(-1)[0] < sourceLatestDate,
      }),
    );
  }
  return out.filter(Boolean);
}

async function downloadWorkbook(url, fetchImpl) {
  const response = await request(fetchImpl, url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b)
    throw new Error(`${url}: response is not an XLSX zip archive`);
  return {
    workbook: XLSX.read(buffer, { type: "array", cellDates: false }),
    sourceHash: createHash("sha256").update(buffer).digest("hex"),
  };
}

/**
 * Download and parse the current World Bank Pink Sheet workbooks.
 *
 * By default the result contains the monthly prices and indices. Set
 * includeAnnual:true to add annual nominal prices and indices; set
 * includeAnnualReal:true to additionally emit the annual real-dollar workbook
 * sheets.
 */
export async function fetchCommodityHistorySeries({
  includeAnnual = false,
  includeAnnualReal = false,
  fetchImpl = globalThis.fetch,
  urls = WORLD_BANK_PINK_SHEET,
} = {}) {
  if (typeof fetchImpl !== "function")
    throw new Error("A fetch implementation is required.");
  const resolvedUrls =
    urls === WORLD_BANK_PINK_SHEET
      ? await discoverPinkSheetUrls({ fetchImpl })
      : urls;
  const monthlyFile = await downloadWorkbook(
    resolvedUrls.monthlyUrl,
    fetchImpl,
  );
  const monthlyPrices = workbookRows(monthlyFile.workbook, "Monthly Prices");
  const monthlyIndices = workbookRows(monthlyFile.workbook, "Monthly Indices");
  const series = [
    ...parsePriceSheet({
      rows: monthlyPrices,
      sourceUrl: resolvedUrls.monthlyUrl,
      sourceHash: monthlyFile.sourceHash,
      frequency: "monthly",
      sheet: "Monthly Prices",
    }),
    ...parseIndexSheet({
      rows: monthlyIndices,
      sourceUrl: resolvedUrls.monthlyUrl,
      sourceHash: monthlyFile.sourceHash,
      frequency: "monthly",
      sheet: "Monthly Indices",
    }),
  ];

  if (!includeAnnual) return series;

  const annualFile = await downloadWorkbook(resolvedUrls.annualUrl, fetchImpl);
  const annualPrices = workbookRows(
    annualFile.workbook,
    "Annual Prices (Nominal)",
  );
  const annualIndices = workbookRows(
    annualFile.workbook,
    "Annual Indices (Nominal)",
  );
  series.push(
    ...parsePriceSheet({
      rows: annualPrices,
      sourceUrl: resolvedUrls.annualUrl,
      sourceHash: annualFile.sourceHash,
      frequency: "annual",
      sheet: "Annual Prices (Nominal)",
      includeAnnual: true,
    }),
    ...parseIndexSheet({
      rows: annualIndices,
      sourceUrl: resolvedUrls.annualUrl,
      sourceHash: annualFile.sourceHash,
      frequency: "annual",
      sheet: "Annual Indices (Nominal)",
      includeAnnual: true,
    }),
  );

  if (includeAnnualReal) {
    const annualRealPrices = workbookRows(
      annualFile.workbook,
      "Annual Prices (Real)",
    );
    const annualRealIndices = workbookRows(
      annualFile.workbook,
      "Annual Indices (Real)",
    );
    series.push(
      ...parsePriceSheet({
        rows: annualRealPrices,
        sourceUrl: resolvedUrls.annualUrl,
        sourceHash: annualFile.sourceHash,
        frequency: "annual",
        sheet: "Annual Prices (Real)",
        includeAnnual: true,
      }).map((entry) => ({
        ...entry,
        id: `${entry.id}_REAL`,
        name: `${entry.name} · Real 2010 dollars`,
        methodology:
          "World Bank Pink Sheet annual real benchmark price in constant 2010 U.S. dollars. The annual row is a source-published calendar-year value, not an end-of-period quote; this remains a price level, not total return.",
        valueType: "real_price",
        dataRole: "benchmark_price",
        provenance: {
          ...entry.provenance,
          valueType: "real_price",
          realBaseYear: 2010,
        },
      })),
      ...parseIndexSheet({
        rows: annualRealIndices,
        sourceUrl: resolvedUrls.annualUrl,
        sourceHash: annualFile.sourceHash,
        frequency: "annual",
        sheet: "Annual Indices (Real)",
        includeAnnual: true,
        real: true,
      }).map((entry) => ({
        ...entry,
        valueType: "real_index",
        dataRole: "price_index",
      })),
    );
  }

  return series;
}
