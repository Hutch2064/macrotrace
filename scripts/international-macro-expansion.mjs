// Additional international macro histories validated against the FRED graph
// CSV endpoint on 2026-09-30.  The catalog is deliberately separate from the
// core and extended catalogs: it is a research-ready expansion set, not a
// silent replacement of an existing series.
//
// Tuple shape:
// [id, name, category, unit, frequency, transform, metadata]

const verificationDate = "2026-09-30";

const countries = Object.freeze({
  AT: { name: "Austria", iso3: "AUT" },
  BE: { name: "Belgium", iso3: "BEL" },
  BG: { name: "Bulgaria", iso3: "BGR" },
  CY: { name: "Cyprus", iso3: "CYP" },
  CZ: { name: "Czech Republic", iso3: "CZE" },
  DK: { name: "Denmark", iso3: "DNK" },
  EE: { name: "Estonia", iso3: "EST" },
  ES: { name: "Spain", iso3: "ESP" },
  FI: { name: "Finland", iso3: "FIN" },
  FR: { name: "France", iso3: "FRA" },
  GR: { name: "Greece", iso3: "GRC" },
  HR: { name: "Croatia", iso3: "HRV" },
  HU: { name: "Hungary", iso3: "HUN" },
  IE: { name: "Ireland", iso3: "IRL" },
  IL: { name: "Israel", iso3: "ISR" },
  IS: { name: "Iceland", iso3: "ISL" },
  IT: { name: "Italy", iso3: "ITA" },
  LT: { name: "Lithuania", iso3: "LTU" },
  LU: { name: "Luxembourg", iso3: "LUX" },
  LV: { name: "Latvia", iso3: "LVA" },
  MT: { name: "Malta", iso3: "MLT" },
  NL: { name: "Netherlands", iso3: "NLD" },
  NO: { name: "Norway", iso3: "NOR" },
  PL: { name: "Poland", iso3: "POL" },
  PT: { name: "Portugal", iso3: "PRT" },
  RO: { name: "Romania", iso3: "ROU" },
  SE: { name: "Sweden", iso3: "SWE" },
  SI: { name: "Slovenia", iso3: "SVN" },
  SK: { name: "Slovakia", iso3: "SVK" },
  TR: { name: "Turkey", iso3: "TUR" },
  AU: { name: "Australia", iso3: "AUS" },
  BR: { name: "Brazil", iso3: "BRA" },
  CA: { name: "Canada", iso3: "CAN" },
  CH: { name: "Switzerland", iso3: "CHE" },
  CN: { name: "China", iso3: "CHN" },
  DE: { name: "Germany", iso3: "DEU" },
  GB: { name: "United Kingdom", iso3: "GBR" },
  ID: { name: "Indonesia", iso3: "IDN" },
  IN: { name: "India", iso3: "IND" },
  JP: { name: "Japan", iso3: "JPN" },
  KR: { name: "South Korea", iso3: "KOR" },
  MX: { name: "Mexico", iso3: "MEX" },
  ZA: { name: "South Africa", iso3: "ZAF" },
});

const byIso3 = Object.freeze(
  Object.fromEntries(
    Object.values(countries).map((country) => [country.iso3, country]),
  ),
);

const EUROSTAT_RIGHTS =
  "Eurostat data are redistributed through FRED; retain Eurostat/FRED attribution and follow the current European Commission data terms.";
const OECD_RIGHTS =
  "OECD data are copyrighted and require citation; retain OECD/FRED attribution and review current OECD terms before redistribution.";

function verification(lastVerifiedObservation, observationCount = null) {
  return {
    validationDate: verificationDate,
    lastVerifiedObservation,
    ...(observationCount === null ? {} : { observationCount }),
  };
}

function countryMetadata(code, extra) {
  const country = countries[code];
  if (!country) throw new Error(`Unknown country code in expansion: ${code}`);
  return {
    countryCode: country.iso3,
    country: country.name,
    geography: country.name,
    ...extra,
  };
}

function tuple({ id, name, category, unit, frequency, metadata }) {
  return [id, name, category, unit, frequency, "identity", metadata];
}

const hicpCountries = [
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "GR",
  "HR",
  "HU",
  "IE",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
];

const hicpObservationCounts = {
  AT: 368,
  BE: 368,
  BG: 357,
  CY: 368,
  CZ: 368,
  DK: 368,
  EE: 368,
  FI: 368,
  GR: 368,
  HR: 345,
  HU: 368,
  IE: 368,
  LT: 368,
  LU: 368,
  LV: 368,
  MT: 368,
  NL: 368,
  PL: 368,
  PT: 368,
  RO: 368,
  SE: 368,
  SI: 368,
  SK: 357,
};

const hicpSeries = hicpCountries.map((code) => {
  const country = countries[code];
  return tuple({
    id: `CP0000${code}M086NEST`,
    name: `Harmonized Consumer Price Index · ${country.name}`,
    category: "International Inflation",
    unit: "index",
    frequency: "monthly",
    metadata: countryMetadata(code, {
      semantic: "index",
      changeType: "percent",
      publishedUnit: "Index 2025=100, Not Seasonally Adjusted",
      provider: "Eurostat",
      sourceFamily: "Eurostat HICP via FRED",
      methodology:
        "All-items Harmonized Index of Consumer Prices, published monthly by Eurostat as an index (2025=100), not seasonally adjusted; the series is not converted into a derived inflation rate.",
      rightsNote: EUROSTAT_RIGHTS,
      availabilityNote:
        "Current Eurostat HICP feed; monthly source observations through August 2026 were present in the FRED graph CSV response.",
      ...verification("2026-08-01", hicpObservationCounts[code]),
    }),
  });
});

const emergingCpiSeries = [
  [
    "IN",
    "CPALTT01INM659N",
    "Consumer Price Inflation (YoY) · India",
    "2025-03-01",
  ],
  [
    "CN",
    "CPALTT01CNM659N",
    "Consumer Price Inflation (YoY) · China",
    "2025-04-01",
  ],
].map(([code, id, name, latest]) =>
  tuple({
    id,
    name,
    category: "International Inflation",
    unit: "%",
    frequency: "monthly",
    metadata: countryMetadata(code, {
      semantic: "rate",
      changeType: "basis-points",
      publishedUnit:
        "Growth rate same period previous year, Not Seasonally Adjusted",
      provider: "Organization for Economic Co-operation and Development",
      sourceFamily: "OECD Main Economic Indicators via FRED",
      methodology:
        "All-items consumer-price inflation measured as the published rate of change from the same month one year earlier, not seasonally adjusted; no missing current observations are backfilled.",
      rightsNote: OECD_RIGHTS,
      historyStatus: "historical",
      archiveReason: `The FRED graph CSV remains populated but this OECD CPI feed currently ends at ${latest}; it is retained as a lagged historical context series, not represented as a current 2026 release.`,
      availabilityNote: `Lagged OECD CPI history; latest numeric FRED graph CSV observation verified at ${latest}.`,
      ...verification(latest),
    }),
  }),
);

const unemploymentCountries = [
  "AT",
  "BE",
  "CZ",
  "DK",
  "EE",
  "FI",
  "GR",
  "HU",
  "IE",
  "IL",
  "IS",
  "LU",
  "NL",
  "NO",
  "PL",
  "PT",
  "SE",
  "SI",
  "SK",
  "TR",
];

const unemploymentObservationCounts = {
  AT: 403,
  BE: 523,
  CZ: 403,
  DK: 523,
  EE: 355,
  FI: 463,
  GR: 340,
  HU: 367,
  IE: 523,
  IL: 175,
  IS: 283,
  LU: 523,
  NL: 523,
  NO: 451,
  PL: 355,
  PT: 523,
  SE: 523,
  SI: 367,
  SK: 343,
  TR: 259,
};

const unemploymentSeries = unemploymentCountries.map((code) => {
  const country = countries[code];
  return tuple({
    id: `LRHUTTTT${code}M156S`,
    name: `Harmonized Unemployment Rate · ${country.name}`,
    category: "International Labor",
    unit: "%",
    frequency: "monthly",
    metadata: countryMetadata(code, {
      semantic: "rate",
      changeType: "basis-points",
      publishedUnit: "Percent, Seasonally Adjusted",
      provider: "Organization for Economic Co-operation and Development",
      sourceFamily: "OECD Main Economic Indicators via FRED",
      methodology:
        "Monthly harmonized unemployment rate for all persons aged 15 years and over, seasonally adjusted, as published by the OECD; FRED values are retained without interpolation.",
      rightsNote: OECD_RIGHTS,
      availabilityNote:
        "Current OECD Main Economic Indicators feed; July 2026 is the latest numeric observation returned by FRED graph CSV for this family.",
      ...verification("2026-07-01", unemploymentObservationCounts[code]),
    }),
  });
});

const manufacturingCountries = [
  "AUT",
  "BEL",
  "CAN",
  "CZE",
  "DNK",
  "EST",
  "FIN",
  "FRA",
  "GBR",
  "GRC",
  "HUN",
  "IRL",
  "ISR",
  "ITA",
  "JPN",
  "KOR",
  "LUX",
  "MEX",
  "NLD",
  "NOR",
  "POL",
  "PRT",
  "SVN",
  "SWE",
  "TUR",
  "BRA",
  "IND",
  "ZAF",
];

const manufacturingLatest = {
  AUT: "2026-06-01",
  BEL: "2026-06-01",
  CAN: "2026-06-01",
  CZE: "2026-06-01",
  DNK: "2026-06-01",
  EST: "2026-07-01",
  FIN: "2026-06-01",
  FRA: "2026-06-01",
  GBR: "2026-06-01",
  GRC: "2026-06-01",
  HUN: "2026-06-01",
  IRL: "2025-11-01",
  ISR: "2026-06-01",
  ITA: "2026-06-01",
  JPN: "2026-06-01",
  KOR: "2026-07-01",
  LUX: "2026-06-01",
  MEX: "2026-06-01",
  NLD: "2026-06-01",
  NOR: "2026-06-01",
  POL: "2026-07-01",
  PRT: "2026-07-01",
  SVN: "2026-06-01",
  SWE: "2026-06-01",
  TUR: "2026-06-01",
  BRA: "2026-07-01",
  IND: "2026-06-01",
  ZAF: "2026-06-01",
};

const manufacturingSeries = manufacturingCountries.map((iso3) => {
  const country = byIso3[iso3];
  const latest = manufacturingLatest[iso3];
  return tuple({
    id: `${iso3}PRMNTO01GYSAM`,
    name: `Manufacturing Production Growth (YoY) · ${country.name}`,
    category: "International Growth",
    unit: "%",
    frequency: "monthly",
    metadata: countryMetadata(
      Object.entries(countries).find(([, value]) => value.iso3 === iso3)[0],
      {
        semantic: "rate",
        changeType: "basis-points",
        publishedUnit:
          "Growth rate same period previous year, Seasonally Adjusted",
        provider: "Organization for Economic Co-operation and Development",
        sourceFamily: "OECD Main Economic Indicators via FRED",
        methodology:
          "Manufacturing total production growth from the same month one year earlier, seasonally adjusted, as published by the OECD; this is a source growth-rate series, not a level reconstructed in MacroTrace.",
        rightsNote: OECD_RIGHTS,
        availabilityNote: `Current OECD manufacturing feed; latest numeric FRED graph CSV observation verified at ${latest}.`,
        ...verification(latest),
      },
    ),
  });
});

const retailCountries = [
  "AUT",
  "BEL",
  "CAN",
  "CZE",
  "DEU",
  "DNK",
  "ESP",
  "EST",
  "FIN",
  "FRA",
  "GBR",
  "GRC",
  "HUN",
  "ISR",
  "ITA",
  "JPN",
  "KOR",
  "LUX",
  "MEX",
  "NLD",
  "POL",
  "PRT",
  "SVK",
  "TUR",
  "BRA",
  "ZAF",
];

const retailLatest = {
  AUT: "2026-07-01",
  BEL: "2026-07-01",
  CAN: "2026-06-01",
  CZE: "2026-07-01",
  DEU: "2026-06-01",
  DNK: "2026-07-01",
  ESP: "2026-07-01",
  EST: "2026-07-01",
  FIN: "2026-07-01",
  FRA: "2026-07-01",
  GBR: "2026-07-01",
  GRC: "2026-06-01",
  HUN: "2026-07-01",
  ISR: "2026-06-01",
  ITA: "2026-07-01",
  JPN: "2026-06-01",
  KOR: "2026-07-01",
  LUX: "2026-07-01",
  MEX: "2026-06-01",
  NLD: "2026-07-01",
  POL: "2026-07-01",
  PRT: "2026-07-01",
  SVK: "2026-07-01",
  TUR: "2026-06-01",
  BRA: "2026-06-01",
  ZAF: "2026-06-01",
};

const retailSeries = retailCountries.map((iso3) => {
  const country = byIso3[iso3];
  const latest = retailLatest[iso3];
  return tuple({
    id: `${iso3}SLRTTO01GYSAM`,
    name: `Retail Trade Volume Growth (YoY) · ${country.name}`,
    category: "International Growth",
    unit: "%",
    frequency: "monthly",
    metadata: countryMetadata(
      Object.entries(countries).find(([, value]) => value.iso3 === iso3)[0],
      {
        semantic: "rate",
        changeType: "basis-points",
        publishedUnit:
          "Growth rate same period previous year, Seasonally Adjusted",
        provider: "Organization for Economic Co-operation and Development",
        sourceFamily: "OECD Main Economic Indicators via FRED",
        methodology:
          "Total retail-trade volume growth from the same month one year earlier, seasonally adjusted, as published by the OECD; the source measure is retained as a growth rate.",
        rightsNote: OECD_RIGHTS,
        availabilityNote: `Current OECD retail-volume feed; latest numeric FRED graph CSV observation verified at ${latest}.`,
        ...verification(latest),
      },
    ),
  });
});

const cliCountries = [
  "CAN",
  "DEU",
  "ESP",
  "FRA",
  "GBR",
  "ITA",
  "JPN",
  "KOR",
  "MEX",
  "TUR",
  "AUS",
  "BRA",
  "CHN",
  "IDN",
  "IND",
  "ZAF",
];

const cliSeries = cliCountries.map((iso3) => {
  const country = byIso3[iso3];
  return tuple({
    id: `${iso3}LOLITOAASTSAM`,
    name: `Composite Leading Indicator (Amplitude Adjusted) · ${country.name}`,
    category: "International Growth",
    unit: "index",
    frequency: "monthly",
    metadata: countryMetadata(
      Object.entries(countries).find(([, value]) => value.iso3 === iso3)[0],
      {
        semantic: "index",
        changeType: "percent",
        publishedUnit: "Index, Seasonally Adjusted",
        provider: "Organization for Economic Co-operation and Development",
        sourceFamily: "OECD Main Economic Indicators via FRED",
        methodology:
          "OECD composite leading indicator, amplitude adjusted and seasonally adjusted, published monthly as an index; it is a forward-looking cyclical indicator and not a GDP estimate.",
        rightsNote: OECD_RIGHTS,
        availabilityNote:
          "Current amplitude-adjusted OECD CLI feed; August 2026 is the latest numeric observation returned by FRED graph CSV for each retained country.",
        ...verification("2026-08-01"),
      },
    ),
  });
});

const confidenceCountries = [
  "AUT",
  "BEL",
  "CZE",
  "DEU",
  "DNK",
  "EST",
  "FIN",
  "FRA",
  "GBR",
  "GRC",
  "HUN",
  "IRL",
  "ITA",
  "JPN",
  "LUX",
  "MEX",
  "NLD",
  "POL",
  "PRT",
  "SVK",
  "SVN",
  "SWE",
  "TUR",
  "AUS",
  "BRA",
  "CHN",
];

const confidenceLatest = {
  AUT: "2026-08-01",
  BEL: "2026-08-01",
  CZE: "2026-08-01",
  DEU: "2026-08-01",
  DNK: "2026-08-01",
  EST: "2026-04-01",
  FIN: "2026-08-01",
  FRA: "2026-08-01",
  GBR: "2026-08-01",
  GRC: "2026-08-01",
  HUN: "2026-08-01",
  IRL: "2026-08-01",
  ITA: "2026-08-01",
  JPN: "2026-08-01",
  LUX: "2026-08-01",
  MEX: "2026-07-01",
  NLD: "2026-08-01",
  POL: "2026-04-01",
  PRT: "2026-08-01",
  SVK: "2026-08-01",
  SVN: "2026-08-01",
  SWE: "2026-08-01",
  TUR: "2026-08-01",
  AUS: "2026-08-01",
  BRA: "2026-08-01",
  CHN: "2026-07-01",
};

const confidenceSeries = confidenceCountries.map((iso3) => {
  const country = byIso3[iso3];
  const latest = confidenceLatest[iso3];
  return tuple({
    id: `CSCICP02${Object.entries(countries).find(([, value]) => value.iso3 === iso3)[0]}M460S`,
    name: `Composite Consumer Confidence · ${country.name}`,
    category: "International Growth",
    unit: "percentage balance",
    frequency: "monthly",
    metadata: countryMetadata(
      Object.entries(countries).find(([, value]) => value.iso3 === iso3)[0],
      {
        semantic: "balance",
        changeType: "points",
        publishedUnit: "Percentage balance, Seasonally Adjusted",
        provider: "Organization for Economic Co-operation and Development",
        sourceFamily: "OECD Main Economic Indicators via FRED",
        methodology:
          "OECD composite consumer-confidence balance, seasonally adjusted and published monthly; negative values indicate a balance of pessimistic responses, not a percentage share.",
        rightsNote: OECD_RIGHTS,
        availabilityNote: `Current OECD confidence feed; latest numeric FRED graph CSV observation verified at ${latest}.`,
        ...verification(latest),
      },
    ),
  });
});

const gdpCountries = [
  "AT",
  "BE",
  "CH",
  "CZ",
  "DK",
  "EE",
  "ES",
  "FI",
  "HU",
  "LU",
  "NL",
  "NO",
  "PL",
  "PT",
  "SE",
  "SI",
];

const gdpLatest = Object.fromEntries(
  gdpCountries.map((code) => [
    code,
    code === "LU" ? "2026-01-01" : "2026-04-01",
  ]),
);

const gdpSeries = gdpCountries.map((code) => {
  const country = countries[code];
  const latest = gdpLatest[code];
  return tuple({
    id: `CLVMNACSCAB1GQ${code}`,
    name: `Real Gross Domestic Product · ${country.name}`,
    category: "International Growth",
    unit: "millions chained 2010 euros",
    frequency: "quarterly",
    metadata: countryMetadata(code, {
      semantic: "quantity",
      changeType: "percent",
      publishedUnit: "Millions of Chained 2010 Euros, Seasonally Adjusted",
      provider: "Eurostat",
      sourceFamily: "Eurostat National Accounts via FRED",
      methodology:
        "Seasonally adjusted real GDP at quarterly frequency, Eurostat item B1GQ in millions of chained 2010 euros; the published level is retained and no country series are spliced.",
      rightsNote: EUROSTAT_RIGHTS,
      availabilityNote: `Current Eurostat national-accounts feed; latest numeric FRED graph CSV observation verified at ${latest}.`,
      ...verification(latest),
    }),
  });
});

export const additionalInternationalFredSeries = Object.freeze([
  ...hicpSeries,
  ...emergingCpiSeries,
  ...unemploymentSeries,
  ...manufacturingSeries,
  ...retailSeries,
  ...cliSeries,
  ...confidenceSeries,
  ...gdpSeries,
]);

export const internationalExpansionVerification = Object.freeze({
  verificationDate,
  seriesCount: additionalInternationalFredSeries.length,
  familyCounts: Object.freeze({
    hicp: hicpSeries.length,
    emergingCpi: emergingCpiSeries.length,
    harmonizedUnemployment: unemploymentSeries.length,
    manufacturingGrowth: manufacturingSeries.length,
    retailGrowth: retailSeries.length,
    leadingIndicators: cliSeries.length,
    consumerConfidence: confidenceSeries.length,
    quarterlyRealGdp: gdpSeries.length,
  }),
});
