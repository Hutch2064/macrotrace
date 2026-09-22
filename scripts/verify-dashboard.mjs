import { readFile } from "node:fs/promises";
import {
  changePercentile,
  correlation,
  maxDrawdown,
  semanticChange,
  volatility,
} from "../src/common.js";
import { presets } from "../src/presets.js";

const snapshot = JSON.parse(
  await readFile("public/data/snapshot.json", "utf8"),
);
const seriesById = new Map(
  snapshot.series.map((series) => [series.id, series]),
);

for (const preset of presets) {
  const size = (preset.series?.length ?? 0) + (preset.symbols?.length ?? 0);
  if (!size || size > 24)
    throw new Error(`${preset.id} must contain 1–24 series.`);
  for (const id of preset.series ?? [])
    if (!seriesById.has(id))
      throw new Error(`${preset.id} references missing ${id}.`);
}

for (const [preset, rollup] of [
  ["sectors", "SPY"],
  ["currencies", "DTWEXBGS"],
  ["commodities", "DBC"],
  ["macro", "CFNAI"],
  ["markets", "VT"],
]) {
  const view = presets.find(({ id }) => id === preset);
  if (![...(view.series ?? []), ...(view.symbols ?? [])].includes(rollup))
    throw new Error(`${preset} is missing roll-up ${rollup}.`);
}

for (const [presetId, required] of [
  ["long-assets", ["HIST_SP500_TR", "HIST_TBOND10", "HIST_GOLD"]],
  ["style-history", ["FF_US_MARKET", "FF_LARGE_VALUE", "FF_SMALL_GROWTH"]],
]) {
  const preset = presets.find(({ id }) => id === presetId);
  if (
    preset?.horizon !== "max" ||
    !required.every((id) => preset.series.includes(id))
  ) {
    throw new Error(
      `${presetId} must open the required century-scale research series at maximum history.`,
    );
  }
}

const cpi = seriesById.get("CPIAUCSL");
const macro = presets
  .find(({ id }) => id === "macro")
  .series.map((id) => seriesById.get(id));
const percentile = changePercentile(cpi);
if (!(percentile > 0 && percentile < 100))
  throw new Error(`CPI YoY percentile is not informative: ${percentile}.`);

const signed = {
  category: "Growth",
  unit: "index",
  source: "FRED",
  frequency: "monthly",
  observations: [
    ["2024-01-01", 0.02],
    ["2025-01-01", -0.08],
  ],
};
const rate = {
  category: "Rates",
  unit: "%",
  source: "FRED",
  frequency: "monthly",
  observations: [
    ["2024-01-01", 4.3],
    ["2025-01-01", 3.6],
  ],
};
const price = {
  category: "Markets",
  unit: "$",
  source: "Yahoo Finance",
  frequency: "daily",
  observations: [
    ["2024-01-02", 100],
    ["2024-01-03", 120],
    ["2024-01-04", 90],
  ],
};
if (Math.abs(semanticChange(signed, "max") + 0.1) > 1e-9)
  throw new Error("Signed indexes must use point changes.");
if (Math.abs(semanticChange(rate, "max") + 70) > 1e-9)
  throw new Error("Rates must use basis-point changes.");
if (Math.abs(semanticChange(price, "max") + 10) > 1e-9)
  throw new Error("Prices must use percent returns.");
if (Math.abs(maxDrawdown(price, "max") + 25) > 1e-9)
  throw new Error("Market drawdown contract failed.");
if (!(volatility(price, "max") > 0))
  throw new Error("Market log-return volatility is empty.");
if (!Number.isNaN(correlation(signed, rate, "max", "auto")))
  throw new Error("Correlation should require at least three aligned changes.");

if (!presets.every(({ mode }) => ["macro", "markets"].includes(mode)))
  throw new Error("Every preset needs an analytical mode.");
console.log(
  `Verified ${presets.length} presets and macro/market semantic contracts.`,
);
