import { createHash } from "node:crypto";

// Stable keys preserve published history IDs. WDI observations remain annual.
export const indicators = Object.freeze([
  [
    "GDP",
    "NY.GDP.MKTP.KD",
    "Real GDP",
    "constant 2015 USD",
    "percent",
    "Growth",
  ],
  [
    "GDPPC",
    "NY.GDP.PCAP.KD",
    "Real GDP per capita",
    "constant 2015 USD/person",
    "percent",
    "Growth",
  ],
  ["POP", "SP.POP.TOTL", "Population", "people", "percent", "Demography"],
  [
    "TRADE",
    "NE.TRD.GNFS.ZS",
    "Trade share of GDP",
    "%",
    "basis-points",
    "Growth",
  ],
  [
    "INVESTMENT",
    "NE.GDI.TOTL.ZS",
    "Gross capital formation share of GDP",
    "%",
    "basis-points",
    "Growth",
  ],
  [
    "SAVINGS",
    "NY.GNS.ICTR.ZS",
    "Gross savings share of GDP",
    "%",
    "basis-points",
    "Growth",
  ],
  [
    "URBAN",
    "SP.URB.TOTL.IN.ZS",
    "Urban population share",
    "%",
    "basis-points",
    "Demography",
  ],
  [
    "INFLATION",
    "FP.CPI.TOTL.ZG",
    "CPI inflation",
    "%",
    "basis-points",
    "Inflation",
  ],
  [
    "UNEMPLOYMENT",
    "SL.UEM.TOTL.ZS",
    "Unemployment rate · modeled ILO estimate",
    "%",
    "basis-points",
    "Labor",
  ],
  [
    "GDPGROWTH",
    "NY.GDP.MKTP.KD.ZG",
    "Real GDP growth",
    "%",
    "basis-points",
    "Growth",
  ],
  [
    "GDPNOMINAL",
    "NY.GDP.MKTP.CD",
    "Nominal GDP",
    "current USD",
    "percent",
    "Growth",
  ],
  [
    "GDPPCPPP",
    "NY.GDP.PCAP.PP.KD",
    "Real GDP per capita · purchasing power parity",
    "constant 2021 international USD/person",
    "percent",
    "Growth",
  ],
  [
    "CPIINDEX",
    "FP.CPI.TOTL",
    "Consumer price index",
    "index (2010=100)",
    "percent",
    "Inflation",
  ],
  [
    "LFPR",
    "SL.TLF.CACT.ZS",
    "Labor force participation · modeled ILO estimate",
    "%",
    "basis-points",
    "Labor",
  ],
  [
    "EMPLOYMENT_POP",
    "SL.EMP.TOTL.SP.ZS",
    "Employment-to-population ratio · modeled ILO estimate",
    "%",
    "basis-points",
    "Labor",
  ],
  [
    "YOUTH_UNEMPLOYMENT",
    "SL.UEM.1524.ZS",
    "Youth unemployment · modeled ILO estimate",
    "%",
    "basis-points",
    "Labor",
  ],
  [
    "EXPORTS_GDP",
    "NE.EXP.GNFS.ZS",
    "Exports share of GDP",
    "%",
    "basis-points",
    "Growth",
  ],
  [
    "IMPORTS_GDP",
    "NE.IMP.GNFS.ZS",
    "Imports share of GDP",
    "%",
    "basis-points",
    "Growth",
  ],
  [
    "CURRENT_ACCOUNT",
    "BN.CAB.XOKA.GD.ZS",
    "Current account balance share of GDP",
    "%",
    "basis-points",
    "Growth",
  ],
  [
    "FDI_GDP",
    "BX.KLT.DINV.WD.GD.ZS",
    "Foreign direct investment net inflows share of GDP",
    "%",
    "basis-points",
    "Growth",
  ],
  [
    "GOV_DEBT",
    "GC.DOD.TOTL.GD.ZS",
    "Central government debt share of GDP",
    "%",
    "basis-points",
    "Fiscal",
  ],
  [
    "GOV_REVENUE",
    "GC.REV.XGRT.GD.ZS",
    "Government revenue excluding grants share of GDP",
    "%",
    "basis-points",
    "Fiscal",
  ],
  [
    "GOV_EXPENSE",
    "GC.XPN.TOTL.GD.ZS",
    "Government expense share of GDP",
    "%",
    "basis-points",
    "Fiscal",
  ],
  [
    "CREDIT_PRIVATE",
    "FS.AST.PRVT.GD.ZS",
    "Domestic credit to private sector share of GDP",
    "%",
    "basis-points",
    "Credit",
  ],
  [
    "MONEY",
    "FM.LBL.BMNY.GD.ZS",
    "Broad money share of GDP",
    "%",
    "basis-points",
    "Credit",
  ],
  [
    "RESERVES",
    "FI.RES.TOTL.CD",
    "Total reserves including gold",
    "current USD",
    "percent",
    "Credit",
  ],
  [
    "EXTERNAL_DEBT",
    "DT.DOD.DECT.CD",
    "External debt stocks",
    "current USD",
    "percent",
    "Credit",
  ],
  [
    "MANUFACTURING",
    "NV.IND.MANF.ZS",
    "Manufacturing value added share of GDP",
    "%",
    "basis-points",
    "Growth",
  ],
  [
    "SERVICES",
    "NV.SRV.TOTL.ZS",
    "Services value added share of GDP",
    "%",
    "basis-points",
    "Growth",
  ],
  [
    "AGRICULTURE",
    "NV.AGR.TOTL.ZS",
    "Agriculture value added share of GDP",
    "%",
    "basis-points",
    "Growth",
  ],
  [
    "POP_GROWTH",
    "SP.POP.GROW",
    "Population growth",
    "%",
    "basis-points",
    "Demography",
  ],
  [
    "REMITTANCES",
    "BX.TRF.PWKR.DT.GD.ZS",
    "Personal remittances received share of GDP",
    "%",
    "basis-points",
    "Growth",
  ],
]);

const root = "https://api.worldbank.org/v2";
const pageSize = 20000;
const displayNames = new Map([
  ["KOR", "South Korea"],
  ["PRK", "North Korea"],
  ["RUS", "Russia"],
  ["IRN", "Iran"],
  ["EGY", "Egypt"],
  ["VEN", "Venezuela"],
  ["YEM", "Yemen"],
  ["LAO", "Laos"],
  ["TUR", "Türkiye"],
]);

async function request(url, fetchImpl) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok) throw new Error(`World Bank HTTP ${response.status}`);
      const body = await response.text();
      return { body, json: JSON.parse(body) };
    } catch (error) {
      if (attempt) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
}

export async function fetchPages(path, fetchImpl = globalThis.fetch) {
  const rows = [],
    bodies = [];
  let metadata;
  for (let page = 1; ; page++) {
    const separator = path.includes("?") ? "&" : "?";
    const { body, json } = await request(
      `${path}${separator}page=${page}`,
      fetchImpl,
    );
    const [current, values] = json;
    if (
      !current ||
      Number(current.page) !== page ||
      !Number.isInteger(Number(current.pages)) ||
      Number(current.pages) < page ||
      !Array.isArray(values)
    )
      throw new Error(`World Bank invalid pagination: ${path}`);
    if (
      metadata &&
      (Number(current.total) !== Number(metadata.total) ||
        current.lastupdated !== metadata.lastupdated)
    )
      throw new Error(
        "World Bank changed during pagination; refusing a mixed release.",
      );
    metadata ??= current;
    rows.push(...values);
    bodies.push(body);
    if (page === Number(current.pages)) break;
  }
  if (rows.length !== Number(metadata.total))
    throw new Error("World Bank incomplete page coverage.");
  return {
    rows,
    metadata,
    sourceHash: createHash("sha256").update(bodies.join("\n")).digest("hex"),
  };
}

export function countryRoster(rows) {
  const roster = rows
    .filter((row) => row.region?.id && row.region.id !== "NA")
    .map((row) => ({
      id: row.id,
      name: displayNames.get(row.id) || row.name,
      sourceName: row.name,
      region: row.region.value.trim(),
      incomeLevel: row.incomeLevel.value,
      lon:
        row.longitude?.trim() && Number.isFinite(Number(row.longitude))
          ? Number(row.longitude)
          : null,
      lat:
        row.latitude?.trim() && Number.isFinite(Number(row.latitude))
          ? Number(row.latitude)
          : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (new Set(roster.map(({ id }) => id)).size !== roster.length)
    throw new Error("Duplicate World Bank economy code.");
  return roster;
}

export function observationsFor(rows, countryCode, indicator, lastYear) {
  const values = new Map();
  for (const row of rows) {
    if (
      row.countryiso3code !== countryCode ||
      row.indicator?.id !== indicator ||
      !Number.isFinite(row.value) ||
      !/^\d{4}$/.test(row.date) ||
      Number(row.date) > lastYear ||
      row.obs_status === "F"
    )
      continue;
    const date = `${row.date}-12-31`;
    if (values.has(date))
      throw new Error(
        `Duplicate World Bank observation: ${countryCode}/${indicator}/${date}`,
      );
    values.set(date, row.value);
  }
  return [...values].sort(([a], [b]) => a.localeCompare(b));
}

export async function fetchWorldDevelopmentSeries({
  fetchImpl = globalThis.fetch,
  previousSeries = [],
  previousCountries = [],
  previousAudit = null,
} = {}) {
  let roster;
  const checkedAt = new Date().toISOString();
  const lastYear = Number(checkedAt.slice(0, 4)) - 1;
  let rosterRetained = false;
  try {
    roster = countryRoster(
      (await fetchPages(`${root}/country?format=json&per_page=400`, fetchImpl))
        .rows,
    );
    if (roster.length < 200)
      throw new Error("Unexpected World Bank economy coverage loss.");
  } catch (error) {
    if (previousCountries.length < 200) throw error;
    roster = previousCountries;
    rosterRetained = true;
  }
  const scopes = [
    ...roster,
    { id: "WLD", name: "World", region: "Global", incomeLevel: null },
  ];
  const output = [],
    audit = [],
    failures = [];
  let cursor = 0;
  async function worker() {
    while (cursor < indicators.length) {
      const [key, indicator, label, unit, changeType, category] =
        indicators[cursor++];
      const sourceDownloadUrl = `${root}/country/all/indicator/${indicator}?format=json&source=2&per_page=${pageSize}&date=1960:${lastYear}`;
      try {
        const [data, info] = await Promise.all([
          fetchPages(sourceDownloadUrl, fetchImpl),
          request(
            `${root}/indicator/${indicator}?format=json&source=2`,
            fetchImpl,
          ),
        ]);
        const definition = info.json[1]?.find(
          (row) => row.id === indicator && row.source?.id === "2",
        );
        if (!definition?.sourceNote || !definition.sourceOrganization)
          throw new Error(`Missing World Bank definition: ${indicator}`);
        const available = [];
        for (const economy of scopes) {
          const observations = observationsFor(
            data.rows,
            economy.id,
            indicator,
            lastYear,
          );
          if (!observations.length) continue;
          available.push(economy.id);
          output.push({
            id: `WDI_${economy.id}_${key}`,
            name: `${label} · ${economy.name}`,
            indicatorKey: key,
            indicatorName: label,
            sourceIndicator: indicator,
            category,
            frequency: "annual",
            releaseFrequency: "annual",
            unit,
            changeType,
            geography:
              economy.id === "WLD"
                ? "Global"
                : economy.id === "USA"
                  ? "US"
                  : economy.name,
            country: economy.id === "WLD" ? null : economy.name,
            countryCode: economy.id,
            region: economy.region,
            incomeLevel: economy.incomeLevel,
            source: "World Bank · World Development Indicators",
            sourceFamily: "World Development Indicators",
            sourceUrl: `https://data.worldbank.org/indicator/${indicator}`,
            sourceDownloadUrl,
            sourceColumn: `${economy.id} / ${indicator}`,
            sourceFile: "World Bank Indicators API v2",
            sourceHash: data.sourceHash,
            sourceDefinition: definition.sourceNote,
            sourceOrganization: definition.sourceOrganization,
            checkedAt,
            sourceAsOf: observations.at(-1)[0],
            providerUpdatedAt: data.metadata.lastupdated,
            historyType:
              key.includes("UNEMPLOYMENT") ||
              ["LFPR", "EMPLOYMENT_POP"].includes(key)
                ? "published modeled estimate"
                : "published observations",
            rightsNote:
              "World Bank WDI: CC BY 4.0 and additional World Bank terms; underlying organizations credited in sourceOrganization. https://data.worldbank.org/summary-terms-of-use. No endorsement implied.",
            availabilityNote:
              "Annual reference years; releases and revisions vary by economy and indicator. A daily retrieval does not create a daily economic reading.",
            methodology:
              "Published source values without interpolation, synthetic substitution, or forecast rows. December 31 labels the reference year, not the publication date. Missing/non-numeric values are omitted; even short valid histories are retained. World aggregates use the provider's aggregation, never an unweighted country average.",
            observations,
          });
        }
        if (available.length < 20)
          throw new Error(`Unexpectedly low indicator coverage: ${indicator}`);
        const priorCoverage = previousAudit?.indicators?.find(
          (entry) => entry.key === key,
        )?.available.length;
        if (
          priorCoverage &&
          available.length - Number(available.includes("WLD")) <
            priorCoverage * 0.9
        )
          throw new Error(
            `World Bank ${indicator}: economy coverage fell by more than 10%; retaining the verified release for review.`,
          );
        audit.push({
          key,
          indicator,
          label,
          category,
          unit,
          available: available.filter((id) => id !== "WLD"),
          providerUpdatedAt: data.metadata.lastupdated,
          checkedAt,
          status: "ok",
        });
        console.log(
          `WDI ${key}: ${available.filter((id) => id !== "WLD").length} economies.`,
        );
      } catch (error) {
        const cached = previousSeries.filter(
          (series) =>
            series.id.startsWith("WDI_") &&
            (series.indicatorKey === key ||
              (!series.indicatorKey && series.id.endsWith(`_${key}`))),
        );
        for (let i = output.length - 1; i >= 0; i--)
          if (output[i].sourceIndicator === indicator) output.splice(i, 1);
        if (!cached.length) throw error;
        output.push(
          ...cached.map((series) => ({
            ...series,
            refreshStatus: "upstream-unavailable",
          })),
        );
        failures.push(...cached.map(({ id }) => id));
        const prior = previousAudit?.indicators?.find(
          (entry) => entry.key === key,
        );
        audit.push({
          ...prior,
          key,
          indicator,
          label,
          category,
          unit,
          available: cached
            .map((series) => series.countryCode || series.id.split("_")[1])
            .filter((id) => id !== "WLD"),
          checkedAt: prior?.checkedAt || cached[0].checkedAt,
          status: "upstream-unavailable",
          error: error.message,
        });
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  output.sort((a, b) => a.id.localeCompare(b.id));
  const active = new Set(
    output.map((series) => series.countryCode || series.id.split("_")[1]),
  );
  const countries = roster
    .filter(({ id }) => active.has(id))
    .map((country) => {
      const series = output.filter(
        (entry) => (entry.countryCode || entry.id.split("_")[1]) === country.id,
      );
      return {
        ...country,
        seriesCount: series.length,
        headlineCount: series.filter((entry) =>
          ["INFLATION", "UNEMPLOYMENT", "GDPGROWTH", "GDPPC"].includes(
            entry.indicatorKey,
          ),
        ).length,
      };
    });
  return {
    series: output,
    countries,
    failures,
    audit: {
      checkedAt,
      rosterRetained,
      rosterCount: roster.length,
      countriesWithData: countries.length,
      indicators: audit.sort((a, b) => a.key.localeCompare(b.key)),
    },
  };
}
