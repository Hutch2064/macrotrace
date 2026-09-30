import { transformSeries } from "./panel.js";

const ANNUAL_KEYS = ["INFLATION", "UNEMPLOYMENT", "GDPGROWTH", "GDPPC"];
const NATIONAL = [
  ["Headline CPI", "CPIAUCSL", "yoy", "% YoY"],
  ["Core PCE", "PCEPILFE", "yoy", "% YoY"],
  ["Unemployment rate", "UNRATE", "level", "%"],
  ["Real GDP growth", "GDPC1", "yoy", "% YoY"],
];
const ANNUAL = [
  ["Consumer price inflation", "INFLATION", "% annual", "FP.CPI.TOTL.ZG"],
  ["Unemployment rate", "UNEMPLOYMENT", "%", "SL.UEM.TOTL.ZS"],
  ["Real GDP growth", "GDPGROWTH", "% annual", "NY.GDP.MKTP.KD.ZG"],
  ["Real GDP per capita", "GDPPC", "USD · 2015 prices", "NY.GDP.PCAP.KD"],
];
const SUPPLEMENT_PRIORITY = new Map([
  ["INFLATION", 0],
  ["UNEMPLOYMENT", 1],
  ["GDPGROWTH", 2],
  ["GDPPC", 3],
  ["GDPNOMINAL", 4],
  ["GDP", 5],
]);
const SUPPLEMENT_PLACEHOLDERS = [
  ["INFLATION", "Inflation", "% annual"],
  ["UNEMPLOYMENT", "Unemployment rate", "%"],
  ["GDPGROWTH", "GDP growth", "% annual"],
  ["GDPPC", "Real GDP per capita", "USD · reported"],
  ["GDPNOMINAL", "Nominal GDP", "USD · reported"],
  ["GDP", "Real GDP", "USD · reported"],
];

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function countOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizeCountry(country) {
  return {
    id: String(country?.id || "")
      .trim()
      .toUpperCase(),
    name: String(country?.name || country?.id || "").trim(),
    lon: finiteOrNull(country?.lon),
    lat: finiteOrNull(country?.lat),
    region: country?.region ?? null,
    incomeLevel: country?.incomeLevel ?? null,
    sourceFamily: country?.sourceFamily ?? null,
    seriesCount: countOrZero(country?.seriesCount),
    headlineCount: countOrZero(country?.headlineCount),
  };
}

function countryCodeForSeries(series) {
  const explicit = String(series?.countryCode || "")
    .trim()
    .toUpperCase();
  if (explicit) return explicit;
  return String(series?.id || "").match(/^[^_]+_([A-Z0-9]{3})_/)?.[1] || null;
}

function indicatorKeyForSeries(series) {
  const explicit = String(series?.indicatorKey || "")
    .trim()
    .toUpperCase();
  if (explicit) return explicit;
  const match = String(series?.id || "").match(/^[^_]+_[A-Z0-9]{3}_(.+)$/);
  return match?.[1]?.toUpperCase() || "";
}

function isWorldBankSeries(series) {
  const id = String(series?.id || "");
  const source = `${series?.sourceFamily || ""} ${series?.source || ""}`;
  return (
    id.startsWith("WDI_") ||
    /world bank|world development indicators/i.test(source)
  );
}

function isWorldBankCountry(country) {
  return (
    !country?.sourceFamily ||
    /world bank|world development/i.test(country.sourceFamily)
  );
}

function hasSeriesValue(series) {
  return (
    (Array.isArray(series?.observations) &&
      series.observations.some(([, value]) =>
        Number.isFinite(finiteOrNull(value)),
      )) ||
    Number.isFinite(finiteOrNull(series?.coverage?.latest?.[1]))
  );
}

// The catalog owns the roster. The fallback keeps older snapshots readable by
// deriving the same roster shape from their WDI series metadata.
export function countriesFor(snapshot = {}) {
  if (Array.isArray(snapshot.countries) && snapshot.countries.length)
    return snapshot.countries
      .map(normalizeCountry)
      .filter((country) => country.id && country.id !== "WLD");

  const derived = new Map();
  for (const series of snapshot.series || []) {
    const id = countryCodeForSeries(series);
    if (!id || id === "WLD") continue;
    const country =
      derived.get(id) ||
      normalizeCountry({
        id,
        name: series.country || id,
        sourceFamily: isWorldBankSeries(series) ? null : series.sourceFamily,
      });
    country.seriesCount += 1;
    if (!country.sourceFamily && !isWorldBankSeries(series))
      country.sourceFamily = series.sourceFamily || series.source;
    derived.set(id, country);
  }
  return [...derived.values()];
}

function pointFromCoverage(point) {
  return Array.isArray(point) && point.length >= 2
    ? {
        date: typeof point[0] === "string" ? point[0] : null,
        value: finiteOrNull(point[1]),
      }
    : null;
}

function latestPoint(series, measure) {
  if (Array.isArray(series?.observations) && series.observations.length) {
    const point = transformSeries(series, { measure })
      .filter(({ value }) => Number.isFinite(value))
      .at(-1);
    if (point) return point;
  }
  // Annual WDI readouts use native levels. Catalog metadata is deliberately
  // sufficient for the country selector; no history fetch is needed here.
  if (measure !== "level") return null;
  const latest = pointFromCoverage(series?.coverage?.latest);
  return latest ? { date: latest.date, value: latest.value } : null;
}

function hasActualCountryData(country, series) {
  return (
    countOrZero(country.seriesCount) > 0 ||
    countOrZero(country.headlineCount) > 0 ||
    series.some(hasSeriesValue)
  );
}

export function countryMomentum(snapshot, roster = countriesFor(snapshot)) {
  const byCountry = new Map();
  for (const series of snapshot.series || []) {
    const country = countryCodeForSeries(series);
    if (country) {
      const list = byCountry.get(country);
      if (list) list.push(series);
      else byCountry.set(country, [series]);
    }
  }
  return new Map(
    roster.map((country) => {
      const actualSeries = byCountry.get(country.id) || [];
      const growthSeries = actualSeries
        .filter((series) => indicatorKeyForSeries(series) === "GDPGROWTH")
        .sort(
          (left, right) =>
            Number(isWorldBankSeries(right)) - Number(isWorldBankSeries(left)),
        );
      const series = growthSeries[0];
      const observations = Array.isArray(series?.observations)
        ? series.observations
            .map(([date, value]) => ({ date, value: finiteOrNull(value) }))
            .filter(
              ({ date, value }) =>
                typeof date === "string" && Number.isFinite(value),
            )
        : [];
      const latest = observations.at(-1);
      const latestCoverage = pointFromCoverage(series?.coverage?.latest);
      const previousCoverage = pointFromCoverage(
        series?.coverage?.previousYear,
      );
      const latestPoint = latest ? latest : latestCoverage;
      const prior = latest
        ? observations.find(
            ({ date }) =>
              date.slice(0, 4) === String(Number(latest.date.slice(0, 4)) - 1),
          )
        : latestCoverage &&
            previousCoverage &&
            previousCoverage.date?.slice(0, 4) ===
              String(Number(latestCoverage.date?.slice(0, 4)) - 1)
          ? previousCoverage
          : null;
      const metadata = metadataForSeries(
        snapshot,
        series,
        series?.metadataKey,
        isWorldBankSeries(series),
      );
      return [
        country.id,
        {
          available: hasActualCountryData(country, actualSeries),
          value: latestPoint?.value ?? null,
          year: latestPoint?.date?.slice(0, 4) ?? null,
          change:
            latestPoint &&
            prior &&
            Number.isFinite(latestPoint.value) &&
            Number.isFinite(prior.value)
              ? latestPoint.value - prior.value
              : null,
          retained: series?.refreshStatus === "upstream-unavailable",
          source: metadata.source,
          sourceFamily: metadata.sourceFamily,
          sourceUrl: metadata.sourceUrl,
        },
      ];
    }),
  );
}

export function countryIds(id, snapshot) {
  if (id === "USA") return NATIONAL.map(([, key]) => key);
  if (!snapshot || !countriesFor(snapshot).some((country) => country.id === id))
    return [];
  return ANNUAL_KEYS.map((key) => `WDI_${id}_${key}`);
}

function seriesForCountry(snapshot, id) {
  return (snapshot.series || []).filter(
    (series) => countryCodeForSeries(series) === id,
  );
}

function metadataForSeries(snapshot, series, metadataKey, worldBank = false) {
  const template =
    snapshot.metadataTemplates?.[series?.metadataKey || metadataKey] || {};
  return {
    source:
      series?.provider ||
      series?.source ||
      (worldBank
        ? template.source || "World Bank · World Development Indicators"
        : undefined),
    sourceFamily:
      series?.sourceFamily ||
      template.sourceFamily ||
      (worldBank ? "World Development Indicators" : undefined),
    sourceUrl:
      series?.sourceUrl ||
      template.sourceUrl ||
      (worldBank && metadataKey
        ? `https://data.worldbank.org/indicator/${metadataKey}`
        : undefined),
    frequency: series?.frequency || template.frequency || "annual",
  };
}

function readoutForSeries(
  snapshot,
  series,
  { id, label, unit, metadataKey, metricKey },
  country,
  worldBank = false,
) {
  const point = series ? latestPoint(series, "level") : null;
  const metadata = metadataForSeries(snapshot, series, metadataKey, worldBank);
  return {
    id: series?.id || id,
    label: series?.indicatorName || label,
    value: point?.value ?? null,
    unit: series?.unit || unit,
    date: point?.date ?? null,
    source: metadata.source || country?.sourceFamily,
    sourceFamily: metadata.sourceFamily || country?.sourceFamily,
    sourceUrl: metadata.sourceUrl,
    frequency: metadata.frequency,
    metricKey: metricKey || indicatorKeyForSeries(series),
    retained: series?.refreshStatus === "upstream-unavailable",
    unavailable: !series || !point,
  };
}

function supplementalReadouts(snapshot, country, seriesList) {
  const hasRealIncome = seriesList.some(
    (series) =>
      indicatorKeyForSeries(series) === "GDPPC" && hasSeriesValue(series),
  );
  const rankFor = (key) =>
    !hasRealIncome && key === "GDPPC_NOMINAL"
      ? 3
      : (SUPPLEMENT_PRIORITY.get(key) ?? 6);
  const available = seriesList
    .filter((series) => !isWorldBankSeries(series) && hasSeriesValue(series))
    .sort((left, right) => {
      const leftKey = indicatorKeyForSeries(left);
      const rightKey = indicatorKeyForSeries(right);
      const rank = rankFor(leftKey) - rankFor(rightKey);
      if (rank) return rank;
      return (
        Number(right.sourceFamily === country.sourceFamily) -
        Number(left.sourceFamily === country.sourceFamily)
      );
    });
  const selected = [];
  const seen = new Set();
  for (const series of available) {
    const metricKey = indicatorKeyForSeries(series);
    if (seen.has(metricKey)) continue;
    seen.add(metricKey);
    selected.push(
      readoutForSeries(
        snapshot,
        series,
        {
          id: series.id,
          label: series.indicatorName || series.name || metricKey,
          unit: series.unit || "reported",
          metricKey,
        },
        country,
      ),
    );
    if (selected.length === 4) return selected;
  }
  for (const [metricKey, label, unit] of SUPPLEMENT_PLACEHOLDERS) {
    if (selected.length === 4) break;
    if (seen.has(metricKey)) continue;
    seen.add(metricKey);
    selected.push({
      id: `unavailable:${country.id}:${metricKey}`,
      label: `${label} · unavailable`,
      value: null,
      unit,
      date: null,
      source: country.sourceFamily || "Official annual source",
      sourceFamily: country.sourceFamily || "Official annual source",
      sourceUrl: undefined,
      frequency: "annual",
      metricKey,
      retained: false,
      unavailable: true,
    });
  }
  return selected;
}

export function countryReadout(snapshot, id) {
  const country = countriesFor(snapshot).find((item) => item.id === id);
  const countrySeries = seriesForCountry(snapshot, id);
  if (country && !isWorldBankCountry(country))
    return supplementalReadouts(snapshot, country, countrySeries);

  const byId = new Map(countrySeries.map((series) => [series.id, series]));
  const specs =
    id === "USA"
      ? NATIONAL.map(([label, key, measure, unit]) => ({
          id: key,
          label,
          measure,
          unit,
        }))
      : ANNUAL.map(([label, key, unit, metadataKey]) => ({
          id: `WDI_${id}_${key}`,
          label,
          unit,
          metadataKey,
          metricKey: key,
        }));
  return specs.map((spec) => {
    const series =
      byId.get(spec.id) || snapshot.series?.find((item) => item.id === spec.id);
    if (id === "USA") {
      const point = series ? latestPoint(series, spec.measure) : null;
      const metadata = metadataForSeries(snapshot, series, null, false);
      return {
        id: spec.id,
        label: spec.label,
        value: point?.value ?? null,
        unit: spec.unit,
        date: point?.date ?? null,
        source: metadata.source,
        sourceFamily: metadata.sourceFamily,
        sourceUrl: metadata.sourceUrl,
        frequency: metadata.frequency,
        metricKey: spec.id,
        retained: series?.refreshStatus === "upstream-unavailable",
        unavailable: !series || !point,
      };
    }
    return readoutForSeries(snapshot, series, spec, country, true);
  });
}
