import assert from "node:assert/strict";
import { createRequire } from "node:module";

import {
  ASUB_CPI_API,
  ASUB_GDP_API,
  CBS_BASE,
  CBS_CPI_TABLE,
  CBS_GDP_TABLE,
  INSEE_CATALOG_URL,
  INSEE_DATA_URL,
  INSEE_WORKBOOK_URL,
  JERSEY_GDP_URL,
  JERSEY_RPI_URL,
  fetchTerritoryData,
  parseAsubPxWeb,
  parseCbsTerritoryData,
  parseInseeRegionalWorkbook,
  parseInseeMelodi,
  parseJerseyGdpCsv,
  parseJerseyRpiCsv,
} from "../scripts/territory-data.mjs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const NOW = new Date("2024-09-30T12:00:00Z");

function response(value, { json = true } = {}) {
  return json
    ? new Response(JSON.stringify(value), {
        headers: { "content-type": "application/json" },
      })
    : new Response(value, {
        headers: { "content-type": "application/octet-stream" },
      });
}

function csv(value) {
  return new Response(value, { headers: { "content-type": "text/csv" } });
}

const jerseyGdp = [
  "Year,GDP,Average",
  "2021,6040.99505,6319.417064",
  "2022,6404.312607,6414.214148",
  "2023,6905.421667,6509.011232",
  "2024,9999,0",
].join("\n");

const jerseyRpi = [
  "Quarter,Year,Quarter reference date,RPI index numbers,RPI annual percentage change,RPIX index numbers,RPIX annual percentage change",
  "Mar,2021,2021-03-15,200,,,",
  "Mar,2022,2022-03-15,210,,,",
  "Mar,2023,2023-03-15,220,,,",
  "Mar,2024,2024-03-15,230,,,",
].join("\n");

function melodiDocument(sourceCode, prices) {
  const geo = {
    FRY1: "2024-OTHER-01_COMER978",
    FRY2: "2024-REG-02",
    FRY3: "2024-REG-03",
    FRY4: "2024-REG-04",
    FRY5: "2024-REG-06",
  }[sourceCode];
  return {
    identifier: "DS_COMPTES_REGIONAUX",
    observations: ["2020", "2021", "2022", "2023", "2024"].map(
      (year, index) => ({
        attributes: {
          OBS_STATUS_FR:
            Number(year) >= 2024 ? "PROV" : Number(year) >= 2022 ? "SD" : "D",
          UNIT_MULT: "6",
        },
        dimensions: {
          REF_AREA: sourceCode,
          GEO: geo,
          STO: "B1GQ",
          ACTIVITY: "_T",
          ACCOUNTING_ENTRY: "B",
          UNIT_MEASURE: "XDC",
          FREQ: "A",
          PRICES: prices,
          TIME_PERIOD: year,
        },
        measures: {
          OBS_VALUE_NIVEAU: {
            value: (prices === "V" ? 1000 : 900) + index * 100,
          },
        },
      }),
    ),
  };
}

const melodiDocuments = Object.fromEntries(
  ["FRY1", "FRY2", "FRY3", "FRY4", "FRY5"].map((code) => [
    code,
    {
      nominal: melodiDocument(code, "V"),
      real: melodiDocument(code, "L"),
    },
  ]),
);

function inseeWorkbook() {
  const years = [null, "1990", "2021", "2022", "2023", "2024"];
  const names = [
    "Guadeloupe (y compris Saint-Martin)",
    "Martinique",
    "Guyane",
    "La Réunion",
    "Mayotte",
  ];
  const rows = (base) => [
    [base, null, null, null, null, null],
    ["Unité : millions d’euros", null, null, null, null, null],
    [null, null, null, null, null, null],
    years,
    ...names.map((name, index) => [
      name,
      1000 + index,
      1100 + index,
      1200 + index,
      1300 + index,
      index === 4 ? null : 1400 + index,
    ]),
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Nom du fichier xlsx", "PIB_REG"],
      ["Date de création du fichier", "2026-03-11T14:46:23"],
    ]),
    "Métadonnées",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows("PIB en valeur (prix courants)")),
    "PIB en valeur",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows("PIB en volume (chaîné)")),
    "PIB en volume ",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

const asubGdpMeta = {
  title: "GDP",
  variables: [
    {
      code: "uppgift",
      values: ["lopande", "fasta"],
      valueTexts: ["Current prices", "Fixed prices"],
    },
    {
      code: "bransch",
      values: ["BNPMRK"],
      valueTexts: ["GDP AT MARKET PRICES"],
    },
    {
      code: "år",
      values: ["2021", "2022", "2023"],
      valueTexts: ["2021", "2022", "2023"],
    },
  ],
};

const asubCpiMeta = {
  title: "CPI",
  variables: [
    { code: "år", values: ["1986", "1987"], valueTexts: ["1986", "1987"] },
    { code: "månad", values: ["01", "02"], valueTexts: ["Jan", "Feb"] },
    { code: "indexserie", values: ["0_2015"], valueTexts: ["2015=100"] },
  ],
};

function jsonStat(id, size, dimensions, values) {
  return { class: "dataset", id, size, dimension: dimensions, value: values };
}

const asubGdpData = jsonStat(
  ["uppgift", "bransch", "år"],
  [2, 1, 3],
  {
    uppgift: { category: { index: { lopande: 0, fasta: 1 }, label: {} } },
    bransch: { category: { index: { BNPMRK: 0 }, label: {} } },
    år: { category: { index: { 2021: 0, 2022: 1, 2023: 2 }, label: {} } },
  },
  [100, 110, 120, 90, 95, 100],
);

const asubCpiData = jsonStat(
  ["år", "månad", "indexserie"],
  [2, 2, 1],
  {
    år: { category: { index: { 1986: 0, 1987: 1 }, label: {} } },
    månad: { category: { index: { "01": 0, "02": 1 }, label: {} } },
    indexserie: { category: { index: { "0_2015": 0 }, label: {} } },
  },
  [100, 101, 102, 103],
);

const cbsGdpData = {
  value: [
    {
      CaribischNederland: "GM9001",
      Perioden: "2021JJ00",
      BbpWaardeInWerkelijkePrijzen_1: 100,
      BbpWaardePrijsniveau2017_2: 100,
    },
    {
      CaribischNederland: "GM9001",
      Perioden: "2022JJ00",
      BbpWaardeInWerkelijkePrijzen_1: 110,
      BbpWaardePrijsniveau2017_2: 105,
    },
    {
      CaribischNederland: "GM9002",
      Perioden: "2021JJ00",
      BbpWaardeInWerkelijkePrijzen_1: 50,
      BbpWaardePrijsniveau2017_2: 50,
    },
    {
      CaribischNederland: "GM9002",
      Perioden: "2022JJ00",
      BbpWaardeInWerkelijkePrijzen_1: 55,
      BbpWaardePrijsniveau2017_2: 52,
    },
    {
      CaribischNederland: "GM9003",
      Perioden: "2021JJ00",
      BbpWaardeInWerkelijkePrijzen_1: 20,
      BbpWaardePrijsniveau2017_2: 20,
    },
    {
      CaribischNederland: "GM9003",
      Perioden: "2022JJ00",
      BbpWaardeInWerkelijkePrijzen_1: 21,
      BbpWaardePrijsniveau2017_2: 21,
    },
  ],
};
const cbsGdpIslands = {
  value: [
    { Key: "GM9001", Title: "Bonaire" },
    { Key: "GM9002", Title: "Sint Eustatius" },
    { Key: "GM9003", Title: "Saba" },
  ],
};
const cbsGdpPeriods = {
  value: [
    { Key: "2021JJ00", Status: "Definitief" },
    { Key: "2022JJ00", Status: "Definitief" },
  ],
};
const cbsGdpTable = { value: [{ Modified: "2025-09-25T15:30:00" }] };
const cbsCpiData = {
  value: [
    ...["GM9001", "GM9002", "GM9003"].flatMap((island, offset) => [
      {
        SpendingCategory: "T001112  ",
        CaribbeanNetherlands: island,
        Periods: "2021KW01",
        ConsumerPriceIndexCPI_1: 100 + offset,
      },
      {
        SpendingCategory: "T001112  ",
        CaribbeanNetherlands: island,
        Periods: "2022KW01",
        ConsumerPriceIndexCPI_1: 105 + offset,
      },
    ]),
  ],
};
const cbsCpiIslands = {
  value: [
    { Key: "GM9001", Title: "Bonaire" },
    { Key: "GM9002", Title: "St. Eustatius" },
    { Key: "GM9003", Title: "Saba" },
  ],
};
const cbsCpiPeriods = {
  value: [
    { Key: "2021KW01", Status: "Definitief" },
    { Key: "2022KW01", Status: "Voorlopig" },
  ],
};
const cbsCpiTable = { value: [{ Modified: "2026-09-23T15:30:00" }] };

const ckanJersey = {
  success: true,
  result: {
    metadata_modified: "2026-01-01T00:00:00Z",
    resources: [
      {
        name: "GDP in real terms in constant 2024 values",
        format: "CSV",
        url: "https://mock.test/jersey-gdp.csv",
        last_modified: "2026-01-01T00:00:00Z",
      },
    ],
  },
};
const ckanRpi = {
  success: true,
  result: {
    metadata_modified: "2026-01-01T00:00:00Z",
    resources: [
      {
        name: "Jersey RPI and RPIX percentage change and index numbers",
        format: "CSV",
        url: "https://mock.test/jersey-rpi.csv",
        last_modified: "2026-01-01T00:00:00Z",
      },
    ],
  },
};

function mockedFetch({ fail = null } = {}) {
  return async (requestUrl, options = {}) => {
    const url = String(requestUrl);
    if (fail && fail(url)) throw new Error(`mock unavailable: ${url}`);
    if (url.includes("package_show?id=national-accounts"))
      return response(ckanJersey);
    if (url.includes("package_show?id=rpi-rpi-x-rpi-y-rpi-pensioners"))
      return response(ckanRpi);
    if (url === "https://mock.test/jersey-gdp.csv") return csv(jerseyGdp);
    if (url === "https://mock.test/jersey-rpi.csv") return csv(jerseyRpi);
    if (url === JERSEY_GDP_URL) return csv(jerseyGdp);
    if (url === JERSEY_RPI_URL) return csv(jerseyRpi);
    if (url === INSEE_CATALOG_URL)
      return response({
        identifier: "DS_COMPTES_REGIONAUX",
        modified: "2026-03-13T15:24:04.690816822",
        relations: [
          {
            url: [
              {
                content: "https://www.insee.fr/fr/statistiques/8391986",
                lang: "fr",
              },
            ],
          },
        ],
        product: [{ modified: "2026-05-12T09:45:09.074297896" }],
      });
    if (url.startsWith(INSEE_DATA_URL)) {
      const query = new URL(url).searchParams;
      return response(
        melodiDocuments[query.get("REF_AREA")][
          query.get("PRICES") === "V" ? "nominal" : "real"
        ],
      );
    }
    if (url === "https://www.insee.fr/fr/statistiques/8391986")
      return response(
        '<a href="/fr/statistiques/fichier/999/PIB_REG_fr.xlsx">current</a>',
        { json: false },
      );
    if (
      url === INSEE_WORKBOOK_URL ||
      url === "https://www.insee.fr/fr/statistiques/fichier/999/PIB_REG_fr.xlsx"
    )
      return response(inseeWorkbook(), { json: false });
    if (url === ASUB_GDP_API && options.method === "POST")
      return response(asubGdpData);
    if (url === ASUB_CPI_API && options.method === "POST")
      return response(asubCpiData);
    if (url === ASUB_GDP_API) return response(asubGdpMeta);
    if (url === ASUB_CPI_API) return response(asubCpiMeta);
    if (url === `${CBS_BASE}/${CBS_GDP_TABLE}/TypedDataSet`)
      return response(cbsGdpData);
    if (url === `${CBS_BASE}/${CBS_GDP_TABLE}/CaribischNederland`)
      return response(cbsGdpIslands);
    if (url === `${CBS_BASE}/${CBS_GDP_TABLE}/Perioden`)
      return response(cbsGdpPeriods);
    if (url === `${CBS_BASE}/${CBS_GDP_TABLE}/TableInfos`)
      return response(cbsGdpTable);
    if (url === `${CBS_BASE}/${CBS_CPI_TABLE}/TypedDataSet`)
      return response(cbsCpiData);
    if (url === `${CBS_BASE}/${CBS_CPI_TABLE}/CaribbeanNetherlands`)
      return response(cbsCpiIslands);
    if (url === `${CBS_BASE}/${CBS_CPI_TABLE}/Periods`)
      return response(cbsCpiPeriods);
    if (url === `${CBS_BASE}/${CBS_CPI_TABLE}/TableInfos`)
      return response(cbsCpiTable);
    throw new Error(`unexpected mock URL ${url}`);
  };
}

const jerseySeries = parseJerseyGdpCsv(jerseyGdp, { now: NOW });
assert.deepEqual(jerseySeries[0].observations, [
  ["2021-12-31", 6040.99505],
  ["2022-12-31", 6404.312607],
  ["2023-12-31", 6905.421667],
]);
assert.equal(jerseySeries[1].observations.length, 2);
assert.throws(
  () => parseJerseyGdpCsv("Year,Wrong\n2023,1", { now: NOW }),
  /missing field GDP/,
);
const rpiSeries = parseJerseyRpiCsv(jerseyRpi, { now: NOW });
assert.equal(rpiSeries[0].observations.length, 4);
assert.equal(rpiSeries[1].observations.length, 3);
assert.ok(Math.abs(rpiSeries[1].observations[0][1] - 5) < 1e-12);
assert.equal(rpiSeries[1].observations[1][0], "2023-03-15");
assert.throws(
  () => parseJerseyRpiCsv("Quarter,Year\nMar,2023", { now: NOW }),
  /missing field/,
);

const inseeSeries = parseInseeRegionalWorkbook(inseeWorkbook(), { now: NOW });
assert.equal(inseeSeries.length, 15);
assert.equal(
  inseeSeries
    .filter((series) => series.countryCode === "MYT")[0]
    .observations.at(-1)[0],
  "2023-12-31",
);
assert.match(
  inseeSeries.find((series) => series.countryCode === "GLP").sourceDefinition,
  /includes Saint-Martin/,
);
assert.ok(
  inseeSeries
    .filter((series) => series.countryCode === "GLP")
    .every((series) => series.indicatorName.includes("incl. Saint-Martin")),
);
const invalidInseeWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  invalidInseeWorkbook,
  XLSX.utils.aoa_to_sheet([["only metadata"]]),
  "Métadonnées",
);
assert.throws(
  () =>
    parseInseeRegionalWorkbook(
      XLSX.write(invalidInseeWorkbook, { type: "buffer", bookType: "xlsx" }),
      { now: NOW },
    ),
  /INSEE workbook missing sheet/,
);
const melodiSeries = parseInseeMelodi(melodiDocuments, { now: NOW });
assert.equal(melodiSeries.length, 15);
assert.equal(
  melodiSeries
    .find((series) => series.id === "TERR_GLP_GDP_NOMINAL")
    .observations.at(-1)[0],
  "2023-12-31",
);
assert.equal(
  melodiSeries.find((series) => series.id === "TERR_GLP_GDP_NOMINAL")
    .observationStatus["2022-12-31"],
  "semi-definitive",
);
assert.equal(
  melodiSeries.find((series) => series.id === "TERR_GLP_GDP_NOMINAL")
    .latestStatus,
  "semi-definitive",
);
assert.ok(
  melodiSeries
    .filter((series) => series.countryCode === "GLP")
    .every((series) => series.indicatorName.includes("incl. Saint-Martin")),
);
assert.equal(
  melodiSeries
    .find((series) => series.id === "TERR_GLP_GDP_REAL")
    .observations.at(-1)[1],
  1200,
);
assert.match(
  melodiSeries.find((series) => series.id === "TERR_GLP_GDP_REAL")
    .sourceDownloadUrl,
  /REF_AREA=FRY1.*PRICES=L/,
);
const wrongMelodiUnit = structuredClone(melodiDocuments);
wrongMelodiUnit.FRY1.nominal.observations[0].attributes.UNIT_MULT = "3";
assert.throws(
  () => parseInseeMelodi(wrongMelodiUnit, { now: NOW }),
  /unexpected UNIT_MULT 3/,
);
assert.throws(
  () =>
    parseInseeMelodi(
      {
        FRY1: {
          nominal: { identifier: "bad" },
          real: melodiDocuments.FRY1.real,
        },
      },
      { now: NOW },
    ),
  /missing observations schema/,
);

const asubSeries = parseAsubPxWeb(
  {
    gdpMeta: asubGdpMeta,
    gdpData: asubGdpData,
    cpiMeta: asubCpiMeta,
    cpiData: asubCpiData,
  },
  { now: NOW },
);
assert.equal(asubSeries.length, 5);
assert.equal(
  asubSeries.find((series) => series.id === "TERR_ALA_GDP_GROWTH")
    .observations[0][1],
  5.555555555555558,
);
assert.equal(
  asubSeries.find((series) => series.id === "TERR_ALA_CPI_INFLATION")
    .observations[0][0],
  "1987-01-01",
);
assert.throws(
  () =>
    parseAsubPxWeb({
      gdpMeta: asubGdpMeta,
      gdpData: { ...asubGdpData, value: [] },
      cpiMeta: asubCpiMeta,
      cpiData: asubCpiData,
    }),
  /PxWeb/,
);

const cbsSeries = parseCbsTerritoryData(
  {
    gdpData: cbsGdpData,
    gdpIslands: cbsGdpIslands,
    gdpPeriods: cbsGdpPeriods,
    gdpTable: cbsGdpTable,
    cpiData: cbsCpiData,
    cpiIslands: cbsCpiIslands,
    cpiPeriods: cbsCpiPeriods,
    cpiTable: cbsCpiTable,
  },
  { now: NOW },
);
assert.equal(cbsSeries.length, 15);
assert.ok(
  Math.abs(
    cbsSeries.find((series) => series.id === "TERR_BES_GM9001_CPI_INFLATION")
      .observations[0][1] - 5,
  ) < 1e-12,
);
assert.equal(
  cbsSeries.find((series) => series.id === "TERR_BES_GM9001_CPI_INDEX")
    .observationStatus["2022-03-01"],
  "provisional",
);
for (const island of ["Bonaire", "Sint Eustatius", "Saba"]) {
  const islandSeries = cbsSeries.filter((series) =>
    series.name.includes(`· ${island} `),
  );
  assert.equal(islandSeries.length, 5);
  assert.ok(
    islandSeries.every((series) =>
      series.indicatorName.endsWith(`· ${island}`),
    ),
  );
}
assert.throws(
  () =>
    parseCbsTerritoryData({
      gdpData: { value: [] },
      gdpIslands: cbsGdpIslands,
      gdpPeriods: cbsGdpPeriods,
      gdpTable: cbsGdpTable,
      cpiData: cbsCpiData,
      cpiIslands: cbsCpiIslands,
      cpiPeriods: cbsCpiPeriods,
      cpiTable: cbsCpiTable,
    }),
  /CBS GDP missing/,
);

const fetched = await fetchTerritoryData({
  fetchImpl: mockedFetch(),
  now: NOW,
});
assert.equal(fetched.failures.length, 0);
assert.ok(
  fetched.series.every(
    (series) =>
      series.sourceOrganization && series.sourceDefinition && series.sourceHash,
  ),
  "every territorial series retains complete institutional provenance",
);
assert.deepEqual(
  new Set(fetched.countries.map((country) => country.id)),
  new Set(["JEY", "ALA", "GLP", "MTQ", "GUF", "REU", "MYT", "BES"]),
);
assert.equal(
  fetched.audit.providers.jersey.discovery.GDP,
  "current-CKAN-resource",
);
assert.equal(
  fetched.series.find((series) => series.id === "TERR_JEY_GDP_REAL").unit,
  "GBP million (constant 2024 prices)",
);

const previousSeries = [
  {
    id: "TERR_JEY_GDP_REAL",
    sourceFamily: "Government of Jersey Statistics",
    checkedAt: "2024-01-01T00:00:00.000Z",
    observations: [["2023-12-31", 1]],
  },
];
const fallback = await fetchTerritoryData({
  fetchImpl: mockedFetch({ fail: (url) => url.includes("package_show") }),
  previousSeries,
  previousCountries: [],
  now: NOW,
});
assert.equal(
  fallback.series.find((series) => series.id === "TERR_JEY_GDP_REAL")
    .refreshStatus,
  "upstream-unavailable",
);
assert.equal(
  fallback.series.find((series) => series.id === "TERR_JEY_GDP_REAL").checkedAt,
  "2024-01-01T00:00:00.000Z",
);
assert.ok(fallback.failures.includes("TERR_JEY_GDP_REAL"));
assert.deepEqual(
  fallback.series.find((series) => series.id === "TERR_JEY_GDP_REAL")
    .observations,
  previousSeries[0].observations,
  "a successful archived CSV must not overwrite the previously verified current-resource history",
);
assert.equal(fallback.audit.providers.jersey.status, "degraded");

console.log(
  `territory-data verification passed: ${fetched.series.length} mocked series across ${fetched.countries.length} territories`,
);
