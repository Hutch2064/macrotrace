import { transformSeries } from "./panel.js";

export const countries = [
  { id: "USA", name: "United States", lon: -100, lat: 39 },
  { id: "CAN", name: "Canada", lon: -106, lat: 57 },
  { id: "GBR", name: "United Kingdom", lon: -3, lat: 55 },
  { id: "DEU", name: "Germany", lon: 10, lat: 51 },
  { id: "FRA", name: "France", lon: 2, lat: 47 },
  { id: "ITA", name: "Italy", lon: 12, lat: 43 },
  { id: "JPN", name: "Japan", lon: 138, lat: 37 },
  { id: "AUS", name: "Australia", lon: 134, lat: -25 },
  { id: "CHN", name: "China", lon: 104, lat: 35 },
  { id: "IND", name: "India", lon: 79, lat: 23 },
  { id: "BRA", name: "Brazil", lon: -52, lat: -12 },
  { id: "MEX", name: "Mexico", lon: -102, lat: 24 },
  { id: "KOR", name: "South Korea", lon: 128, lat: 36 },
  { id: "ZAF", name: "South Africa", lon: 25, lat: -29 },
  { id: "SAU", name: "Saudi Arabia", lon: 45, lat: 24 },
  { id: "IDN", name: "Indonesia", lon: 118, lat: -3 },
];

export const globeIds = countries.map(({ id }) => `WDI_${id}_GDPGROWTH`);
export function countryMomentum(snapshot) {
  const byId = new Map(snapshot.series.map((series) => [series.id, series]));
  return new Map(
    countries.map(({ id }) => {
      const series = byId.get(`WDI_${id}_GDPGROWTH`);
      const rows = (series?.observations || []).filter(([, value]) =>
        Number.isFinite(value),
      );
      const latest = rows.at(-1);
      const prior =
        latest &&
        new Map(rows).get(
          `${Number(latest[0].slice(0, 4)) - 1}${latest[0].slice(4)}`,
        );
      return [
        id,
        {
          value: latest?.[1] ?? null,
          year: latest?.[0].slice(0, 4) ?? null,
          change: latest && Number.isFinite(prior) ? latest[1] - prior : null,
          retained: series?.refreshStatus === "upstream-unavailable",
        },
      ];
    }),
  );
}

const national = [
  ["Headline CPI", "CPIAUCSL", "yoy", "% YoY"],
  ["Core PCE", "PCEPILFE", "yoy", "% YoY"],
  ["Unemployment rate", "UNRATE", "level", "%"],
  ["Real GDP growth", "GDPC1", "yoy", "% YoY"],
];
const annual = [
  ["Consumer price inflation", "INFLATION", "% annual"],
  ["Unemployment rate", "UNEMPLOYMENT", "%"],
  ["Real GDP growth", "GDPGROWTH", "% annual"],
  ["Real GDP per capita", "GDPPC", "USD · 2015 prices"],
];
export function countryIds(id) {
  return id === "USA"
    ? national.map(([, key]) => key)
    : annual.map(([, key]) => `WDI_${id}_${key}`);
}
export function countryReadout(snapshot, id) {
  const byId = new Map(snapshot.series.map((series) => [series.id, series]));
  const specs =
    id === "USA"
      ? national
      : annual.map(([label, key, unit]) => [
          label,
          `WDI_${id}_${key}`,
          "level",
          unit,
        ]);
  return specs.map(([label, key, measure, unit]) => {
    const series = byId.get(key);
    const points = series ? transformSeries(series, { measure }) : [];
    const point = points.filter(({ value }) => Number.isFinite(value)).at(-1);
    return {
      id: key,
      label,
      value: point?.value ?? null,
      unit,
      date: point?.date ?? null,
      source: series?.provider || series?.source,
      sourceUrl: series?.sourceUrl,
      frequency: series?.frequency,
      retained: series?.refreshStatus === "upstream-unavailable",
    };
  });
}
