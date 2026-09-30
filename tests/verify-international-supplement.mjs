import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  fetchInternationalSupplement,
  finiteNumber,
  observationsFromRows,
} from "../scripts/international-supplement.mjs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

assert.equal(finiteNumber(null), null);
assert.equal(finiteNumber(undefined), null);
assert.equal(finiteNumber(""), null);
assert.equal(finiteNumber("  "), null);
assert.equal(finiteNumber(true), null);
assert.equal(finiteNumber(false), null);
assert.equal(finiteNumber("not-a-number"), null);
assert.equal(finiteNumber("0"), 0);
assert.equal(finiteNumber(0), 0);

assert.deepEqual(
  observationsFromRows(
    [
      { TIME_PERIOD: "2024", OBS_VALUE: "12" },
      { TIME_PERIOD: "2025", OBS_VALUE: "99", OBS_STATUS: "F" },
      { TIME_PERIOD: "2026", OBS_VALUE: "88", obs_status: "F" },
      { TIME_PERIOD: "2025", OBS_VALUE: "" },
      { TIME_PERIOD: "2026", OBS_VALUE: true },
    ],
    () => true,
    "OBS_VALUE",
    2025,
  ),
  { observations: [["2024-12-31", 12]], notes: {} },
  "missing, boolean, future, and forecast values are not observations",
);

function jsonResponse(value, headers = {}) {
  return new Response(JSON.stringify(value), { headers });
}

const unCountries = [
  { countryCode: 660, countryName: "Anguilla" },
  { countryCode: 184, countryName: "Cook Islands" },
  { countryCode: 500, countryName: "Montserrat" },
];
const unNames = new Map([
  [2, "GDP, at current prices - US Dollars"],
  [4, "GDP, at constant 2020 prices - US Dollars"],
  [5, "GDP, Per Capita GDP - US Dollars"],
  [43, "GDP, Per Capita GDP at constant 2020 prices - US Dollars"],
  [8, "GDP, Annual Rate of Growth - Percentage"],
]);
const unSeries = [...unNames].map(([serieCode, serieName]) => ({
  serieCode,
  serieName,
  unitMeasureType: serieCode === 8 ? "Percentage" : "US$",
}));

function unRows(serieCode) {
  return [
    {
      countryCode: 660,
      serieCode,
      fiscalYear: 2024,
      observationValue: serieCode === 8 ? "1.5" : "100",
    },
    ...(serieCode === 2
      ? [
          {
            countryCode: 660,
            serieCode,
            fiscalYear: 2025,
            observationValue: 999,
            OBS_STATUS: "F",
          },
        ]
      : []),
  ];
}

const spcCsv = [
  "FREQ,CURRENCY,GEO_PICT,INDICATOR,TIME_PERIOD,OBS_VALUE,UNIT_MEASURE,UNIT_MULT,OBS_STATUS,OBS_COMMENT",
  "A,USD,NU,GDPC,2024,123.4,USD,3,,Converted 0.5814 NZD/USD.",
  "A,USD,NU,GDPC,2025,999,USD,3,F,forecast row",
  "A,USD,NU,GDPC,2026,888,USD,3,,future row",
  "A,USD,NU,GDPC,2024,777,USD,6,,wrong multiplier",
  "M,USD,NU,GDPC,2024,666,USD,3,,wrong frequency",
  "A,EUR,NU,GDPC,2024,555,USD,3,,wrong currency",
  "A,USD,NU,GDPCPC,2024,12.3,USD_POP,,,",
  "A,USD,NU,GDPCVR,2024,2.1,PERCENT,,,",
  "A,USD,NU,GDPCPCVR,2024,1.7,PERCENT,,,",
].join("\n");

const IMF_WEO_PAGE = "https://data.imf.org/en/Datasets/WEO";
const IMF_WEO_DOWNLOAD = "https://data.imf.org/downloads/WEOTaiwanall.xlsx";
const IMF_INDICATORS = [
  [
    "NGDP_RPCH",
    "Gross domestic product (GDP), Constant prices",
    "Percent",
    "Units",
  ],
  [
    "NGDPD",
    "Gross domestic product (GDP), Current prices",
    "US dollar",
    "Billions",
  ],
  [
    "NGDPDPC",
    "Gross domestic product (GDP) per capita, Current prices",
    "US dollar",
    "Units",
  ],
  ["PCPIPCH", "Inflation, average consumer prices", "Percent", "Units"],
  ["LUR", "Unemployment rate", null, "Units"],
];

function imfWorkbook({ missingCutoff = false } = {}) {
  const rows = IMF_INDICATORS.map(
    ([indicator, description, unit, scale], index) => ({
      DATASET: "WEO",
      SERIES_CODE: `TWN.{${indicator}}.A`,
      "COUNTRY.ID": "TWN",
      COUNTRY: "Taiwan Province of China",
      "INDICATOR.ID": indicator,
      INDICATOR: description,
      "INDICATOR.Description": description,
      FREQUENCY: "Annual",
      SCALE: scale,
      UNIT: unit,
      UPDATE_DATE: "2026-04-15T13:00:00Z",
      PUBLICATION_DATE: "2026-04-14T13:00:00Z",
      LATEST_ACTUAL_ANNUAL_DATA:
        missingCutoff && index === IMF_INDICATORS.length - 1 ? null : 2025,
      CURRENCY: "National currency",
      2024: [5.267, 801.495, 34251.621, 2.181, 3.39][index],
      2025: [8.676, 920.05, 39488.575, 1.659, 3.35][index],
      2026: [5.181, 976.719, 42102.703, 1.527, 3.35][index],
    }),
  );
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Countries");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function mockFetch({
  emptySpc = false,
  emptyUn = false,
  failImfDiscovery = false,
  missingImfCutoff = false,
} = {}) {
  const workbook = imfWorkbook({ missingCutoff: missingImfCutoff });
  return async (requestUrl) => {
    const url = new URL(requestUrl);
    if (url.href === IMF_WEO_PAGE) {
      if (failImfDiscovery) throw new Error("mock WEO page unavailable");
      return new Response(
        `<html><a href="/downloads/WEOTaiwanall.xlsx">full WEO XLSX</a></html>`,
        { headers: { "content-type": "text/html" } },
      );
    }
    if (url.href === IMF_WEO_DOWNLOAD) return new Response(workbook);
    if (url.pathname.endsWith("/Country")) return jsonResponse(unCountries);
    if (url.pathname.endsWith("/Series")) return jsonResponse(unSeries);
    if (url.pathname.endsWith("/Data/lastupdated"))
      return jsonResponse("2026-09-01T00:00:00Z");
    if (url.pathname.includes("/Data/basic/")) {
      const serieCode = Number(url.pathname.split("/").at(-1));
      return jsonResponse(emptyUn ? [] : unRows(serieCode));
    }
    if (url.pathname.includes("/rest/dataflow/"))
      return new Response("<structure />", {
        headers: { "last-modified": "Wed, 30 Sep 2026 00:00:00 GMT" },
      });
    if (url.pathname.includes("/rest/data/"))
      return new Response(
        emptySpc
          ? "FREQ,CURRENCY,GEO_PICT,INDICATOR,TIME_PERIOD,OBS_VALUE,UNIT_MEASURE,UNIT_MULT\nA,USD,NU,GDPC,2024,1,USD,6\n"
          : spcCsv,
        { headers: { "content-type": "text/csv" } },
      );
    throw new Error(`unexpected mock URL: ${requestUrl}`);
  };
}

const checkedAt = new Date("2026-09-30T12:00:00Z");
const refreshed = await fetchInternationalSupplement({
  fetchImpl: mockFetch(),
  now: checkedAt,
});
const niueGdp = refreshed.series.find(({ id }) => id === "SPC_NIU_GDP_NOMINAL");
assert.deepEqual(niueGdp.observations, [["2024-12-31", 123.4]]);
assert.equal(niueGdp.unit, "thousands USD");
assert.equal(niueGdp.sourceUnit, "USD");
assert.equal(niueGdp.sourceUnitMultiplier, "3");
assert.equal(niueGdp.sourceCurrency, "USD");
assert.equal(niueGdp.sourceFrequency, "A");
assert.equal(
  niueGdp.observationNotes["2024-12-31"],
  "Converted 0.5814 NZD/USD.",
);
assert.equal(
  refreshed.series.find(({ id }) => id === "UN_AIA_GDP_NOMINAL").sourceAsOf,
  "2024-12-31",
  "UN forecast-marked 2025 row is excluded",
);
const imfGdp = refreshed.series.find(({ id }) => id === "IMF_TWN_GDP_NOMINAL");
assert.equal(imfGdp.unit, "USD billions");
assert.equal(imfGdp.sourceUnit, "US dollar");
assert.equal(imfGdp.sourceScale, "Billions");
assert.equal(imfGdp.actualCutoff, 2025);
assert.deepEqual(
  imfGdp.observations,
  [
    ["2024-12-31", 801.495],
    ["2025-12-31", 920.05],
  ],
  "IMF WEO projection year is excluded by the row cutoff",
);
assert.equal(
  refreshed.series.filter(({ id }) => id.startsWith("IMF_TWN_")).length,
  5,
);
assert.equal(refreshed.countries.find(({ id }) => id === "TWN").lon, 120.96);
assert.equal(
  refreshed.audit.providers.find(
    ({ provider }) => provider === "IMF World Economic Outlook",
  ).discoveryMethod,
  "official-page-html-link",
);

const missingCutoffRefresh = await fetchInternationalSupplement({
  fetchImpl: mockFetch({ missingImfCutoff: true }),
  now: checkedAt,
});
assert.equal(
  missingCutoffRefresh.series.some(({ id }) => id === "IMF_TWN_UNEMPLOYMENT"),
  false,
  "rows without an actual cutoff are excluded rather than treated as actual",
);
assert.equal(
  missingCutoffRefresh.audit.providers
    .find(({ provider }) => provider === "IMF World Economic Outlook")
    .series.find(({ sourceIndicator }) => sourceIndicator === "LUR").status,
  "excluded",
);

const cachedImf = {
  id: "IMF_TWN_GDP_NOMINAL",
  sourceIndicator: "NGDPD",
  country: "Taiwan",
  countryCode: "TWN",
  observations: [["2025-12-31", 920.05]],
};
const failedDiscoveryRefresh = await fetchInternationalSupplement({
  fetchImpl: mockFetch({ failImfDiscovery: true }),
  previousSeries: [cachedImf],
  now: checkedAt,
});
assert.deepEqual(
  failedDiscoveryRefresh.series.find(({ id }) => id === cachedImf.id),
  { ...cachedImf, refreshStatus: "upstream-unavailable" },
  "WEO discovery failure retains the last verified Taiwan history",
);
const failedImfAudit = failedDiscoveryRefresh.audit.providers.find(
  ({ provider }) => provider === "IMF World Economic Outlook",
);
assert.equal(failedImfAudit.status, "upstream-unavailable");
assert.equal(failedImfAudit.discoveryStatus, "failed");
assert.ok(failedDiscoveryRefresh.failures.includes("IMF_WEO"));

const cached = {
  id: "SPC_NIU_GDP_NOMINAL",
  sourceIndicator: "GDPC",
  country: "Niue",
  countryCode: "NIU",
  observations: [["2024-12-31", 123.4]],
};
const emptyRefresh = await fetchInternationalSupplement({
  fetchImpl: mockFetch({ emptySpc: true }),
  previousSeries: [cached],
  now: checkedAt,
});
assert.deepEqual(
  emptyRefresh.series.find(({ id }) => id === cached.id),
  { ...cached, refreshStatus: "upstream-unavailable" },
  "unexpectedly empty SPC data retains the previous history",
);
assert.ok(emptyRefresh.failures.includes("SPC_PDH"));
assert.equal(
  emptyRefresh.audit.providers.find(({ provider }) => provider === "SPC_PDH")
    .status,
  "upstream-unavailable",
);

const cachedUn = {
  id: "UN_AIA_GDP_NOMINAL",
  sourceIndicator: "2",
  country: "Anguilla",
  countryCode: "AIA",
  observations: [["2024-12-31", 100]],
};
const emptyUnRefresh = await fetchInternationalSupplement({
  fetchImpl: mockFetch({ emptyUn: true }),
  previousSeries: [cachedUn],
  now: checkedAt,
});
assert.deepEqual(
  emptyUnRefresh.series.find(({ id }) => id === cachedUn.id),
  { ...cachedUn, refreshStatus: "upstream-unavailable" },
  "unexpectedly empty UN indicator response retains the previous history",
);
assert.ok(emptyUnRefresh.failures.includes("UN_AMA_2"));

console.log("international supplement verification passed");
