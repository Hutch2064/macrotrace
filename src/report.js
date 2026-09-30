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
  methodDefinitions,
} from "./macro-report.js";
import { timeChart } from "./time-chart.js";
import { lazyChart } from "./lazy-chart.js";
import { renderSourceCatalog } from "./source-catalog.js";
import { economicGlobe } from "./globe.js";
import { countries, countryIds, countryReadout } from "./countries.js";
import { loadHistories } from "./data-store.js";
import { enhanceSelect } from "./select.js";

const charts = [];
let mounted = false;
let snapshot,
  globe,
  country = "USA",
  countryRevision = 0,
  countryMotion;
const select = document.querySelector("#country-select");
select.replaceChildren(
  ...countries.map(({ id, name }) => new Option(name, id)),
);
enhanceSelect(select);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
async function renderCountry(id) {
  const token = ++countryRevision;
  country = id;
  select.value = id;
  select._renderCustom?.();
  globe?.select(id);
  const name = countries.find((item) => item.id === id).name;
  document.querySelector("#globe-country-name").textContent = name;
  const host = document.querySelector("#headline-metrics");
  host.setAttribute("aria-busy", "true");
  try {
    await loadHistories(snapshot, countryIds(id));
    if (token !== countryRevision) return;
    const metrics = countryReadout(snapshot, id);
    countryMotion?.cancel();
    host.innerHTML = metrics
      .map(
        (metric) =>
          `<div class="headline-metric"><span class="metric-label">${escape(metric.label)}</span><span class="metric-value${metric.unit.startsWith("USD") ? " metric-currency" : ""}" title="${escape(format(metric.value) + " " + metric.unit)}">${metric.unit.startsWith("USD") ? compact(metric.value) : format(metric.value)}<span class="metric-unit">${escape(metric.unit)}</span></span><span class="metric-date">${metric.frequency === "annual" && metric.date ? metric.date.slice(0, 4) + " · annual" : dateLabel(metric.date)}${metric.retained ? " · retained snapshot" : ""}</span>${metric.sourceUrl ? `<a class="metric-source" href="${escape(metric.sourceUrl)}" target="_blank" rel="noopener noreferrer">${id === "USA" ? "FRED" : "World Bank WDI"}</a>` : ""}</div>`,
      )
      .join("");
    countryMotion = host.animate(
      [
        { opacity: 0, transform: "translateY(6px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: reduced() ? 0 : 650, easing: "cubic-bezier(.22,1,.36,1)" },
    );
    document.querySelector("#country-note").textContent =
      id === "USA"
        ? "U.S. releases · monthly and quarterly observations"
        : "Comparable World Bank annual indicators · latest published years vary";
    document.querySelector("#country-description").textContent =
      id === "USA"
        ? "United States: consumer and core PCE inflation are changes in seasonally adjusted price indexes over twelve months. Unemployment is the published rate; real GDP growth compares four quarters. Each date identifies the actual reference period."
        : `${name}: inflation measures annual consumer-price change; unemployment is the modeled ILO share of the labor force; GDP growth is annual real-output growth. Real GDP per capita is in constant 2015 U.S. dollars, not purchasing-power-adjusted household income. These annual releases are checked daily, not fabricated into daily readings.`;
  } finally {
    if (token === countryRevision) host.setAttribute("aria-busy", "false");
  }
}
select.addEventListener(
  "change",
  () =>
    void renderCountry(select.value).catch((error) =>
      showError(document.querySelector("#headline-metrics"), error),
    ),
);
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
  await loadHistories(snapshot, REPORT_IDS);
  const report = buildMacroReport(snapshot);
  if (!mounted) {
    mountChrome(snapshot, "report");
    mounted = true;
  }
  charts.splice(0).forEach((chart) => chart.destroy());
  document.querySelector("#as-of").textContent =
    "Data checked " + dateLabel(snapshot.generatedAt);
  document.querySelector("#report-summary").textContent = report.summary;
  await renderCountry(country);
  document.querySelector("#report-sections").innerHTML = report.findings
    .map(
      (finding) =>
        `<section class="report-section" id="${escape(finding.id)}"><div class="report-copy"><span class="report-topic">${escape(finding.topic || finding.series[0]?.category || "Economic signal")}</span><h2>${escape(finding.title)}</h2>${finding.paragraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`).join("")}<a class="source-link" href="./dashboard.html?topic=${encodeURIComponent(finding.topic || finding.series[0]?.category || "")}">Explore this topic ↗</a></div><div class="report-chart-frame"><div class="report-chart" id="chart-${escape(finding.id)}"></div><p class="report-chart-note">${escape(finding.note)}</p></div></section>`,
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
  if (!globe) {
    try {
      globe = await economicGlobe(
        document.querySelector("#economic-globe"),
        (id) =>
          void renderCountry(id).catch((error) =>
            showError(document.querySelector("#headline-metrics"), error),
          ),
      );
      globe.select(country);
    } catch (error) {
      document.querySelector(".globe-caption small").textContent =
        "Use the economy selector below to explore.";
      console.error(error);
    }
  }
}
document.addEventListener("snapshot-updated", (event) => {
  void render(event.detail).catch((error) =>
    showError(document.querySelector("#report-summary"), error),
  );
});
render().catch((error) =>
  showError(document.querySelector("#report-summary"), error),
);
