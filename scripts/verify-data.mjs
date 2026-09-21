import { readFile } from "node:fs/promises";

const snapshot = JSON.parse(await readFile("public/data/snapshot.json", "utf8"));
if (snapshot.series.length < 40) throw new Error("Expected at least 40 series.");

const ids = new Set(snapshot.series.map(({ id }) => id));
for (const id of ["DEXUSAL", "DEXCAUS", "DEXSZUS", "DEXUSEU", "DEXUSUK", "DEXJPUS"]) {
  if (!ids.has(id)) throw new Error(`Missing reporting-currency series ${id}.`);
}

const longHistoryIds = ["FF_US_MARKET", "FF_LARGE_VALUE", "FF_LARGE_GROWTH", "FF_SMALL_VALUE", "HIST_SP500_TR", "HIST_TBOND10", "HIST_GOLD"];
for (const id of longHistoryIds) if (!ids.has(id)) throw new Error(`Missing long-history asset class ${id}.`);

for (const series of snapshot.series) {
  if (!series.id || !series.name || !series.category || !series.sourceUrl) {
    throw new Error(`Incomplete metadata for ${series.id ?? "unknown series"}.`);
  }
  if (series.observations.length < 24) throw new Error(`Too few observations for ${series.id}.`);
  if (series.category === "Long-History Asset Classes") {
    if (series.kind !== "market" || series.historyType !== "observed_public" || !series.assetClass || !series.dataRole || !series.sourceFile || !series.sourceColumn || !series.sourceAsOf || !series.dividendTreatment || !series.methodology || !/^[a-f0-9]{64}$/.test(series.sourceHash ?? "")) throw new Error(`Incomplete long-history provenance for ${series.id}.`);
    if (series.observations[0][0] > "1927-12-31") throw new Error(`${series.id} does not provide the promised long history.`);
  }
  let previous = "";
  for (const [date, value] of series.observations) {
    if (date <= previous) throw new Error(`${series.id} dates are not strictly increasing.`);
    if (!Number.isFinite(value)) throw new Error(`${series.id} has a non-finite value.`);
    previous = date;
  }
}

const byId = new Map(snapshot.series.map((series) => [series.id, series]));
if (Math.abs(byId.get("FF_US_MARKET").observations[1][1] - 103.11) > 1e-6) throw new Error("Fama–French market return reconstruction changed.");
if (Math.abs(byId.get("HIST_SP500_TR").observations[1][1] - 143.81) > 1e-6) throw new Error("Damodaran S&P 500 return reconstruction changed.");

console.log(`Verified ${snapshot.series.length} series through ${snapshot.generatedAt}.`);
