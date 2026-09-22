import { createHash } from "node:crypto";

const countries = [
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
];
const indicators = [
  ["GDP", "NY.GDP.MKTP.KD", "Real GDP", "constant 2015 USD", "percent"],
  [
    "GDPPC",
    "NY.GDP.PCAP.KD",
    "Real GDP per capita",
    "constant 2015 USD/person",
    "percent",
  ],
  ["POP", "SP.POP.TOTL", "Population", "people", "percent"],
  ["TRADE", "NE.TRD.GNFS.ZS", "Trade share of GDP", "%", "basis-points"],
  [
    "INVESTMENT",
    "NE.GDI.TOTL.ZS",
    "Gross capital formation share of GDP",
    "%",
    "basis-points",
  ],
  [
    "SAVINGS",
    "NY.GNS.ICTR.ZS",
    "Gross savings share of GDP",
    "%",
    "basis-points",
  ],
  ["URBAN", "SP.URB.TOTL.IN.ZS", "Urban population share", "%", "basis-points"],
];

export async function fetchWorldDevelopmentSeries() {
  const output = [];
  // Seven bounded API requests; the income comparison is fetched in one country batch.
  for (const [key, indicator, label, unit, changeType] of indicators) {
    const selected = [["WLD", "World"], ...(key === "GDPPC" ? countries : [])];
    const url = `https://api.worldbank.org/v2/country/${selected.map(([id]) => id).join(";")}/indicator/${indicator}?format=json&per_page=1000`;
    const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
    if (!response.ok)
      throw new Error(`World Bank ${indicator}: ${response.status}`);
    const text = await response.text(),
      [metadata, rows] = JSON.parse(text);
    if (!Array.isArray(rows) || metadata.pages !== 1)
      throw new Error(`World Bank incomplete response for ${indicator}`);
    for (const [country, name] of selected) {
      const observations = rows
        .filter(
          (row) =>
            row.countryiso3code === country &&
            Number.isFinite(row.value) &&
            /^\d{4}$/.test(row.date),
        )
        .map((row) => [`${row.date}-12-31`, row.value])
        .sort(([a], [b]) => a.localeCompare(b));
      if (observations.length < 30)
        throw new Error(
          `World Bank history unexpectedly short: ${country}/${indicator}`,
        );
      output.push({
        id: `WDI_${country}_${key}`,
        name: `${label} · ${name}`,
        category: "Long-Run Global Development",
        frequency: "annual",
        unit,
        changeType,
        source: "World Bank · World Development Indicators",
        sourceFamily: "World Development Indicators",
        sourceUrl: `https://data.worldbank.org/indicator/${indicator}`,
        sourceDownloadUrl: url,
        sourceColumn: `${country} / ${indicator}`,
        sourceFile: "World Bank Indicators API v2",
        sourceHash: createHash("sha256").update(text).digest("hex"),
        checkedAt: new Date().toISOString(),
        sourceAsOf: observations.at(-1)[0],
        providerUpdatedAt: metadata.lastupdated,
        rightsNote:
          "World Bank: World Development Indicators. CC BY 4.0 with World Bank additional terms and attribution to underlying providers: https://data.worldbank.org/summary-terms-of-use. No endorsement implied.",
        methodology:
          "Published annual World Bank indicator, retained without interpolation. Nulls are omitted, never replaced by zero. December 31 labels the reference year, not the publication date. Constant-dollar GDP uses the provider's 2015 price base and is not a PPP purchasing-power comparison; per-capita GDP is output, not household income. World aggregates use the World Bank's indicator-specific aggregation and coverage, not an unweighted country average.",
        observations,
      });
    }
  }
  return output;
}
