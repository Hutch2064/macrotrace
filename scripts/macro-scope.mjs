// The public data contract is macroeconomic only.  Keep this module pure so
// the fetch pipeline and verification scripts share exactly the same scope
// decision and metadata normalization.

const MACRO_CATEGORIES = new Set([
  "Credit",
  "Currencies",
  "Commodities",
  "Demography",
  "Fiscal",
  "Growth",
  "Housing",
  "Inflation",
  "International Growth",
  "International Inflation",
  "International Labor",
  "International Rates",
  "Labor",
  "Productivity",
  "Rates",
  "Sector Employment",
]);

const SHILLER_HOUSING_IDS = new Set([
  "SHILLER_HOME_REAL",
  "SHILLER_HOME_NOMINAL",
]);

const FX_IDS = new Set([
  "DTWEXBGS",
  "DTWEXAFEGS",
  "DTWEXEMEGS",
  "DEXUSAL",
  "DEXCAUS",
  "DEXSZUS",
  "DEXUSEU",
  "DEXUSUK",
  "DEXJPUS",
  "DEXUSNZ",
  "DEXCHUS",
  "DEXINUS",
  "DEXBZUS",
  "DEXMXUS",
  "DEXSDUS",
  "DEXNOUS",
  "DEXSIUS",
  "DEXHKUS",
  "DEXKOUS",
  "DEXSFUS",
]);

const COUNTRIES = [
  "United States",
  "Canada",
  "United Kingdom",
  "Germany",
  "France",
  "Italy",
  "Japan",
  "Australia",
  "China",
  "India",
  "Brazil",
  "Mexico",
  "South Korea",
  "Spain",
  "Hong Kong",
  "Singapore",
  "South Africa",
  "Switzerland",
  "Sweden",
  "Norway",
  "New Zealand",
];

const COUNTRY_ALIASES = new Map([
  ["US", "United States"],
  ["USA", "United States"],
  ["United States", "United States"],
  ["U.S.", "United States"],
  ["UK", "United Kingdom"],
  ["GBR", "United Kingdom"],
  ["Korea", "South Korea"],
  ["KOR", "South Korea"],
]);

const PROHIBITED_DATA_ROLES = new Set([
  "research_factor_index",
  "research_portfolio",
  "simulated_proxy_index",
  "total_return_index",
]);

const CANONICAL_CATEGORIES = new Set([
  "Credit",
  "Currencies",
  "Commodities",
  "Demography",
  "Fiscal",
  "Growth",
  "Housing",
  "Inflation",
  "Labor",
  "Productivity",
  "Rates",
]);

function asObject(series) {
  if (!Array.isArray(series)) return series || {};
  const [id, name, category, unit, frequency, transform, metadata = {}] =
    series;
  return {
    id,
    name,
    category,
    unit,
    frequency,
    transform,
    ...metadata,
  };
}

function text(value) {
  return String(value ?? "").trim();
}

function isYahooOrSecurity(series) {
  const source = text(series.source).toLowerCase();
  const provider = text(series.provider).toLowerCase();
  const instrument = text(series.instrumentType).toLowerCase();
  const id = text(series.id);
  const category = text(series.category).toLowerCase();
  return (
    source.includes("yahoo finance") ||
    provider.includes("yahoo finance") ||
    instrument === "etf" ||
    instrument === "security" ||
    id === "VIXCLS" ||
    (instrument === "index" && category.includes("equity")) ||
    id.endsWith("_SIM") ||
    /^FF_|^HIST_/.test(id) ||
    category.includes("equity") ||
    category.includes("asset class") ||
    category.includes("etf") ||
    category.includes("factor")
  );
}

/**
 * Return true only for a published macro indicator, FX series, sovereign/rate
 * series, actual commodity price/index, World Bank macro history, or the two
 * explicitly retained Shiller annual housing histories.
 */
export function isMacroSeries(input) {
  const series = asObject(input);
  const id = text(series.id);
  const category = text(series.category);
  const dataset = text(series.dataset);
  const historyType = text(series.historyType);
  const dataRole = text(series.dataRole);
  if (!id || isYahooOrSecurity(series)) return false;
  if (historyType === "proxy_splice" || PROHIBITED_DATA_ROLES.has(dataRole))
    return false;
  if (dataset === "french-damodaran" || dataset === "french-factors")
    return false;
  if (SHILLER_HOUSING_IDS.has(id)) return true;
  if (
    dataset === "worldbank-commodities" ||
    dataset === "worldbank-development"
  )
    return true;
  if (id.startsWith("WDI_") || id.startsWith("WB_CMD_")) return true;
  if (FX_IDS.has(id)) return true;
  return MACRO_CATEGORIES.has(category);
}

export function canonicalMacroCategory(input) {
  const series = asObject(input);
  const id = text(series.id);
  const sourceCategory = text(series.originalCategory || series.category);
  const dataset = text(series.dataset);
  if (dataset === "worldbank-commodities" || id.startsWith("WB_CMD_"))
    return "Commodities";
  if (id.startsWith("WDI_")) {
    if (/_POP$|_URBAN$/.test(id)) return "Demography";
    return "Growth";
  }
  if (SHILLER_HOUSING_IDS.has(id)) return "Housing";
  if (
    [
      "International Inflation",
      "International Growth",
      "International Labor",
      "International Rates",
    ].includes(sourceCategory)
  )
    return sourceCategory.replace("International ", "");
  if (sourceCategory === "Sector Employment") return "Labor";
  if (sourceCategory === "Markets" && FX_IDS.has(id)) return "Currencies";
  return CANONICAL_CATEGORIES.has(sourceCategory)
    ? sourceCategory
    : sourceCategory;
}

function findCountry(series) {
  const haystack = `${text(series.name)} ${text(series.id)} ${text(series.country)}`;
  for (const country of COUNTRIES)
    if (haystack.includes(country)) return country;
  for (const [alias, country] of COUNTRY_ALIASES)
    if (haystack.includes(alias)) return country;
  return null;
}

function geographyFor(series) {
  const id = text(series.id);
  const category = text(series.category);
  const dataset = text(series.dataset);
  if (FX_IDS.has(id) || category === "Currencies") return "FX";
  if (id === "CLVMNACSCAB1GQEA19") return "Euro Area";
  if (
    id.startsWith("WDI_WLD_") ||
    id.endsWith("WLD") ||
    dataset === "worldbank-commodities" ||
    (category === "Commodities" &&
      series.sourceFamily === "International Monetary Fund")
  )
    return "Global";
  const country = findCountry(series);
  if (country && country !== "United States") return country;
  return "US";
}

function normalizeUnit(value) {
  return text(value).replace(/\s+/g, " ");
}

function normalizeFrequency(value) {
  const frequency = text(value).toLowerCase();
  if (["daily", "weekly", "monthly", "quarterly", "annual"].includes(frequency))
    return frequency;
  return frequency;
}

/**
 * Return a fresh, JSON-safe metadata-normalized copy, or null for a series
 * outside the macro scope.  No observations are changed.
 */
export function normalizeMacroSeries(input) {
  const series = asObject(input);
  if (!isMacroSeries(series)) return null;
  const geography = geographyFor(series);
  const country =
    geography === "Global" || geography === "FX" || geography === "Euro Area"
      ? null
      : geography === "US"
        ? "United States"
        : geography;
  const sourceCategory = text(series.originalCategory || series.category);
  const category = canonicalMacroCategory(series);
  const normalized = {
    ...series,
    category,
    geography,
    country,
    unit: normalizeUnit(series.unit),
    frequency: normalizeFrequency(series.frequency),
  };
  if (sourceCategory !== category) {
    normalized.originalCategory = sourceCategory;
    normalized.subcategory = series.subcategory || sourceCategory;
  }
  if (datasetFor(series) === "worldbank-commodities")
    normalized.commodityGroup = series.commodityGroup || sourceCategory;
  return normalized;
}

function datasetFor(series) {
  return text(series.dataset);
}

export const macroCountries = Object.freeze([...COUNTRIES]);
export const macroGeographies = Object.freeze([
  "US",
  "Global",
  "FX",
  "Euro Area",
  ...COUNTRIES,
]);
export const macroFrequencies = Object.freeze([
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "annual",
]);
