/*
 * Pure source-backed model for the MacroTrace report.
 *
 * This file owns report composition and selection only. `transformSeries` is
 * the same pure transformer used by the dashboard, so report charts cannot
 * quietly drift from dashboard values or semantics.
 */
import { transformSeries } from "./panel.js";

const MIN_FINDINGS = 8;
const TARGET_FINDINGS = 10;
const DAY_MS = 86_400_000;
const FREQUENCY_WINDOW_DAYS = Object.freeze({
  daily: 30,
  weekly: 90,
  monthly: 365,
  quarterly: 730,
  annual: 1460,
});

/** Curated candidates; selection changes as source dates and values change. */
export const REPORT_CANDIDATES = Object.freeze([
  {
    id: "inflation-core",
    topic: "Inflation",
    title: "Consumer-price and core PCE inflation",
    ids: ["CPIAUCSL", "PCEPILFE"],
    measure: "yoy",
    rankMeasure: "yoy",
    suffix: "%",
    description:
      "Headline CPI and core PCE are displayed as year-over-year changes in their seasonally adjusted indexes.",
  },
  {
    id: "labor-unemployment",
    topic: "Labor",
    title: "Unemployment rate",
    ids: ["UNRATE"],
    measure: "level",
    rankMeasure: "change",
    suffix: "%",
    description:
      "The unemployment rate is shown at its native monthly percentage level; adjacent changes are percentage-point differences.",
  },
  {
    id: "jobs",
    topic: "Labor",
    title: "Nonfarm payroll growth",
    ids: ["PAYEMS"],
    measure: "yoy",
    rankMeasure: "yoy",
    suffix: "%",
    description:
      "Nonfarm payrolls are shown as a year-over-year percentage change in the source employment level.",
  },
  {
    id: "real-gdp",
    topic: "Growth",
    title: "Real GDP growth",
    ids: ["GDPC1"],
    measure: "yoy",
    rankMeasure: "yoy",
    suffix: "%",
    description:
      "Real GDP is compared with the observation exactly four quarters earlier by calendar period.",
  },
  {
    id: "industrial-production",
    topic: "Growth",
    title: "Industrial production growth",
    ids: ["INDPRO"],
    measure: "yoy",
    rankMeasure: "yoy",
    suffix: "%",
    description:
      "Industrial production is shown as a year-over-year percentage change in its source index.",
  },
  {
    id: "monetary-policy",
    topic: "Rates",
    title: "Federal funds rate",
    ids: ["FEDFUNDS"],
    measure: "level",
    rankMeasure: "change",
    suffix: "%",
    description:
      "The monthly-average federal funds rate remains in its reported percentage level.",
  },
  {
    id: "yield-curve",
    topic: "Rates",
    title: "Ten-year minus two-year Treasury spread",
    ids: ["T10Y2Y"],
    measure: "level",
    rankMeasure: "change",
    suffix: " pp",
    description:
      "The Treasury curve is reported in its native percentage-point spread.",
  },
  {
    id: "housing",
    topic: "Housing",
    title: "Housing starts and permits",
    ids: ["HOUST", "PERMIT"],
    measure: "level",
    rankMeasure: "change",
    suffix: " thousand",
    description:
      "Housing starts and building permits retain their source-reported thousands of units, seasonally adjusted annual-rate convention.",
  },
  {
    id: "credit-conditions",
    topic: "Credit",
    title: "Financial conditions",
    ids: ["NFCI"],
    measure: "level",
    rankMeasure: "change",
    suffix: " pts",
    description:
      "The National Financial Conditions Index remains in native index points; a change is a point difference.",
  },
  {
    id: "energy-prices",
    topic: "Commodities",
    title: "Oil and gasoline prices",
    ids: ["DCOILWTICO", "GASREGW"],
    measure: "yoy",
    rankMeasure: "yoy",
    suffix: "%",
    description:
      "WTI and regular gasoline are compared in a common year-over-year percent-change unit, not in their unlike dollar levels.",
  },
  {
    id: "commodity-index",
    topic: "Commodities",
    title: "All-commodities price index",
    ids: ["PALLFNFINDEXM"],
    measure: "yoy",
    rankMeasure: "yoy",
    suffix: "%",
    description:
      "The IMF all-commodities index is shown as a year-over-year percentage change.",
  },
  {
    id: "currency",
    topic: "Currencies",
    title: "Trade-weighted U.S. dollar",
    ids: ["DTWEXBGS"],
    measure: "yoy",
    rankMeasure: "yoy",
    suffix: "%",
    description:
      "The broad trade-weighted dollar index is shown as a year-over-year percentage change.",
  },
  {
    id: "trade",
    topic: "Growth",
    title: "World trade share",
    ids: ["WDI_WLD_TRADE"],
    measure: "level",
    rankMeasure: "change",
    suffix: " pp",
    description:
      "World trade is reported as the World Bank's percentage share of global GDP; changes are percentage points.",
  },
  {
    id: "productivity",
    topic: "Productivity",
    title: "Nonfarm business productivity",
    ids: ["OPHNFB"],
    measure: "yoy",
    rankMeasure: "yoy",
    suffix: "%",
    description:
      "Nonfarm business labor productivity is shown as a year-over-year percentage change in the source index.",
  },
  {
    id: "global-growth",
    topic: "Growth",
    title: "World real GDP",
    ids: ["WDI_WLD_GDP"],
    measure: "yoy",
    rankMeasure: "yoy",
    suffix: "%",
    description:
      "World real GDP is shown as a year-over-year percentage change in the World Bank series.",
  },
  {
    id: "fiscal-debt",
    topic: "Fiscal",
    title: "Federal debt relative to GDP",
    ids: ["GFDEGDQ188S"],
    measure: "level",
    rankMeasure: "change",
    suffix: " pp",
    description:
      "Federal debt as a share of GDP remains a native percentage level; changes are percentage points.",
  },
]);

/** All candidate inputs plus the four separate U.S. headline inputs. */
export const REPORT_IDS = Object.freeze([
  ...new Set([
    "CPIAUCSL",
    "PCEPILFE",
    "UNRATE",
    "GDPC1",
    ...REPORT_CANDIDATES.flatMap(({ ids }) => ids),
  ]),
]);

export const methodDefinitions = Object.freeze([
  {
    title: "Row grain and native levels",
    definition:
      "Every chart point is an actual source observation at its native frequency. Level findings preserve the raw reported value; monthly, quarterly, weekly, daily and annual rows are not resampled or averaged together.",
  },
  {
    title: "Sources and freshness",
    definition:
      "Required candidates are public economic releases represented by the supplied snapshot. Source metadata retains each series URL, observed-through date, provider check time, and upstream refresh status; a retained history is disclosed separately from the chart value.",
  },
  {
    title: "Dropped rows",
    definition:
      "Rows with missing or non-finite values remain unavailable rather than becoming zero. A comparison row is omitted when its required native prior period is missing, its percentage baseline is nonpositive, or a daily/weekly prior boundary is more than seven days earlier; no future row is substituted.",
  },
  {
    title: "Year-over-year formula",
    definition:
      "For relative series, YoY = 100 × (x[t] / x[t−1 native year period] − 1). Monthly, quarterly and annual periods use the exact prior calendar period; daily and weekly periods use the last observed row on or before the one-year boundary only within seven calendar days.",
  },
  {
    title: "Change and rate semantics",
    definition:
      "Previous-observation change = 100 × (x[t] / x[t−1 native observation] − 1) for positive prices and quantities. Rates use x[t] − x[t−1] in percentage points; signed index or diffusion series use native-point differences. Relative percentage changes and point changes are never plotted as one unit.",
  },
  {
    title: "Dynamic selection",
    definition:
      "Available candidates are ranked by source-date freshness and latest movement normalized against that series' own historical absolute-movement distribution using a median scale and empirical percentile. Ties resolve in stable candidate order; the report targets ten themes and never invents an unavailable theme.",
  },
  {
    title: "Deterministic refresh",
    definition:
      "Given the same snapshot rows, candidate availability, transforms, prose values, scores and selected order are deterministic. Snapshot generation time is metadata and is never used as an economic observation date.",
  },
]);

export const REPORT_METHODS = Object.freeze({
  rowGrain: methodDefinitions[0].definition,
  sources: methodDefinitions[1].definition,
  droppedRows: methodDefinitions[2].definition,
  annualChange: methodDefinitions[3].definition,
  pointChanges: methodDefinitions[4].definition,
  selection: methodDefinitions[5].definition,
  deterministicRefresh: methodDefinitions[6].definition,
});

function validDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return false;
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return (
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === date
  );
}

function dateValue(date) {
  return Date.parse(`${date}T00:00:00Z`);
}

function sourceRows(series) {
  if (!Array.isArray(series?.observations)) return [];
  return series.observations
    .filter(
      (point) =>
        Array.isArray(point) &&
        validDate(point[0]) &&
        Number.isFinite(point[1]),
    )
    .map(([date, value]) => [date, value])
    .sort(([left], [right]) => left.localeCompare(right));
}

function latestSourceDate(series) {
  return sourceRows(series).at(-1)?.[0] || null;
}

function latestPoint(points) {
  return points.length ? points[points.length - 1] : null;
}

function formatDate(date) {
  if (!validDate(date)) return "an unavailable date";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function numberText(value, decimals = 2) {
  if (!Number.isFinite(value)) return "unavailable";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function signedText(value, decimals = 2) {
  if (!Number.isFinite(value)) return "unavailable";
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${numberText(Math.abs(value), decimals)}`;
}

function median(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function midrankPercentile(values, value) {
  if (!values.length || !Number.isFinite(value)) return 0;
  let below = 0;
  let equal = 0;
  for (const item of values) {
    if (item < value) below += 1;
    else if (item === value) equal += 1;
  }
  if (values.length === 1) return 1;
  return (below + equal / 2) / values.length;
}

function frequencyWindow(series) {
  return FREQUENCY_WINDOW_DAYS[series?.frequency] || 365;
}

function unitSuffix(unit) {
  const value = String(unit || "").toLowerCase();
  if (value.includes("percentage point")) return " pp";
  if (value.includes("index point")) return " pts";
  if (value.includes("%") || value.includes("percent")) return "%";
  if (value.includes("thousand")) return " thousand";
  if (value.includes("million")) return " million";
  return ` ${unit || "reported units"}`;
}

function measureText(measure, unit) {
  if (measure === "level") return `native ${unit || "reported"} levels`;
  if (measure === "change") return `changes in ${unit || "native units"}`;
  return `year-over-year changes in ${unit || "percent"}`;
}

function transformEntry(series, measure) {
  const transformed = transformSeries(series, { measure });
  const points = transformed
    .filter(({ date, value }) => validDate(date) && Number.isFinite(value))
    .map(({ date, value }) => [date, value]);
  const unit =
    transformed.find(({ unit: value }) => value)?.unit ||
    series.unit ||
    "reported units";
  return {
    source: series,
    points,
    unit,
    latest: latestPoint(points),
  };
}

function candidateScore(candidate, byId, referenceDate) {
  const missingIds = candidate.ids.filter((id) => !byId.has(id));
  const entries = candidate.ids.map((id) => {
    const source = byId.get(id);
    const display = source ? transformEntry(source, candidate.measure) : null;
    const ranking = source
      ? transformEntry(source, candidate.rankMeasure)
      : null;
    return { id, source, display, ranking };
  });
  const noDataIds = entries
    .filter(
      (entry) => !entry.display?.points.length || !entry.ranking?.points.length,
    )
    .map(({ id }) => id);
  const unavailableIds = [...new Set([...missingIds, ...noDataIds])];
  const datedEntries = entries
    .map((entry) => ({ entry, date: entry.display?.latest?.[0] }))
    .filter(({ date }) => date);
  const latestDates = datedEntries.map(({ date }) => date).sort();
  const latestDate = latestDates.length ? latestDates[0] : null;
  const freshnessScore = datedEntries.length
    ? datedEntries.reduce((total, { entry, date }) => {
        const age = Math.max(
          0,
          (dateValue(referenceDate) - dateValue(date)) / DAY_MS,
        );
        return (
          total +
          1 /
            (1 + age / frequencyWindow({ frequency: entry.source?.frequency }))
        );
      }, 0) / datedEntries.length
    : 0;
  const movementEntries = entries.map((entry) => {
    const values = (entry.ranking?.points || []).map(([, value]) => value);
    const latest = values.at(-1);
    const history = values
      .slice(0, -1)
      .map((value) => Math.abs(value))
      .filter(Number.isFinite);
    const latestAbsolute = Number.isFinite(latest) ? Math.abs(latest) : 0;
    const scale = median(history) || 1;
    const percentile = midrankPercentile(history, latestAbsolute);
    const scaleScore = latestAbsolute / (latestAbsolute + scale);
    return {
      id: entry.id,
      latestMovement: latest,
      historicalMedianAbsoluteMovement: scale,
      normalizedMovementRatio: latestAbsolute / scale,
      movementPercentile: percentile,
      movementScore: 0.6 * percentile + 0.4 * scaleScore,
    };
  });
  const movementScore = movementEntries.length
    ? movementEntries.reduce((total, entry) => total + entry.movementScore, 0) /
      movementEntries.length
    : 0;
  const score = 0.55 * movementScore + 0.45 * freshnessScore;
  return {
    candidate,
    entries,
    missingIds: unavailableIds,
    available: unavailableIds.length === 0,
    latestDate,
    freshnessScore,
    movementScore,
    score,
    movementEntries,
  };
}

function pickCandidates(scored) {
  const available = scored
    .filter((entry) => entry.available)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.freshnessScore - left.freshnessScore ||
        left.candidate.id.localeCompare(right.candidate.id),
    );
  const target = Math.min(TARGET_FINDINGS, available.length);
  const selected = [];
  const selectedThemes = new Set();
  for (const entry of available) {
    if (selected.length >= target) break;
    if (selectedThemes.has(entry.candidate.id)) continue;
    selected.push(entry);
    selectedThemes.add(entry.candidate.id);
  }
  if (selected.length < target) {
    for (const entry of available) {
      if (selected.length >= target) break;
      if (!selected.includes(entry)) selected.push(entry);
    }
  }
  return { available, selected };
}

function valuePhrase(entry) {
  const point = entry.display.latest;
  if (!point) return `${entry.source.name || entry.id} is unavailable`;
  return `${entry.source.name || entry.id} was ${numberText(point[1], 2)}${unitSuffix(entry.display.unit)} on ${formatDate(point[0])}`;
}

function titleValuePhrase(entry) {
  const point = entry.display.latest;
  if (!point) return "unavailable";
  return `${numberText(point[1], 1)}${unitSuffix(entry.display.unit)}`;
}

function titleLabels(candidate) {
  return (
    {
      "inflation-core": ["CPI", "core PCE"],
      "labor-unemployment": ["unemployment"],
      jobs: ["payrolls"],
      "real-gdp": ["real GDP"],
      "industrial-production": ["industrial production"],
      "monetary-policy": ["fed funds"],
      "yield-curve": ["curve spread"],
      housing: ["starts", "permits"],
      "credit-conditions": ["financial conditions"],
      "energy-prices": ["WTI", "gasoline"],
      "commodity-index": ["commodities"],
      currency: ["dollar"],
      trade: ["world trade"],
      productivity: ["productivity"],
      "global-growth": ["world GDP"],
      "fiscal-debt": ["debt/GDP"],
    }[candidate.id] || []
  );
}

function dynamicTitle(scored) {
  const labels = titleLabels(scored.candidate);
  const values = scored.entries
    .map(
      (entry, index) =>
        `${labels[index] ? `${labels[index]} ` : ""}${titleValuePhrase(entry)}`,
    )
    .join(" · ");
  return `${scored.candidate.title}: ${values}`;
}

function displayComparison(entry) {
  const points = entry.display.points;
  const latest = points.at(-1);
  const prior = points.at(-2);
  if (!latest) return `${entry.source.name || entry.id} is unavailable`;
  const latestText = `${numberText(latest[1], 2)}${unitSuffix(entry.display.unit)}`;
  if (!prior)
    return `${entry.source.name || entry.id} is ${latestText} on ${formatDate(latest[0])}; no prior displayed observation is available.`;
  const delta = latest[1] - prior[1];
  const unit = String(entry.display.unit || "").toLowerCase();
  const deltaSuffix =
    unit.includes("percentage") || unit.includes("%")
      ? " pp"
      : unitSuffix(entry.display.unit);
  return `${entry.source.name || entry.id} is ${latestText} on ${formatDate(latest[0])}, versus ${numberText(prior[1], 2)}${unitSuffix(entry.display.unit)} on ${formatDate(prior[0])} (change ${signedText(delta, 2)}${deltaSuffix}).`;
}

function dynamicParagraphs(scored) {
  const latestReadings = scored.entries.map(valuePhrase).join("; ");
  const comparisons = scored.entries.map(displayComparison).join(" ");
  return [
    `${scored.candidate.description} Latest published readings: ${latestReadings}.`,
    comparisons,
  ];
}

function dynamicNote(scored) {
  const dates = scored.entries
    .map((entry) => entry.display.latest?.[0])
    .filter(Boolean)
    .map(formatDate)
    .join(" / ");
  return `${measureText(scored.candidate.measure, scored.entries[0]?.display.unit)}; latest dates ${dates}.`;
}

function buildAsOf(byId) {
  const bySeries = Object.fromEntries(
    REPORT_IDS.map((id) => [id, latestSourceDate(byId.get(id))]),
  );
  const dates = Object.values(bySeries).filter(Boolean).sort();
  return { latest: dates.at(-1) || null, bySeries };
}

function buildSourceMetadata(id, series, failureIds) {
  const rows = sourceRows(series);
  const retained =
    series.refreshStatus === "upstream-unavailable" || failureIds.has(id);
  return {
    id,
    name: series.name || id,
    source: series.source || series.provider || "Unknown source",
    sourceUrl: series.sourceUrl || null,
    frequency: series.frequency || "unknown",
    unit: series.unit || "reported units",
    observedThrough: rows.at(-1)?.[0] || null,
    checkedAt: series.checkedAt || null,
    refreshStatus: series.refreshStatus || "ok",
    retainedSnapshot: retained,
    freshnessNote: retained
      ? "Last successful observations retained after an unsuccessful upstream refresh; the observed-through date remains the displayed economic period."
      : "Observed-through is the latest source row; checkedAt is the provider check time.",
  };
}

function explicitGeographies(seriesRows) {
  return [
    ...new Set(
      seriesRows
        .map((series) => series.geography || series.country || series.region)
        .filter((value) => typeof value === "string" && value.trim()),
    ),
  ].sort();
}

function fullDatasetSummary(seriesRows, selected, scored) {
  const topics = [
    ...new Set(seriesRows.map((series) => series.category).filter(Boolean)),
  ].sort();
  const geographies = explicitGeographies(seriesRows);
  const available = scored.filter(
    ({ available: isAvailable }) => isAvailable,
  ).length;
  const selectedTopics = [
    ...new Set(selected.map(({ candidate }) => candidate.topic)),
  ].join(", ");
  return {
    text: `Explore ${seriesRows.length.toLocaleString("en-US")} economic indicators across ${topics.length} topics and ${geographies.length} geographies. The report follows ${selected.length} timely themes in ${selectedTopics}, selected from ${available} available themes by release freshness and movement within each indicator's own history. Figures, comparisons and theme selection update with the data; they describe the economy without attributing causes.`,
    indicatorCount: seriesRows.length,
    topicCount: topics.length,
    topics,
    geographyCount: geographies.length,
    geographies,
  };
}

function headline(label, unit, id, measure, byId) {
  const series = byId.get(id);
  if (!series) return { label, value: null, unit, date: null };
  const point = latestPoint(transformEntry(series, measure).points);
  return { label, value: point?.[1] ?? null, unit, date: point?.[0] ?? null };
}

/** Build the dynamic report from one snapshot. */
export function buildMacroReport(snapshot) {
  const sourceRowsList = Array.isArray(snapshot?.series) ? snapshot.series : [];
  const byId = new Map(
    sourceRowsList
      .filter((series) => typeof series?.id === "string")
      .map((series) => [series.id, series]),
  );
  const sourceDates = sourceRowsList
    .map(latestSourceDate)
    .filter(Boolean)
    .sort();
  const referenceDate = sourceDates.at(-1) || "1970-01-01";
  const scored = REPORT_CANDIDATES.map((candidate) =>
    candidateScore(candidate, byId, referenceDate),
  );
  const { available, selected } = pickCandidates(scored);
  const findings = selected.map((entry) => ({
    id: entry.candidate.id,
    topic: entry.candidate.topic,
    title: dynamicTitle(entry),
    paragraphs: dynamicParagraphs(entry),
    series: entry.entries.map(({ source, display }) => ({
      id: source.id,
      name: source.name || source.id,
      frequency: source.frequency || "unknown",
      unit: display.unit,
    })),
    points: entry.entries.map(({ display }) => display.points),
    suffix: unitSuffix(entry.entries[0]?.display.unit),
    note: dynamicNote(entry),
    measure: entry.candidate.measure,
    asOf: entry.entries.map(({ source, display }) => ({
      id: source.id,
      date: display.latest?.[0] || null,
    })),
    selectionScore: {
      freshness: entry.freshnessScore,
      ownHistoryMovement: entry.movementScore,
      combined: entry.score,
    },
  }));
  const headlineExistingUS = [
    headline("Headline CPI (SA index) YoY", "% YoY", "CPIAUCSL", "yoy", byId),
    headline("Core PCE (SA index) YoY", "% YoY", "PCEPILFE", "yoy", byId),
    headline("Unemployment rate", "%", "UNRATE", "level", byId),
    headline("Real GDP growth", "% YoY", "GDPC1", "yoy", byId),
  ];
  const sourceFailureIds = new Set(
    Array.isArray(snapshot?.refreshFailures) ? snapshot.refreshFailures : [],
  );
  const sourceMetadata = REPORT_IDS.map((id) => {
    const series = byId.get(id);
    return series
      ? buildSourceMetadata(id, series, sourceFailureIds)
      : {
          id,
          name: id,
          source: "Unavailable",
          sourceUrl: null,
          frequency: "unknown",
          unit: "reported units",
          observedThrough: null,
          checkedAt: null,
          refreshStatus: "unavailable",
          retainedSnapshot: false,
          freshnessNote:
            "Required candidate source row is unavailable in this snapshot.",
        };
  });
  const dataset = fullDatasetSummary(sourceRowsList, selected, scored);
  const selection = {
    candidateCount: REPORT_CANDIDATES.length,
    availableCount: available.length,
    selectedCount: selected.length,
    minimumFindings: MIN_FINDINGS,
    targetFindings: TARGET_FINDINGS,
    selectedIds: selected.map(({ candidate }) => candidate.id),
    explanation:
      "Candidates require all listed source rows and finite transformed points. Ranking combines release-date freshness with the latest movement's empirical percentile and median-normalized scale within each series; stable candidate order resolves ties.",
    candidates: scored.map((entry) => ({
      id: entry.candidate.id,
      topic: entry.candidate.topic,
      available: entry.available,
      missingIds: entry.missingIds,
      latestDate: entry.latestDate,
      freshnessScore: entry.freshnessScore,
      movementScore: entry.movementScore,
      score: entry.score,
    })),
  };
  const asOf = buildAsOf(byId);
  return {
    headlines: headlineExistingUS,
    headlineExistingUS,
    summary: dataset.text,
    dataset,
    selection,
    findings,
    asOf,
    sourceMetadata,
    methodDefinitions,
  };
}
