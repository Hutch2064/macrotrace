import {
  format,
  colorReadings,
  loadSnapshot,
  mountChrome,
  periodChange,
  signed,
  sliceHorizon,
  yoyChange,
} from "./common.js";
import { timeChart } from "./time-chart.js";
import { reportTitles } from "./report-readings.js";
import { rollingHorizonChanges } from "./analytics.js";
import { lazyChart } from "./lazy-chart.js";

const reportSeries = [
  "UNRATE",
  "CPIAUCSL",
  "DGS10",
  "PAYEMS",
  "JTSJOL",
  "PCEPILFE",
  "GDPC1",
  "INDPRO",
  "FEDFUNDS",
  "DGS2",
  "HOUST",
  "PERMIT",
  "DCOILWTICO",
  "GASREGW",
  "NFCI",
  "STLFSI4",
  "USEHS",
  "USCONS",
  "USINFO",
];

const reportCharts = [];
let chromeMounted = false;
async function main(updatedSnapshot) {
  const snapshot = updatedSnapshot || (await loadSnapshot(reportSeries));
  if (!chromeMounted) {
    mountChrome(snapshot, "report");
    chromeMounted = true;
  }
  reportCharts.splice(0).forEach((chart) => chart.destroy());
  const byId = Object.fromEntries(
    snapshot.series.map((series) => [series.id, series]),
  );
  document.querySelector("#as-of").textContent =
    `Snapshot ${new Date(snapshot.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;

  const headlines = [
    ["UNRATE", "Unemployment rate", "%", "Latest reading"],
    [
      "CPIAUCSL",
      "Consumer inflation",
      "% YoY",
      "12-month change",
      (series) => yoyChange(series.observations),
    ],
    ["DGS10", "10-year Treasury", "%", "Latest yield"],
    [
      "PAYEMS",
      "Nonfarm payrolls",
      "% YoY",
      "12-month growth",
      (series) => yoyChange(series.observations),
    ],
  ];
  document.querySelector("#headline-metrics").innerHTML = headlines
    .map(([id, label, unit, note, calculate]) => {
      const series = byId[id];
      const value = calculate
        ? calculate(series)
        : series.observations[series.observations.length - 1][1];
      return `<div class="headline-metric"><span class="metric-value">${format(value, unit.startsWith("%") ? "%" : "")}</span><span class="metric-label">${label}</span><span class="metric-delta">${note}</span></div>`;
    })
    .join("");

  const stories = [
    {
      ids: ["UNRATE", "JTSJOL"],
      horizon: 1825,
      copy: ([unrate, openings]) =>
        `Unemployment is <span class="story-stat">${format(unrate.observations[unrate.observations.length - 1][1], "%")}</span>, while job openings have changed <span class="story-stat">${signed(periodChange(openings.observations, 1095))}%</span> over three years. These measure different things: unemployment is a share of the labor force, while openings count unfilled positions. Indexed lines compare their relative paths, not their units or economic desirability.`,
      measure: "indexed",
    },
    {
      ids: ["CPIAUCSL", "PCEPILFE"],
      horizon: 1825,
      copy: ([cpi, corePce]) =>
        `Headline CPI is running at <span class="story-stat">${format(yoyChange(cpi.observations), "%")}</span> year over year; core PCE is <span class="story-stat">${format(yoyChange(corePce.observations), "%")}</span>. CPI covers consumer prices; core PCE excludes food and energy within a different consumption basket. Neither is a price-level reduction when its growth rate stays positive.`,
      measure: "yoy",
    },
    {
      ids: ["GDPC1", "INDPRO"],
      horizon: 3650,
      copy: ([gdp, production]) =>
        `Real GDP changed <span class="story-stat">${signed(periodChange(gdp.observations, 1825))}%</span> over five years, while industrial production changed <span class="story-stat">${signed(periodChange(production.observations, 1825))}%</span>. The comparison separates economy-wide growth from the factory cycle.`,
      measure: "indexed",
    },
    {
      ids: ["FEDFUNDS", "DGS10", "DGS2"],
      horizon: 1825,
      copy: ([fed, ten, two]) => {
        const twoByDate = new Map(two.observations);
        const common = ten.observations
          .filter(([date]) => twoByDate.has(date))
          .at(-1);
        const tenValue = common[1];
        const twoValue = twoByDate.get(common[0]);
        return `The monthly-average effective federal funds rate is <span class="story-stat">${format(fed.observations.at(-1)[1], "%")}</span>, versus <span class="story-stat">${format(twoValue, "%")}</span> at two years and <span class="story-stat">${format(tenValue, "%")}</span> at ten years. The 10Y–2Y slope is <span class="story-stat">${signed((tenValue - twoValue) * 100)} bp</span>, computed from the latest common Treasury observation date; the monthly federal funds average is a separate frequency.`;
      },
      measure: "level",
    },
    {
      ids: ["HOUST", "PERMIT"],
      horizon: 3650,
      copy: ([starts, permits]) =>
        `Housing starts changed <span class="story-stat">${signed(periodChange(starts.observations, 365))}%</span> over one year, while building permits moved <span class="story-stat">${signed(periodChange(permits.observations, 365))}%</span>. Both are seasonally adjusted annual rates in the source, not counts of homes completed in that month.`,
      measure: "indexed",
    },
    {
      ids: ["DCOILWTICO", "GASREGW"],
      horizon: 1095,
      copy: ([oil, gas]) =>
        `WTI crude changed <span class="story-stat">${signed(periodChange(oil.observations, 365))}%</span> over the last year; regular gasoline changed <span class="story-stat">${signed(periodChange(gas.observations, 365))}%</span>. Crude is quoted per barrel and gasoline per gallon. Rebasing highlights relative movements without equating these physical units or claiming causation.`,
      measure: "indexed",
    },
    {
      ids: ["NFCI", "STLFSI4"],
      horizon: 1825,
      copy: ([conditions, stress]) =>
        `The National Financial Conditions Index is <span class="story-stat">${format(conditions.observations[conditions.observations.length - 1][1])}</span>, while the St. Louis Fed stress index is <span class="story-stat">${format(stress.observations[stress.observations.length - 1][1])}</span>. Values below zero indicate conditions or stress below their historical averages.`,
      measure: "level",
    },
    {
      ids: ["USEHS", "USCONS", "USINFO"],
      horizon: 1825,
      copy: ([health, construction, information]) =>
        `Over one year, education and health payrolls changed <span class="story-stat">${signed(periodChange(health.observations, 365))}%</span>, construction changed <span class="story-stat">${signed(periodChange(construction.observations, 365))}%</span>, and information changed <span class="story-stat">${signed(periodChange(information.observations, 365))}%</span>. These are payroll counts by industry, not sector equity returns. Different growth rates reveal where employment is expanding or contracting.`,
      measure: "indexed",
    },
  ];

  const findingTitles = reportTitles(snapshot);
  const container = document.querySelector("#report-sections");
  container.replaceChildren();
  for (const [index, story] of stories.entries()) {
    const seriesList = story.ids.map((id) => byId[id]);
    const article = document.createElement("article");
    article.className = "report-story";
    const dates = seriesList.map((series) => series.observations.at(-1)[0]);

    const caption = `${seriesList.map((series) => series.id).join(" · ")} · ${story.measure === "indexed" ? "first visible observation = 100" : story.measure === "yoy" ? "year-over-year percent change" : "reported level"} · latest observations ${dates.join(" / ")} · FRED`;
    article.innerHTML = `<div class="story-copy"><h2>${findingTitles[index]}</h2><p>${story.copy(seriesList)}</p></div><figure class="story-chart"><div class="chart-wrap"></div><figcaption>${caption}</figcaption></figure>`;
    container.append(article);
    const points = seriesList.map((series) => {
      const visible = sliceHorizon(series.observations, story.horizon);
      if (story.measure === "level") return visible;
      if (story.measure === "yoy")
        return sliceHorizon(rollingHorizonChanges(series, "1y"), story.horizon);
      const base = visible[0][1];
      return visible.map(([date, value]) => [date, (value / base) * 100]);
    });
    reportCharts.push(
      lazyChart(article.querySelector(".chart-wrap"), () =>
        timeChart(article.querySelector(".chart-wrap"), seriesList, points, {
          suffix: story.measure === "yoy" ? "%" : "",
        }),
      ),
    );
  }
  colorReadings();
}

document.addEventListener("snapshot-updated", (event) => {
  void main(event.detail);
});
main().catch((error) => {
  console.error(error);
  document.querySelector("#report-sections").innerHTML =
    `<p class="empty-state">${error.message}</p>`;
});
