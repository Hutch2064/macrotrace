import {
  Chart, alignedDatasets, changeClass, changePercentile, changeSuffix, changeType, chartOptions, correlation, format,
  levelPercentile, loadSnapshot, maxDrawdown, mountChrome, palette, rollingChanges, semanticChange,
  seriesKind, signed, sliceHorizon, standardize, transform, volatility,
} from "./common.js";
import { presetById, presets } from "./presets.js";

const MAX_SELECTED = 24;
const apiOrigin = import.meta.env.VITE_MARKET_API_ORIGIN || "";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const matchesSearch = (series, query) => {
  const text = `${series.id} ${series.name} ${series.category}`.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  return query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).every((token) => text.includes(token));
};

async function main() {
  const snapshot = await loadSnapshot();
  mountChrome(snapshot, "dashboard");
  const state = { series: snapshot.series, selected: [], horizon: "365", mode: "macro", activePreset: "macro", logarithmic: false };
  const charts = {};
  const loaded = new Map(state.series.map((series) => [series.id, series]));
  const horizon = document.querySelector("#horizon-filter");
  const search = document.querySelector("#series-search");
  const results = document.querySelector("#search-results");
  const status = document.querySelector("#ticker-status");
  const presetStatus = document.querySelector("#preset-status");
  let searchResults = [];
  let activeSearchIndex = 0;
  let searchTimer;

  document.querySelector("#freshness").textContent = `Daily snapshot · ${new Date(snapshot.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}`;
  horizon.addEventListener("change", () => { state.horizon = horizon.value; render(); });
  document.querySelector("#log-scale").addEventListener("change", (event) => { state.logarithmic = event.target.checked; renderTrend(selectedSeries()); });
  document.querySelector("#reset-filters").addEventListener("click", () => applyPreset(state.mode === "macro" ? "macro" : "markets"));
  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));

  function enhanceSelect(select) {
    const wrapper = document.createElement("div"); wrapper.className = "custom-select";
    const trigger = document.createElement("button"); trigger.type = "button"; trigger.className = "select-trigger"; trigger.setAttribute("aria-haspopup", "listbox");
    const menu = document.createElement("div"); menu.className = "select-menu"; menu.setAttribute("role", "listbox"); menu.hidden = true;
    const renderOptions = () => {
      trigger.innerHTML = `<span>${escapeHtml(select.selectedOptions[0]?.textContent ?? "Select")}</span><i aria-hidden="true"></i>`;
      menu.innerHTML = [...select.options].map((option) => `<button type="button" role="option" data-value="${escapeHtml(option.value)}" aria-selected="${option.selected}">${escapeHtml(option.textContent)}</button>`).join("");
    };
    const close = () => { menu.hidden = true; trigger.setAttribute("aria-expanded", "false"); wrapper.classList.remove("open"); };
    const open = () => { menu.hidden = false; trigger.setAttribute("aria-expanded", "true"); wrapper.classList.add("open"); menu.querySelector('[aria-selected="true"]')?.focus(); };
    trigger.addEventListener("click", () => menu.hidden ? open() : close());
    trigger.addEventListener("keydown", (event) => { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) { event.preventDefault(); open(); } });
    menu.addEventListener("click", (event) => { const option = event.target.closest("[data-value]"); if (!option) return; select.value = option.dataset.value; select.dispatchEvent(new Event("change")); renderOptions(); close(); trigger.focus(); });
    menu.addEventListener("keydown", (event) => {
      const options = [...menu.querySelectorAll("[role=option]")]; const index = options.indexOf(document.activeElement);
      if (event.key === "Escape") { close(); trigger.focus(); }
      if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); options[(index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus(); }
      if (["Home", "End"].includes(event.key)) { event.preventDefault(); options[event.key === "Home" ? 0 : options.length - 1]?.focus(); }
    });
    select.hidden = true; select.after(wrapper); wrapper.append(trigger, menu); select._renderCustom = renderOptions; renderOptions();
    document.addEventListener("click", (event) => { if (!wrapper.contains(event.target)) close(); });
  }
  enhanceSelect(horizon);

  document.querySelectorAll(".chart-expand").forEach((button) => button.addEventListener("click", () => {
    const card = button.closest("[data-chart-card]"); const expanded = card.classList.toggle("chart-expanded");
    document.body.classList.toggle("chart-modal-open", expanded); card.setAttribute("role", expanded ? "dialog" : "article");
    if (expanded) card.setAttribute("aria-modal", "true"); else card.removeAttribute("aria-modal");
    button.textContent = expanded ? "×" : "↗"; button.setAttribute("aria-label", expanded ? "Close expanded chart" : "Expand chart");
    window.setTimeout(() => Object.values(charts).forEach((chart) => chart.resize()), 40);
  }));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") document.querySelector(".chart-expanded .chart-expand")?.click(); });

  function selectedSeries() { return state.selected.map((id) => loaded.get(id)).filter(Boolean); }
  function setSearchOpen(open) { results.hidden = !open; search.setAttribute("aria-expanded", String(open)); }
  function destroyChart(name) { charts[name]?.destroy(); }
  function setMode(mode) { if (mode !== state.mode) { state.mode = mode; state.logarithmic = false; document.querySelector("#log-scale").checked = false; applyPreset(mode === "macro" ? "macro" : "markets"); } }
  function renderPresetButtons() {
    document.querySelector("#preset-list").innerHTML = presets.filter((preset) => preset.mode === state.mode).map((preset) => `<button class="preset-button${preset.id === state.activePreset ? " active" : ""}" data-preset="${preset.id}" type="button"><strong>${preset.label}</strong><span>${preset.description}</span></button>`).join("");
    document.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => applyPreset(button.dataset.preset)));
  }
  async function fetchSeries(item) {
    const existing = loaded.get(item.id); if (existing) return existing;
    const path = item.kind === "fred" ? `/api/fred?id=${encodeURIComponent(item.id)}&name=${encodeURIComponent(item.name)}` : `/api/market?symbol=${encodeURIComponent(item.id)}`;
    const response = await fetch(`${apiOrigin}${path}`); if (!response.ok) throw new Error(`${item.id} is temporarily unavailable.`);
    const series = await response.json(); loaded.set(series.id, series); state.series = [...state.series, series]; return series;
  }
  async function addResult(item) {
    setSearchOpen(false); search.value = ""; status.textContent = `Adding ${item.id}…`;
    try {
      const series = await fetchSeries(item); state.mode = item.kind === "market" || seriesKind(series) === "market" ? "markets" : "macro";
      if (!state.selected.includes(series.id)) state.selected = [...state.selected.slice(-(MAX_SELECTED - 1)), series.id];
      state.activePreset = null; status.textContent = `${series.name} added · ${series.observations.at(-1)[0]}`; presetStatus.textContent = `Custom view · ${state.selected.length} series`; render();
    } catch (error) { status.textContent = error.message; }
  }
  function renderSearch(items) {
    searchResults = items; activeSearchIndex = 0;
    results.innerHTML = items.length ? items.map((item, index) => `<button class="search-result${index ? "" : " active"}" data-search-index="${index}" role="option" aria-selected="${!index}" type="button"><span><strong>${escapeHtml(item.id)}</strong> · ${escapeHtml(item.name)}</span><small><b>${escapeHtml(item.source)}</b>${item.meta ? ` · ${escapeHtml(item.meta)}` : ""}</small></button>`).join("") : `<div class="search-result"><span>No matching Yahoo Finance or FRED series.</span></div>`;
    setSearchOpen(true);
  }
  search.addEventListener("input", () => {
    clearTimeout(searchTimer); const query = search.value.trim(); if (!query) return setSearchOpen(false);
    const local = state.series.filter((series) => matchesSearch(series, query)).slice(0, 8).map((series) => ({ id: series.id, name: series.name, kind: seriesKind(series), source: series.source, meta: `${series.category} · ${series.frequency}` }));
    renderSearch(local);
    searchTimer = window.setTimeout(async () => { try { const response = await fetch(`${apiOrigin}/api/search?q=${encodeURIComponent(query)}`); if (response.ok && search.value.trim() === query) { const remote = (await response.json()).results ?? []; const seen = new Set(); renderSearch([...local, ...remote].filter((item) => !seen.has(`${item.kind}:${item.id}`) && seen.add(`${item.kind}:${item.id}`)).slice(0, 14)); } } catch { /* Local results remain available. */ } }, 120);
  });
  search.addEventListener("keydown", (event) => {
    if (results.hidden || !searchResults.length) return;
    if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); activeSearchIndex = (activeSearchIndex + (event.key === "ArrowDown" ? 1 : -1) + searchResults.length) % searchResults.length; results.querySelectorAll("[role=option]").forEach((row, index) => { row.classList.toggle("active", index === activeSearchIndex); row.setAttribute("aria-selected", String(index === activeSearchIndex)); }); }
    else if (event.key === "Enter") { event.preventDefault(); void addResult(searchResults[activeSearchIndex]); } else if (event.key === "Escape") setSearchOpen(false);
  });
  results.addEventListener("click", (event) => { const button = event.target.closest("[data-search-index]"); if (button) void addResult(searchResults[Number(button.dataset.searchIndex)]); });
  document.addEventListener("click", (event) => { if (!event.target.closest(".search-control")) setSearchOpen(false); });

  async function applyPreset(id) {
    const preset = presetById(id); if (!preset) return;
    state.activePreset = id; state.mode = preset.mode; state.selected = (preset.series ?? []).filter((seriesId) => loaded.has(seriesId));
    if (preset.horizon) { state.horizon = preset.horizon; horizon.value = preset.horizon; horizon._renderCustom?.(); }
    render();
    if (!preset.symbols?.length) { presetStatus.textContent = `${preset.label} · ${state.selected.length} ${preset.horizon === "max" ? "unspliced research series" : "current series"}`; return; }
    presetStatus.textContent = `Loading ${preset.label}…`;
    const outcomes = await Promise.allSettled(preset.symbols.map((symbol) => fetchSeries({ id: symbol, name: symbol, kind: "market" })));
    if (state.activePreset !== id) return;
    state.selected = [...state.selected, ...outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value.id] : [])].slice(0, MAX_SELECTED);
    presetStatus.textContent = `${preset.label} · ${state.selected.length}/${(preset.series?.length ?? 0) + preset.symbols.length} current series`; render();
  }
  function toggleSeries(id) { state.selected = state.selected.filter((selected) => selected !== id); state.activePreset = null; presetStatus.textContent = `Custom view · ${state.selected.length} series`; render(); }
  function horizontalBarOptions({ percent = false, min, max, suffix = "" } = {}) { return { ...chartOptions({ percent, legend: false }), indexAxis: "y", scales: { x: { type: "linear", min, max, grid: { color: "rgba(255,255,255,.07)" }, ticks: { callback: (value) => `${value}${percent ? "%" : suffix}` } }, y: { type: "category", grid: { display: false } } } }; }
  function setText(id, text) { document.querySelector(`#${id}`).textContent = text; }
  function render() {
    const seriesList = selectedSeries();
    document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === state.mode)); document.body.dataset.analysisMode = state.mode;
    setText("workspace-description", state.mode === "macro" ? "Read economic releases in comparable levels, changes, and cycle positions." : "Evaluate securities with return, drawdown, volatility, and correlation diagnostics.");
    document.querySelector(".scale-toggle").hidden = state.mode !== "markets"; setText("selection-count", seriesList.length);
    document.querySelector("#selected-series").innerHTML = seriesList.map((series, index) => `<button class="series-chip" data-remove="${escapeHtml(series.id)}" title="Remove ${escapeHtml(series.name)}"><i style="background:${palette[index % palette.length]}"></i>${escapeHtml(series.id)} ×</button>`).join("");
    document.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => toggleSeries(button.dataset.remove)));
    renderPresetButtons(); renderMetrics(seriesList); renderTrend(seriesList); renderHorizonChanges(seriesList); renderPosition(seriesList); renderFourth(seriesList); renderFifth(seriesList); renderRelationships(seriesList); renderHeatmap(seriesList); renderProfile(seriesList); renderTable(seriesList);
  }
  function renderMetrics(seriesList) {
    const moves = seriesList.map((series) => semanticChange(series, state.horizon)).filter(Number.isFinite).sort((a, b) => a - b); const percentiles = seriesList.map(state.mode === "macro" ? changePercentile : levelPercentile).filter(Number.isFinite); const latestDates = seriesList.map((series) => new Date(series.observations.at(-1)[0])).filter((date) => Number.isFinite(date.getTime())); const drawdowns = seriesList.map((series) => maxDrawdown(series, state.horizon)).filter(Number.isFinite); const research = seriesList.some(({ historyType }) => historyType === "observed_public");
    const metrics = state.mode === "macro" ? [[String(seriesList.length), "Indicators in current view"], [percentiles.length ? format(mean(percentiles), "%") : "—", "Average historical percentile"], [moves.length ? format(moves.filter((value) => value > 0).length / moves.length * 100, "%") : "—", "Indicators moving higher"], [latestDates.length ? `${Math.max(0, Math.round((Date.now() - Math.max(...latestDates)) / 86400000))}d` : "—", "Since newest release"]] : [[String(seriesList.length), research ? "Research series in current view" : "Securities in current view"], [moves.length ? `${signed(moves[Math.floor(moves.length / 2)])}%` : "—", "Median window return"], [moves.length ? format(moves.filter((value) => value > 0).length / moves.length * 100, "%") : "—", "Series with gains"], [drawdowns.length ? format(Math.min(...drawdowns), "%") : "—", "Deepest drawdown"]];
    document.querySelector("#dashboard-metrics").innerHTML = metrics.map(([value, label]) => `<div class="dashboard-metric"><span class="metric-value">${value}</span><span class="metric-label">${label}</span></div>`).join("");
  }
  function renderTrend(seriesList) {
    destroyChart("trend"); const macro = state.mode === "macro"; const pointLists = seriesList.map((series) => { const visible = sliceHorizon(series.observations, state.horizon); return macro ? standardize(visible, series.observations) : transform(visible, "indexed"); });
    const research = seriesList.some(({ historyType }) => historyType === "observed_public"); setText("trend-kicker", macro ? "01 · Cycle" : "01 · Performance"); setText("trend-title", macro ? "Standardized history" : "Indexed return path"); setText("trend-note", macro ? "Deviation from each series’ full-history mean in standard deviations" : research ? "Public research returns rebased to 100; not ETF prices or stitched histories" : "First visible adjusted close = 100");
    charts.trend = new Chart(document.querySelector("#trend-chart"), { type: "line", data: alignedDatasets(seriesList, pointLists), options: chartOptions({ logarithmic: !macro && state.logarithmic && pointLists.every((points) => points.every(([, value]) => value > 0)) }) });
  }
  function changeScore(series, days) {
    const current = semanticChange(series, days); const points = series.observations; if (!Number.isFinite(current) || points.length < 8) return NaN;
    const samples = points.slice(4).map((_, index) => semanticChange({ ...series, observations: points.slice(0, index + 5) }, days)).filter(Number.isFinite); if (samples.length < 3) return NaN;
    const average = mean(samples); const deviation = Math.sqrt(mean(samples.map((value) => (value - average) ** 2))); return deviation ? (current - average) / deviation : 0;
  }
  function renderHorizonChanges(seriesList) {
    destroyChart("ranking"); const macro = state.mode === "macro"; const longHistory = seriesList.some(({ category }) => category === "Long-History Asset Classes"); const horizons = longHistory ? [["1Y", 365], ["5Y", 1825], ["10Y", 3650]] : [["1M", 30], ["3M", 90], ["1Y", 365]]; setText("ranking-title", macro ? "Change momentum score" : "Returns across horizons"); setText("ranking-note", macro ? "Each change versus its own historical norm; 0 is typical" : longHistory ? "Long-horizon compounded return; percent" : "Adjusted-close price return; percent");
    charts.ranking = new Chart(document.querySelector("#ranking-chart"), { type: "bar", data: { labels: seriesList.map(({ id }) => id), datasets: horizons.map(([label, days], index) => ({ label, data: seriesList.map((series) => macro ? changeScore(series, days) : semanticChange(series, days)), backgroundColor: palette[index], borderRadius: 3 })) }, options: chartOptions() });
  }
  function renderPosition(seriesList) {
    destroyChart("correlation"); const rows = seriesList.map((series) => ({ label: series.id, value: changePercentile(series) })).filter(({ value }) => Number.isFinite(value)); setText("position-title", state.mode === "macro" ? "Change momentum percentile" : "Return momentum percentile"); setText("position-note", "Latest native-period change ranked against its own history");
    charts.correlation = new Chart(document.querySelector("#correlation-chart"), { type: "bar", data: { labels: rows.map(({ label }) => label), datasets: [{ label: "Percentile", data: rows.map(({ value }) => value), backgroundColor: "rgba(245,218,150,.75)", borderRadius: 4 }] }, options: horizontalBarOptions({ min: 0, max: 100, suffix: "th" }) });
  }
  function renderFourth(seriesList) {
    destroyChart("drawdown");
    if (state.mode === "markets") { setText("metric-four-kicker", "04 · Drawdown"); setText("metric-four-title", "Peak-to-trough decline"); setText("metric-four-note", "Worst adjusted-close decline inside the selected window"); const rows = seriesList.map((series) => ({ label: series.id, value: maxDrawdown(series, state.horizon) })).filter(({ value }) => Number.isFinite(value)); charts.drawdown = new Chart(document.querySelector("#drawdown-chart"), { type: "bar", data: { labels: rows.map(({ label }) => label), datasets: [{ label: "Maximum drawdown", data: rows.map(({ value }) => value), backgroundColor: "rgba(251,113,133,.72)", borderRadius: 4 }] }, options: horizontalBarOptions({ percent: true, max: 0 }) }); return; }
    setText("metric-four-kicker", "04 · Momentum"); setText("metric-four-title", "Release momentum"); setText("metric-four-note", "Native release-to-release changes standardized within each series"); const pointLists = seriesList.map((series) => { const visible = rollingChanges(series, state.horizon); return standardize(visible, rollingChanges(series)); }); charts.drawdown = new Chart(document.querySelector("#drawdown-chart"), { type: "line", data: alignedDatasets(seriesList, pointLists), options: chartOptions() });
  }
  function renderFifth(seriesList) {
    destroyChart("volatility");
    if (state.mode === "markets") { setText("metric-five-kicker", "05 · Risk"); setText("metric-five-title", "Annualized volatility"); setText("metric-five-note", "Standard deviation of native-frequency log returns, annualized"); const rows = seriesList.map((series) => ({ label: series.id, value: volatility(series, state.horizon) })).filter(({ value }) => Number.isFinite(value)); charts.volatility = new Chart(document.querySelector("#volatility-chart"), { type: "bar", data: { labels: rows.map(({ label }) => label), datasets: [{ label: "Annualized volatility", data: rows.map(({ value }) => value), backgroundColor: "rgba(96,165,250,.72)", borderRadius: 4 }] }, options: horizontalBarOptions({ percent: true, min: 0 }) }); return; }
    setText("metric-five-kicker", "05 · Freshness"); setText("metric-five-title", "Days since latest release"); setText("metric-five-note", "Native release calendars; fewer days is fresher"); const rows = seriesList.map((series) => ({ label: series.id, value: Math.max(0, Math.round((Date.now() - new Date(series.observations.at(-1)[0])) / 86400000)) })); charts.volatility = new Chart(document.querySelector("#volatility-chart"), { type: "bar", data: { labels: rows.map(({ label }) => label), datasets: [{ label: "Days", data: rows.map(({ value }) => value), backgroundColor: "rgba(96,165,250,.72)", borderRadius: 4 }] }, options: horizontalBarOptions({ min: 0, suffix: "d" }) });
  }
  function renderRelationships(seriesList) {
    destroyChart("risk"); const anchor = seriesList[0]; const annual = seriesList.some(({ frequency }) => frequency === "annual"); setText("relationship-note", annual ? "Aligned calendar-year changes, never raw levels" : "Aligned monthly changes, never raw levels"); const rows = anchor ? seriesList.slice(1).map((series) => ({ label: series.id, value: correlation(anchor, series, state.horizon, "auto") })).filter(({ value }) => Number.isFinite(value)) : [];
    charts.risk = new Chart(document.querySelector("#risk-chart"), { type: "bar", data: { labels: rows.map(({ label }) => label), datasets: [{ label: anchor ? `Correlation to ${anchor.id}` : "Correlation", data: rows.map(({ value }) => value), backgroundColor: rows.map(({ value }) => value >= 0 ? "rgba(125,211,167,.72)" : "rgba(241,151,141,.72)"), borderRadius: 4 }] }, options: horizontalBarOptions({ min: -1, max: 1 }) });
  }
  function monthlyCells(series) { const map = new Map(); for (const [date, value] of series.observations) map.set(date.slice(0, 7), value); const entries = [...map.entries()].slice(-13); const type = changeType(series); return entries.slice(1).map(([month, value], index) => { const prior = entries[index][1]; const change = type === "basis-points" ? (value - prior) * 100 : type === "points" ? value - prior : prior > 0 && value > 0 ? (value / prior - 1) * 100 : NaN; return { month, change }; }); }
  function annualCells(series) { const map = new Map(); for (const [date, value] of series.observations) map.set(date.slice(0, 4), value); const entries = [...map.entries()].slice(-13); const type = changeType(series); return entries.slice(1).map(([year, value], index) => { const prior = entries[index][1]; const change = type === "basis-points" ? (value - prior) * 100 : type === "points" ? value - prior : prior > 0 && value > 0 ? (value / prior - 1) * 100 : NaN; return { month: year, change }; }); }
  function renderHeatmap(seriesList) {
    const annual = seriesList.some(({ frequency }) => frequency === "annual"); const monthly = seriesList.map((series) => ({ series, values: annual ? annualCells(series) : monthlyCells(series) })); const months = [...new Set(monthly.flatMap((row) => row.values.map(({ month }) => month)))].sort().slice(-12); const cells = [`<div class="heatmap-corner">Series</div>`, ...months.map((month) => `<div class="heatmap-month">${annual ? month : new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</div>`)];
    for (const row of monthly) { const byMonth = new Map(row.values.map((value) => [value.month, value.change])); const magnitudes = row.values.map(({ change }) => Math.abs(change)).filter(Number.isFinite).sort((a, b) => a - b); const scale = magnitudes[Math.floor(magnitudes.length * .9)] || 1; cells.push(`<div class="heatmap-label">${escapeHtml(row.series.id)}</div>`); for (const month of months) { const value = byMonth.get(month); const intensity = Number.isFinite(value) ? Math.min(.86, .14 + Math.abs(value) / scale * .62) : 0; const background = !Number.isFinite(value) ? "transparent" : value >= 0 ? `rgba(34,197,94,${intensity})` : `rgba(244,63,94,${intensity})`; const label = Number.isFinite(value) ? `${row.series.name}, ${month}: ${signed(value)}${changeSuffix(row.series)}` : `${row.series.name}, ${month}: no observation`; cells.push(`<div class="heatmap-cell" style="background:${background}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${Number.isFinite(value) ? format(value) : "—"}</div>`); } }
    const heatmap = document.querySelector("#monthly-heatmap"); heatmap.style.setProperty("--heatmap-months", months.length || 1); heatmap.innerHTML = cells.join(""); setText("heatmap-title", annual ? "Annual return heat map" : state.mode === "macro" ? "Month-over-month change" : "Monthly return heat map"); setText("heatmap-note", state.mode === "macro" ? "Exact units follow each series: percent, basis points, or index points" : annual ? "Calendar-year returns; native annual histories remain uninterpolated" : "Adjusted-close monthly returns; green is positive, red is negative");
  }
  function renderProfile(seriesList) {
    destroyChart("profile");
    if (state.mode === "markets") { setText("profile-title", "Return versus risk"); setText("profile-note", "Window return against annualized volatility; upper-left is more efficient"); charts.profile = new Chart(document.querySelector("#profile-chart"), { type: "scatter", data: { datasets: seriesList.map((series, index) => ({ label: series.id, data: [{ x: volatility(series, state.horizon), y: semanticChange(series, state.horizon) }], pointRadius: 6, pointHoverRadius: 8, backgroundColor: palette[index % palette.length] })) }, options: { ...chartOptions(), scales: { x: { title: { display: true, text: "Annualized volatility (%)" }, grid: { color: "rgba(255,255,255,.07)" } }, y: { title: { display: true, text: "Window return (%)" }, grid: { color: "rgba(255,255,255,.07)" } } } } }); return; }
    setText("profile-title", "Category breadth"); setText("profile-note", "Share of selected indicators with a positive window change; direction, not economic desirability"); const groups = new Map(); for (const series of seriesList) { const value = semanticChange(series, state.horizon); if (Number.isFinite(value)) groups.set(series.category, [...(groups.get(series.category) ?? []), value]); } const rows = [...groups].map(([label, values]) => ({ label, value: values.filter((value) => value > 0).length / values.length * 100 })); charts.profile = new Chart(document.querySelector("#profile-chart"), { type: "bar", data: { labels: rows.map(({ label }) => label), datasets: [{ label: "Moving higher", data: rows.map(({ value }) => value), backgroundColor: "rgba(245,218,150,.72)", borderRadius: 4 }] }, options: horizontalBarOptions({ min: 0, max: 100, percent: true }) });
  }
  function renderTable(seriesList) { setText("secondary-change-heading", state.mode === "macro" ? "Change percentile" : "Annualized volatility"); document.querySelector("#data-table").innerHTML = seriesList.map((series) => { const latest = series.observations.at(-1); const movement = semanticChange(series, state.horizon); const secondary = state.mode === "macro" ? changePercentile(series) : volatility(series, state.horizon); return `<tr><td>${escapeHtml(series.id)} · ${escapeHtml(series.name)}</td><td>${escapeHtml(series.category)}</td><td>${latest[0]}</td><td>${format(latest[1])} ${escapeHtml(series.unit)}</td><td class="${changeClass(movement)}">${signed(movement)}${changeSuffix(series)}</td><td>${format(secondary, "%")}</td><td><a href="${escapeHtml(series.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(series.source)}</a></td></tr>`; }).join(""); }

  document.querySelector("#download-csv").addEventListener("click", () => { const rows = [["series_id", "series_name", "date", "value", "unit"], ...selectedSeries().flatMap((series) => sliceHorizon(series.observations, state.horizon).map(([date, value]) => [series.id, series.name, date, value, series.unit]))]; const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "macrotrace-current-view.csv"; link.click(); URL.revokeObjectURL(link.href); });
  await applyPreset("macro");
}

main().catch((error) => { console.error(error); document.querySelector("main").innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`; });
