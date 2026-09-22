import * as analytics from "./analytics.js";
import { Chart, registerables } from "chart.js";

const crosshair = {
  id: "simfolioCrosshair",
  afterDraw(chart) {
    const point = chart.tooltip?._active?.[0];
    if (!point) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(point.element.x, chartArea.top);
    ctx.lineTo(point.element.x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};
const emptyState = {
  id: "emptyState",
  afterDraw(chart) {
    const hasData = chart.data.datasets.some(({ data }) =>
      data.some((value) =>
        typeof value === "number"
          ? Number.isFinite(value)
          : value && Number.isFinite(value.x) && Number.isFinite(value.y),
      ),
    );
    if (hasData) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px Inter";
    ctx.textAlign = "center";
    ctx.fillText(
      "Insufficient observations in this window",
      (chartArea.left + chartArea.right) / 2,
      (chartArea.top + chartArea.bottom) / 2,
    );
    ctx.restore();
  },
};
Chart.register(...registerables, crosshair, emptyState);
Chart.defaults.color = "rgba(255,255,255,.9)";
Chart.defaults.borderColor = "rgba(255,255,255,.07)";
Chart.defaults.font.family = "Inter, system-ui, sans-serif";
Chart.defaults.animation.duration = 320;

export const palette = [
  "#22c55e",
  "#d1d5db",
  "#60a5fa",
  "#f59e0b",
  "#a78bfa",
  "#f472b6",
  "#2dd4bf",
  "#fb7185",
  "#84cc16",
  "#38bdf8",
  "#f97316",
  "#818cf8",
  "#06b6d4",
  "#e11d48",
  "#facc15",
  "#c084fc",
  "#14b8a6",
  "#f43f5e",
  "#0ea5e9",
  "#d97706",
];

export async function loadSnapshot() {
  const response = await fetch(
    `./data/snapshot.json?v=${__SNAPSHOT_VERSION__}`,
  );
  if (!response.ok) throw new Error("The data snapshot could not be loaded.");
  return response.json();
}

export function seriesKind(series) {
  return series.kind === "market" || series.source === "Yahoo Finance"
    ? "market"
    : "macro";
}

export function changeType(series) {
  return analytics.changeType(series);
}

export function changeSuffix(series) {
  return analytics.changeSuffix(series);
}

export function semanticChange(series, horizon = 365) {
  return analytics.change(series, horizon);
}

export function standardize(observations, reference = observations) {
  const values = reference.map(([, value]) => value).filter(Number.isFinite);
  if (values.length < 2) return [];
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  const deviation = Math.sqrt(variance);
  return deviation
    ? observations.map(([date, value]) => [date, (value - mean) / deviation])
    : [];
}

export function rollingChanges(series, horizon = "max") {
  return analytics
    .nativeChanges(series, horizon)
    .map(({ date, value }) => [date, value]);
}

export function mountChrome(snapshot, page) {
  const byId = new Map(snapshot.series.map((series) => [series.id, series]));
  const signal = (id, label, value, detail) => {
    const series = byId.get(id);
    if (!series) return "";
    return `<span class="tape-item" title="Observation ${series.observations.at(-1)[0]} · snapshot ${snapshot.generatedAt.slice(0, 10)}"><b>${label}</b><span>${value(series)}</span><small>${detail(series)} · ${series.observations.at(-1)[0]}</small></span>`;
  };
  const latest = (series) =>
    series.observations[series.observations.length - 1];
  const signals = [
    signal(
      "CPIAUCSL",
      "Consumer inflation",
      (series) => format(yoyChange(series.observations), "%"),
      () => "year over year",
    ),
    signal(
      "UNRATE",
      "Unemployment",
      (series) => format(latest(series)[1], "%"),
      () => "latest rate",
    ),
    signal(
      "PAYEMS",
      "Payroll growth",
      (series) => format(yoyChange(series.observations), "%"),
      () => "year over year",
    ),
    signal(
      "FEDFUNDS",
      "Effective fed funds",
      (series) => format(latest(series)[1], "%"),
      () => "monthly average",
    ),
    signal(
      "DGS10",
      "10-year Treasury",
      (series) => format(latest(series)[1], "%"),
      () => "latest yield",
    ),
    signal(
      "DTWEXBGS",
      "U.S. dollar",
      (series) => `${signed(yoyChange(series.observations))}%`,
      () => "year over year",
    ),
  ].filter(Boolean);
  const tape = signals.join("");
  document.querySelector("#site-header").innerHTML = `
    <header class="site-nav">
      <div class="nav-row">
        <a class="brand" href="./index.html" aria-label="MacroTrace report"><span class="brand-mark">M</span><span>MacroTrace</span></a>
        <button class="menu-button" type="button" aria-label="Open navigation" aria-expanded="false">Menu</button>
        <nav class="nav-links" aria-label="Primary navigation">
          <a href="./index.html" ${page === "report" ? 'aria-current="page"' : ""}>Report</a>
          <a href="./dashboard.html" ${page === "dashboard" ? 'aria-current="page"' : ""}>Dashboard</a>
          <a href="${page === "report" ? "#methodology" : "./index.html#methodology"}">Methodology</a>
          <a class="nav-cta" href="./dashboard.html">Open data</a>
        </nav>
      </div>
      <div class="pulse-tape" aria-label="Latest named economic readings"><div class="tape-track"><div class="tape-group">${tape}</div><div class="tape-group" aria-hidden="true">${tape}</div></div></div>
    </header>`;
  document.querySelector("#site-footer").innerHTML = `
    <footer class="site-footer"><div class="footer-row shell"><span>MacroTrace · Public economic data, made legible.</span><span>Built by Aidan Hutchison · Daily snapshots, not a live feed</span></div></footer>`;
  const button = document.querySelector(".menu-button");
  const links = document.querySelector(".nav-links");
  button.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    button.setAttribute("aria-expanded", String(open));
  });
}

export function sliceHorizon(observations, horizon) {
  return analytics.sliceHorizon(observations, horizon);
}

export function periodChange(observations, horizon = 365) {
  return analytics.change({ observations, changeType: "percent" }, horizon);
}

export function yoyChange(observations) {
  return analytics.change({ observations, changeType: "percent" }, "1y");
}

export function transform(observations, measure) {
  if (!observations.length) return [];
  if (measure === "level") return observations;
  if (measure === "indexed") {
    const base = observations[0][1];
    return observations.map(([date, value]) => [date, (value / base) * 100]);
  }
  if (measure === "change") {
    const base = observations[0][1];
    return observations.map(([date, value]) => [
      date,
      (value / base - 1) * 100,
    ]);
  }
  return observations.flatMap(([date, value], index) => {
    const target = new Date(date);
    target.setUTCFullYear(target.getUTCFullYear() - 1);
    let prior;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (new Date(observations[cursor][0]) <= target) {
        prior = observations[cursor][1];
        break;
      }
    }
    return prior && prior !== 0 ? [[date, (value / prior - 1) * 100]] : [];
  });
}

export function volatility(series, horizon) {
  return analytics.logVolatility(series, horizon);
}

export function changePercentile(series) {
  return analytics.percentileOfChanges(series);
}

export function maxDrawdown(series, horizon) {
  return analytics.maxDrawdown(series, horizon);
}

export function correlation(first, second, horizon = "max", mode = "percent") {
  return analytics.correlation(first, second, { horizon, mode });
}

export function chartOptions({
  percent = false,
  legend = true,
  logarithmic = false,
} = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        display: legend,
        position: "bottom",
        align: "start",
        onClick: (event, item, legendPlugin) => {
          const chart = legendPlugin.chart;
          const visible = chart.isDatasetVisible(item.datasetIndex);
          chart.setDatasetVisibility(item.datasetIndex, !visible);
          chart.update();
        },
        labels: {
          usePointStyle: true,
          pointStyle: "line",
          boxWidth: 18,
          padding: 16,
          color: "#cbd5e1",
        },
      },
      tooltip: {
        backgroundColor: "#0a0a0a",
        borderColor: "rgba(255,255,255,.12)",
        borderWidth: 1,
        cornerRadius: 12,
        padding: 14,
        titleColor: "rgba(255,255,255,.9)",
        bodyColor: "rgba(255,255,255,.9)",
        displayColors: true,
        callbacks: {
          label: (context) =>
            `${context.dataset.label}: ${format(context.chart.options.indexAxis === "y" ? context.parsed.x : context.parsed.y, percent ? "%" : "")}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxTicksLimit: 7, maxRotation: 0 },
      },
      y: {
        type: logarithmic ? "logarithmic" : "linear",
        grid: { color: "rgba(255,255,255,.07)" },
        ticks: {
          callback: (value) => (percent ? `${value}%` : compact(value)),
        },
      },
    },
  };
}

export function format(value, suffix = "") {
  if (!Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: Math.abs(value) < 10 ? 2 : 1 }).format(value)}${suffix}`;
}
export function compact(value) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
export function signed(value) {
  return `${value >= 0 ? "+" : ""}${format(value)}`;
}
export function changeClass(value) {
  return value >= 0 ? "positive" : "negative";
}
export { Chart };
