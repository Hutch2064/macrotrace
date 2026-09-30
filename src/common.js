import { loadSnapshot, loadedHistoryIds } from "./data-store.js";
export { loadSnapshot } from "./data-store.js";

export const palette = [
  "#CFB97D",
  "#7dd3a7",
  "#90b4ce",
  "#c0a1cc",
  "#f1978d",
  "#d7d5c9",
];
const numbers = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const compactNumbers = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
export const format = (value, suffix = "") =>
  Number.isFinite(value) ? numbers.format(value) + suffix : "—";
export const compact = (value) =>
  Number.isFinite(value) ? compactNumbers.format(value) : "—";
export const signed = (value) =>
  Number.isFinite(value) ? (value > 0 ? "+" : "") + format(value) : "—";
export const changeClass = (value) =>
  value > 0 ? "positive" : value < 0 ? "negative" : "";
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
export const dateLabel = (date) =>
  date
    ? new Date(
        date + (date.length === 10 ? "T00:00:00Z" : ""),
      ).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Unavailable";
export const expandIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>';

export function mountChrome(snapshot, page) {
  document.querySelector("#site-header").innerHTML = `
    <header class="site-nav"><div class="nav-row">
      <a class="brand" href="./index.html" aria-label="MacroTrace report"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M2 25V8l7 11 7-15 7 15 7-11v17" stroke="currentColor" stroke-width="1.5"/><path d="M2 25h28" stroke="currentColor" stroke-opacity=".4"/></svg><span>MacroTrace</span></a>
      <nav class="nav-links" aria-label="Primary navigation"><a href="./index.html" ${page === "report" ? 'aria-current="page"' : ""}>Report</a><a href="./dashboard.html" ${page === "dashboard" ? 'aria-current="page"' : ""}>Dashboard</a></nav>
    </div></header>`;
  document.querySelector("#site-footer").innerHTML =
    '<footer class="site-footer"><div class="footer-row shell"><span>MacroTrace · The economy, in perspective.</span><span>Aidan Hutchison · Public sources, native release frequencies.</span></div></footer>';
  let currentVersion = snapshot.generatedAt;
  let checking = false;
  async function checkForSnapshot() {
    if (document.hidden || checking) return;
    checking = true;
    try {
      const response = await fetch("./data/version.json", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const version = await response.json();
      if (!version.generatedAt || version.generatedAt === currentVersion)
        return;
      const data = await loadSnapshot(loadedHistoryIds(), version.generatedAt);
      if (!data.series?.length) return;
      currentVersion = data.generatedAt;
      document.dispatchEvent(
        new CustomEvent("snapshot-updated", { detail: data }),
      );
    } catch {
      // A successful published snapshot remains available during outages.
    } finally {
      checking = false;
    }
  }
  window.setInterval(checkForSnapshot, 60 * 60 * 1000);
  document.addEventListener("data-version-changed", checkForSnapshot);
  document.addEventListener("visibilitychange", checkForSnapshot);
}

export async function downloadCsv(rows, filename) {
  const quote = (value) =>
    '"' + String(value ?? "").replaceAll('"', '""') + '"';
  const parts = [];
  let keys,
    batch = [];
  for (const row of rows) {
    if (!keys) {
      keys = Object.keys(row);
      batch.push(keys.map(quote).join(","));
    }
    batch.push(keys.map((key) => quote(row[key])).join(","));
    if (batch.length >= 1000) {
      parts.push(batch.join("\r\n") + "\r\n");
      batch = [];
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  parts.push(batch.join("\r\n"));
  const url = URL.createObjectURL(
    new Blob(parts, { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function showError(target, error) {
  target.innerHTML =
    '<p class="error-message">The snapshot could not be loaded. Please refresh to retry; no substitute values are shown.</p>';
  console.error(error);
}
