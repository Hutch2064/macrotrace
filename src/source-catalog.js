import { escapeHtml as escape, dateLabel } from "./common.js";
import { initDisclosure } from "./disclosure.js";

export function renderSourceCatalog(snapshot) {
  const groups = new Map();
  const outside = snapshot.series.filter(
    (series) => series.source !== "Yahoo Finance",
  );
  for (const series of outside) {
    const category = series.category || "Other economic indicators";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(series);
  }
  document.querySelector("#source-catalog").innerHTML = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, entries]) => {
      const providers = [
        ...new Set(entries.map((entry) => entry.provider || entry.source)),
      ];
      const rows = entries
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => {
          const first = entry.coverage?.first || entry.observations?.[0];
          const latest = entry.coverage?.latest || entry.observations?.at(-1);
          return `<div class="source-row"><div><a href="${escape(entry.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escape(entry.name)} ↗</a><small class="subtle"> · ${escape(entry.id)} · ${escape(entry.frequency)} · ${escape(entry.unit)}</small></div><span>${escape(first?.[0] || "—")}<br />${escape(latest?.[0] || "—")}${entry.refreshStatus ? "<br />Retained snapshot" : ""}</span></div>`;
        })
        .join("");
      return `<details class="source-group"><summary><span>${escape(category)} <small class="muted">· ${entries.length} indicators</small></span></summary><div class="disclosure-panel"><div class="source-body"><p>${escape(providers.join(" · "))}</p><div class="source-list">${rows}</div></div></div></details>`;
    })
    .join("");
  initDisclosure(document.querySelector("#source-catalog"));
  const retained = snapshot.series.filter(
    (series) => series.refreshStatus,
  ).length;
  const yahoo = snapshot.series.filter(
    (series) => series.source === "Yahoo Finance",
  ).length;
  document.querySelector("#source-freshness").textContent =
    `Snapshot published ${dateLabel(snapshot.generatedAt)}. Automated ingestion checks sources daily; observations advance on each provider’s release schedule and remain subject to revisions.${retained ? ` ${retained} indicators retain their last successful history after an upstream retrieval failure; their individual dates remain visible.` : ""}${yahoo ? ` Yahoo Finance supplies ${yahoo} commodity futures price histories, not stocks; futures quotes are distinct from spot prices and can reflect contract rolls.` : ""} Source links identify each non-Yahoo series; the dashboard CSV includes the full source reference and exact values.`;
}
