import {
  loadSnapshot,
  mountChrome,
  escapeHtml as escape,
  format,
  dateLabel,
  showError,
} from "./common.js";
import {
  REPORT_IDS,
  buildMacroReport,
  methodDefinitions,
} from "./macro-report.js";
import { timeChart } from "./time-chart.js";
import { lazyChart } from "./lazy-chart.js";
import { renderSourceCatalog } from "./source-catalog.js";
import { economicOrbit } from "./orbit.js";

const charts = [];
let mounted = false;
const orbit = economicOrbit(document.querySelector("#economic-orbit"));
window.addEventListener("pagehide", () => orbit.destroy(), { once: true });
async function render(updated) {
  const snapshot = updated || (await loadSnapshot(REPORT_IDS));
  const report = buildMacroReport(snapshot);
  if (!mounted) {
    mountChrome(snapshot, "report");
    mounted = true;
  }
  charts.splice(0).forEach((chart) => chart.destroy());
  document.querySelector("#as-of").textContent =
    "Snapshot " + dateLabel(snapshot.generatedAt);
  document.querySelector("#report-summary").textContent = report.summary;
  document.querySelector("#headline-metrics").innerHTML = report.headlines
    .map(
      (metric) =>
        `<div class="headline-metric"><span class="metric-label">${escape(metric.label)}</span><span class="metric-value">${format(metric.value)}<span class="metric-unit">${escape(metric.unit)}</span></span><span class="metric-date">${dateLabel(metric.date)}</span></div>`,
    )
    .join("");
  document.querySelector("#report-sections").innerHTML = report.findings
    .map(
      (finding) =>
        `<section class="report-section" id="${escape(finding.id)}"><div class="report-copy"><span class="report-topic">${escape(finding.topic || finding.series[0]?.category || "Economic signal")}</span><h2>${escape(finding.title)}</h2>${finding.paragraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`).join("")}<a class="source-link" href="./dashboard.html?topic=${encodeURIComponent(finding.topic || finding.series[0]?.category || "")}">Explore this topic ↗</a></div><div class="report-chart-frame"><div class="report-chart" id="chart-${escape(finding.id)}"></div><p class="report-chart-note">${escape(finding.note)}</p></div></section>`,
    )
    .join("");
  for (const finding of report.findings) {
    const host = document.getElementById("chart-" + finding.id);
    const latest = finding.points
      .flatMap((points) => points.at(-1)?.[0] || [])
      .sort()
      .at(-1);
    const cutoff = latest ? new Date(latest + "T00:00:00Z") : null;
    cutoff?.setUTCFullYear(cutoff.getUTCFullYear() - 5);
    const start = cutoff?.toISOString().slice(0, 10);
    const visiblePoints = finding.points.map((points) =>
      points.filter(([date]) => !start || date >= start),
    );
    host.nextElementSibling.textContent =
      "Last five years of available observations. " + finding.note;
    charts.push(
      lazyChart(host, () =>
        timeChart(host, finding.series, visiblePoints, {
          suffix: finding.suffix || "",
          signedValues: finding.signedValues || false,
        }),
      ),
    );
  }
  document.querySelector("#method-definitions").innerHTML = methodDefinitions
    .concat([
      {
        title: "Currency and housing normalization",
        definition:
          "Bilateral currencies are shown as USD per unit of foreign currency. FRED quotes in the opposite direction use 1 / source value; nonpositive inverse inputs are omitted. Trade-weighted dollar indexes keep their original index units. Shiller's housing indexes retain annual source rows before 1953 and average the twelve monthly rows of each complete year thereafter; incomplete years are omitted. Pink Sheet commodities keep published monthly averages and index definitions, not investment returns.",
      },
      {
        title: "Historical position",
        definition:
          "For the selected measure and period, percentile = 100 × (readings below the latest + (readings equal to the latest − 1) / 2) / (number of readings − 1). Ties receive their midrank; fewer than two comparable readings are unavailable.",
      },
      {
        title: "Direction and monthly panels",
        definition:
          "Direction groups count eligible latest values above, below or equal to zero, divided by the eligible indicator count in that group. This is not a weighted economic index. The heat map keeps the last actual reading in each month; it does not interpolate or create monthly observations.",
      },
    ])
    .map(
      (method) =>
        `<div class="method-definition"><h3>${escape(method.title)}</h3><p>${escape(method.definition)}</p></div>`,
    )
    .join("");
  renderSourceCatalog(snapshot);
}
document.addEventListener("snapshot-updated", (event) => {
  void render(event.detail).catch((error) =>
    showError(document.querySelector("#report-summary"), error),
  );
});
render().catch((error) =>
  showError(document.querySelector("#report-summary"), error),
);
