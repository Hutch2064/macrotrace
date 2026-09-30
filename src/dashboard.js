import { loadSnapshot, loadHistories } from "./data-store.js";
import {
  mountChrome,
  format,
  signed,
  changeClass,
  dateLabel,
  escapeHtml as escape,
  expandIcon,
  downloadCsv,
  showError,
} from "./common.js";
import { filterSeries, transformSeries } from "./panel.js";
import { enhanceSelect } from "./select.js";
import { timeChart } from "./time-chart.js";
import { lazyChart } from "./lazy-chart.js";

const $ = (selector) => document.querySelector(selector);
const PAGE_SIZE = 6,
  TABLE_SIZE = 40;
const priority = [
  "CPIAUCSL",
  "CPILFESL",
  "PCEPI",
  "PCEPILFE",
  "T5YIE",
  "T10YIE",
  "UNRATE",
  "PAYEMS",
  "GDPC1",
  "FEDFUNDS",
  "HOUST",
  "INDPRO",
];
const state = {
  category: "Inflation",
  geography: "all",
  frequency: "all",
  search: "",
  period: "5",
  measure: "yoy",
  group: "category",
  start: "",
  end: "",
};
let snapshot,
  matched = [],
  transformed = new Map(),
  rows = [],
  page = 0,
  tablePage = 0,
  revision = 0;
let plots = [],
  expanded,
  expandedSeries;
const transformCache = new WeakMap();
const measureLabels = {
  level: "Reported level",
  yoy: "Year-over-year change",
  change: "Previous-observation change",
};
function latestDate() {
  return snapshot.series.reduce((latest, series) => {
    const date =
      series.coverage?.latest?.[0] || series.observations?.at(-1)?.[0];
    return date > latest ? date : latest;
  }, "1000-01-01");
}
function range(period = state.period) {
  const end =
    period === "custom" || period === "current" ? state.end : latestDate();
  if (period === "custom" || period === "current")
    return { start: state.start, end };
  if (period === "max") return { start: "1000-01-01", end };
  const start = new Date(end + "T00:00:00Z");
  start.setUTCFullYear(start.getUTCFullYear() - Number(period));
  return { start: start.toISOString().slice(0, 10), end };
}
function readings(series, scope = range()) {
  let cache = transformCache.get(series);
  if (!cache) transformCache.set(series, (cache = new Map()));
  const key = [state.measure, scope.start, scope.end].join("/");
  if (!cache.has(key))
    cache.set(
      key,
      transformSeries(series, { ...scope, measure: state.measure }),
    );
  // Bound browser calculations as the reader explores many custom windows.
  if (cache.size > 12) cache.delete(cache.keys().next().value);
  return cache.get(key);
}
const visibleSeries = () =>
  matched.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
const finite = (points) =>
  points.filter((point) => Number.isFinite(point.value));
function prepareOptions(select, values, allLabel) {
  select.replaceChildren(
    ...[["all", allLabel], ...values.map((value) => [value, value])].map(
      ([value, label]) => new Option(label, value),
    ),
  );
}
function metric(label, value, note) {
  return `<div class="headline-metric"><span class="metric-label">${escape(label)}</span><span class="metric-value">${escape(value)}</span><span class="metric-date">${escape(note)}</span></div>`;
}
async function render() {
  const token = ++revision;
  const selected = filterSeries(snapshot.series, state).sort((a, b) => {
    const first = priority.indexOf(a.id),
      second = priority.indexOf(b.id);
    return (
      (first < 0 ? 999 : first) - (second < 0 ? 999 : second) ||
      a.name.localeCompare(b.name)
    );
  });
  const scope = range();
  $("#date-range").hidden = state.period !== "custom";
  if (scope.start > scope.end) {
    $("#panel-status").textContent =
      "The start date must be on or before the end date.";
    return;
  }
  $("#panel-status").textContent = selected.some(
    (series) => !series.observations,
  )
    ? "Retrieving the selected cached histories…"
    : "";
  $("#main").setAttribute("aria-busy", "true");
  try {
    await loadHistories(
      snapshot,
      selected.map(({ id }) => id),
    );
    if (token !== revision) return;
    matched = selected;
    transformed = new Map(
      matched.map((series) => [series.id, readings(series, scope)]),
    );
    rows = matched.flatMap((series) =>
      transformed.get(series.id).map((point) => ({ series, ...point })),
    );
    rows.sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        a.series.name.localeCompare(b.series.name),
    );
    page = Math.min(
      page,
      Math.max(0, Math.ceil(matched.length / PAGE_SIZE) - 1),
    );
    tablePage = 0;
    const comparable = rows.filter((row) => Number.isFinite(row.value)).length;
    const geographies = new Set(rows.map((row) => row.series.geography));
    $("#dashboard-metrics").innerHTML =
      metric(
        "Indicators",
        format(new Set(rows.map((row) => row.series.id)).size),
        `${matched.length} match the metadata filters`,
      ) +
      metric(
        "Observations",
        format(rows.length),
        "Actual source rows in this period",
      ) +
      metric(
        "Geographies",
        format(geographies.size),
        "Distinct source geographies",
      ) +
      metric(
        "Comparable readings",
        format(comparable),
        measureLabels[state.measure],
      );
    $("#measure-note").textContent =
      state.measure === "level"
        ? "Original source units. Separate axes keep unlike indicators separate."
        : state.measure === "yoy"
          ? "Calendar-year change: percentage points for rates; percent for positive prices and quantities; native points for signed indexes."
          : "Change from the previous actual observation—not necessarily one day or month. Rate changes are percentage points.";
    const retained = matched.filter((series) => series.refreshStatus).length;
    $("#panel-status").textContent =
      `${dateLabel(scope.start)} – ${dateLabel(scope.end)} · ${matched.length} indicators${retained ? ` · ${retained} histories retained after upstream retrieval failures` : ""}${!rows.length ? " · No observations match this view." : ""}`;
    renderSeries();
    renderBreadth();
    renderTable();
  } catch (error) {
    if (token === revision)
      $("#panel-status").textContent =
        "A selected history is temporarily unavailable. Change a filter or reset to retry; the previous complete view remains visible.";
    console.error(error);
  } finally {
    if (token === revision) $("#main").setAttribute("aria-busy", "false");
  }
}
function renderSeries() {
  plots.splice(0).forEach((plot) => plot.destroy());
  const current = visibleSeries();
  $("#series-page").textContent = matched.length
    ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, matched.length)} of ${matched.length}`
    : "0 indicators";
  $("#series-previous").disabled = page === 0;
  $("#series-next").disabled = (page + 1) * PAGE_SIZE >= matched.length;
  $("#series-charts").innerHTML =
    current
      .map((series) => {
        const points = transformed.get(series.id);
        const latest = finite(points).at(-1);
        return `<article class="chart-card indicator-card"><div class="chart-heading"><h3>${escape(series.name)}</h3><button class="chart-expand" type="button" data-series="${escape(series.id)}" aria-label="Expand ${escape(series.name)}">${expandIcon}</button></div><div class="indicator-meta"><span>${escape(series.frequency)} · ${escape(latest?.unit || series.unit)}</span><b class="${state.measure !== "level" ? changeClass(latest?.value) : ""}">${state.measure === "level" ? format(latest?.value) : signed(latest?.value)}</b></div><div class="indicator-plot" data-plot="${escape(series.id)}"></div><p class="chart-subhead">${dateLabel(points.at(-1)?.date)}${series.refreshStatus ? " · Retained snapshot" : ""}</p></article>`;
      })
      .join("") ||
    '<p class="empty-panel">No indicators match these filters. Try another topic, geography or frequency, or reset the view.</p>';
  for (const host of $("#series-charts").querySelectorAll("[data-plot]")) {
    const series = current.find((series) => series.id === host.dataset.plot);
    const points = finite(transformed.get(series.id));
    plots.push(
      lazyChart(host, () =>
        timeChart(
          host,
          [series],
          [points.map(({ date, value }) => [date, value])],
          {
            suffix: points[0]?.unit ? " " + points[0].unit : "",
            signedValues: state.measure !== "level",
          },
        ),
      ),
    );
  }
  renderPosition(current);
  renderHeatmap(current);
}
function renderPosition(current) {
  $("#position-chart").innerHTML =
    current
      .map((series) => {
        const points = finite(transformed.get(series.id));
        const latest = points.at(-1);
        // Midrank prevents every tied or constant observation from ranking at 100.
        const lower = points.filter(
          (point) => point.value < latest?.value,
        ).length;
        const equal = points.filter(
          (point) => point.value === latest?.value,
        ).length;
        const rank =
          points.length > 1
            ? (100 * (lower + (equal - 1) / 2)) / (points.length - 1)
            : null;
        return `<div class="position-row" title="${escape(series.name)} · ${format(latest?.value)} ${escape(latest?.unit)} · ${points.length} readings"><span class="position-label">${escape(series.name)}</span><div class="position-track">${rank !== null ? `<i class="position-marker" style="left:${rank}%"></i>` : ""}</div><span class="position-reading">${format(rank)}${rank === null ? "" : "%"}</span></div>`;
      })
      .join("") ||
    '<p class="chart-empty">No eligible history in this view.</p>';
}
function renderBreadth() {
  const groups = new Map();
  for (const series of matched) {
    const latest = finite(transformed.get(series.id)).at(-1);
    if (!latest) continue;
    const name = series[state.group] || "Unspecified";
    if (!groups.has(name))
      groups.set(name, { positive: 0, negative: 0, zero: 0 });
    groups.get(name)[
      latest.value > 0 ? "positive" : latest.value < 0 ? "negative" : "zero"
    ]++;
  }
  $("#breadth-note").textContent =
    state.measure === "level"
      ? "Share of latest reported levels above, below or equal to zero. Original units are not averaged."
      : "Share of latest eligible changes above, below or equal to zero. Higher does not necessarily mean better.";
  $("#breadth-chart").innerHTML =
    [...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, counts]) => {
        const total = counts.positive + counts.negative + counts.zero;
        return `<div class="breadth-row" title="${escape(name)}: ${counts.positive} above zero, ${counts.negative} below zero, ${counts.zero} unchanged"><span>${escape(name)}</span><div class="breadth-track" role="img" aria-label="${escape(name)}: ${counts.positive} above zero; ${counts.negative} below zero; ${counts.zero} equal to zero">${[
          ["positive", counts.positive],
          ["negative", counts.negative],
          ["neutral", counts.zero],
        ]
          .map(
            ([color, count]) =>
              `<span class="${color}-bg" style="width:${(count / total) * 100}%"></span>`,
          )
          .join(
            "",
          )}</div><span class="breadth-reading">n=${total}</span></div>`;
      })
      .join("") ||
    '<p class="chart-empty">No comparable readings in this view.</p>';
}
function renderHeatmap(current) {
  const end = range().end;
  const date = new Date(end + "T00:00:00Z");
  date.setUTCDate(1);
  const months = Array.from({ length: 12 }, (_, i) => {
    const month = new Date(date);
    month.setUTCMonth(month.getUTCMonth() - 11 + i);
    return month.toISOString().slice(0, 7);
  }).filter((month) => month >= range().start.slice(0, 7));
  $("#heatmap-unit").textContent = measureLabels[state.measure];
  $("#panel-heatmap").innerHTML = current.length
    ? `<table class="heatmap-table"><thead><tr><th>Indicator / unit</th>${months.map((month) => `<th>${new Date(month + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })}</th>`).join("")}</tr></thead><tbody>${current
        .map((series) => {
          const points = transformed.get(series.id),
            byMonth = new Map(
              points.map((point) => [point.date.slice(0, 7), point]),
            );
          const scale =
            Math.max(
              ...finite(points).map((point) => Math.abs(point.value)),
              0,
            ) || 1;
          return `<tr><td class="row-label">${escape(series.name)}<small> · ${escape(points.find((point) => point.unit)?.unit || series.unit)}</small></td>${months
            .map((month) => {
              const point = byMonth.get(month),
                value = point?.value;
              const alpha = Number.isFinite(value)
                ? 0.08 + Math.min(0.6, (Math.abs(value) / scale) * 0.6)
                : 0.025;
              const background = Number.isFinite(value)
                ? value < 0
                  ? `rgba(241,151,141,${alpha})`
                  : `rgba(125,211,167,${alpha})`
                : "rgba(255,255,255,.025)";
              const label = `${series.name} · ${point?.date || month} · ${format(value)} ${point?.unit || ""}`;
              return `<td><button class="heatmap-cell" style="background:${background}" data-reading="${escape(label)}" aria-label="${escape(label)}">${format(value)}</button></td>`;
            })
            .join("")}</tr>`;
        })
        .join("")}</tbody></table>`
    : '<p class="chart-empty">No monthly observations in this view.</p>';
}
function renderTable() {
  const pages = Math.max(1, Math.ceil(rows.length / TABLE_SIZE));
  tablePage = Math.min(tablePage, pages - 1);
  $("#table-count").textContent =
    `${format(rows.length)} source observations · ${measureLabels[state.measure]} · missing comparisons remain unavailable`;
  $("#table-page").textContent = `Page ${tablePage + 1} of ${format(pages)}`;
  $("#table-previous").disabled = tablePage === 0;
  $("#table-next").disabled = tablePage >= pages - 1;
  $("#observations-table").innerHTML =
    rows
      .slice(tablePage * TABLE_SIZE, (tablePage + 1) * TABLE_SIZE)
      .map(
        (row) =>
          `<tr><td>${escape(row.series.name)}<small>${escape(row.series.id)} · ${escape(row.series.frequency)}</small></td><td>${escape(row.series.category)}<small>${escape(row.series.geography)}</small></td><td>${escape(row.date)}</td><td>${format(row.raw)} <small>${escape(row.series.unit)}</small></td><td class="${state.measure !== "level" ? changeClass(row.value) : ""}">${state.measure === "level" ? format(row.value) : signed(row.value)} <small>${escape(row.unit || "")}</small></td><td><a href="${escape(row.series.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escape(row.series.provider || row.series.source)} ↗</a></td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="6">No observations match these filters.</td></tr>';
}
function renderExpanded() {
  if (!expandedSeries) return;
  expanded?.destroy();
  const scope =
    $("#dialog-period").value === "current"
      ? range()
      : range($("#dialog-period").value);
  const points = finite(readings(expandedSeries, scope));
  const logarithmic = $("#dialog-log").checked;
  const eligible = points.length > 1 && points.every(({ value }) => value > 0);
  $("#dialog-log").disabled = !eligible;
  if (!eligible) $("#dialog-log").checked = false;
  $("#dialog-title").textContent = expandedSeries.name;
  $("#dialog-source").textContent =
    `${expandedSeries.geography} · ${expandedSeries.frequency} · ${expandedSeries.provider || expandedSeries.source}`;
  $("#dialog-note").textContent =
    `${measureLabels[state.measure]} · ${dateLabel(scope.start)} – ${dateLabel(scope.end)}. Drag horizontally to zoom; double-click to reset. Click a legend to toggle it. Arrow keys inspect dates.${eligible ? "" : " Log scale requires every plotted value to be strictly positive."}`;
  expanded = timeChart(
    $("#expanded-chart"),
    [expandedSeries],
    [points.map(({ date, value }) => [date, value])],
    {
      logarithmic: logarithmic && eligible,
      suffix: points[0]?.unit ? " " + points[0].unit : "",
      signedValues: state.measure !== "level",
    },
  );
}
function updateState() {
  for (const key of [
    "category",
    "geography",
    "frequency",
    "period",
    "measure",
    "group",
    "start",
    "end",
  ])
    state[key] = $("#" + key + "-filter").value;
  state.search = $("#series-search").value.trim();
  page = 0;
  tablePage = 0;
  if (state.period !== "custom") {
    const scope = range();
    state.start = scope.start;
    state.end = scope.end;
    $("#start-filter").value = scope.start;
    $("#end-filter").value = scope.end;
  }
  if ($("#chart-dialog").open) $("#chart-dialog").close();
  void render();
}
async function main() {
  snapshot = await loadSnapshot();
  mountChrome(snapshot, "dashboard");
  prepareOptions(
    $("#category-filter"),
    [...new Set(snapshot.series.map((series) => series.category))].sort(),
    "All topics",
  );
  prepareOptions(
    $("#geography-filter"),
    [...new Set(snapshot.series.map((series) => series.geography))]
      .filter(Boolean)
      .sort(),
    "All geographies",
  );
  prepareOptions(
    $("#frequency-filter"),
    ["daily", "weekly", "monthly", "quarterly", "annual"].filter((frequency) =>
      snapshot.series.some((series) => series.frequency === frequency),
    ),
    "All frequencies",
  );
  const topic = new URLSearchParams(location.search).get("topic");
  if (snapshot.series.some((series) => series.category === topic))
    state.category = topic;
  $("#category-filter").value = state.category;
  const scope = range();
  state.start = scope.start;
  state.end = scope.end;
  $("#start-filter").value = scope.start;
  $("#end-filter").value = scope.end;
  for (const select of document.querySelectorAll("select"))
    enhanceSelect(select);
  for (const key of [
    "category",
    "geography",
    "frequency",
    "period",
    "measure",
    "group",
    "start",
    "end",
  ])
    $("#" + key + "-filter").addEventListener("change", updateState);
  let searchTimer;
  $("#series-search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(updateState, 150);
  });
  $("#reset-filters").addEventListener("click", () => {
    clearTimeout(searchTimer);
    for (const [key, value] of Object.entries({
      category: "Inflation",
      geography: "all",
      frequency: "all",
      period: "5",
      measure: "yoy",
      group: "category",
    })) {
      const control = $("#" + key + "-filter");
      control.value = value;
      control._renderCustom?.();
    }
    $("#series-search").value = "";
    updateState();
  });
  $("#series-previous").addEventListener("click", () => {
    page--;
    renderSeries();
  });
  $("#series-next").addEventListener("click", () => {
    page++;
    renderSeries();
  });
  $("#table-previous").addEventListener("click", () => {
    tablePage--;
    renderTable();
  });
  $("#table-next").addEventListener("click", () => {
    tablePage++;
    renderTable();
  });
  $("#series-charts").addEventListener("click", (event) => {
    const button = event.target.closest("[data-series]");
    if (!button) return;
    expandedSeries = matched.find(
      (series) => series.id === button.dataset.series,
    );
    $("#dialog-period").value = "current";
    $("#dialog-period")._renderCustom?.();
    $("#dialog-log").checked = false;
    $("#chart-dialog").showModal();
    renderExpanded();
  });
  $("#chart-dialog").addEventListener("close", () => {
    expanded?.destroy();
    expanded = undefined;
    expandedSeries = undefined;
  });
  $("#dialog-close").addEventListener("click", () =>
    $("#chart-dialog").close(),
  );
  $("#dialog-period").addEventListener("change", renderExpanded);
  $("#dialog-log").addEventListener("change", renderExpanded);
  $("#dialog-reset").addEventListener("click", () => expanded?.reset());
  for (const event of ["pointerover", "focusin"])
    $("#panel-heatmap").addEventListener(event, (event) => {
      const cell = event.target.closest("[data-reading]");
      if (cell) $("#heatmap-reading").textContent = cell.dataset.reading;
    });
  $("#download-data").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const exportScope = rows,
      exportMeasure = state.measure;
    function* exportRows() {
      for (const row of exportScope)
        yield {
          indicator: row.series.id,
          name: row.series.name,
          topic: row.series.category,
          geography: row.series.geography,
          frequency: row.series.frequency,
          date: row.date,
          reported_value: row.raw,
          reported_unit: row.series.unit,
          measure: exportMeasure,
          measure_value: row.value,
          measure_unit: row.unit,
          source: row.series.source,
          source_url: row.series.sourceUrl,
          checked_at: row.series.checkedAt,
          refresh_status: row.series.refreshStatus || "successful",
        };
    }
    button.disabled = true;
    button.textContent = "Preparing CSV…";
    try {
      await downloadCsv(exportRows(), "macrotrace-panel.csv");
    } finally {
      button.disabled = false;
      button.textContent = "Download filtered CSV ↓";
    }
  });
  const freshness = () => {
    $("#freshness").textContent =
      `Snapshot ${dateLabel(snapshot.generatedAt)} · daily source checks · observation dates vary`;
  };
  freshness();
  document.addEventListener("snapshot-updated", (event) => {
    snapshot = event.detail;
    freshness();
    void render();
  });
  await render();
}
main().catch((error) => showError($("#panel-status"), error));
