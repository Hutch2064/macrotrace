import assert from "node:assert/strict";
import XLSX from "xlsx";
import {
  IMF_INDICATORS,
  IMF_WEO_PAGE_URL,
  discoveredImfDownloads,
  fetchImfMacro,
  parseImfWEO,
} from "../scripts/imf-macro.mjs";

const checkedAt = "2026-09-30T00:00:00.000Z";
const countries = [
  {
    id: "USA",
    name: "United States",
    region: "North America",
    lon: -100,
    lat: 40,
  },
  { id: "DEU", name: "Germany", region: "Europe", lon: 10, lat: 51 },
];

function fixtureRows() {
  const rows = [];
  for (const countryCode of ["USA", "DEU"]) {
    for (const [index, indicator] of IMF_INDICATORS.entries()) {
      const percent = indicator.sourceUnit === "Percent";
      const cutoff = percent && indicator.category === "Fiscal" ? 2024 : 2025;
      const row = {
        DATASET: "IMF.RES:WEO(9.0.0)",
        SERIES_CODE: `${countryCode}.${indicator.sourceIndicator}.A`,
        "COUNTRY.ID": countryCode,
        COUNTRY: countryCode === "USA" ? "United States" : "Germany",
        "INDICATOR.ID": indicator.sourceIndicator,
        INDICATOR: indicator.indicatorName,
        "INDICATOR.Description": `Official definition for ${indicator.sourceIndicator}`,
        FREQUENCY: "Annual",
        SCALE: indicator.sourceScale,
        UNIT: indicator.sourceUnit,
        UPDATE_DATE: "2026-04-15T13:00:00Z",
        PUBLICATION_DATE: "2026-04-14T13:00:00Z",
        LATEST_ACTUAL_ANNUAL_DATA: cutoff,
        HISTORICAL_DATA_SOURCE: "National statistical office",
        2023: ["GGXCNL", "GGXCNL_NGDP"].includes(indicator.sourceIndicator)
          ? -3.5
          : index % 2
            ? -3.5
            : 100 + index,
        2024: index === 17 ? -12.5 : index === 18 ? -1.25 : 101 + index,
        2025: 102 + index,
        2026: 999999,
      };
      rows.push(row);
    }
  }
  // A source null is not a zero: it must disappear without removing the row.
  const nominalPerCapita = rows.find(
    (row) => row["COUNTRY.ID"] === "USA" && row["INDICATOR.ID"] === "NGDPDPC",
  );
  nominalPerCapita[2024] = null;
  // A unit change is not silently normalized.
  rows.push({
    ...rows.find(
      (row) => row["COUNTRY.ID"] === "USA" && row["INDICATOR.ID"] === "NGDPD",
    ),
    SERIES_CODE: "USA.NGDPD.WRONG_UNIT.A",
    UNIT: "Euro",
  });
  // Duplicate source key at an alternate native scale: canonical WEO
  // Billions must win deterministically without converting the value.
  rows.push({
    ...rows.find(
      (row) => row["COUNTRY.ID"] === "USA" && row["INDICATOR.ID"] === "NGDPD",
    ),
    SERIES_CODE: "USA.NGDPD.MILLIONS",
    SCALE: "Millions",
    2023: 999999,
  });
  // A missing latest-actual cutoff cannot admit observations.
  rows.push({
    ...rows.find(
      (row) =>
        row["COUNTRY.ID"] === "USA" && row["INDICATOR.ID"] === "GGXWDN_NGDP",
    ),
    SERIES_CODE: "USA.GGXWDN_NGDP.NO_CUTOFF",
    LATEST_ACTUAL_ANNUAL_DATA: null,
  });
  return rows;
}

const rows = fixtureRows();
const parsed = parseImfWEO(rows, {
  countries,
  checkedAt,
  lastYear: 2025,
  sourceDownloadUrl: "https://data.imf.org/fixture/WEOApr2026all.xlsx",
  providerSnapshotHash: "snapshot-hash",
  sourcePageHash: "page-hash",
  discoveryMethod: "fixture",
});

assert.equal(parsed.length, IMF_INDICATORS.length * countries.length);
assert.ok(parsed.every((series) => series.dataset === "imf-macro"));
assert.ok(
  parsed.every((series) => series.providerSnapshotHash === "snapshot-hash"),
);
assert.ok(
  parsed.every((series) =>
    series.sourceDownloadUrl.includes("WEOApr2026all.xlsx"),
  ),
);
assert.ok(
  parsed.every((series) =>
    series.sourceDefinition.startsWith("Official definition"),
  ),
);
assert.ok(
  parsed.every((series) =>
    series.observations.every(([date]) => date.endsWith("-12-31")),
  ),
);
assert.ok(
  parsed.every((series) =>
    series.observations.every(([date]) => date <= "2025-12-31"),
  ),
);
assert.ok(
  parsed.every((series) =>
    series.observations.every(([, value]) => Number.isFinite(value)),
  ),
);

const fiscal = parsed.find(
  (series) =>
    series.countryCode === "USA" && series.sourceIndicator === "GGXCNL_NGDP",
);
assert.deepEqual(fiscal.observations, [
  ["2023-12-31", -3.5],
  ["2024-12-31", -1.25],
]);
assert.equal(fiscal.actualCutoff, 2024);
assert.equal(fiscal.unit, "% of GDP");

const balanceLevel = parsed.find(
  (series) =>
    series.countryCode === "USA" && series.sourceIndicator === "GGXCNL",
);
assert.equal(
  balanceLevel.observations[0][1],
  -3.5,
  "signed published levels are unchanged",
);
assert.equal(balanceLevel.sourceScale, "Billions");
assert.equal(balanceLevel.sourceUnit, "Domestic currency");
const nominalGdp = parsed.find(
  (series) =>
    series.countryCode === "USA" && series.sourceIndicator === "NGDPD",
);
assert.equal(nominalGdp.sourceScale, "Billions");
assert.equal(
  nominalGdp.observations.find(([date]) => date === "2023-12-31")[1],
  102,
);

const nullSeries = parsed.find(
  (series) =>
    series.countryCode === "USA" && series.sourceIndicator === "NGDPDPC",
);
assert.deepEqual(
  nullSeries.observations.map(([date]) => date),
  ["2023-12-31", "2025-12-31"],
  "null observations are omitted while later actual observations remain",
);
assert.equal(
  parsed.some(
    (series) =>
      series.sourceIndicator === "NGDPD" && series.sourceUnit === "Euro",
  ),
  false,
  "wrong native units are excluded",
);
assert.ok(
  !parsed.some(
    (series) =>
      series.countryCode === "USA" &&
      series.sourceIndicator === "GGXWDN_NGDP" &&
      series.actualCutoff === null,
  ),
  "missing actual cutoffs are excluded",
);
assert.equal(
  parsed.some((series) =>
    series.observations.some(([date]) => date === "2026-12-31"),
  ),
  false,
  "forecast years are excluded",
);

const millionSeries = parseImfWEO(
  [
    {
      ...rows.find(
        (row) => row["COUNTRY.ID"] === "USA" && row["INDICATOR.ID"] === "NGDPD",
      ),
      SCALE: "Millions",
    },
  ],
  {
    countries: [{ id: "USA", name: "United States" }],
    checkedAt,
    lastYear: 2025,
    providerSnapshotHash: "million-hash",
  },
);
assert.equal(millionSeries[0].sourceScale, "Millions");
assert.equal(millionSeries[0].unit, "USD millions");

const discovered = discoveredImfDownloads(
  `<a href="/downloads/WEOOct2025all.xlsx">old</a><a href="/-/media/iData/WEOApr2026all.xlsx">new</a>`,
);
assert.equal(
  discovered[0],
  "https://data.imf.org/-/media/iData/WEOApr2026all.xlsx",
);
assert.equal(discovered.length, 2);

const workbook = XLSX.write(
  {
    Sheets: { Countries: XLSX.utils.json_to_sheet(rows) },
    SheetNames: ["Countries"],
  },
  { type: "buffer", bookType: "xlsx" },
);
let calls = [];
const fetched = await fetchImfMacro({
  countries,
  now: new Date(checkedAt),
  fetchImpl: async (url) => {
    calls.push(url);
    if (url === IMF_WEO_PAGE_URL)
      return new Response(
        '<a href="https://data.imf.org/fixture/WEOApr2026all.xlsx">WEO</a>',
        { status: 200 },
      );
    return new Response(workbook, { status: 200 });
  },
});
assert.equal(fetched.length, parsed.length);
assert.deepEqual(calls, [
  IMF_WEO_PAGE_URL,
  "https://data.imf.org/fixture/WEOApr2026all.xlsx",
]);

const oldCheckedAt = "2025-01-01T00:00:00.000Z";
const retained = await fetchImfMacro({
  previousSeries: fetched.map((series) => ({
    ...series,
    checkedAt: oldCheckedAt,
  })),
  countries,
  now: new Date(checkedAt),
  fetchImpl: async () => {
    throw new Error("fixture outage");
  },
});
assert.equal(retained.length, fetched.length);
assert.ok(retained.every((series) => series.checkedAt === oldCheckedAt));
assert.ok(
  retained.every((series) => series.refreshStatus === "upstream-unavailable"),
);

const malformedRetained = await fetchImfMacro({
  previousSeries: fetched.map((series) => ({
    ...series,
    checkedAt: oldCheckedAt,
  })),
  countries,
  now: new Date(checkedAt),
  fetchImpl: async (url) =>
    url === IMF_WEO_PAGE_URL
      ? new Response(
          '<a href="https://data.imf.org/fixture/WEOApr2026all.xlsx">WEO</a>',
          { status: 200 },
        )
      : new Response("not an xlsx", { status: 200 }),
});
assert.ok(
  malformedRetained.every((series) => series.checkedAt === oldCheckedAt),
);

await assert.rejects(
  () =>
    fetchImfMacro({
      countries,
      fetchImpl: async () => {
        throw new Error("first import outage");
      },
    }),
  /IMF WEO provider failed on first import/,
);

if (process.argv.includes("--live")) {
  const liveCountries = [
    { id: "USA", name: "United States" },
    { id: "DEU", name: "Germany" },
    { id: "BRA", name: "Brazil" },
  ];
  const live = await fetchImfMacro({ countries: liveCountries });
  assert.ok(live.length, "live IMF WEO run returned series");
  assert.equal(
    new Set(live.map(({ id }) => id)).size,
    live.length,
    "live source-key selection emits one deterministic row per series id",
  );
  assert.ok(live.every((series) => series.dataset === "imf-macro"));
  assert.ok(live.every((series) => series.observations.length));
  assert.ok(
    live.every((series) =>
      series.observations.every(([date]) => date.endsWith("-12-31")),
    ),
  );
  const sample = live
    .slice(0, 8)
    .map(
      ({ countryCode, sourceIndicator, actualCutoff, sourceAsOf }) =>
        `${countryCode}/${sourceIndicator}: cutoff=${actualCutoff}, last=${sourceAsOf}`,
    )
    .join("; ");
  console.log(`IMF WEO live check: ${live.length} series; ${sample}`);
}

console.log(
  "Verified IMF WEO discovery, full-country parsing, actual cutoffs, forecast exclusion, null/unit handling, signed levels, and retained cache freshness.",
);
