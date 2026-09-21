import { Chart, alignedDatasets, changeClass, chartOptions, correlation, format, historicalPercentile, loadSnapshot, maxDrawdown, mountChrome, palette, signed, sliceHorizon, transform, volatility, yoyChange } from "./common.js";
import { presetById, presets } from "./presets.js";

const MAX_SELECTED = 24;
const apiOrigin = import.meta.env.VITE_MARKET_API_ORIGIN || "";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

async function main() {
  const snapshot = await loadSnapshot();
  mountChrome(snapshot, "dashboard");
  const state = { series: snapshot.series, selected: [], horizon: "365", measure: "yoy", scale: "linear", breakdown: "series", category: "all", frequency: "all", activePreset: "macro", changeMode: "percent" };
  const charts = {};
  const loaded = new Map(state.series.map((series) => [series.id, series]));
  const controls = Object.fromEntries(["category", "horizon", "frequency", "measure", "scale", "breakdown"].map((key) => [key, document.querySelector(`#${key}-filter`)]));
  const search = document.querySelector("#series-search");
  const results = document.querySelector("#search-results");
  const status = document.querySelector("#ticker-status");
  const presetStatus = document.querySelector("#preset-status");
  let searchResults = [];
  let activeSearchIndex = 0;
  let searchTimer;

  document.querySelector("#freshness").textContent = `Daily snapshot · ${new Date(snapshot.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}`;
  const categories = [...new Set(state.series.map(({ category }) => category))].sort();
  controls.category.insertAdjacentHTML("beforeend", categories.map((category) => `<option>${category}</option>`).join(""));
  document.querySelector("#preset-list").innerHTML = presets.map((preset) => `<button class="preset-button" data-preset="${preset.id}" type="button"><strong>${preset.label}</strong><span>${preset.description}</span></button>`).join("");
  document.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => applyPreset(button.dataset.preset)));

  for (const [key, control] of Object.entries(controls)) control.addEventListener("change", () => {
    state[key] = control.value;
    state.activePreset = null;
    if (key === "category" || key === "frequency") resetSelectionForFilters();
    render();
  });
  document.querySelector("#reset-filters").addEventListener("click", () => applyPreset("macro"));
  document.querySelectorAll(".chart-expand").forEach((button) => button.addEventListener("click", () => {
    const card = button.closest("[data-chart-card]");
    const expanded = card.classList.toggle("chart-expanded");
    document.body.classList.toggle("chart-modal-open", expanded);
    if (expanded) card.setAttribute("aria-modal", "true"); else card.removeAttribute("aria-modal");
    card.setAttribute("role", expanded ? "dialog" : "article");
    if (!button.dataset.expandLabel) button.dataset.expandLabel = button.getAttribute("aria-label");
    button.textContent = expanded ? "×" : "↗";
    button.setAttribute("aria-label", expanded ? "Close expanded chart" : button.dataset.expandLabel);
    window.setTimeout(() => Object.values(charts).forEach((chart) => chart.resize()), 40);
  }));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") document.querySelector(".chart-expanded .chart-expand")?.click(); });

  function eligibleSeries() { return state.series.filter((series) => (state.category === "all" || series.category === state.category) && (state.frequency === "all" || series.frequency === state.frequency)); }
  function selectedSeries() { return state.selected.map((id) => loaded.get(id)).filter(Boolean); }
  function resetSelectionForFilters() { state.selected = eligibleSeries().slice(0, 6).map(({ id }) => id); }
  function setSearchOpen(open) { results.hidden = !open; search.setAttribute("aria-expanded", String(open)); }

  async function fetchSeries(item) {
    const existing = loaded.get(item.id);
    if (existing) return existing;
    const path = item.kind === "fred" ? `/api/fred?id=${encodeURIComponent(item.id)}&name=${encodeURIComponent(item.name)}` : `/api/market?symbol=${encodeURIComponent(item.id)}`;
    const response = await fetch(`${apiOrigin}${path}`);
    if (!response.ok) throw new Error(`${item.id} is temporarily unavailable.`);
    const series = await response.json();
    loaded.set(series.id, series);
    state.series = [...state.series.filter(({ id }) => id !== series.id), series];
    return series;
  }

  async function addResult(item) {
    setSearchOpen(false); search.value = ""; status.textContent = `Adding ${item.id}…`;
    try {
      const series = await fetchSeries(item);
      if (!state.selected.includes(series.id)) state.selected = [...state.selected.slice(-(MAX_SELECTED - 1)), series.id];
      state.activePreset = null; state.category = "all"; state.frequency = "all";
      controls.category.value = "all"; controls.frequency.value = "all";
      status.textContent = `${series.id} added · ${series.observations[series.observations.length - 1][0]}`;
      render();
    } catch (error) { status.textContent = error.message; }
  }

  function renderSearch(items) {
    searchResults = items; activeSearchIndex = 0;
    results.innerHTML = items.length ? items.map((item, index) => `<button class="search-result${index === 0 ? " active" : ""}" data-search-index="${index}" role="option" aria-selected="${index === 0}" type="button"><span><strong>${escapeHtml(item.id)}</strong> · ${escapeHtml(item.name)}</span><small><b>${escapeHtml(item.source)}</b>${item.meta ? ` · ${escapeHtml(item.meta)}` : ""}</small></button>`).join("") : `<div class="search-result"><span>No matching Yahoo Finance or FRED series.</span></div>`;
    setSearchOpen(true);
  }

  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const query = search.value.trim();
    if (!query) { setSearchOpen(false); return; }
    const needle = query.toLowerCase();
    const local = state.series.filter((series) => `${series.id} ${series.name} ${series.category}`.toLowerCase().includes(needle)).slice(0, 8).map((series) => ({ id: series.id, name: series.name, kind: series.source === "Yahoo Finance" ? "market" : "fred", source: series.source === "Yahoo Finance" ? "Yahoo Finance" : "FRED", bundled: true, meta: `${series.category} · ${series.frequency}` }));
    renderSearch(local);
    searchTimer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${apiOrigin}/api/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) return;
        const remote = (await response.json()).results ?? [];
        if (search.value.trim() === query) renderSearch(remote);
      } catch { /* Local matches remain available. */ }
    }, 120);
  });
  search.addEventListener("keydown", (event) => {
    if (results.hidden || !searchResults.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      activeSearchIndex = (activeSearchIndex + (event.key === "ArrowDown" ? 1 : -1) + searchResults.length) % searchResults.length;
      results.querySelectorAll("[role=option]").forEach((row, index) => { const active = index === activeSearchIndex; row.classList.toggle("active", active); row.setAttribute("aria-selected", String(active)); });
    } else if (event.key === "Enter") { event.preventDefault(); void addResult(searchResults[activeSearchIndex]); }
    else if (event.key === "Escape") setSearchOpen(false);
  });
  results.addEventListener("click", (event) => { const button = event.target.closest("[data-search-index]"); if (button) void addResult(searchResults[Number(button.dataset.searchIndex)]); });
  document.addEventListener("click", (event) => { if (!event.target.closest(".search-control")) setSearchOpen(false); });

  async function applyPreset(id) {
    const preset = presetById(id);
    if (!preset) return;
    state.activePreset = id; state.measure = preset.measure; state.changeMode = preset.changeMode ?? "percent"; state.category = "all"; state.frequency = "all"; state.breakdown = "series";
    controls.measure.value = state.measure; controls.category.value = "all"; controls.frequency.value = "all"; controls.breakdown.value = "series";
    state.selected = (preset.series ?? []).filter((seriesId) => loaded.has(seriesId));
    render();
    if (!preset.symbols?.length) { presetStatus.textContent = `${preset.label} · ${state.selected.length} current series`; return; }
    presetStatus.textContent = `Loading ${preset.label}…`;
    const outcomes = Array(preset.symbols.length);
    let nextSymbol = 0;
    await Promise.all(Array.from({ length: Math.min(3, preset.symbols.length) }, async () => {
      while (nextSymbol < preset.symbols.length) {
        const index = nextSymbol++;
        const symbol = preset.symbols[index];
        try { outcomes[index] = { status: "fulfilled", value: await fetchSeries({ id: symbol, name: symbol, kind: "market" }) }; }
        catch (reason) { outcomes[index] = { status: "rejected", reason }; }
      }
    }));
    if (state.activePreset !== id) return;
    state.selected = [...(preset.series ?? []).filter((seriesId) => loaded.has(seriesId)), ...outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value.id] : [])].slice(0, MAX_SELECTED);
    presetStatus.textContent = `${preset.label} · ${state.selected.length}/${(preset.series?.length ?? 0) + preset.symbols.length} current series`;
    render();
  }

  function toggleSeries(id) {
    if (state.selected.includes(id)) state.selected = state.selected.filter((selected) => selected !== id);
    else if (state.selected.length < MAX_SELECTED) state.selected.push(id);
    else status.textContent = `Remove a series before adding another (maximum ${MAX_SELECTED}).`;
    state.activePreset = null; render();
  }
  function move(series, horizon = state.horizon) {
    const visible = sliceHorizon(series.observations, horizon);
    if (visible.length < 2) return NaN;
    const first = visible[0][1]; const last = visible[visible.length - 1][1];
    if (state.changeMode === "basis-points") return (last - first) * 100;
    if (state.changeMode === "points") return last - first;
    return first === 0 ? NaN : (last / first - 1) * 100;
  }
  function moveSuffix() { return state.changeMode === "basis-points" ? " bp" : state.changeMode === "points" ? " pts" : "%"; }
  function destroyChart(name) { charts[name]?.destroy(); }
  function horizontalBarOptions({ percent = false, min, max } = {}) {
    const base = chartOptions({ percent, legend: false });
    return { ...base, indexAxis: "y", scales: {
      x: { type: "linear", min, max, grid: { color: "rgba(255,255,255,.07)" }, ticks: { callback: (value) => percent ? `${value}%` : value } },
      y: { type: "category", grid: { display: false }, ticks: { color: "rgba(255,255,255,.9)" } },
    } };
  }

  function render() {
    const seriesList = selectedSeries();
    document.querySelector("#selection-count").textContent = seriesList.length;
    document.querySelector("#selected-series").innerHTML = seriesList.map((series, index) => `<button class="series-chip" data-remove="${series.id}" title="Remove ${series.name}"><i style="background:${palette[index % palette.length]}"></i>${series.id} ×</button>`).join("");
    document.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => toggleSeries(button.dataset.remove)));
    document.querySelectorAll("[data-preset]").forEach((button) => button.classList.toggle("active", button.dataset.preset === state.activePreset));
    renderMetrics(seriesList); renderTrend(seriesList); renderMomentum(seriesList); renderPercentiles(seriesList); renderDrawdowns(seriesList); renderVolatility(seriesList); renderRelationships(seriesList); renderHeatmap(seriesList); renderTable(seriesList);
  }

  function renderMetrics(seriesList) {
    const primary = seriesList[0];
    const moves = seriesList.map((series) => move(series)).filter(Number.isFinite).sort((a, b) => a - b);
    const median = moves.length ? moves[Math.floor(moves.length / 2)] : NaN;
    const breadth = moves.length ? moves.filter((value) => value > 0).length / moves.length * 100 : NaN;
    const relationships = primary ? seriesList.slice(1).map((series) => ({ id: series.id, value: correlation(primary, series, state.horizon, state.changeMode) })).filter(({ value }) => Number.isFinite(value)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)) : [];
    const strongest = relationships[0];
    const metrics = [
      [primary ? format(primary.observations[primary.observations.length - 1][1]) : "—", primary ? `${primary.id} latest · ${primary.observations[primary.observations.length - 1][0]}` : "Select a series"],
      [Number.isFinite(median) ? `${signed(median)}${moveSuffix()}` : "—", "Median move in selected window"],
      [Number.isFinite(breadth) ? format(breadth, "%") : "—", "Series with positive momentum"],
      [strongest ? format(strongest.value) : "—", strongest ? `${primary.id} / ${strongest.id} correlation` : "Select two for correlation"],
    ];
    document.querySelector("#dashboard-metrics").innerHTML = metrics.map(([value, label]) => `<div class="dashboard-metric"><span class="metric-value">${value}</span><span class="metric-label">${label}</span></div>`).join("");
  }
  function renderTrend(seriesList) {
    destroyChart("trend");
    const pointLists = seriesList.map((series) => transform(sliceHorizon(series.observations, state.horizon), state.measure));
    const data = alignedDatasets(seriesList, pointLists);
    const titles = { indexed: "Indexed path", change: "Window change", level: "Reported levels", yoy: "Year-over-year change" };
    document.querySelector("#trend-title").textContent = titles[state.measure];
    document.querySelector("#trend-note").textContent = state.measure === "level" && new Set(seriesList.map(({ unit }) => unit)).size > 1 ? "Mixed units · compare direction, not magnitude" : `${seriesList.length} selected series`;
    const logarithmic = state.scale === "logarithmic" && pointLists.every((points) => points.every(([, value]) => value > 0));
    document.querySelector("#trend-note").textContent = state.scale === "logarithmic" && !logarithmic ? "Log unavailable for zero or negative values · showing linear" : document.querySelector("#trend-note").textContent;
    charts.trend = new Chart(document.querySelector("#trend-chart"), { type: "line", data, options: chartOptions({ percent: ["change", "yoy"].includes(state.measure), logarithmic }) });
  }
  function groupRows(seriesList, horizon) {
    const rows = seriesList.map((series) => ({ label: state.breakdown === "series" ? series.id : series[state.breakdown], value: move(series, horizon) })).filter(({ value }) => Number.isFinite(value));
    if (state.breakdown === "series") return rows;
    const groups = rows.reduce((map, row) => map.set(row.label, [...(map.get(row.label) ?? []), row.value]), new Map());
    return [...groups].map(([label, values]) => ({ label, value: values.reduce((sum, value) => sum + value, 0) / values.length }));
  }
  function renderMomentum(seriesList) {
    destroyChart("ranking"); const horizons = [["1M", 30], ["3M", 90], ["1Y", 365]]; const labels = groupRows(seriesList, 365).map(({ label }) => label);
    charts.ranking = new Chart(document.querySelector("#ranking-chart"), { type: "bar", data: { labels, datasets: horizons.map(([label, horizon], index) => { const map = new Map(groupRows(seriesList, horizon).map((row) => [row.label, row.value])); return { label, data: labels.map((name) => map.get(name) ?? null), backgroundColor: palette[index], borderRadius: 3 }; }) }, options: chartOptions() });
  }
  function renderPercentiles(seriesList) {
    destroyChart("correlation");
    const rows = seriesList.map((series) => ({ label: series.id, value: historicalPercentile(series, state.measure) })).filter(({ value }) => Number.isFinite(value));
    charts.correlation = new Chart(document.querySelector("#correlation-chart"), { type: "bar", data: { labels: rows.map(({ label }) => label), datasets: [{ label: "Historical percentile", data: rows.map(({ value }) => value), backgroundColor: rows.map(({ value }) => value >= 50 ? "rgba(245,218,150,.78)" : "rgba(128,97,38,.76)"), borderRadius: 5 }] }, options: { ...chartOptions({ legend: false }), indexAxis: "y", scales: { x: { min: 0, max: 100, grid: { color: "rgba(245,201,96,.08)" }, ticks: { callback: (value) => `${value}th` } }, y: { grid: { display: false } } } } });
  }
  function renderDrawdowns(seriesList) {
    destroyChart("drawdown");
    const rows = seriesList.map((series) => ({ label: series.id, value: maxDrawdown(series, state.horizon) })).filter(({ value }) => Number.isFinite(value));
    charts.drawdown = new Chart(document.querySelector("#drawdown-chart"), { type: "bar", data: { labels: rows.map(({ label }) => label), datasets: [{ label: "Maximum drawdown", data: rows.map(({ value }) => value), backgroundColor: "rgba(251,113,133,.72)", borderRadius: 4, minBarLength: 2 }] }, options: horizontalBarOptions({ percent: true, max: 0 }) });
  }
  function renderVolatility(seriesList) {
    destroyChart("volatility");
    const rows = seriesList.map((series) => ({ label: series.id, value: volatility(series, state.horizon) })).filter(({ value }) => Number.isFinite(value));
    charts.volatility = new Chart(document.querySelector("#volatility-chart"), { type: "bar", data: { labels: rows.map(({ label }) => label), datasets: [{ label: "Annualized volatility", data: rows.map(({ value }) => value), backgroundColor: "rgba(96,165,250,.72)", borderRadius: 4, minBarLength: 2 }] }, options: horizontalBarOptions({ percent: true, min: 0 }) });
  }
  function renderRelationships(seriesList) {
    destroyChart("risk"); const anchor = seriesList[0]; const rows = anchor ? seriesList.slice(1).map((series) => ({ label: series.id, value: correlation(anchor, series, state.horizon, state.changeMode) })).filter(({ value }) => Number.isFinite(value)) : [];
    charts.risk = new Chart(document.querySelector("#risk-chart"), { type: "bar", data: { labels: rows.map(({ label }) => label), datasets: [{ label: anchor ? `Correlation to ${anchor.id}` : "Correlation", data: rows.map(({ value }) => value), backgroundColor: rows.map(({ value }) => value >= 0 ? "rgba(125,211,167,.72)" : "rgba(241,151,141,.72)"), borderRadius: 5 }] }, options: { ...chartOptions({ legend: false }), scales: { x: { grid: { display: false } }, y: { min: -1, max: 1, grid: { color: "rgba(245,201,96,.08)" } } } } });
  }
  function renderHeatmap(seriesList) {
    const monthly = seriesList.map((series) => {
      const values = new Map();
      for (const [date, value] of series.observations) values.set(date.slice(0, 7), value);
      const entries = [...values.entries()].slice(-13);
      const observations = entries.map(([, value]) => value);
      const positive = observations.every((value) => value > 0);
      const range = Math.max(...observations) - Math.min(...observations);
      return { id: series.id, values: entries.slice(1).map(([month, value], index) => {
        const prior = entries[index][1];
        const change = state.changeMode === "basis-points" ? (value - prior) * 100 : state.changeMode === "points" ? value - prior : positive ? (value / prior - 1) * 100 : range ? (value - prior) / range * 100 : 0;
        return { month, change };
      }) };
    });
    const months = [...new Set(monthly.flatMap((row) => row.values.map(({ month }) => month)))].sort().slice(-12);
    const values = monthly.flatMap((row) => row.values.map(({ change }) => Math.abs(change))).filter(Number.isFinite).sort((a, b) => a - b);
    const scale = values[Math.floor(values.length * .9)] || values.at(-1) || 1;
    const suffix = moveSuffix();
    const cells = [`<div class="heatmap-corner">Series</div>`, ...months.map((month) => `<div class="heatmap-month">${escapeHtml(new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }))}</div>`)];
    for (const row of monthly) {
      const byMonth = new Map(row.values.map((value) => [value.month, value.change]));
      cells.push(`<div class="heatmap-label">${escapeHtml(row.id)}</div>`);
      for (const month of months) {
        const value = byMonth.get(month);
        const intensity = Number.isFinite(value) ? Math.min(.86, .14 + Math.abs(value) / scale * .62) : 0;
        const background = !Number.isFinite(value) ? "transparent" : value >= 0 ? `rgba(34,197,94,${intensity})` : `rgba(244,63,94,${intensity})`;
        const label = Number.isFinite(value) ? `${row.id} · ${month}: ${signed(value)}${suffix}` : `${row.id} · ${month}: no observation`;
        cells.push(`<div class="heatmap-cell" style="background:${background}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${Number.isFinite(value) ? format(value) : "—"}</div>`);
      }
    }
    const heatmap = document.querySelector("#monthly-heatmap");
    heatmap.style.setProperty("--heatmap-months", months.length || 1);
    heatmap.innerHTML = cells.join("");
  }
  function renderTable(seriesList) {
    document.querySelector("#data-table").innerHTML = seriesList.map((series) => { const latest = series.observations[series.observations.length - 1]; const windowMove = move(series); const yoy = yoyChange(series.observations); return `<tr><td>${escapeHtml(series.id)} · ${escapeHtml(series.name)}</td><td>${escapeHtml(series.category)}</td><td>${escapeHtml(latest[0])}</td><td>${format(latest[1])} ${escapeHtml(series.unit)}</td><td class="${changeClass(windowMove)}">${signed(windowMove)}${moveSuffix()}</td><td class="${changeClass(yoy)}">${signed(yoy)}%</td><td><a href="${escapeHtml(series.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(series.source)}</a></td></tr>`; }).join("");
  }

  document.querySelector("#download-csv").addEventListener("click", () => {
    const rows = [["series_id", "series_name", "date", "value", "unit"], ...selectedSeries().flatMap((series) => sliceHorizon(series.observations, state.horizon).map(([date, value]) => [series.id, series.name, date, value, series.unit]))];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "macrotrace-current-view.csv"; link.click(); URL.revokeObjectURL(link.href);
  });

  await applyPreset("macro");
}

main().catch((error) => { console.error(error); document.querySelector("main").innerHTML = `<p class="empty-state">${error.message}</p>`; });
