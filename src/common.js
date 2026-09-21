import { Chart, registerables } from "chart.js";

const crosshair = { id: "simfolioCrosshair", afterDraw(chart) { const point = chart.tooltip?._active?.[0]; if (!point) return; const { ctx, chartArea } = chart; ctx.save(); ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(point.element.x, chartArea.top); ctx.lineTo(point.element.x, chartArea.bottom); ctx.stroke(); ctx.restore(); } };
Chart.register(...registerables, crosshair);
Chart.defaults.color = "rgba(255,255,255,.9)";
Chart.defaults.borderColor = "rgba(255,255,255,.07)";
Chart.defaults.font.family = "Inter, system-ui, sans-serif";
Chart.defaults.animation.duration = 320;

export const palette = ["#22c55e", "#d1d5db", "#60a5fa", "#f59e0b", "#a78bfa", "#f472b6", "#2dd4bf", "#fb7185", "#84cc16", "#38bdf8", "#f97316", "#818cf8", "#06b6d4", "#e11d48", "#facc15", "#c084fc", "#14b8a6", "#f43f5e", "#0ea5e9", "#d97706"];

export async function loadSnapshot() {
  const response = await fetch("./data/snapshot.json");
  if (!response.ok) throw new Error("The data snapshot could not be loaded.");
  return response.json();
}

const marketCategories = new Set(["Markets", "Currencies", "Commodities"]);

export function seriesKind(series) {
  return series.kind === "market" || series.source === "Yahoo Finance" ? "market" : "macro";
}

export function changeType(series) {
  if (seriesKind(series) === "market" || marketCategories.has(series.category)) return "percent";
  if (series.unit === "%" || series.unit === "percentage points") return "basis-points";
  return series.observations.every(([, value]) => value > 0) ? "percent" : "points";
}

export function changeSuffix(series) {
  return changeType(series) === "basis-points" ? " bp" : changeType(series) === "points" ? " pts" : "%";
}

export function semanticChange(series, horizon = 365) {
  const visible = sliceHorizon(series.observations, horizon);
  if (visible.length < 2) return NaN;
  const first = visible[0][1];
  const last = visible[visible.length - 1][1];
  if (changeType(series) === "basis-points") return (last - first) * 100;
  if (changeType(series) === "points") return last - first;
  return first > 0 && last > 0 ? (last / first - 1) * 100 : NaN;
}

export function standardize(observations, reference = observations) {
  const values = reference.map(([, value]) => value).filter(Number.isFinite);
  if (values.length < 2) return [];
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  const deviation = Math.sqrt(variance);
  return deviation ? observations.map(([date, value]) => [date, (value - mean) / deviation]) : [];
}

export function rollingChanges(series, horizon = "max") {
  const visible = sliceHorizon(series.observations, horizon);
  const type = changeType(series);
  return visible.slice(1).flatMap(([date, value], index) => {
    const prior = visible[index][1];
    const change = type === "basis-points" ? (value - prior) * 100 : type === "points" ? value - prior : prior > 0 && value > 0 ? (value / prior - 1) * 100 : NaN;
    return Number.isFinite(change) ? [[date, change]] : [];
  });
}

export function mountChrome(snapshot, page) {
  const byId = new Map(snapshot.series.map((series) => [series.id, series]));
  const signal = (id, label, value, detail) => {
    const series = byId.get(id);
    if (!series) return "";
    return `<span class="tape-item"><b>${label}</b><span>${value(series)}</span><small>${detail(series)}</small></span>`;
  };
  const latest = (series) => series.observations[series.observations.length - 1];
  const signals = [
    signal("CPIAUCSL", "Consumer inflation", (series) => format(yoyChange(series.observations), "%"), () => "year over year"),
    signal("UNRATE", "Unemployment", (series) => format(latest(series)[1], "%"), () => "latest rate"),
    signal("PAYEMS", "Payroll growth", (series) => format(yoyChange(series.observations), "%"), () => "year over year"),
    signal("FEDFUNDS", "Federal funds", (series) => format(latest(series)[1], "%"), () => "policy rate"),
    signal("DGS10", "10-year Treasury", (series) => format(latest(series)[1], "%"), () => "latest yield"),
    signal("DTWEXBGS", "U.S. dollar", (series) => `${signed(yoyChange(series.observations))}%`, () => "year over year"),
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
    <footer class="site-footer"><div class="footer-row shell"><span>MacroTrace · Public economic data, made legible.</span><span>Built by Aidan Hutchison · FRED + Yahoo Finance</span></div></footer>`;
  const button = document.querySelector(".menu-button");
  const links = document.querySelector(".nav-links");
  button.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    button.setAttribute("aria-expanded", String(open));
  });
}

export function latestObservations(seriesList) {
  return seriesList.flatMap((series) => {
    const change = periodChange(series.observations, 365);
    return Number.isFinite(change) ? [{ series, change }] : [];
  }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

export function cutoffDate(observations, horizon) {
  const latest = new Date(observations[observations.length - 1]?.[0] ?? Date.now());
  if (horizon === "max") return new Date("1900-01-01");
  if (horizon === "ytd") return new Date(Date.UTC(latest.getUTCFullYear(), 0, 1));
  latest.setUTCDate(latest.getUTCDate() - Number(horizon));
  return latest;
}

export function sliceHorizon(observations, horizon) {
  if (!observations.length) return [];
  const cutoff = cutoffDate(observations, horizon);
  const index = observations.findIndex(([date]) => new Date(date) >= cutoff);
  return observations.slice(Math.max(0, index === -1 ? observations.length - 1 : index));
}

export function periodChange(observations, horizon = 365) {
  const visible = sliceHorizon(observations, horizon);
  if (visible.length < 2 || visible[0][1] === 0) return NaN;
  return (visible[visible.length - 1][1] / visible[0][1] - 1) * 100;
}

export function yoyChange(observations) {
  if (observations.length < 2) return NaN;
  const latest = observations[observations.length - 1];
  const target = new Date(latest[0]);
  target.setUTCFullYear(target.getUTCFullYear() - 1);
  let prior = observations[0];
  for (const point of observations) {
    if (new Date(point[0]) <= target) prior = point;
    else break;
  }
  return prior[1] === 0 ? NaN : (latest[1] / prior[1] - 1) * 100;
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
    return observations.map(([date, value]) => [date, (value / base - 1) * 100]);
  }
  return observations.flatMap(([date, value], index) => {
    const target = new Date(date); target.setUTCFullYear(target.getUTCFullYear() - 1);
    let prior;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (new Date(observations[cursor][0]) <= target) { prior = observations[cursor][1]; break; }
    }
    return prior && prior !== 0 ? [[date, (value / prior - 1) * 100]] : [];
  });
}

export function volatility(series, horizon) {
  const visible = sliceHorizon(series.observations, horizon);
  const values = (visible.length >= 3 ? visible : series.observations.slice(-12)).map(([, value]) => value);
  if (values.length < 3) return NaN;
  const positive = values.every((value) => value > 0);
  const range = Math.max(...values) - Math.min(...values);
  const changes = values.slice(1).map((value, index) => positive ? Math.log(value / values[index]) : range ? (value - values[index]) / range : 0).filter(Number.isFinite);
  if (!changes.length) return NaN;
  const mean = changes.reduce((sum, value) => sum + value, 0) / changes.length;
  const variance = changes.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, changes.length - 1);
  const factor = { daily: 252, weekly: 52, monthly: 12, quarterly: 4, annual: 1 }[series.frequency] ?? 12;
  return Math.sqrt(variance * factor) * 100;
}

export function historicalPercentile(series, measure) {
  const history = transform(series.observations, measure);
  const values = history.map(([, value]) => value).filter(Number.isFinite).sort((a, b) => a - b);
  const latest = history.at(-1)?.[1];
  return values.length && Number.isFinite(latest) ? values.filter((value) => value <= latest).length / values.length * 100 : NaN;
}

export function levelPercentile(series) {
  const values = series.observations.map(([, value]) => value).filter(Number.isFinite).sort((a, b) => a - b);
  const latest = series.observations[series.observations.length - 1]?.[1];
  if (!values.length || !Number.isFinite(latest) || values[0] === values[values.length - 1]) return NaN;
  const below = values.filter((value) => value < latest).length;
  const tied = values.filter((value) => value === latest).length;
  return (below + tied * .5) / values.length * 100;
}

export function changePercentile(series) {
  const values = rollingChanges(series).map(([, value]) => value).filter(Number.isFinite).sort((a, b) => a - b);
  const latest = values.length ? rollingChanges(series).at(-1)?.[1] : NaN;
  if (values.length < 3 || !Number.isFinite(latest) || values[0] === values[values.length - 1]) return NaN;
  const below = values.filter((value) => value < latest).length;
  const tied = values.filter((value) => value === latest).length;
  return (below + tied * .5) / values.length * 100;
}

export function maxDrawdown(series, horizon) {
  const visible = sliceHorizon(series.observations, horizon);
  const values = (visible.length >= 2 ? visible : series.observations.slice(-12)).map(([, value]) => value);
  if (values.length < 2) return NaN;
  const positive = values.every((value) => value > 0);
  const range = Math.max(...values) - Math.min(...values);
  let peak = -Infinity;
  let drawdown = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    const denominator = positive ? peak : range;
    if (denominator > 0) drawdown = Math.min(drawdown, (value - peak) / denominator * 100);
  }
  return drawdown;
}

export function correlation(first, second, horizon = "max", mode = "percent") {
  const annual = first.frequency === "annual" || second.frequency === "annual";
  const changes = (series) => {
    const visible = sliceHorizon(series.observations, horizon);
    const key = (date) => date.slice(0, annual ? 4 : 7);
    const source = new Set(visible.map(([date]) => key(date))).size >= 4 ? visible : sliceHorizon(series.observations, annual ? 3650 : 365);
    const map = new Map();
    for (const [date, value] of source) map.set(key(date), value);
    const entries = [...map.entries()];
    const type = mode === "auto" ? changeType(series) : mode;
    return new Map(entries.slice(1).map(([period, value], index) => {
      const prior = entries[index][1];
      const change = type === "percent" ? prior > 0 && value > 0 ? value / prior - 1 : NaN : type === "basis-points" ? (value - prior) * 100 : value - prior;
      return [period, change];
    }).filter(([, value]) => Number.isFinite(value)));
  };
  const left = changes(first); const right = changes(second);
  const pairs = [...left].flatMap(([period, value]) => right.has(period) ? [[value, right.get(period)]] : []);
  if (pairs.length < 3) return NaN;
  const meanX = pairs.reduce((sum, [x]) => sum + x, 0) / pairs.length;
  const meanY = pairs.reduce((sum, [, y]) => sum + y, 0) / pairs.length;
  const numerator = pairs.reduce((sum, [x, y]) => sum + (x - meanX) * (y - meanY), 0);
  const denominator = Math.sqrt(pairs.reduce((sum, [x]) => sum + (x - meanX) ** 2, 0) * pairs.reduce((sum, [, y]) => sum + (y - meanY) ** 2, 0));
  return denominator ? numerator / denominator : NaN;
}

export function downsample(points, max = 520) {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  return points.filter((_, index) => index % step === 0 || index === points.length - 1);
}

export function chartOptions({ percent = false, legend = true, logarithmic = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: legend, position: "bottom", align: "start", onClick: (event, item, legendPlugin) => { const chart = legendPlugin.chart; const visible = chart.isDatasetVisible(item.datasetIndex); chart.setDatasetVisibility(item.datasetIndex, !visible); chart.update(); }, labels: { usePointStyle: true, pointStyle: "line", boxWidth: 18, padding: 16, color: "#cbd5e1" } },
      tooltip: { backgroundColor: "#0a0a0a", borderColor: "rgba(255,255,255,.12)", borderWidth: 1, cornerRadius: 12, padding: 14, titleColor: "rgba(255,255,255,.9)", bodyColor: "rgba(255,255,255,.9)", displayColors: true, callbacks: { label: (context) => `${context.dataset.label}: ${format(context.parsed.y, percent ? "%" : "")}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 7, maxRotation: 0 } },
      y: { type: logarithmic ? "logarithmic" : "linear", grid: { color: "rgba(255,255,255,.07)" }, ticks: { callback: (value) => percent ? `${value}%` : compact(value) } },
    },
  };
}

export function lineDataset(series, points, color, label = series.name) {
  const sampled = downsample(points);
  return { label, data: sampled.map(([, value]) => value), borderColor: color, backgroundColor: `${color}18`, pointRadius: 0, pointHoverRadius: 3, borderWidth: 1.5, tension: 0, fill: false, _labels: sampled.map(([date]) => date) };
}

export function labelsFor(datasets) {
  const all = new Set(datasets.flatMap((dataset) => dataset._labels));
  return [...all].sort();
}

export function alignedDatasets(seriesList, pointLists) {
  const labels = [...new Set(pointLists.flatMap((points) => downsample(points).map(([date]) => date)))].sort();
  const datasets = seriesList.map((series, index) => {
    const map = new Map(downsample(pointLists[index]));
    return { ...lineDataset(series, [], palette[index]), data: labels.map((date) => map.get(date) ?? null), spanGaps: true };
  });
  return { labels, datasets };
}

export function format(value, suffix = "") {
  if (!Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: Math.abs(value) < 10 ? 2 : 1 }).format(value)}${suffix}`;
}
export function compact(value) { return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
export function signed(value) { return `${value >= 0 ? "+" : ""}${format(value)}`; }
export function changeClass(value) { return value >= 0 ? "positive" : "negative"; }
export { Chart };
