import { readFile } from "node:fs/promises";
import { marketSeries } from "./market-catalog.mjs";

const snapshot = JSON.parse(
  await readFile("public/data/snapshot.json", "utf8"),
);
const version = JSON.parse(await readFile("public/data/version.json", "utf8"));
if (version.generatedAt !== snapshot.generatedAt)
  throw new Error("Version manifest does not match the data snapshot.");
if (snapshot.series.length < 40)
  throw new Error("Expected at least 40 series.");

const ids = new Set(snapshot.series.map(({ id }) => id));
const marketIds = new Set(marketSeries.map(({ id }) => id));
if (marketIds.size !== marketSeries.length)
  throw new Error("Market catalog contains duplicate identifiers.");
for (const id of marketIds)
  if (!ids.has(id)) throw new Error(`Missing daily market series ${id}.`);

for (const id of [
  "DEXUSAL",
  "DEXCAUS",
  "DEXSZUS",
  "DEXUSEU",
  "DEXUSUK",
  "DEXJPUS",
]) {
  if (!ids.has(id)) throw new Error(`Missing reporting-currency series ${id}.`);
}

const longHistoryIds = [
  "FF_US_MARKET",
  "FF_LARGE_VALUE",
  "FF_LARGE_GROWTH",
  "FF_SMALL_VALUE",
  "HIST_SP500_TR",
  "HIST_TBOND10",
  "HIST_GOLD",
];
for (const id of longHistoryIds)
  if (!ids.has(id)) throw new Error(`Missing long-history asset class ${id}.`);

for (const series of snapshot.series) {
  if (!series.id || !series.name || !series.category || !series.sourceUrl) {
    throw new Error(
      `Incomplete metadata for ${series.id ?? "unknown series"}.`,
    );
  }
  if (series.observations.length < 24)
    throw new Error(`Too few observations for ${series.id}.`);
  if (series.category === "Long-History Asset Classes") {
    if (
      series.kind !== "market" ||
      series.historyType !== "observed_public" ||
      !series.assetClass ||
      !series.dataRole ||
      !series.sourceFile ||
      !series.sourceColumn ||
      !series.sourceAsOf ||
      !series.dividendTreatment ||
      !series.methodology ||
      !/^[a-f0-9]{64}$/.test(series.sourceHash ?? "")
    )
      throw new Error(`Incomplete long-history provenance for ${series.id}.`);
    const requiredStart =
      series.expectedStart ||
      (/^FF_(DEVELOPED|EUROPE|JAPAN|ASIAPAC)/.test(series.id)
        ? "1990-12-31"
        : "1927-12-31");
    if (series.observations[0][0] > requiredStart)
      throw new Error(
        `${series.id} does not provide the promised long history.`,
      );
    if (
      series.expectedStart &&
      (series.coverageStart !== series.expectedStart ||
        series.observations[1]?.[0] !== series.expectedStart)
    )
      throw new Error(
        `${series.id} does not begin with the independently specified first source return.`,
      );
    if (series.dataset === "french-damodaran") {
      const baseline = series.id.startsWith("HIST_")
        ? "1927-12-31"
        : /^FF_(DEVELOPED|EUROPE|JAPAN|ASIAPAC)/.test(series.id)
          ? "1990-06-30"
          : "1926-06-30";
      if (series.observations[0][0] !== baseline)
        throw new Error(`${series.id} lost its promised historical baseline.`);
    }
  }
  let previous = "";
  for (const [date, value] of series.observations) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new Error(`${series.id} has an invalid calendar date: ${date}.`);
    if (date > snapshot.generatedAt.slice(0, 10))
      throw new Error(
        `${series.id} contains a future-dated observation: ${date}.`,
      );
    if (date <= previous)
      throw new Error(`${series.id} dates are not strictly increasing.`);
    if (!Number.isFinite(value))
      throw new Error(`${series.id} has a non-finite value.`);
    previous = date;
  }
}

const byId = new Map(snapshot.series.map((series) => [series.id, series]));
for (const spec of marketSeries) {
  const series = byId.get(spec.id);
  if (
    series.kind !== "market" ||
    series.frequency !== "daily" ||
    series.name !== spec.name ||
    series.category !== spec.category ||
    series.provider !== "Yahoo Finance" ||
    series.source !== "Yahoo Finance" ||
    series.sourceUrl !== spec.sourceUrl ||
    series.instrumentType !== spec.instrumentType ||
    series.marketRole !== spec.marketRole ||
    series.unit !== spec.unit
  )
    throw new Error(`Incomplete Yahoo benchmark metadata for ${spec.id}.`);
  if (!/^\w+_close$/.test(series.valueType ?? ""))
    throw new Error(`Missing Yahoo close value type for ${spec.id}.`);
}
if (Math.abs(byId.get("FF_US_MARKET").observations[1][1] - 103.11) > 1e-6)
  throw new Error("Fama–French market return reconstruction changed.");
if (Math.abs(byId.get("HIST_SP500_TR").observations[1][1] - 143.81) > 1e-6)
  throw new Error("Damodaran S&P 500 return reconstruction changed.");

console.log(
  `Verified ${snapshot.series.length} series through ${snapshot.generatedAt}.`,
);
