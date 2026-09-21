import { Chart, alignedDatasets, changeClass, chartOptions, correlation, format, loadSnapshot, mountChrome, palette, periodChange, signed, sliceHorizon, transform, volatility, yoyChange } from "./common.js";

async function main() {
const snapshot = await loadSnapshot();
mountChrome(snapshot, "dashboard");
const state = { series: snapshot.series, selected: ["CPIAUCSL", "UNRATE", "DGS10"], horizon: "365", measure: "indexed", breakdown: "series", category: "all", frequency: "all" };
const charts = {};
const controls = Object.fromEntries(["category", "horizon", "frequency", "measure", "breakdown"].map((key) => [key, document.querySelector(`#${key}-filter`)]));
const search = document.querySelector("#series-search");
const results = document.querySelector("#search-results");
const status = document.querySelector("#ticker-status");

document.querySelector("#freshness").textContent = `Snapshot ${new Date(snapshot.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}`;
const categories = [...new Set(state.series.map(({ category }) => category))].sort();
controls.category.insertAdjacentHTML("beforeend", categories.map((category) => `<option>${category}</option>`).join(""));

for (const [key, control] of Object.entries(controls)) control.addEventListener("change", () => {
  state[key] = control.value;
  if (key === "category" || key === "frequency") resetSelectionForFilters();
  render();
});
document.querySelector("#reset-filters").addEventListener("click", () => {
  Object.assign(state, { selected: ["CPIAUCSL", "UNRATE", "DGS10"], horizon: "365", measure: "indexed", breakdown: "series", category: "all", frequency: "all" });
  for (const [key, control] of Object.entries(controls)) control.value = state[key];
  search.value = ""; status.textContent = ""; render();
});

function eligibleSeries() {
  return state.series.filter((series) => (state.category === "all" || series.category === state.category) && (state.frequency === "all" || series.frequency === state.frequency));
}
function selectedSeries() { return state.selected.map((id) => state.series.find((series) => series.id === id)).filter(Boolean); }
function resetSelectionForFilters() { state.selected = eligibleSeries().slice(0, 3).map(({ id }) => id); }
function toggleSeries(id) {
  if (state.selected.includes(id)) state.selected = state.selected.filter((selected) => selected !== id);
  else if (state.selected.length < 5) state.selected.push(id);
  else status.textContent = "Remove a series before adding another (maximum five).";
  render();
}

search.addEventListener("input", () => {
  const query = search.value.trim().toLowerCase();
  if (!query) { results.hidden = true; return; }
  const matches = eligibleSeries().filter((series) => `${series.id} ${series.name} ${series.category}`.toLowerCase().includes(query)).slice(0, 8);
  results.innerHTML = matches.length ? matches.map((series) => `<button class="search-result" data-id="${series.id}" type="button"><span><strong>${series.id}</strong> · ${series.name}</span><small>${series.category}</small></button>`).join("") : `<div class="search-result"><span>No bundled match. Use “Load ticker” for ${query.toUpperCase()}.</span></div>`;
  results.hidden = false;
});
results.addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]"); if (!button) return;
  toggleSeries(button.dataset.id); search.value = ""; results.hidden = true;
});
document.addEventListener("click", (event) => { if (!event.target.closest(".search-control")) results.hidden = true; });

document.querySelector("#add-ticker").addEventListener("click", async () => {
  const symbol = search.value.trim().toUpperCase();
  if (!/^[A-Z0-9.^=-]{1,12}$/.test(symbol)) { status.textContent = "Enter a valid ticker symbol."; return; }
  status.textContent = `Loading ${symbol}…`;
  try {
    const origin = import.meta.env.VITE_MARKET_API_ORIGIN || "";
    const response = await fetch(`${origin}/api/market?symbol=${encodeURIComponent(symbol)}`);
    if (!response.ok) throw new Error(response.status === 404 ? "Ticker not found." : "Live lookup is unavailable.");
    const series = await response.json();
    state.series = [...state.series.filter(({ id }) => id !== series.id), series];
    if (!state.selected.includes(series.id)) state.selected = [...state.selected.slice(-4), series.id];
    state.category = "all"; state.frequency = "all"; controls.category.value = "all"; controls.frequency.value = "all";
    status.textContent = `${symbol} loaded from Yahoo Finance.`; search.value = ""; results.hidden = true; render();
  } catch (error) { status.textContent = error.message; }
});

function destroyChart(name) { charts[name]?.destroy(); }
function render() {
  const seriesList = selectedSeries();
  document.querySelector("#selection-count").textContent = seriesList.length;
  document.querySelector("#selected-series").innerHTML = seriesList.map((series, index) => `<button class="series-chip" data-remove="${series.id}" title="Remove ${series.name}"><i style="background:${palette[index]}"></i>${series.id} ×</button>`).join("");
  document.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => toggleSeries(button.dataset.remove)));
  renderMetrics(seriesList); renderTrend(seriesList); renderRanking(seriesList); renderCorrelations(seriesList); renderRisk(seriesList); renderTable(seriesList);
}

function renderMetrics(seriesList) {
  const primary = seriesList[0];
  const changes = seriesList.map((series) => periodChange(series.observations, state.horizon)).filter(Number.isFinite);
  const bestIndex = changes.indexOf(Math.max(...changes));
  const vols = seriesList.map((series) => volatility(series, state.horizon)).filter(Number.isFinite);
  const corr = seriesList.length > 1 ? correlation(seriesList[0], seriesList[1], state.horizon) : NaN;
  const metrics = [
    [primary ? format(primary.observations[primary.observations.length - 1][1]) : "—", primary ? `${primary.id} latest level` : "Select a series"],
    [bestIndex >= 0 ? `${signed(changes[bestIndex])}%` : "—", bestIndex >= 0 ? `${seriesList[bestIndex].id} leads the window` : "Period leader"],
    [vols.length ? `${format(vols.reduce((sum, value) => sum + value, 0) / vols.length, "%")}` : "—", "Average annualized volatility"],
    [format(corr), seriesList.length > 1 ? `${seriesList[0].id} / ${seriesList[1].id} correlation` : "Select two for correlation"],
  ];
  document.querySelector("#dashboard-metrics").innerHTML = metrics.map(([value, label]) => `<div class="dashboard-metric"><span class="metric-value">${value}</span><span class="metric-label">${label}</span></div>`).join("");
}

function renderTrend(seriesList) {
  destroyChart("trend");
  const pointLists = seriesList.map((series) => transform(sliceHorizon(series.observations, state.horizon), state.measure));
  const data = alignedDatasets(seriesList, pointLists);
  const titles = { indexed: "Indexed history", change: "Cumulative change", level: "Reported levels", yoy: "Year-over-year change" };
  document.querySelector("#trend-title").textContent = titles[state.measure];
  document.querySelector("#trend-note").textContent = state.measure === "level" && new Set(seriesList.map(({ unit }) => unit)).size > 1 ? "Series use different native units" : `${seriesList.length} selected series`;
  charts.trend = new Chart(document.querySelector("#trend-chart"), { type: "line", data, options: chartOptions({ percent: ["change", "yoy"].includes(state.measure) }) });
}

function breakdownRows(seriesList) {
  const rows = seriesList.map((series) => ({ label: state.breakdown === "series" ? series.id : series[state.breakdown], value: periodChange(series.observations, state.horizon) }));
  if (state.breakdown === "series") return rows;
  const groups = rows.reduce((map, row) => map.set(row.label, [...(map.get(row.label) ?? []), row]), new Map());
  return [...groups].map(([label, values]) => ({ label, value: values.reduce((sum, row) => sum + row.value, 0) / values.length }));
}
function renderRanking(seriesList) {
  destroyChart("ranking"); const rows = breakdownRows(seriesList).filter(({ value }) => Number.isFinite(value)).sort((a, b) => b.value - a.value);
  charts.ranking = new Chart(document.querySelector("#ranking-chart"), { type: "bar", data: { labels: rows.map(({ label }) => label), datasets: [{ label: "Period change", data: rows.map(({ value }) => value), backgroundColor: rows.map(({ value }) => value >= 0 ? "rgba(125,211,167,.7)" : "rgba(241,151,141,.7)"), borderRadius: 5 }] }, options: { ...chartOptions({ percent: true, legend: false }), indexAxis: "y" } });
}
function renderCorrelations(seriesList) {
  destroyChart("correlation"); const pairs = [];
  for (let left = 0; left < seriesList.length; left += 1) for (let right = left + 1; right < seriesList.length; right += 1) pairs.push({ label: `${seriesList[left].id} / ${seriesList[right].id}`, value: correlation(seriesList[left], seriesList[right], state.horizon) });
  charts.correlation = new Chart(document.querySelector("#correlation-chart"), { type: "bar", data: { labels: pairs.map(({ label }) => label), datasets: [{ label: "Correlation", data: pairs.map(({ value }) => value), backgroundColor: pairs.map(({ value }) => value >= 0 ? "rgba(247,220,139,.72)" : "rgba(158,134,77,.72)"), borderRadius: 5 }] }, options: { ...chartOptions({ legend: false }), indexAxis: "y", scales: { x: { min: -1, max: 1, grid: { color: "rgba(245,201,96,.08)" } }, y: { grid: { display: false } } } } });
}
function renderRisk(seriesList) {
  destroyChart("risk"); const points = seriesList.map((series) => ({ x: volatility(series, state.horizon), y: periodChange(series.observations, state.horizon), id: series.id })).filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y));
  charts.risk = new Chart(document.querySelector("#risk-chart"), { type: "scatter", data: { datasets: points.map((point, index) => ({ label: point.id, data: [point], pointRadius: 7, pointHoverRadius: 9, backgroundColor: palette[index] })) }, options: { ...chartOptions(), scales: { x: { title: { display: true, text: "Annualized volatility (%)" }, grid: { color: "rgba(245,201,96,.08)" } }, y: { title: { display: true, text: "Period change (%)" }, grid: { color: "rgba(245,201,96,.08)" } } } } });
}
function renderTable(seriesList) {
  document.querySelector("#data-table").innerHTML = seriesList.map((series) => {
    const latest = series.observations[series.observations.length - 1]; const change = periodChange(series.observations, state.horizon); const yoy = yoyChange(series.observations);
    return `<tr><td>${series.id} · ${series.name}</td><td>${series.category}</td><td>${latest[0]}</td><td>${format(latest[1])} ${series.unit}</td><td class="${changeClass(change)}">${signed(change)}%</td><td class="${changeClass(yoy)}">${signed(yoy)}%</td><td><a href="${series.sourceUrl}" target="_blank" rel="noreferrer">${series.source}</a></td></tr>`;
  }).join("");
}

document.querySelector("#download-csv").addEventListener("click", () => {
  const rows = [["series_id", "series_name", "date", "value", "unit"], ...selectedSeries().flatMap((series) => sliceHorizon(series.observations, state.horizon).map(([date, value]) => [series.id, series.name, date, value, series.unit]))];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "macrotrace-current-view.csv"; link.click(); URL.revokeObjectURL(link.href);
});

render();
}

main().catch((error) => {
  console.error(error);
  document.querySelector("main").innerHTML = `<p class="empty-state">${error.message}</p>`;
});
