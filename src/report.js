import { Chart, alignedDatasets, chartOptions, format, loadSnapshot, mountChrome, palette, periodChange, signed, sliceHorizon, yoyChange } from "./common.js";

async function main() {
const snapshot = await loadSnapshot();
mountChrome(snapshot, "report");
const byId = Object.fromEntries(snapshot.series.map((series) => [series.id, series]));
document.querySelector("#as-of").textContent = `Snapshot ${new Date(snapshot.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;

const headlines = [
  ["UNRATE", "Unemployment rate", "%", "Latest reading"],
  ["CPIAUCSL", "Consumer inflation", "% YoY", "12-month change", (series) => yoyChange(series.observations)],
  ["DGS10", "10-year Treasury", "%", "Latest yield"],
  ["PAYEMS", "Nonfarm payrolls", "% YoY", "12-month growth", (series) => yoyChange(series.observations)],
];
document.querySelector("#headline-metrics").innerHTML = headlines.map(([id, label, unit, note, calculate]) => {
  const series = byId[id]; const value = calculate ? calculate(series) : series.observations[series.observations.length - 1][1];
  return `<div class="headline-metric"><span class="metric-value">${format(value, unit.startsWith("%") ? "%" : "")}</span><span class="metric-label">${label}</span><span class="metric-delta">${note}</span></div>`;
}).join("");

const stories = [
  { ids: ["UNRATE", "JTSJOL"], horizon: 1825, title: "The labor market is cooler, not frozen.", copy: ([unrate, openings]) => `Unemployment is <span class="story-stat">${format(unrate.observations[unrate.observations.length - 1][1], "%")}</span>, while job openings have changed <span class="story-stat">${signed(periodChange(openings.observations, 1095))}%</span> over three years. Together they show hiring demand normalizing without the labor market breaking.`, measure: "indexed" },
  { ids: ["CPIAUCSL", "PCEPILFE"], horizon: 1825, title: "Inflation has slowed, but the last mile remains visible.", copy: ([cpi, corePce]) => `Headline CPI is running at <span class="story-stat">${format(yoyChange(cpi.observations), "%")}</span> year over year; core PCE is <span class="story-stat">${format(yoyChange(corePce.observations), "%")}</span>. The gap between progress and price stability still shapes the rate outlook.`, measure: "yoy" },
  { ids: ["GDPC1", "INDPRO"], horizon: 3650, title: "Output growth is broader than a single GDP print.", copy: ([gdp, production]) => `Real GDP has expanded <span class="story-stat">${signed(periodChange(gdp.observations, 1825))}%</span> over five years, while industrial production changed <span class="story-stat">${signed(periodChange(production.observations, 1825))}%</span>. The comparison separates economy-wide growth from the factory cycle.`, measure: "indexed" },
  { ids: ["FEDFUNDS", "DGS10", "DGS2"], horizon: 1825, title: "The yield curve records the policy handoff.", copy: ([fed, ten, two]) => `The policy rate stands at <span class="story-stat">${format(fed.observations[fed.observations.length - 1][1], "%")}</span>, versus <span class="story-stat">${format(two.observations[two.observations.length - 1][1], "%")}</span> at two years and <span class="story-stat">${format(ten.observations[ten.observations.length - 1][1], "%")}</span> at ten years. Their shape compresses the market’s growth and inflation expectations into one view.`, measure: "level" },
  { ids: ["HOUST", "PERMIT"], horizon: 3650, title: "Housing’s pipeline shows where supply may turn next.", copy: ([starts, permits]) => `Housing starts changed <span class="story-stat">${signed(periodChange(starts.observations, 365))}%</span> over one year, while building permits moved <span class="story-stat">${signed(periodChange(permits.observations, 365))}%</span>. Permits lead completed supply, so the gap is a useful read on construction momentum.`, measure: "indexed" },
  { ids: ["DCOILWTICO", "GASREGW"], horizon: 1095, title: "Energy shocks reach households with a lag.", copy: ([oil, gas]) => `WTI crude changed <span class="story-stat">${signed(periodChange(oil.observations, 365))}%</span> over the last year; regular gasoline changed <span class="story-stat">${signed(periodChange(gas.observations, 365))}%</span>. The two series move together, but refining, distribution, and timing keep them from matching perfectly.`, measure: "indexed" },
  { ids: ["NFCI", "STLFSI4"], horizon: 1825, title: "Financial conditions separate pressure from panic.", copy: ([conditions, stress]) => `The National Financial Conditions Index is <span class="story-stat">${format(conditions.observations[conditions.observations.length - 1][1])}</span>, while the St. Louis Fed stress index is <span class="story-stat">${format(stress.observations[stress.observations.length - 1][1])}</span>. Values below zero indicate conditions or stress below their historical averages.`, measure: "level" },
  { ids: ["USEHS", "USCONS", "USINFO"], horizon: 1825, title: "Sector hiring reveals an uneven expansion.", copy: ([health, construction, information]) => `Over one year, education and health payrolls grew <span class="story-stat">${signed(periodChange(health.observations, 365))}%</span>, construction changed <span class="story-stat">${signed(periodChange(construction.observations, 365))}%</span>, and information changed <span class="story-stat">${signed(periodChange(information.observations, 365))}%</span>. The aggregate labor market can look steady while its industry engines diverge.`, measure: "indexed" },
];

const container = document.querySelector("#report-sections");
for (const [index, story] of stories.entries()) {
  const seriesList = story.ids.map((id) => byId[id]);
  const article = document.createElement("article"); article.className = "report-story";
  article.innerHTML = `<div class="story-copy"><div class="story-number">0${index + 1}</div><h2>${story.title}</h2><p>${story.copy(seriesList)}</p></div><div class="story-chart"><canvas aria-label="${story.title}"></canvas></div>`;
  container.append(article);
  const points = seriesList.map((series) => {
    const visible = sliceHorizon(series.observations, story.horizon);
    if (story.measure === "level") return visible;
    if (story.measure === "yoy") return visible.flatMap(([date], cursor) => {
      const subset = series.observations.slice(0, series.observations.findIndex(([candidate]) => candidate === date) + 1);
      const value = yoyChange(subset); return Number.isFinite(value) ? [[date, value]] : [];
    });
    const base = visible[0][1]; return visible.map(([date, value]) => [date, value / base * 100]);
  });
  const data = alignedDatasets(seriesList, points);
  new Chart(article.querySelector("canvas"), { type: "line", data, options: chartOptions({ percent: story.measure === "yoy" }) });
}
}

main().catch((error) => {
  console.error(error);
  document.querySelector("#report-sections").innerHTML = `<p class="empty-state">${error.message}</p>`;
});
