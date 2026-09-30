import { escapeHtml as escape, dateLabel } from "./common.js";
import { initDisclosure } from "./disclosure.js";

const WORLD_BANK_INDICATOR_URL = "https://data.worldbank.org/indicator/";
const HEADLINE_INDICATORS = 4;

const text = (value, fallback = "") => {
  const result = String(value ?? "").trim();
  return result || fallback;
};

const numberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const indicatorCode = (series) =>
  text(
    series?.sourceIndicator ||
      series?.indicator ||
      series?.indicatorCode ||
      (text(series?.id).match(/^WDI_[A-Z0-9]{3}_(.+)$/)?.[1] ?? ""),
  );

const countryCode = (series) =>
  text(
    series?.countryCode ||
      series?.countryId ||
      text(series?.id).match(/^WDI_([A-Z0-9]{3})_/)?.[1],
  ).toUpperCase();

const isWdiSeries = (series) =>
  Boolean(
    text(series?.id).startsWith("WDI_") ||
    (series?.sourceIndicator && countryCode(series)) ||
    (series?.sourceFamily === "World Development Indicators" &&
      countryCode(series)),
  );

const pointDate = (point) => {
  if (Array.isArray(point)) return text(point[0]);
  if (typeof point === "string") return point;
  if (point && typeof point === "object")
    return text(point.date || point.period || point.year || point.time);
  return "";
};

function nativeDates(series) {
  const coverage = series?.coverage || series?.nativeCoverage || {};
  const metadata = series?.metadata || {};
  const observations = [
    ...(Array.isArray(series?.nativeHistory) ? series.nativeHistory : []),
    ...(Array.isArray(series?.nativehistory) ? series.nativehistory : []),
    ...(Array.isArray(series?.observations) ? series.observations : []),
    ...(Array.isArray(metadata.nativeHistory) ? metadata.nativeHistory : []),
  ]
    .map(pointDate)
    .filter(Boolean)
    .sort();
  const first =
    pointDate(coverage.first) ||
    pointDate(coverage.start) ||
    text(coverage.firstDate || coverage.startDate) ||
    text(series?.nativeStart || series?.startDate || metadata.nativeStart);
  const latest =
    pointDate(coverage.latest) ||
    pointDate(coverage.end) ||
    text(coverage.latestDate || coverage.endDate) ||
    text(series?.nativeEnd || series?.endDate || metadata.nativeEnd);
  return {
    first: first || observations[0] || "",
    latest: latest || observations.at(-1) || "",
  };
}

const nativeYear = (date) => {
  const match = text(date).match(/\b(\d{4})\b/);
  return match?.[1] || "—";
};

const sourceUrlFor = (series) => {
  const direct = text(
    series?.sourceUrl || series?.sourceURL || series?.sourceDownloadUrl,
  );
  if (direct) return direct;
  const indicator = indicatorCode(series);
  return isWdiSeries(series) && indicator
    ? WORLD_BANK_INDICATOR_URL + encodeURIComponent(indicator)
    : "";
};

const sourceAnchor = (series, label, className = "") => {
  const url = sourceUrlFor(series);
  if (!url) return escape(label);
  return `<a${className ? ` class="${className}"` : ""} href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
};

const familyKeyFor = (series) =>
  `${text(series?.category, "Other economic indicators")}\u0000${text(series?.sourceFamily || series?.source || series?.provider)}\u0000${indicatorCode(series)}`;

function countryNameFor(series, countriesById) {
  const code = countryCode(series);
  const rosterName = countriesById.get(code)?.name;
  if (rosterName) return rosterName;
  const direct = text(series?.country || series?.countryName);
  if (direct) return direct;
  const label = text(series?.name);
  const separator = label.lastIndexOf(" · ");
  return separator >= 0
    ? label.slice(separator + 3)
    : code || "Unknown economy";
}

function seriesCoverageLabel(series) {
  const dates = nativeDates(series);
  const first = nativeYear(dates.first);
  const latest = nativeYear(dates.latest);
  const frequency = text(series?.frequency, "annual");
  if (first === "—" && latest === "—") return "Native coverage unavailable";
  if (first === latest) return `${first} · native ${frequency}`;
  return `${first}–${latest} · native ${frequency}`;
}

function familyDefinition(entries) {
  const definition = entries
    .map((entry) => text(entry.sourceDefinition || entry.definition))
    .find(Boolean);
  const organizations = [
    ...new Set(
      entries
        .flatMap((entry) => [
          entry.sourceOrganization,
          entry.underlyingProvider,
          entry.provider,
        ])
        .map((provider) => text(provider))
        .filter(Boolean),
    ),
  ];
  const sourceFamily = entries
    .map((entry) => text(entry.sourceFamily || entry.source))
    .find(Boolean);
  const sourceFamilies = [
    ...new Set(
      entries
        .map((entry) =>
          text(entry.sourceFamily || entry.source || entry.provider),
        )
        .filter(Boolean),
    ),
  ];
  return {
    definition,
    sourceFamilies,
    organizations: organizations.length
      ? organizations
      : sourceFamily
        ? [sourceFamily]
        : [],
  };
}

function renderCountryRows(entries, countriesById) {
  return entries
    .slice()
    .sort((a, b) =>
      countryNameFor(a, countriesById).localeCompare(
        countryNameFor(b, countriesById),
      ),
    )
    .map((entry) => {
      const name = countryNameFor(entry, countriesById);
      const coverage = seriesCoverageLabel(entry);
      const observationCount =
        numberOrNull(entry.coverage?.count) ??
        (Array.isArray(entry.nativeHistory)
          ? entry.nativeHistory.length
          : Array.isArray(entry.nativehistory)
            ? entry.nativehistory.length
            : Array.isArray(entry.observations)
              ? entry.observations.length
              : null);
      const retained = entry.refreshStatus ? " · retained snapshot" : "";
      const count =
        observationCount === null
          ? "—"
          : `${observationCount.toLocaleString()} observations`;
      return `<div class="source-country-row"><div>${sourceAnchor(entry, name)}<small class="subtle"> · ${escape(text(entry.countryCode || countryCode(entry), "—"))}</small></div><span>${escape(coverage)}<br />${escape(count)}${retained ? " · retained" : ""}</span></div>`;
    })
    .join("");
}

function renderFamilyBody(family, countriesById) {
  const { definition, organizations, sourceFamilies } = familyDefinition(
    family.entries,
  );
  const sourceFamilyText = sourceFamilies.length
    ? `<strong>Source family:</strong> ${escape(sourceFamilies.join(" · "))}`
    : "";
  const organizationText = organizations.length
    ? `<strong>Underlying provider${organizations.length === 1 ? "" : "s"}:</strong> ${escape(organizations.join(" · "))}`
    : "";
  const providerText =
    sourceFamilyText || organizationText
      ? `<p class="source-provider">${sourceFamilyText}${sourceFamilyText && organizationText ? "<br />" : ""}${organizationText}</p>`
      : "";
  const definitionText = definition
    ? `<p class="source-definition"><strong>Official definition:</strong> ${escape(definition)}</p>`
    : "";
  const units = [
    ...new Set(family.entries.map((entry) => text(entry.unit)).filter(Boolean)),
  ];
  const unitText = units.length
    ? `<p class="source-provider"><strong>Reported unit:</strong> ${escape(units.join(" · "))} · Native ${escape([...new Set(family.entries.map((entry) => text(entry.frequency, "annual")))].join(" / "))} observations</p>`
    : "";
  return `${unitText}${definitionText}${providerText}<div class="source-country-list">${renderCountryRows(family.entries, countriesById)}</div>`;
}

function indicatorSummary(family) {
  const name =
    text(family.indicatorName) ||
    text(
      family.entries[0]?.name,
      text(family.entries[0]?.sourceFamily, "Indicator"),
    );
  const economies = new Set(
    family.entries.map(countryCode).filter((code) => code && code !== "WLD"),
  ).size;
  const global = family.entries.some((entry) => countryCode(entry) === "WLD");
  const suffix = `${economies.toLocaleString()} ${economies === 1 ? "economy" : "economies"}${global ? " · global aggregate" : ""}`;
  return `${escape(name)} <small class="muted">· ${escape(suffix)}</small>`;
}

function renderLegacyRows(entries) {
  return entries
    .slice()
    .sort((a, b) => text(a.name).localeCompare(text(b.name)))
    .map((entry) => {
      const dates = nativeDates(entry);
      const first = dates.first || entry.coverage?.first;
      const latest = dates.latest || entry.coverage?.latest;
      const retained = entry.refreshStatus ? "<br />Retained snapshot" : "";
      return `<div class="source-row"><div>${sourceAnchor(entry, text(entry.name, entry.id || "Unnamed series"))}<small class="subtle"> · ${escape(text(entry.id, "—"))} · ${escape(text(entry.frequency, "native"))} · ${escape(text(entry.unit, "—"))}</small></div><span>${escape(pointDate(first) || "—")}<br />${escape(pointDate(latest) || "—")}${retained}</span></div>`;
    })
    .join("");
}

function familyCount(entries) {
  return new Set(entries.filter(isWdiSeries).map(familyKeyFor)).size;
}

function formatCount(value) {
  const number = numberOrNull(value);
  return number === null
    ? "—"
    : Math.max(0, Math.round(number)).toLocaleString();
}

function freshnessMarkup(snapshot, allSeries, countries) {
  const audit = snapshot.countryAudit || {};
  const rosterCount =
    numberOrNull(audit.rosterCount) ?? (countries.length || null);
  const countriesWithData =
    numberOrNull(audit.countriesWithData) ?? (countries.length || null);
  const supplementaryCount = Math.max(
    0,
    Math.round(
      numberOrNull(audit.supplementaryCount) ??
        ((rosterCount === null
          ? countries.length
          : countries.length - rosterCount) ||
          0),
    ),
  );
  const baseCountries = countries.filter(
    (country) =>
      !country.sourceFamily ||
      /World Bank|World Development/i.test(country.sourceFamily),
  );
  const baseCountryCount = baseCountries.length;
  const fullHeadlineCount = baseCountries.filter(
    (country) =>
      (numberOrNull(country.headlineCount) ?? 0) >= HEADLINE_INDICATORS,
  ).length;
  const partialHeadlineCount = countries.filter(
    (country) =>
      (numberOrNull(country.headlineCount) ?? 0) < HEADLINE_INDICATORS,
  ).length;
  const retained = allSeries.filter((series) => series.refreshStatus).length;
  const yahoo = allSeries.filter(
    (series) => series.source === "Yahoo Finance",
  ).length;
  const links =
    '<a href="./data/country-coverage.json">Country coverage JSON ↗</a> · <a href="./data/source-inventory.csv">Full source inventory CSV ↗</a> · <a href="./data/source-inventory.md">Markdown inventory ↗</a>';
  const coverage =
    rosterCount !== null && countriesWithData !== null
      ? ` The catalog retains ${formatCount(countriesWithData)} of ${formatCount(rosterCount)} World Bank roster economies with at least one available history.${supplementaryCount ? ` It also lists ${formatCount(supplementaryCount)} supplementary provider economies separately.` : ""}`
      : "";
  const headlines =
    countries.length > 0
      ? supplementaryCount
        ? ` Core World Bank headline coverage is partial: ${formatCount(Math.min(fullHeadlineCount, baseCountryCount))} of ${formatCount(baseCountryCount)} roster economies provide all four headline indicators; ${formatCount(Math.max(0, baseCountryCount - fullHeadlineCount))} lack at least one, and supplementary provider economies are not treated as WDI headline-complete.`
        : partialHeadlineCount
          ? ` Headline coverage is partial: ${formatCount(fullHeadlineCount)} of ${formatCount(countries.length)} economies provide all four headline indicators; ${formatCount(partialHeadlineCount)} have at least one missing headline, so no all-country completeness is implied.`
          : ` All four headline indicators are available for the ${formatCount(countries.length)} economies in the retained roster.`
      : "";
  const retainedNote = retained
    ? ` ${formatCount(retained)} series retain their last successful history after an upstream retrieval failure; each retained date remains visible.`
    : "";
  const yahooNote = yahoo
    ? ` Yahoo Finance supplies ${formatCount(yahoo)} commodity futures price histories, not stocks; futures quotes are distinct from spot prices and can reflect contract rolls.`
    : "";
  const rosterNote = audit.rosterRetained
    ? " The last verified economy roster is retained while the provider is unavailable."
    : "";
  return `Snapshot published ${escape(dateLabel(snapshot.generatedAt))}. Automated ingestion checks providers daily; World Bank WDI histories remain native annual observations, so a daily check does not create daily economic data or conceal missing reference years.${coverage}${headlines} Missing landing-page headline slots may show other available indicators for the same economy, under their actual names and units; these are alternatives, not imputed core metrics.${rosterNote}${retainedNote}${yahooNote} ${links}.`;
}

export function renderSourceCatalog(snapshot) {
  const root = document.querySelector("#source-catalog");
  if (!root) return;
  root.__sourceCatalogCleanup?.();

  const metadataTemplates = snapshot?.metadataTemplates || {};
  const allSeries = (
    Array.isArray(snapshot?.series) ? snapshot.series : []
  ).map((series) => {
    const metadataKey = text(
      series?.metadataKey || series?.sourceIndicator || series?.indicator,
    );
    const template = metadataKey ? metadataTemplates[metadataKey] : null;
    return template ? { ...template, ...series } : series;
  });
  const outside = allSeries.filter(
    (series) => series.source !== "Yahoo Finance",
  );
  const countries = Array.isArray(snapshot?.countries)
    ? snapshot.countries
    : [];
  const countriesById = new Map(
    countries.map((country) => [text(country.id).toUpperCase(), country]),
  );
  const groups = new Map();
  for (const series of outside) {
    const category = text(series.category, "Other economic indicators");
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(series);
  }

  const lazyFamilies = new Map();
  let familyId = 0;
  const html = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, entries]) => {
      const families = new Map();
      const legacy = [];
      for (const entry of entries) {
        if (!isWdiSeries(entry)) {
          legacy.push(entry);
          continue;
        }
        const key = familyKeyFor(entry);
        if (!families.has(key))
          families.set(key, {
            category,
            indicatorName: text(entry.indicatorName),
            entries: [],
          });
        families.get(key).entries.push(entry);
      }
      const familyDetails = [...families.values()]
        .sort((a, b) =>
          text(a.indicatorName || a.entries[0]?.name).localeCompare(
            text(b.indicatorName || b.entries[0]?.name),
          ),
        )
        .map((family) => {
          const id = `source-indicator-${++familyId}`;
          lazyFamilies.set(id, family);
          return `<details class="source-indicator" data-source-family="${id}"><summary>${indicatorSummary(family)}</summary><div class="disclosure-panel"><div class="source-indicator-body" data-source-family-body="${id}"></div></div></details>`;
        })
        .join("");
      const providerValues = [
        ...new Set(
          entries
            .map((entry) =>
              isWdiSeries(entry)
                ? entry.sourceFamily || entry.source || entry.provider
                : entry.provider || entry.source,
            )
            .map((provider) => text(provider))
            .filter(Boolean),
        ),
      ];
      const body = `${providerValues.length ? `<p>${escape(providerValues.join(" · "))}</p>` : ""}${legacy.length ? `<div class="source-list">${renderLegacyRows(legacy)}</div>` : ""}${familyDetails ? `<div class="source-indicator-list">${familyDetails}</div>` : ""}`;
      const familiesInCategory = familyCount(entries);
      const countLabel = `${formatCount(entries.length)} series${familiesInCategory ? ` · ${formatCount(familiesInCategory)} indicator ${familiesInCategory === 1 ? "family" : "families"}` : ""}`;
      return `<details class="source-group"><summary><span>${escape(category)} <small class="muted">· ${escape(countLabel)}</small></span></summary><div class="disclosure-panel"><div class="source-body">${body}</div></div></details>`;
    })
    .join("");
  root.innerHTML = html;
  initDisclosure(root);

  const materialize = (detail) => {
    if (!detail || detail.dataset.sourceFamilyReady === "true") return;
    const family = lazyFamilies.get(detail.dataset.sourceFamily);
    const body = detail.querySelector(
      ":scope > .disclosure-panel > [data-source-family-body]",
    );
    if (!family || !body) return;
    body.innerHTML = renderFamilyBody(family, countriesById);
    detail.dataset.sourceFamilyReady = "true";
  };
  const onCapture = (event) => {
    const summary = event.target.closest?.("summary");
    if (!summary) return;
    const detail = summary.parentElement;
    if (detail?.dataset.sourceFamily) materialize(detail);
  };
  const onToggle = (event) => {
    if (event.target?.dataset?.sourceFamily && event.target.open)
      materialize(event.target);
  };
  root.addEventListener("click", onCapture, true);
  root.addEventListener("keydown", onCapture, true);
  root.addEventListener("toggle", onToggle, true);
  root.__sourceCatalogCleanup = () => {
    root.removeEventListener("click", onCapture, true);
    root.removeEventListener("keydown", onCapture, true);
    root.removeEventListener("toggle", onToggle, true);
  };

  const freshness = document.querySelector("#source-freshness");
  if (freshness)
    freshness.innerHTML = freshnessMarkup(snapshot, allSeries, countries);
}
