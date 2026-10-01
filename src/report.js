import {
  loadSnapshot,
  mountChrome,
  escapeHtml as escape,
  format,
  compact,
  dateLabel,
  showError,
} from "./common.js";
import {
  REPORT_IDS,
  buildMacroReport,
  highlightSegments,
  methodDefinitions,
} from "./macro-report.js";
import { timeChart } from "./time-chart.js";
import { lazyChart } from "./lazy-chart.js";
import { renderSourceCatalog } from "./source-catalog.js";
import { economicGlobe } from "./globe.js";
import {
  countriesFor,
  countryIds,
  countryReadout,
  countryMomentum,
} from "./countries.js";
import { loadHistories } from "./data-store.js";

const reportText = (text, highlights) =>
  highlightSegments(text, highlights)
    .map((segment) =>
      segment.highlight
        ? `<span class="report-highlight">${escape(segment.text)}</span>`
        : escape(segment.text),
    )
    .join("");

const charts = [];
let mounted = false;
let snapshot,
  globe,
  globeReadings = new Map(),
  countries = [],
  country = "USA",
  geographicCountry,
  metricCountry,
  metricLocation,
  countryRevision = 0,
  countryMotion,
  countryNameMotion;
function setCountries(roster) {
  countries = roster;
  if (!geographicCountry && !countries.some(({ id }) => id === country))
    country = countries.find(({ id }) => id === "USA")?.id || countries[0]?.id;
}
function sourceLabel(
  sourceFamily,
  source,
  fallback = "Official annual source",
) {
  const value = String(sourceFamily || source || "").trim();
  if (/world bank|world development indicators/i.test(value))
    return "World Bank WDI";
  if (/federal reserve bank of st\. louis|\bFRED\b/i.test(value)) return "FRED";
  return value || fallback;
}
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
async function renderCountry(id, location, refresh = false) {
  const token = ++countryRevision;
  if (!refresh) {
    country = id;
    if (location) geographicCountry = location;
    globe?.select(id);
  }
  const selectedCountry =
    refresh && location
      ? location
      : geographicCountry?.id === id
        ? geographicCountry
        : countries.find((item) => item.id === id);
  if (!selectedCountry) return;
  const name = selectedCountry.name || selectedCountry.id;
  const countryName = document.querySelector("#globe-country-name");
  if (!refresh) {
    countryName.textContent = name;
    countryNameMotion?.cancel();
    countryNameMotion = countryName.animate(
      [
        { opacity: 0, transform: "translateY(4px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: reduced() ? 0 : 420, easing: "cubic-bezier(.22,1,.36,1)" },
    );
  }
  const host = document.querySelector("#headline-metrics");
  const economicId = countries.some((item) => item.id === id)
    ? id
    : selectedCountry.economicId || id;
  const sharedArea =
    economicId !== id && selectedCountry.sharedAggregate
      ? countries.find((item) => item.id === economicId)?.name ||
        selectedCountry.economicName
      : null;
  // Geographic selection is independent of the last available economic view.
  if (!countries.some((item) => item.id === economicId)) {
    host.setAttribute("aria-busy", "false");
    return;
  }
  host.setAttribute("aria-busy", "true");
  try {
    // The catalog's annual coverage fields are enough for non-U.S. cards.
    // Keep the U.S. four-series behavior unchanged.
    if (economicId === "USA")
      await loadHistories(snapshot, countryIds(economicId));
    if (token !== countryRevision) return;
    const metrics = countryReadout(snapshot, economicId);
    if (!metrics.some((metric) => Number.isFinite(metric.value))) return;
    metricCountry = id;
    metricLocation = selectedCountry;
    host.dataset.country = economicId;
    host.setAttribute("aria-label", `Economic metrics for ${name}`);
    countryMotion?.cancel();
    host.innerHTML = metrics
      .map((metric) => {
        const unit = String(metric.unit || "");
        const currency = /(USD|EUR|GBP|dollars|currency)/i.test(unit);
        const magnitude = currency
          ? unit.match(/\b(thousand|million|billion)s?\b/i)?.[1]?.toLowerCase()
          : null;
        const scale =
          { thousand: 1e3, million: 1e6, billion: 1e9 }[magnitude] || 1;
        const value =
          currency || /^(people|persons)$/i.test(unit)
            ? compact(
                Number.isFinite(metric.value) ? metric.value * scale : null,
              )
            : format(metric.value);
        const displayUnit = magnitude
          ? unit.replace(/\b(thousand|million|billion)s?\b/i, "").trim()
          : unit;
        const status = ["provisional", "semi-definitive"].includes(
          metric.status,
        )
          ? ` · ${metric.status}`
          : "";
        const reference = !metric.date
          ? "Unavailable"
          : metric.frequency === "annual"
            ? metric.date.slice(0, 4) + " · annual"
            : metric.frequency === "quarterly"
              ? `Q${Math.ceil(Number(metric.date.slice(5, 7)) / 3)} ${metric.date.slice(0, 4)} · quarterly`
              : metric.frequency === "monthly"
                ? new Intl.DateTimeFormat("en-US", {
                    month: "short",
                    year: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(metric.date + "T00:00:00Z")) + " · monthly"
                : dateLabel(metric.date);
        return `<div class="headline-metric"><span class="metric-label"${metric.fallbackFor ? ` title="${escape("Alternative indicator; " + metric.fallbackFor + " is unavailable.")}"` : ""}>${escape(metric.label)}</span><span class="metric-value${currency ? " metric-currency" : ""}" title="${escape(format(metric.value) + " " + unit)}">${value}<span class="metric-unit">${escape(displayUnit)}</span></span>${sharedArea ? `<span class="metric-date">${escape(sharedArea)} · shared aggregate</span>` : ""}<span class="metric-date">${escape(reference + status)}${metric.retained ? " · retained snapshot" : ""}</span>${metric.sourceUrl ? `<a class="metric-source" href="${escape(metric.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escape(sourceLabel(metric.sourceFamily, metric.source, id === "USA" ? "FRED" : "Official source"))}</a>` : ""}</div>`;
      })
      .join("");
    countryMotion = host.animate(
      [
        { opacity: 0, transform: "translateY(6px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: reduced() ? 0 : 650, easing: "cubic-bezier(.22,1,.36,1)" },
    );
  } catch (error) {
    if (token === countryRevision) throw error;
  } finally {
    if (token === countryRevision) host.setAttribute("aria-busy", "false");
  }
}
const reveal = new IntersectionObserver(
  (entries) => {
    for (const entry of entries)
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        reveal.unobserve(entry.target);
      }
  },
  { threshold: 0.08 },
);
window.addEventListener(
  "pagehide",
  () => {
    globe?.destroy();
    reveal.disconnect();
    charts.splice(0).forEach((chart) => chart.destroy());
  },
  { once: true },
);
async function render(updated) {
  snapshot =
    updated || (await loadSnapshot([...REPORT_IDS, ...countryIds(country)]));
  const nextCountries = countriesFor(snapshot);
  const previousIds = countries.map(({ id }) => id);
  const nextIds = nextCountries.map(({ id }) => id);
  const rosterChanged =
    previousIds.length !== nextIds.length ||
    previousIds.some((id, index) => id !== nextIds[index]);
  setCountries(nextCountries);
  if (rosterChanged && globe) {
    globe.destroy();
    globe = null;
  }
  await loadHistories(snapshot, REPORT_IDS);
  const report = buildMacroReport(snapshot);
  if (!mounted) {
    mountChrome(snapshot, "report");
    mounted = true;
  }
  charts.splice(0).forEach((chart) => chart.destroy());
  document.querySelector("#as-of").textContent =
    "Data checked " + dateLabel(snapshot.generatedAt);
  document.querySelector("#report-summary").innerHTML = reportText(
    report.summary,
    report.summaryHighlights,
  );
  await renderCountry(
    metricCountry || country,
    metricLocation,
    Boolean(metricCountry),
  );
  document.querySelector("#report-sections").innerHTML = report.findings
    .map(
      (finding) =>
        `<section class="report-section" id="${escape(finding.id)}"><div class="report-copy"><span class="report-topic">${escape(finding.topic || finding.series[0]?.category || "Economic signal")}</span><h2>${escape(finding.title)}</h2>${finding.paragraphs.map((paragraph, index) => `<p>${reportText(paragraph, finding.paragraphHighlights?.[index])}</p>`).join("")}<a class="source-link" href="./dashboard.html?topic=${encodeURIComponent(finding.topic || finding.series[0]?.category || "")}">Explore this topic</a></div><div class="report-chart-frame"><div class="report-chart" id="chart-${escape(finding.id)}"></div><p class="report-chart-note">${escape(finding.note)}</p></div></section>`,
    )
    .join("");
  for (const finding of report.findings) {
    const section = document.getElementById(finding.id);
    if (!reduced()) {
      section.classList.add("reveal");
      reveal.observe(section);
    }
    const host = document.getElementById("chart-" + finding.id);
    const latest = finding.points
      .flatMap((points) => points.at(-1)?.[0] || [])
      .sort()
      .at(-1);
    const cutoff = latest ? new Date(latest + "T00:00:00Z") : null;
    cutoff?.setUTCFullYear(cutoff.getUTCFullYear() - 5);
    const start = cutoff?.toISOString().slice(0, 10);
    const visiblePoints = finding.points.map((points) =>
      points.filter(([date]) => !start || date >= start),
    );
    host.nextElementSibling.textContent =
      "Last five years of available observations. " + finding.note;
    charts.push(
      lazyChart(host, () =>
        timeChart(host, finding.series, visiblePoints, {
          suffix: finding.suffix || "",
          signedValues: finding.signedValues || false,
        }),
      ),
    );
  }
  document.querySelector("#method-definitions").innerHTML = methodDefinitions
    .concat([
      {
        title: "Currency and housing normalization",
        definition:
          "Bilateral currencies are shown as USD per unit of foreign currency. FRED quotes in the opposite direction use 1 / source value; nonpositive inverse inputs are omitted. Trade-weighted dollar indexes keep their original index units. Shiller's housing indexes retain annual source rows before 1953 and average the twelve monthly rows of each complete year thereafter; incomplete years are omitted. Pink Sheet commodities keep published monthly averages and index definitions, not investment returns.",
      },
      {
        title: "Historical position",
        definition:
          "For the selected measure and period, percentile = 100 × (readings below the latest + (readings equal to the latest − 1) / 2) / (number of readings − 1). Ties receive their midrank; fewer than two comparable readings are unavailable.",
      },
      {
        title: "Direction and monthly panels",
        definition:
          "Direction groups count eligible latest values above, below or equal to zero, divided by the eligible indicator count in that group. This is not a weighted economic index. The heat map keeps the last actual reading in each month; it does not interpolate or create monthly observations.",
      },
    ])
    .map(
      (method) =>
        `<div class="method-definition"><h3>${escape(method.title)}</h3><p>${escape(method.definition)}</p></div>`,
    )
    .join("");
  renderSourceCatalog(snapshot);
  globeReadings = countryMomentum(snapshot);
  if (!globe) {
    try {
      globe = await economicGlobe(
        document.querySelector("#economic-globe"),
        (id, location) =>
          void renderCountry(id, location).catch((error) =>
            showError(document.querySelector("#headline-metrics"), error),
          ),
        globeReadings,
        countries,
      );
      globe.select(country);
    } catch (error) {
      console.error(error);
    }
  }
  globe?.setReadings(globeReadings);
}
document.addEventListener("snapshot-updated", (event) => {
  void render(event.detail).catch((error) =>
    showError(document.querySelector("#report-summary"), error),
  );
});
render().catch((error) =>
  showError(document.querySelector("#report-summary"), error),
);
