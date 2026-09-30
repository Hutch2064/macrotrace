import { createHash } from "node:crypto";

// These codes are the fixed country scope used by the globe headline panel.
// Existing WDI world series remain separate and are not redefined.
export const countries = Object.freeze([
  ["USA", "United States"],
  ["CAN", "Canada"],
  ["GBR", "United Kingdom"],
  ["DEU", "Germany"],
  ["FRA", "France"],
  ["ITA", "Italy"],
  ["JPN", "Japan"],
  ["AUS", "Australia"],
  ["CHN", "China"],
  ["IND", "India"],
  ["BRA", "Brazil"],
  ["MEX", "Mexico"],
  ["KOR", "South Korea"],
  ["ZAF", "South Africa"],
  ["SAU", "Saudi Arabia"],
  ["IDN", "Indonesia"],
]);

const world = [["WLD", "World"]];

// key, World Bank indicator, label, unit, change type, country scope.
// The first seven are the existing published WDI histories. Their IDs and
// semantics are intentionally unchanged; the final three are country-only
// headline measures requested for the globe.
export const indicators = Object.freeze([
  ["GDP", "NY.GDP.MKTP.KD", "Real GDP", "constant 2015 USD", "percent", world],
  [
    "GDPPC",
    "NY.GDP.PCAP.KD",
    "Real GDP per capita",
    "constant 2015 USD/person",
    "percent",
    [...world, ...countries],
  ],
  ["POP", "SP.POP.TOTL", "Population", "people", "percent", world],
  ["TRADE", "NE.TRD.GNFS.ZS", "Trade share of GDP", "%", "basis-points", world],
  [
    "INVESTMENT",
    "NE.GDI.TOTL.ZS",
    "Gross capital formation share of GDP",
    "%",
    "basis-points",
    world,
  ],
  [
    "SAVINGS",
    "NY.GNS.ICTR.ZS",
    "Gross savings share of GDP",
    "%",
    "basis-points",
    world,
  ],
  [
    "URBAN",
    "SP.URB.TOTL.IN.ZS",
    "Urban population share",
    "%",
    "basis-points",
    world,
  ],
  [
    "INFLATION",
    "FP.CPI.TOTL.ZG",
    "CPI inflation",
    "%",
    "basis-points",
    countries,
  ],
  [
    "UNEMPLOYMENT",
    "SL.UEM.TOTL.ZS",
    "Unemployment rate · modeled ILO estimate",
    "%",
    "basis-points",
    countries,
  ],
  [
    "GDPGROWTH",
    "NY.GDP.MKTP.KD.ZG",
    "Real GDP growth",
    "%",
    "basis-points",
    countries,
  ],
]);

const apiRoot = "https://api.worldbank.org/v2/country";
const pageSize = 1000;
const requestTimeoutMs = 90000;

function indicatorUrl(countryCodes, indicator, page) {
  const params = new URLSearchParams({
    format: "json",
    per_page: String(pageSize),
    page: String(page),
  });
  return `${apiRoot}/${countryCodes.join(";")}/indicator/${indicator}?${params}`;
}

async function fetchIndicatorPages(countryScope, indicator, fetchImpl) {
  const countryCodes = countryScope.map(([code]) => code);
  const pageBodies = [];
  const rows = [];
  let firstMetadata;
  let page = 1;
  while (true) {
    const url = indicatorUrl(countryCodes, indicator, page);
    const response = await fetchImpl(url, {
      signal:
        typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(requestTimeoutMs)
          : undefined,
    });
    if (!response.ok)
      throw new Error(
        `World Bank ${indicator} page ${page}: ${response.status}`,
      );
    const body = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (error) {
      throw new Error(`World Bank ${indicator} page ${page}: invalid JSON`, {
        cause: error,
      });
    }
    const [metadata, pageRows] = parsed;
    if (
      !metadata ||
      metadata.page !== page ||
      !Number.isInteger(metadata.pages) ||
      metadata.pages < page ||
      !Array.isArray(pageRows)
    )
      throw new Error(`World Bank ${indicator}: invalid pagination metadata`);
    if (!firstMetadata) firstMetadata = metadata;
    pageBodies.push(body);
    rows.push(...pageRows);
    if (page >= metadata.pages) break;
    page += 1;
  }
  if (rows.length !== Number(firstMetadata.total))
    throw new Error(
      `World Bank ${indicator}: expected ${firstMetadata.total} rows, received ${rows.length}`,
    );
  return {
    metadata: firstMetadata,
    rows,
    sourceHash: createHash("sha256")
      .update(pageBodies.join("\n"))
      .digest("hex"),
    sourceDownloadUrl: indicatorUrl(countryCodes, indicator, 1).replace(
      /&page=1$/,
      "",
    ),
  };
}

function observationsFor(rows, countryCode) {
  return rows
    .filter(
      (row) =>
        row.countryiso3code === countryCode &&
        Number.isFinite(row.value) &&
        /^\d{4}$/.test(row.date),
    )
    .map((row) => [`${row.date}-12-31`, row.value])
    .sort(([a], [b]) => a.localeCompare(b));
}

function minimumObservations(key) {
  return ["INFLATION", "UNEMPLOYMENT", "GDPGROWTH"].includes(key) ? 10 : 30;
}

function methodologyFor(key, indicator) {
  const headline =
    key === "INFLATION"
      ? "CPI inflation is the World Bank's annual consumer-price inflation rate."
      : key === "UNEMPLOYMENT"
        ? "Unemployment is the World Bank's modeled ILO estimate as a share of the total labor force."
        : key === "GDPGROWTH"
          ? "Real GDP growth is the World Bank's annual percentage change in constant-price GDP."
          : "The World Bank publishes this annual indicator at its native frequency.";
  return `${headline} Observations are retained without interpolation, annualization, or synthetic substitution. Dates use December 31 as a reference-year label, not a publication date; missing values are omitted. World aggregates use the provider's indicator-specific aggregation and coverage, not an unweighted country average. Source indicator: ${indicator}.`;
}

/**
 * Fetch the official WDI histories used by the report and globe. All API
 * pages are retrieved and included in provenance; no values are fabricated.
 */
export async function fetchWorldDevelopmentSeries({
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function")
    throw new Error("A fetch implementation is required.");
  const output = [];
  const checkedAt = new Date().toISOString();
  for (const [key, indicator, label, unit, changeType, scope] of indicators) {
    const { metadata, rows, sourceHash, sourceDownloadUrl } =
      await fetchIndicatorPages(scope, indicator, fetchImpl);
    for (const [country, fallbackName] of scope) {
      const observations = observationsFor(rows, country);
      if (observations.length < minimumObservations(key))
        throw new Error(
          `World Bank history unexpectedly short: ${country}/${indicator} (${observations.length})`,
        );
      const sourceName =
        rows.find((row) => row.countryiso3code === country)?.country?.value ||
        fallbackName;
      output.push({
        id: `WDI_${country}_${key}`,
        name: `${label} · ${sourceName}`,
        category: "Long-Run Global Development",
        frequency: "annual",
        releaseFrequency: "annual",
        unit,
        changeType,
        source: "World Bank · World Development Indicators",
        sourceFamily: "World Development Indicators",
        sourceUrl: `https://data.worldbank.org/indicator/${indicator}`,
        sourceDownloadUrl,
        sourceColumn: `${country} / ${indicator}`,
        sourceFile: "World Bank Indicators API v2",
        sourceHash,
        checkedAt,
        sourceAsOf: observations.at(-1)[0],
        providerUpdatedAt: metadata.lastupdated,
        rightsNote:
          "World Bank: World Development Indicators. CC BY 4.0 with World Bank additional terms and attribution to underlying providers: https://data.worldbank.org/summary-terms-of-use. No endorsement implied.",
        availabilityNote: `Annual source observations through ${observations.at(-1)[0]}; the latest available year can differ by country and indicator.`,
        methodology: methodologyFor(key, indicator),
        observations,
      });
    }
  }
  return output;
}
