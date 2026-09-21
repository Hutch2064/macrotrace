import { readFile } from "node:fs/promises";
import { historicalPercentile, maxDrawdown, volatility } from "../src/common.js";
import { presets } from "../src/presets.js";

const snapshot = JSON.parse(await readFile("public/data/snapshot.json", "utf8"));
const seriesById = new Map(snapshot.series.map((series) => [series.id, series]));

for (const preset of presets) {
  const size = (preset.series?.length ?? 0) + (preset.symbols?.length ?? 0);
  if (!size || size > 24) throw new Error(`${preset.id} must contain 1–24 series.`);
  for (const id of preset.series ?? []) if (!seriesById.has(id)) throw new Error(`${preset.id} references missing ${id}.`);
}

for (const [preset, rollup] of [["sectors", "SPY"], ["currencies", "DTWEXBGS"], ["commodities", "DBC"], ["macro", "CFNAI"], ["markets", "VT"]]) {
  const view = presets.find(({ id }) => id === preset);
  if (![...(view.series ?? []), ...(view.symbols ?? [])].includes(rollup)) throw new Error(`${preset} is missing roll-up ${rollup}.`);
}

const cpi = seriesById.get("CPIAUCSL");
const macro = presets.find(({ id }) => id === "macro").series.map((id) => seriesById.get(id));
const percentile = historicalPercentile(cpi, "yoy");
if (!(percentile > 0 && percentile < 100)) throw new Error(`CPI YoY percentile is not informative: ${percentile}.`);
if (!macro.some((series) => maxDrawdown(series, 365) < 0)) throw new Error("Macro drawdowns are empty.");
if (!macro.every((series) => volatility(series, 365) >= 0)) throw new Error("Macro volatility contains invalid values.");

console.log(`Verified ${presets.length} presets, roll-ups, percentiles, drawdowns, and volatility.`);
