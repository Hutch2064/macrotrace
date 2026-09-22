import { loadSnapshot, mountChrome } from "./common.js";
import { readCachedSeries } from "./series-cache.js";
import { initDisclosure, openDisclosure } from "./disclosure.js";
import { loadHistory } from "./data-store.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );

const formatNumber = (value) => {
  if (!Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 8,
  }).format(value);
};

const formatDate = (value) => {
  if (!value) return "Unavailable";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
};

const isYahoo = (series) =>
  series?.historyType !== "proxy_splice" &&
  (String(series?.source ?? "")
    .toLowerCase()
    .includes("yahoo") ||
    String(series?.sourceUrl ?? "")
      .toLowerCase()
      .includes("yahoo"));

const observationBounds = (series) => {
  if (series.coverage) return series.coverage;
  const observations = Array.isArray(series?.observations)
    ? series.observations.filter(
        (observation) =>
          Array.isArray(observation) &&
          observation.length >= 2 &&
          observation[0] &&
          Number.isFinite(observation[1]),
      )
    : [];
  return {
    count: observations.length,
    first: observations[0],
    latest: observations.at(-1),
  };
};

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const downloadCsv = (filename, rows) => {
  const blob = new Blob(
    [rows.map((row) => row.map(csvCell).join(",")).join("\n")],
    {
      type: "text/csv;charset=utf-8",
    },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const exportObservations = (series) => {
  const bounds = observationBounds(series);
  downloadCsv(`${series.id}-observations.csv`, [
    ["series_id", "date", "value"],
    ...(series.observations ?? []).map(([date, value]) => [
      series.id,
      date,
      value,
    ]),
  ]);
  return bounds;
};

const renderOptionalField = (label, value) =>
  value ? `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>` : "";

const renderSeries = (series) => {
  const bounds = observationBounds(series);
  const firstDate = bounds.first?.[0];
  const latestDate = bounds.latest?.[0];
  const latestValue = bounds.latest?.[1];
  const sourceUrl = series.sourceUrl || series.sourceDownloadUrl;
  const sourceLink = sourceUrl
    ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(series.source || "Public source")} ↗</a>`
    : escapeHtml(series.source || "Public source");
  const status =
    series.refreshStatus && series.refreshStatus !== "ok"
      ? `<p class="source-series-status">Refresh status: ${escapeHtml(series.refreshStatus)}. The displayed history is the last successful snapshot.</p>`
      : "";
  const downloadUrl = series.sourceDownloadUrl
    ? `<a href="${escapeHtml(series.sourceDownloadUrl)}" target="_blank" rel="noreferrer">Source data download ↗</a>`
    : `<button type="button" data-export-series="${escapeHtml(series.id)}">Export observations CSV</button>`;
  return `
    <details class="source-series disclosure" data-series-card data-search-text="${escapeHtml(
      [
        series.id,
        series.name,
        series.category,
        series.source,
        series.sourceFamily,
        series.dataRole,
      ]
        .filter(Boolean)
        .join(" "),
    )}" data-series-id="${escapeHtml(series.id)}">
      <summary class="source-series-summary">
        <span class="source-series-title"><strong>${escapeHtml(series.name || series.id)}</strong><code>${escapeHtml(series.id)}</code></span>
        <span class="source-series-source">${sourceLink}</span>
        <span class="source-series-frequency">${escapeHtml(series.frequency || "unknown")}</span>
        <span class="source-series-latest"><b>${latestDate ? escapeHtml(formatDate(latestDate)) : "No observation"}</b><small class="${latestValue > 0 ? "positive" : latestValue < 0 ? "negative" : ""}">${latestValue === undefined ? "" : `${escapeHtml(formatNumber(latestValue))}${series.unit ? ` ${escapeHtml(series.unit)}` : ""}`}</small></span>
        <span class="source-series-chevron" aria-hidden="true">+</span>
      </summary>
      <div class="source-series-body disclosure-panel">
        <dl class="source-series-meta">
          <div><dt>Source</dt><dd>${sourceLink}</dd></div>
          ${
            sourceUrl
              ? `<div><dt>Source URL</dt><dd><a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(sourceUrl)}</a></dd></div>`
              : ""
          }
          <div><dt>Series ID</dt><dd><code>${escapeHtml(series.id)}</code></dd></div>
          <div><dt>Frequency</dt><dd>${escapeHtml(series.frequency || "unknown")}</dd></div>
          <div><dt>Unit</dt><dd>${escapeHtml(series.unit || "reported units")}</dd></div>
          <div><dt>Coverage</dt><dd>${firstDate ? `${escapeHtml(formatDate(firstDate))} – ${escapeHtml(formatDate(latestDate))}` : "No observations"} · ${bounds.count.toLocaleString("en-US")} observations</dd></div>
          <div><dt>Latest observation</dt><dd>${latestDate ? `${escapeHtml(formatDate(latestDate))} · ${escapeHtml(formatNumber(latestValue))}${series.unit ? ` ${escapeHtml(series.unit)}` : ""}` : "Unavailable"}</dd></div>
          ${renderOptionalField("Category", series.category)}
          ${renderOptionalField("Source family", series.sourceFamily)}
          ${renderOptionalField("Data role", series.dataRole)}
          ${renderOptionalField("History classification", series.historyStatus || series.historyType)}
          ${renderOptionalField("Archive note", series.archiveReason)}
          ${renderOptionalField("Proxy source / security", series.splice ? `${series.splice.proxyId} → ${series.splice.securityId}` : "")}
          ${renderOptionalField("Splice anchor", series.splice?.anchorDate)}
          ${renderOptionalField("ETF source value type", series.splice?.securityValueType)}
          ${renderOptionalField("ETF source data through", series.splice?.securitySourceAsOf)}
          ${renderOptionalField("ETF source hash", series.splice?.securitySourceHash)}
          ${renderOptionalField("Observed overlap", series.splice ? `${series.splice.overlap.start} – ${series.splice.overlap.end}; ${series.splice.overlap.pairedReturns} paired returns; correlation ${series.splice.overlap.correlation?.toFixed(3)}; annualized tracking-difference volatility ${series.splice.overlap.annualizedTrackingDifferenceVolatility.toFixed(2)}%` : "")}
          ${renderOptionalField("Checked", series.checkedAt ? formatDate(series.checkedAt.slice(0, 10)) : "")}
          ${renderOptionalField("Last verified observation", series.lastVerifiedObservation)}
          ${renderOptionalField("Source file", series.sourceFile)}
          ${renderOptionalField("Source column", series.sourceColumn)}
          ${renderOptionalField("Source hash", series.sourceHash)}
        </dl>
        ${series.methodology ? `<p class="source-series-methodology"><strong>Methodology.</strong> ${escapeHtml(series.methodology)}</p>` : ""}
        ${series.availabilityNote ? `<p class="source-series-note"><strong>Availability note.</strong> ${escapeHtml(series.availabilityNote)}</p>` : ""}
        ${series.rightsNote ? `<p class="source-series-note"><strong>Rights note.</strong> ${escapeHtml(series.rightsNote)}</p>` : ""}
        <div class="source-series-actions">${downloadUrl}</div>
        ${status}
      </div>
    </details>`;
};

const matches = (series, query) => {
  if (!query) return true;
  const text = [
    series.id,
    series.name,
    series.category,
    series.source,
    series.sourceFamily,
    series.dataRole,
    series.frequency,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .every((token) => text.includes(token));
};

const groupSeries = (series) => {
  const groups = new Map();
  for (const item of series) {
    const category = item.category || "Other sources";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  }
  return groups;
};

const renderCatalog = (series, query) => {
  const groups = groupSeries(series);
  const catalog = document.querySelector("#source-catalog");
  const visibleGroups = [...groups.entries()]
    .map(([category, items]) => [
      category,
      items.filter((item) => matches(item, query)),
    ])
    .filter(([, items]) => items.length);
  if (!visibleGroups.length) {
    catalog.innerHTML = `<div class="sources-empty"><strong>No matching source series.</strong><span>Try a shorter name, publisher, category, or series ID.</span></div>`;
    return 0;
  }
  catalog.innerHTML = visibleGroups
    .map(
      ([category, items]) => `
        <details class="source-group disclosure" ${query ? "open" : ""}>
          <summary><span><span class="section-index">${escapeHtml(category)}</span><strong>${items.length.toLocaleString("en-US")} series</strong></span></summary>
          <div class="source-group-list disclosure-panel"></div>
        </details>`,
    )
    .join("");
  catalog.querySelectorAll(".source-group").forEach((group, index) => {
    const items = visibleGroups[index][1];
    group._seriesIds = new Set(items.map(({ id }) => `source-${id}`));
    group._loadSeries = () => {
      if (group.dataset.loaded) return;
      group.dataset.loaded = "true";
      const panel = group.querySelector(".source-group-list");
      panel.innerHTML = items.map(renderSeries).join("");
      panel.querySelectorAll("[data-series-card]").forEach((card) => {
        card.id = `source-${card.dataset.seriesId}`;
      });
      initDisclosure(panel);
    };
    // Materialize before the shared disclosure measures its animated height.
    group
      .querySelector("summary")
      .addEventListener("click", group._loadSeries, { capture: true });
    if (query) group._loadSeries();
  });
  initDisclosure(catalog);
  return visibleGroups.reduce((total, [, items]) => total + items.length, 0);
};

const openHashTarget = async (render, search) => {
  let targetId = "";
  try {
    targetId = decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return;
  }
  if (!targetId.startsWith("source-")) return;
  const materialize = () => {
    for (const group of document.querySelectorAll(".source-group"))
      if (group._seriesIds?.has(targetId)) group._loadSeries();
  };
  materialize();
  let target = document.getElementById(targetId);
  if (!target && search.value) {
    search.value = "";
    render();
    materialize();
    target = document.getElementById(targetId);
  }
  if (!target) {
    const provider = document.querySelector("#yahoo-provider");
    if (!provider) return;
    provider.focus({ preventScroll: true });
    window.requestAnimationFrame(() =>
      provider.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
    return;
  }
  const group = target.closest(".source-group");
  if (group) await openDisclosure(group);
  if (target.matches("details")) await openDisclosure(target);
  window.requestAnimationFrame(() =>
    target.scrollIntoView({ behavior: "smooth", block: "center" }),
  );
};

const snapshotRuleSummary = (snapshot) => {
  const rules = snapshot.methodology || {};
  return [
    rules.marketValue ? `Market values: ${rules.marketValue}` : "",
    rules.missingValues ? rules.missingValues : "",
    rules.normalization ? `Indexed views: ${rules.normalization}` : "",
  ]
    .filter(Boolean)
    .join(" ");
};

async function main() {
  let snapshot = await loadSnapshot();
  mountChrome(snapshot, "sources");
  const sourceSeries = () => {
    const bundledIds = new Set(snapshot.series.map(({ id }) => id));
    return [
      ...snapshot.series.filter((series) => !isYahoo(series)),
      ...readCachedSeries().filter(
        (series) => !bundledIds.has(series.id) && !isYahoo(series),
      ),
    ];
  };
  let series = sourceSeries();
  const search = document.querySelector("#sources-search");
  const summary = document.querySelector("#sources-snapshot-summary");
  const count = document.querySelector("#sources-result-count");
  const queryLabel = () => search.value.trim();
  const render = () => {
    const query = queryLabel();
    const visible = renderCatalog(series, query);
    count.textContent = query
      ? `${visible.toLocaleString("en-US")} matching series`
      : `${visible.toLocaleString("en-US")} series · ${groupSeries(series).size} categories`;
  };

  const updateSummary = () => {
    summary.textContent = `${series.length.toLocaleString("en-US")} series · ${series.length.toLocaleString("en-US")} in the source catalog · Snapshot ${formatDate(snapshot.generatedAt.slice(0, 10))}`;
    document.querySelector("#snapshot-methodology-note").textContent =
      snapshotRuleSummary(snapshot);
  };
  updateSummary();
  document.addEventListener("snapshot-updated", ({ detail }) => {
    snapshot = detail;
    series = sourceSeries();
    updateSummary();
    render();
    void openHashTarget(render, search);
  });
  let searchTimer;
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 120);
  });
  document.querySelector("#export-catalog").addEventListener("click", () => {
    downloadCsv("macrotrace-source-catalog.csv", [
      [
        "series_id",
        "name",
        "category",
        "source",
        "source_url",
        "frequency",
        "unit",
        "coverage_start",
        "coverage_end",
        "observation_count",
        "latest_date",
        "latest_value",
        "source_family",
        "data_role",
        "source_file",
        "source_column",
        "source_hash",
        "methodology",
      ],
      ...series.map((item) => {
        const bounds = observationBounds(item);
        return [
          item.id,
          item.name,
          item.category,
          item.source,
          item.sourceUrl || item.sourceDownloadUrl,
          item.frequency,
          item.unit,
          bounds.first?.[0],
          bounds.latest?.[0],
          bounds.count,
          bounds.latest?.[0],
          bounds.latest?.[1],
          item.sourceFamily,
          item.dataRole,
          item.sourceFile,
          item.sourceColumn,
          item.sourceHash,
          item.methodology,
        ];
      }),
    ]);
  });
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-export-series]");
    if (!button) return;
    const item = series.find(({ id }) => id === button.dataset.exportSeries);
    if (!item) return;
    button.disabled = true;
    try {
      exportObservations(
        item.history ? await loadHistory(snapshot, item.id) : item,
      );
      button.textContent = "Export observations CSV";
    } catch (error) {
      button.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  render();
  initDisclosure(document.querySelector(".sources-methodology"));
  void openHashTarget(render, search);
  window.addEventListener(
    "hashchange",
    () => void openHashTarget(render, search),
  );
}

main().catch((error) => {
  const catalog = document.querySelector("#source-catalog");
  if (catalog) {
    catalog.innerHTML = `<div class="sources-empty"><strong>Source catalog unavailable.</strong><span>${escapeHtml(error.message)}</span></div>`;
  }
});
