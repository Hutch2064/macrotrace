import {
  Chart,
  changePercentile,
  changeSuffix,
  changeType,
  chartOptions,
  format,
  loadSnapshot,
  maxDrawdown,
  mountChrome,
  palette,
  rollingChanges,
  semanticChange,
  seriesKind,
  signed,
  sliceHorizon,
  standardize,
  transform,
  volatility,
} from "./common.js";
import { presetById, presets } from "./presets.js";
import { timeChart } from "./time-chart.js";
import { requestSeries } from "./series-cache.js";
import {
  median,
  percentileRank,
  rollingHorizonChanges,
  periodChanges,
  correlationDetails,
  sliceWindow,
  drawdownPath,
  annualizedCagr,
} from "./analytics.js";

const MAX_SELECTED = 24;
const expandIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>';
const closeIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const chartLabel = (series) => {
  const international = {
    "International Inflation": series.unit === "%" ? "Inflation" : "CPI",
    "International Growth": "GDP",
    "International Labor": "Unemp.",
  }[series.category];
  const name = international
    ? `${series.name.split(" · ").at(-1)} ${international}`
    : series.name.split(" · ")[0];
  return name.length > 22 ? `${name.slice(0, 21)}…` : name;
};
const apiOrigin = import.meta.env.VITE_MARKET_API_ORIGIN || "";
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );
const signalCache = new WeakMap();
function macroSignal(series) {
  if (!signalCache.has(series))
    signalCache.set(
      series,
      changeType(series) === "percent"
        ? rollingHorizonChanges(series, "1y")
        : series.observations,
    );
  return signalCache.get(series);
}
function cyclePercentile(series) {
  const points = macroSignal(series);
  return percentileRank(
    points.at(-1)?.[1],
    points.map(([, value]) => value),
  );
}
const mean = (values) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;
const matchesSearch = (series, query) => {
  const text = `${series.id} ${series.name} ${series.category}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .every((token) => text.includes(token));
};

async function main() {
  const snapshot = await loadSnapshot();
  mountChrome(snapshot, "dashboard");
  const state = {
    series: snapshot.series,
    selected: [],
    horizon: "365",
    mode: "macro",
    activePreset: "macro",
    logarithmic: false,
  };
  let charts = {};
  const modeViews = new Map();
  let analysisView = document.querySelector("#analysis-view");
  const viewTemplate = analysisView.cloneNode(true);
  const loaded = new Map(state.series.map((series) => [series.id, series]));
  const horizon = document.querySelector("#horizon-filter");
  const search = document.querySelector("#series-search");
  const results = document.querySelector("#search-results");
  const status = document.querySelector("#ticker-status");
  const presetStatus = document.querySelector("#preset-status");
  let searchResults = [];
  let activeSearchIndex = 0;
  let searchTimer;
  let searchRequest;
  const queryCache = new Map();

  document.querySelector("#freshness").textContent =
    `Daily snapshot · ${new Date(snapshot.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}`;
  horizon.addEventListener("change", () => {
    state.horizon = horizon.value;
    render();
  });
  document.querySelector("#log-scale").addEventListener("change", (event) => {
    state.logarithmic = event.target.checked;
    renderTrend(selectedSeries());
    renderIndividual(selectedSeries());
  });
  document.querySelector("#reset-filters").addEventListener("click", () => {
    state.horizon = "365";
    horizon.value = "365";
    horizon._renderCustom?.();
    state.logarithmic = false;
    document.querySelector("#log-scale").checked = false;
    search.value = "";
    setSearchOpen(false);
    status.textContent = "";
    applyPreset(state.mode === "macro" ? "macro" : "markets");
  });
  document
    .querySelectorAll("[data-mode]")
    .forEach((button) =>
      button.addEventListener("click", () => setMode(button.dataset.mode)),
    );

  function enhanceSelect(select) {
    const wrapper = document.createElement("div");
    wrapper.className = "custom-select";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    const menu = document.createElement("div");
    menu.className = "select-menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;
    const renderOptions = () => {
      trigger.innerHTML = `<span>${escapeHtml(select.selectedOptions[0]?.textContent ?? "Select")}</span><i aria-hidden="true"></i>`;
      menu.innerHTML = [...select.options]
        .filter((option) => !option.disabled)
        .map(
          (option) =>
            `<button type="button" role="option" data-value="${escapeHtml(option.value)}" aria-selected="${option.selected}">${escapeHtml(option.textContent)}</button>`,
        )
        .join("");
    };
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute(
      "aria-label",
      select.id === "horizon-filter" ? "Horizon" : "Explore a collection",
    );
    const close = () => {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      wrapper.classList.remove("open");
    };
    const open = () => {
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      wrapper.classList.add("open");
      menu.querySelector('[aria-selected="true"]')?.focus();
    };
    trigger.addEventListener("click", () => (menu.hidden ? open() : close()));
    trigger.addEventListener("keydown", (event) => {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        open();
      }
    });
    menu.addEventListener("click", (event) => {
      const option = event.target.closest("[data-value]");
      if (!option) return;
      select.value = option.dataset.value;
      select.dispatchEvent(new Event("change"));
      renderOptions();
      close();
      trigger.focus();
    });
    if (select.id === "view-filter")
      menu.addEventListener("pointerover", (event) => {
        const preset = presetById(
          event.target.closest("[data-value]")?.dataset.value,
        );
        for (const id of preset?.symbols ?? [])
          if (!loaded.has(id))
            void fetchSeries({ id, kind: "market" }).catch(() => {});
      });
    menu.addEventListener("keydown", (event) => {
      const options = [...menu.querySelectorAll("[role=option]")];
      const index = options.indexOf(document.activeElement);
      if (event.key === "Escape") {
        close();
        trigger.focus();
      }
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        options[
          (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
            options.length
        ]?.focus();
      }
      if (["Home", "End"].includes(event.key)) {
        event.preventDefault();
        options[event.key === "Home" ? 0 : options.length - 1]?.focus();
      }
    });
    select.hidden = true;
    select.after(wrapper);
    wrapper.append(trigger, menu);
    select._renderCustom = renderOptions;
    renderOptions();
    document.addEventListener("click", (event) => {
      if (!wrapper.contains(event.target)) close();
    });
  }
  enhanceSelect(horizon);
  document.querySelectorAll(".chart-expand").forEach((button) => {
    button.innerHTML = expandIcon;
  });
  // Keep the unrendered template consistent when opening the other mode first.
  viewTemplate.querySelectorAll(".chart-expand").forEach((button) => {
    button.innerHTML = expandIcon;
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest(".chart-expand");
    if (!button) return;
    const card = button.closest("[data-chart-card]");
    const expanded = card.classList.toggle("chart-expanded");
    document.body.classList.toggle("chart-modal-open", expanded);
    card.setAttribute("role", expanded ? "dialog" : "article");
    document
      .querySelectorAll(
        "main > *, #analysis-view > *, .dashboard-grid > *, #site-header, #site-footer",
      )
      .forEach((element) => {
        if (element !== card && !element.contains(card))
          element.inert = expanded;
      });
    if (expanded) {
      card.setAttribute("aria-modal", "true");
      card.setAttribute("aria-label", card.querySelector("h2").textContent);
      const chart = Object.values(charts).find(
        (item) =>
          (item.host || item.canvas)?.closest("[data-chart-card]") === card,
      );
      const toolbar = document.createElement("div");
      toolbar.className = "chart-explorer-tools";
      const reset = document.createElement("button");
      reset.className = "secondary-button";
      reset.textContent = "Reset chart";
      reset.addEventListener("click", () => {
        if (chart?.reset && chart.host) chart.reset();
        else if (chart?.data) {
          chart.data.datasets.forEach((_, index) =>
            chart.setDatasetVisibility(index, true),
          );
          chart.update("none");
        }
      });
      const help = document.createElement("span");
      help.setAttribute("role", "status");
      help.textContent = chart?.host
        ? "Drag to zoom · arrow keys inspect dates · click a legend to hide a series"
        : chart
          ? "Hover to inspect values · click a legend to isolate datasets"
          : "Select any cell to inspect its exact change and period";
      if (chart) toolbar.append(reset);
      if (chart?.data) {
        const legend = document.createElement("button");
        legend.className = "secondary-button";
        legend.textContent = "Toggle legend";
        legend.addEventListener("click", () => {
          chart.options.plugins.legend.display =
            !chart.options.plugins.legend.display;
          chart.update("none");
        });
        toolbar.append(legend);
      }
      toolbar.append(help);
      card.querySelector(".chart-subhead").after(toolbar);
      button.focus();
    } else {
      card.removeAttribute("aria-modal");
      card.removeAttribute("aria-label");
      card.querySelector(".chart-explorer-tools")?.remove();
    }
    button.innerHTML = expanded ? closeIcon : expandIcon;
    button.setAttribute(
      "aria-label",
      expanded ? "Close expanded chart" : "Expand chart",
    );
    requestAnimationFrame(() =>
      Object.values(charts).forEach((chart) => chart.resize()),
    );
  });
  document.addEventListener("keydown", (event) => {
    const dialog = document.querySelector(".chart-expanded");
    if (!dialog) return;
    if (event.key === "Escape") dialog.querySelector(".chart-expand")?.click();
    if (event.key === "Tab") {
      const focusable = [
        ...dialog.querySelectorAll('button, a, input, [tabindex="0"]'),
      ];
      const first = focusable[0],
        last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
  const inspectCell = (event) => {
    const cell = event.target.closest(".heatmap-cell");
    const help = cell
      ?.closest(".chart-expanded")
      ?.querySelector(".chart-explorer-tools [role=status]");
    if (help) help.textContent = cell.getAttribute("aria-label");
  };
  document.addEventListener("focusin", inspectCell);
  document.addEventListener("click", inspectCell);

  function selectedSeries() {
    return state.selected.map((id) => loaded.get(id)).filter(Boolean);
  }
  function setSearchOpen(open) {
    results.hidden = !open;
    search.setAttribute("aria-expanded", String(open));
    if (!open) search.removeAttribute("aria-activedescendant");
  }
  function destroyChart(name) {
    charts[name]?.destroy();
  }
  function setMode(mode) {
    if (mode === state.mode) return;
    const started = performance.now();
    modeViews.set(state.mode, {
      element: analysisView,
      charts,
      selected: [...state.selected],
      activePreset: state.activePreset,
      logarithmic: state.logarithmic,
      horizon: state.horizon,
      status: presetStatus.textContent,
    });
    const cached = modeViews.get(mode);
    const next = cached?.element || viewTemplate.cloneNode(true);
    analysisView.replaceWith(next);
    analysisView = next;
    charts = cached?.charts || {};
    state.mode = mode;
    state.logarithmic = cached?.logarithmic || false;
    document.querySelector("#log-scale").checked = state.logarithmic;
    if (cached) {
      state.selected = [...cached.selected];
      state.activePreset = cached.activePreset;
      presetStatus.textContent = cached.status;
      renderControls(selectedSeries());
      if (cached.horizon !== state.horizon) render();
      else Object.values(charts).forEach((chart) => chart.resize());
    } else applyPreset(mode === "macro" ? "macro" : "markets");
    if (import.meta.env.DEV)
      document.body.dataset.switchMs = (performance.now() - started).toFixed(1);
  }
  function renderPresetButtons() {
    const container = document.querySelector("#preset-list");
    if (container.dataset.mode !== state.mode) {
      container.dataset.mode = state.mode;
      container.innerHTML = `<label class="view-select">Explore a collection<select id="view-filter"><option value="custom" disabled>Custom selection</option>${presets
        .filter((preset) => preset.mode === state.mode)
        .map(
          (preset) =>
            `<option value="${preset.id}">${escapeHtml(preset.label)} — ${escapeHtml(preset.description)}</option>`,
        )
        .join("")}</select></label>`;
      const select = container.querySelector("select");
      select.value = state.activePreset || "custom";
      enhanceSelect(select);
      select.addEventListener("change", () => applyPreset(select.value));
    }
    const select = container.querySelector("select");
    select.value = state.activePreset || "custom";
    select._renderCustom?.();
  }
  async function fetchSeries(item) {
    const existing = loaded.get(item.id);
    if (existing) return existing;
    const series = await requestSeries(item, apiOrigin);
    loaded.set(series.id, series);
    state.series = [
      ...state.series.filter(({ id }) => id !== series.id),
      series,
    ];
    return series;
  }
  async function addResult(item) {
    if (!item) return;
    setSearchOpen(false);
    search.value = "";
    status.textContent = `Adding ${item.id}…`;
    try {
      const series = await fetchSeries(item);
      const nextMode =
        item.kind === "market" || seriesKind(series) === "market"
          ? "markets"
          : "macro";
      if (nextMode !== state.mode) {
        setMode(nextMode);
        state.selected = [];
      }
      if (!state.selected.includes(series.id))
        state.selected = [
          ...state.selected.slice(-(MAX_SELECTED - 1)),
          series.id,
        ];
      state.activePreset = null;
      status.textContent = `${series.name} added · ${series.observations.at(-1)[0]}`;
      presetStatus.textContent = `Custom view · ${state.selected.length} series`;
      render();
    } catch (error) {
      status.textContent = error.message;
    }
  }
  function renderSearch(items, pending = false) {
    searchResults = items;
    activeSearchIndex = 0;
    results.innerHTML = items.length
      ? items
          .map(
            (item, index) =>
              `<button class="search-result${index ? "" : " active"}" id="search-option-${index}" data-search-index="${index}" role="option" aria-selected="${!index}" type="button"><span><strong>${escapeHtml(item.id)}</strong> · ${escapeHtml(item.name)}</span><small><b>${escapeHtml(item.source)}</b>${item.meta ? ` · ${escapeHtml(item.meta)}` : ""}</small></button>`,
          )
          .join("")
      : `<div class="search-result"><span>${pending ? "Searching Yahoo Finance and FRED…" : "No matching series. Try a ticker, FRED ID, or a shorter name."}</span></div>`;
    setSearchOpen(true);
    if (items.length)
      search.setAttribute("aria-activedescendant", "search-option-0");
  }
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchRequest?.abort();
    const query = search.value.trim();
    if (!query) return setSearchOpen(false);
    const local = state.series
      .filter((series) => matchesSearch(series, query))
      .slice(0, 8)
      .map((series) => ({
        id: series.id,
        name: series.name,
        kind: seriesKind(series),
        source: series.source,
        meta: `${series.category} · ${series.frequency}`,
      }));
    renderSearch(local, true);
    const merge = (remote) => {
      const seen = new Set();
      renderSearch(
        [...local, ...remote]
          .filter((item) => !seen.has(item.id) && seen.add(item.id))
          .slice(0, 14),
      );
    };
    if (queryCache.has(query.toLowerCase()))
      return merge(queryCache.get(query.toLowerCase()));
    searchTimer = window.setTimeout(async () => {
      searchRequest = new AbortController();
      try {
        const response = await fetch(
          `${apiOrigin}/api/search?q=${encodeURIComponent(query)}`,
          { signal: searchRequest.signal },
        );
        if (response.ok && search.value.trim() === query) {
          const remote = (await response.json()).results ?? [];
          if (queryCache.size >= 80)
            queryCache.delete(queryCache.keys().next().value);
          queryCache.set(query.toLowerCase(), remote);
          merge(remote);
        } else if (search.value.trim() === query) {
          renderSearch(local);
          status.textContent =
            "Live search is temporarily unavailable; cached series remain searchable.";
        }
      } catch (error) {
        if (error.name !== "AbortError" && search.value.trim() === query) {
          renderSearch(local);
          status.textContent =
            "Live search is temporarily unavailable; cached series remain searchable.";
        }
      }
    }, 100);
  });
  search.addEventListener("keydown", (event) => {
    if (results.hidden || !searchResults.length) return;
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      activeSearchIndex =
        (activeSearchIndex +
          (event.key === "ArrowDown" ? 1 : -1) +
          searchResults.length) %
        searchResults.length;
      results.querySelectorAll("[role=option]").forEach((row, index) => {
        row.classList.toggle("active", index === activeSearchIndex);
        row.setAttribute("aria-selected", String(index === activeSearchIndex));
      });
      search.setAttribute(
        "aria-activedescendant",
        `search-option-${activeSearchIndex}`,
      );
      results.querySelector(".active")?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      void addResult(searchResults[activeSearchIndex]);
    } else if (event.key === "Escape") setSearchOpen(false);
  });
  results.addEventListener("click", (event) => {
    const button = event.target.closest("[data-search-index]");
    if (button)
      void addResult(searchResults[Number(button.dataset.searchIndex)]);
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-control")) setSearchOpen(false);
  });

  async function applyPreset(id) {
    const preset = presetById(id);
    if (!preset) return;
    state.activePreset = id;
    state.mode = preset.mode;
    state.selected = [
      ...(preset.series ?? []),
      ...(preset.symbols ?? []),
    ].filter((seriesId) => loaded.has(seriesId));
    if (preset.horizon === "max" && preset.mode === "markets") {
      state.logarithmic = true;
      document.querySelector("#log-scale").checked = true;
    }
    if (preset.horizon) {
      state.horizon = preset.horizon;
      horizon.value = preset.horizon;
      horizon._renderCustom?.();
    }
    render();
    if (
      !preset.symbols?.length ||
      preset.symbols.every((symbol) => loaded.has(symbol))
    ) {
      presetStatus.textContent = `${preset.label} · ${state.selected.length} ${preset.horizon === "max" ? "unspliced research series" : "current series"}`;
      return;
    }
    presetStatus.textContent = `Loading ${preset.label}…`;
    let renderFrame;
    const outcomes = await Promise.allSettled(
      preset.symbols.map(async (symbol) => {
        const series = await fetchSeries({
          id: symbol,
          name: symbol,
          kind: "market",
        });
        if (state.activePreset === id && !state.selected.includes(series.id)) {
          state.selected.push(series.id);
          cancelAnimationFrame(renderFrame);
          renderFrame = requestAnimationFrame(render);
        }
        return series;
      }),
    );
    cancelAnimationFrame(renderFrame);
    if (state.activePreset !== id) return;
    const available = new Set(
      outcomes.flatMap((outcome) =>
        outcome.status === "fulfilled" ? [outcome.value.id] : [],
      ),
    );
    state.selected = [
      ...(preset.series ?? []).filter((key) => loaded.has(key)),
      ...preset.symbols.filter((key) => available.has(key)),
    ].slice(0, MAX_SELECTED);
    presetStatus.textContent = `${preset.label} · ${state.selected.length}/${(preset.series?.length ?? 0) + preset.symbols.length} current series`;
    render();
  }
  function toggleSeries(id) {
    state.selected = state.selected.filter((selected) => selected !== id);
    state.activePreset = null;
    presetStatus.textContent = `Custom view · ${state.selected.length} series`;
    render();
  }
  function horizontalBarOptions({
    percent = false,
    min,
    max,
    suffix = "",
  } = {}) {
    return {
      ...chartOptions({ percent, legend: false }),
      indexAxis: "y",
      scales: {
        x: {
          type: "linear",
          min,
          max,
          grid: { color: "rgba(255,255,255,.07)" },
          ticks: { callback: (value) => `${value}${percent ? "%" : suffix}` },
        },
        y: { type: "category", grid: { display: false } },
      },
    };
  }
  function setText(id, text) {
    document.querySelector(`#${id}`).textContent = text;
  }
  function render() {
    const renderStarted = performance.now();
    const seriesList = selectedSeries();
    renderControls(seriesList);
    renderMetrics(seriesList);
    renderTrend(seriesList);
    renderHorizonChanges(seriesList);
    renderPosition(seriesList);
    renderFourth(seriesList);
    renderFifth(seriesList);
    renderRelationships(seriesList);
    renderHeatmap(seriesList);
    renderProfile(seriesList);
    renderIndividual(seriesList);
    if (import.meta.env.DEV)
      document.body.dataset.renderMs = (
        performance.now() - renderStarted
      ).toFixed(1);
  }
  function renderControls(seriesList) {
    document
      .querySelectorAll("[data-mode]")
      .forEach(
        (button) => (
          button.classList.toggle("active", button.dataset.mode === state.mode),
          button.setAttribute(
            "aria-pressed",
            String(button.dataset.mode === state.mode),
          )
        ),
      );
    document.body.dataset.analysisMode = state.mode;
    setText(
      "workspace-description",
      state.mode === "macro"
        ? "Read economic releases in comparable levels, changes, and cycle positions."
        : "Evaluate securities with return, drawdown, volatility, and correlation diagnostics.",
    );
    document.querySelector(".scale-toggle").hidden = false;
    setText("selection-count", seriesList.length);
    document.querySelector("#selected-series").innerHTML = seriesList
      .map(
        (series, index) =>
          `<button class="series-chip" data-remove="${escapeHtml(series.id)}" title="Remove ${escapeHtml(series.name)}"><i style="background:${palette[index % palette.length]}"></i>${escapeHtml(series.name)} ×</button>`,
      )
      .join("");
    document
      .querySelectorAll("[data-remove]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          toggleSeries(button.dataset.remove),
        ),
      );
    renderPresetButtons();
  }
  function annualizedView() {
    return state.horizon === "max" || Number(state.horizon) >= 365;
  }
  function renderMetrics(seriesList) {
    const returns = seriesList
      .map((series) =>
        annualizedView()
          ? annualizedCagr(series, state.horizon)
          : semanticChange(series, state.horizon),
      )
      .filter(Number.isFinite);
    const moves = seriesList
      .map((series) => semanticChange(series, state.horizon))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const percentiles = seriesList
      .map(state.mode === "macro" ? cyclePercentile : changePercentile)
      .filter(Number.isFinite);
    const latestDates = seriesList
      .map((series) => new Date(series.observations.at(-1)[0]))
      .filter((date) => Number.isFinite(date.getTime()));
    const drawdowns = seriesList
      .map((series) => maxDrawdown(series, state.horizon))
      .filter(Number.isFinite);
    const research = seriesList.some(
      ({ historyType }) => historyType === "observed_public",
    );
    const metrics =
      state.mode === "macro"
        ? [
            [String(seriesList.length), "Indicators in current view"],
            [
              percentiles.length ? format(mean(percentiles), "%") : "—",
              "Average cycle percentile",
            ],
            [
              moves.length
                ? format(
                    (moves.filter((value) => value > 0).length / moves.length) *
                      100,
                    "%",
                  )
                : "—",
              `Moving higher · ${moves.length} measured`,
            ],
            [
              latestDates.length
                ? `${Math.max(0, Math.round((Date.now() - Math.max(...latestDates)) / 86400000))}d`
                : "—",
              "Since newest observation",
            ],
          ]
        : [
            [
              String(seriesList.length),
              research
                ? "Research series in current view"
                : "Securities in current view",
            ],
            [
              returns.length ? `${signed(median(returns))}%` : "—",
              annualizedView()
                ? "Median annualized return"
                : "Median window return",
            ],
            [
              moves.length
                ? format(
                    (moves.filter((value) => value > 0).length / moves.length) *
                      100,
                    "%",
                  )
                : "—",
              `Positive returns · ${moves.length} measured`,
            ],
            [
              drawdowns.length ? format(Math.min(...drawdowns), "%") : "—",
              "Deepest observed drawdown",
            ],
          ];
    document.querySelector("#dashboard-metrics").innerHTML = metrics
      .map(
        ([value, label]) =>
          `<div class="dashboard-metric"><span class="metric-value">${value}</span><span class="metric-label">${label}</span></div>`,
      )
      .join("");
  }
  function renderTrend(seriesList) {
    destroyChart("trend");
    const macro = state.mode === "macro";
    const pointLists = seriesList.map((series) => {
      const visible = sliceHorizon(series.observations, state.horizon);
      return macro
        ? standardize(
            sliceHorizon(macroSignal(series), state.horizon),
            macroSignal(series),
          )
        : transform(
            Number.isFinite(semanticChange(series, state.horizon))
              ? sliceWindow(series, state.horizon).points
              : visible,
            "indexed",
          );
    });
    const research = seriesList.some(
      ({ historyType }) => historyType === "observed_public",
    );
    setText("trend-kicker", macro ? "01 · Cycle" : "01 · Performance");
    setText(
      "trend-title",
      macro ? "Economic cycle comparison" : "Indexed return path",
    );
    setText(
      "trend-note",
      macro
        ? "Growth rates for quantities; levels for rates/signed indexes. Each standardized against its own history."
        : research
          ? "Public research returns rebased to 100; not ETF prices or stitched histories"
          : "First visible adjusted close = 100",
    );
    charts.trend = timeChart("#trend-chart", seriesList, pointLists, {
      logarithmic: !macro && state.logarithmic,
    });
  }
  function renderIndividual(seriesList) {
    Object.keys(charts)
      .filter((key) => key.startsWith("individual-"))
      .forEach((key) => {
        destroyChart(key);
        delete charts[key];
      });
    const container = document.querySelector("#series-charts");
    container.innerHTML = seriesList
      .map(
        (series, index) =>
          `<article class="chart-card" data-chart-card><div class="chart-heading"><div><span class="chart-kicker">${escapeHtml(series.category)} · ${escapeHtml(series.frequency)}</span><h2>${escapeHtml(series.name)}</h2></div><button class="chart-expand" type="button" aria-label="Expand ${escapeHtml(series.name)}">${expandIcon}</button></div><div class="chart-subhead">${format(series.observations.at(-1)[1])} ${escapeHtml(series.unit)} · observation ${series.observations.at(-1)[0]}</div><div class="chart-wrap" id="individual-${index}"></div></article>`,
      )
      .join("");
    seriesList.forEach((series, index) => {
      charts[`individual-${index}`] = timeChart(
        `#individual-${index}`,
        [series],
        [sliceHorizon(series.observations, state.horizon)],
        { logarithmic: state.logarithmic },
      );
    });
  }
  const scoreCache = new WeakMap();
  function changeScore(series, days) {
    let cache = scoreCache.get(series);
    if (!cache) {
      cache = new Map();
      scoreCache.set(series, cache);
    }
    if (cache.has(days)) return cache.get(days);
    const samples = rollingHorizonChanges(series, days).map(
      ([, value]) => value,
    );
    const average = mean(samples);
    const deviation = Math.sqrt(
      samples.reduce((sum, value) => sum + (value - average) ** 2, 0) /
        (samples.length - 1),
    );
    const value =
      samples.length >= 3 && deviation
        ? (samples.at(-1) - average) / deviation
        : NaN;
    cache.set(days, value);
    return value;
  }
  function renderHorizonChanges(seriesList) {
    destroyChart("ranking");
    const macro = state.mode === "macro";
    const longHistory = seriesList.some(
      ({ category }) => category === "Long-History Asset Classes",
    );
    const horizons = longHistory
      ? [
          ["1Y", 365],
          ["5Y", 1825],
          ["10Y", 3650],
        ]
      : [
          ["1M", 30],
          ["3M", 90],
          ["1Y", 365],
        ];
    setText(
      "ranking-title",
      macro ? "Change momentum score" : "Returns across horizons",
    );
    setText(
      "ranking-note",
      macro
        ? "Each change versus its own historical norm; 0 is typical"
        : longHistory
          ? "Long-horizon compounded return; percent"
          : "Provider-adjusted price/research-index return; percent",
    );
    charts.ranking = new Chart(document.querySelector("#ranking-chart"), {
      type: "bar",
      data: {
        labels: seriesList.map(chartLabel),
        datasets: horizons.map(([label, days], index) => ({
          label,
          data: seriesList.map((series) =>
            macro ? changeScore(series, days) : semanticChange(series, days),
          ),
          backgroundColor: palette[index],
          borderRadius: 3,
        })),
      },
      options: chartOptions(),
    });
  }
  function renderPosition(seriesList) {
    destroyChart("correlation");
    const rows = seriesList
      .map((series) => ({
        label: chartLabel(series),
        value:
          state.mode === "macro"
            ? cyclePercentile(series)
            : changePercentile(series),
      }))
      .filter(({ value }) => Number.isFinite(value));
    setText(
      "position-title",
      state.mode === "macro"
        ? "Economic cycle percentile"
        : "Return momentum percentile",
    );
    setText(
      "position-note",
      state.mode === "macro"
        ? "Growth percentile for quantities; level percentile for rates and signed indexes. Full-history midpoint ranks."
        : "Latest native-period return ranked against its own history",
    );
    charts.correlation = new Chart(
      document.querySelector("#correlation-chart"),
      {
        type: "bar",
        data: {
          labels: rows.map(({ label }) => label),
          datasets: [
            {
              label: "Percentile",
              data: rows.map(({ value }) => value),
              backgroundColor: "rgba(245,218,150,.75)",
              borderRadius: 4,
            },
          ],
        },
        options: horizontalBarOptions({ min: 0, max: 100, suffix: "th" }),
      },
    );
  }
  function renderFourth(seriesList) {
    destroyChart("drawdown");
    if (state.mode === "markets") {
      setText("metric-four-kicker", "04 · Drawdown");
      setText("metric-four-title", "Underwater history");
      setText(
        "metric-four-note",
        "Native-frequency decline from the window’s running peak. Moves between observations are not captured.",
      );
      charts.drawdown = timeChart(
        "#drawdown-chart",
        seriesList,
        seriesList.map((series) => drawdownPath(series, state.horizon)),
        { suffix: "%" },
      );
      return;
    }
    setText("metric-four-kicker", "04 · Momentum");
    setText("metric-four-title", "Observation momentum");
    setText(
      "metric-four-note",
      "Native observation-to-observation changes standardized within each series",
    );
    const pointLists = seriesList.map((series) => {
      const visible = rollingChanges(series, state.horizon);
      return standardize(visible, rollingChanges(series));
    });
    charts.drawdown = timeChart("#drawdown-chart", seriesList, pointLists);
  }
  function renderFifth(seriesList) {
    destroyChart("volatility");
    if (state.mode === "markets") {
      setText("metric-five-kicker", "05 · Risk");
      setText("metric-five-title", "Annualized volatility");
      setText(
        "metric-five-note",
        "Standard deviation of native-frequency log returns, annualized",
      );
      const rows = seriesList
        .map((series) => ({
          label: chartLabel(series),
          value: volatility(series, state.horizon),
        }))
        .filter(({ value }) => Number.isFinite(value));
      charts.volatility = new Chart(
        document.querySelector("#volatility-chart"),
        {
          type: "bar",
          data: {
            labels: rows.map(({ label }) => label),
            datasets: [
              {
                label: "Annualized volatility",
                data: rows.map(({ value }) => value),
                backgroundColor: "rgba(96,165,250,.72)",
                borderRadius: 4,
              },
            ],
          },
          options: horizontalBarOptions({ percent: true, min: 0 }),
        },
      );
      return;
    }
    setText("metric-five-kicker", "05 · Freshness");
    setText("metric-five-title", "Observation age");
    setText(
      "metric-five-note",
      "Days since observation date—not publication date. Monthly/quarterly periods naturally look older.",
    );
    const rows = seriesList.map((series) => ({
      label: chartLabel(series),
      value: Math.max(
        0,
        Math.round(
          (Date.now() - new Date(series.observations.at(-1)[0])) / 86400000,
        ),
      ),
    }));
    charts.volatility = new Chart(document.querySelector("#volatility-chart"), {
      type: "bar",
      data: {
        labels: rows.map(({ label }) => label),
        datasets: [
          {
            label: "Days",
            data: rows.map(({ value }) => value),
            backgroundColor: "rgba(96,165,250,.72)",
            borderRadius: 4,
          },
        ],
      },
      options: horizontalBarOptions({ min: 0, suffix: "d" }),
    });
  }
  function comparisonPeriod(seriesList) {
    return seriesList.some(({ frequency }) => frequency === "annual")
      ? "year"
      : seriesList.some(({ frequency }) => frequency === "quarterly")
        ? "quarter"
        : "month";
  }
  function renderRelationships(seriesList) {
    destroyChart("risk");
    const anchor = seriesList[0];
    const period = comparisonPeriod(seriesList);
    setText(
      "relationship-note",
      anchor
        ? `Against ${anchor.name}. Complete ${period} changes; n = paired observations. No causality implied.`
        : "Add at least two series.",
    );
    const rows = anchor
      ? seriesList
          .slice(1)
          .map((series) => ({
            label: chartLabel(series),
            ...correlationDetails(anchor, series, {
              horizon: state.horizon,
              period,
            }),
          }))
          .filter(({ value }) => Number.isFinite(value))
      : [];
    charts.risk = new Chart(document.querySelector("#risk-chart"), {
      type: "bar",
      data: {
        labels: rows.map(({ label, n }) => `${label} (n=${n})`),
        datasets: [
          {
            label: anchor ? `Correlation to ${anchor.name}` : "Correlation",
            data: rows.map(({ value }) => value),
            backgroundColor: rows.map(({ value }) =>
              value >= 0 ? "rgba(125,211,167,.72)" : "rgba(241,151,141,.72)",
            ),
            borderRadius: 4,
          },
        ],
      },
      options: horizontalBarOptions({ min: -1, max: 1 }),
    });
  }
  function renderHeatmap(seriesList) {
    const period = comparisonPeriod(seriesList);
    const annual = period === "year";
    const quarterly = period === "quarter";
    const monthly = seriesList.map((series) => ({
      series,
      values: periodChanges(series, period, state.horizon).map(
        ({ period: month, value: change }) => ({ month, change }),
      ),
    }));
    const months = [
      ...new Set(
        monthly.flatMap((row) => row.values.map(({ month }) => month)),
      ),
    ]
      .sort()
      .slice(-12);
    const cells = [
      `<div class="heatmap-corner">Series</div>`,
      ...months.map(
        (month) =>
          `<div class="heatmap-month">${annual || quarterly ? month : new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })}</div>`,
      ),
    ];
    for (const row of monthly) {
      const byMonth = new Map(
        row.values.map((value) => [value.month, value.change]),
      );
      const magnitudes = row.values
        .map(({ change }) => Math.abs(change))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      const scale = magnitudes[Math.floor(magnitudes.length * 0.9)] || 1;
      cells.push(
        `<div class="heatmap-label" title="${escapeHtml(row.series.name)}">${escapeHtml(row.series.name)}<small>${escapeHtml(changeSuffix(row.series))}</small></div>`,
      );
      for (const month of months) {
        const value = byMonth.get(month);
        const intensity = Number.isFinite(value)
          ? Math.min(0.86, 0.14 + (Math.abs(value) / scale) * 0.62)
          : 0;
        const background = !Number.isFinite(value)
          ? "transparent"
          : value >= 0
            ? `rgba(34,197,94,${intensity})`
            : `rgba(244,63,94,${intensity})`;
        const label = Number.isFinite(value)
          ? `${row.series.name}, ${month}: ${signed(value)}${changeSuffix(row.series)}`
          : `${row.series.name}, ${month}: no observation`;
        cells.push(
          `<div class="heatmap-cell" tabindex="0" style="background:${background}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${Number.isFinite(value) ? format(value) : "—"}</div>`,
        );
      }
    }
    const heatmap = document.querySelector("#monthly-heatmap");
    heatmap.style.setProperty("--heatmap-months", months.length || 1);
    heatmap.innerHTML = cells.join("");
    if (!months.length)
      heatmap.innerHTML =
        '<p class="chart-empty">No complete calendar periods in this window. Choose a longer horizon.</p>';
    setText(
      "heatmap-title",
      annual
        ? "Annual change heat map"
        : quarterly
          ? "Quarter-over-quarter change"
          : state.mode === "macro"
            ? "Month-over-month change"
            : "Monthly return heat map",
    );
    setText(
      "heatmap-note",
      `Complete ${period}s within the selected window (latest 12). Row units shown; green is higher, not necessarily better.`,
    );
  }
  function renderProfile(seriesList) {
    destroyChart("profile");
    if (state.mode === "markets") {
      setText("profile-title", "Return versus risk");
      setText(
        "profile-note",
        `${annualizedView() ? "Annualized" : "Window"} return vs native-frequency risk. Different sample periods/frequencies are not directly comparable; inspect source details.`,
      );
      charts.profile = new Chart(document.querySelector("#profile-chart"), {
        type: "scatter",
        data: {
          datasets: seriesList.map((series, index) => ({
            label: chartLabel(series),
            data: [
              {
                x: volatility(series, state.horizon),
                y: annualizedView()
                  ? annualizedCagr(series, state.horizon)
                  : semanticChange(series, state.horizon),
              },
            ],
            pointRadius: 6,
            pointHoverRadius: 8,
            backgroundColor: palette[index % palette.length],
          })),
        },
        options: {
          ...chartOptions(),
          scales: {
            x: {
              title: { display: true, text: "Annualized volatility (%)" },
              grid: { color: "rgba(255,255,255,.07)" },
            },
            y: {
              title: {
                display: true,
                text: annualizedView()
                  ? "Annualized return (%)"
                  : "Window return (%)",
              },
              grid: { color: "rgba(255,255,255,.07)" },
            },
          },
        },
      });
      return;
    }
    setText("profile-title", "Category breadth");
    setText(
      "profile-note",
      "Share of selected indicators with a positive window change; direction, not economic desirability",
    );
    const groups = new Map();
    for (const series of seriesList) {
      const value = semanticChange(series, state.horizon);
      if (Number.isFinite(value))
        groups.set(series.category, [
          ...(groups.get(series.category) ?? []),
          value,
        ]);
    }
    const rows = [...groups].map(([label, values]) => ({
      label,
      value: (values.filter((value) => value > 0).length / values.length) * 100,
    }));
    charts.profile = new Chart(document.querySelector("#profile-chart"), {
      type: "bar",
      data: {
        labels: rows.map(({ label }) => label),
        datasets: [
          {
            label: "Moving higher",
            data: rows.map(({ value }) => value),
            backgroundColor: "rgba(245,218,150,.72)",
            borderRadius: 4,
          },
        ],
      },
      options: horizontalBarOptions({ min: 0, max: 100, percent: true }),
    });
  }
  await applyPreset("macro");
  const warmMarkets = async () => {
    const symbols = [...(presetById("markets")?.symbols ?? [])];
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (symbols.length) {
          const id = symbols.shift();
          try {
            await fetchSeries({ id, kind: "market" });
          } catch {
            /* Optional providers do not block bundled data. */
          }
        }
      }),
    );
  };
  if ("requestIdleCallback" in window)
    window.requestIdleCallback(warmMarkets, { timeout: 2000 });
  else window.setTimeout(warmMarkets, 500);
}

main().catch((error) => {
  console.error(error);
  document.querySelector("main").innerHTML =
    `<p class="empty-state">${escapeHtml(error.message)}</p>`;
});
