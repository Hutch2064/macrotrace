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
      "Headline CPI and core PCE are shown as year-over-year changes in seasonally adjusted price indexes.",
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
      "The unemployment rate is shown at its native monthly percentage level; movement is reported in percentage points.",
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
      "Nonfarm payrolls are shown as year-over-year growth in the source employment level.",
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
      "Industrial production is shown as year-over-year growth in its source index.",
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
      "The federal funds rate is shown at its native monthly-average percentage level; movement is reported in percentage points.",
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
      "The Treasury curve is shown as the native 10-year minus 2-year percentage-point spread; movement is in points.",
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
      "Housing starts and permits retain their native thousands-of-units, seasonally adjusted annual-rate levels; movement uses source units.",
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
      "The National Financial Conditions Index is shown in native index points; movement is a point difference.",
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
      "WTI and regular gasoline retain their native dollar levels; the comparison is a year-over-year percent change.",
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
      "The IMF all-commodities index is shown as year-over-year growth in the source index.",
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
      "The broad trade-weighted dollar index is shown as year-over-year growth in the source index.",
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
      "World trade is shown as its percentage share of global GDP; movement is in percentage points.",
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
      "Nonfarm business labor productivity is shown as year-over-year growth in the source index.",
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
      "World real GDP is shown as year-over-year growth in the World Bank series.",
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
      "Federal debt as a share of GDP is shown at its native percentage level; movement is in percentage points.",
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

function valueText(value, unit) {
  if (!Number.isFinite(value)) return "unavailable";
  const normalized = String(unit || "")
    .trim()
    .toLowerCase();
  if (normalized === "$/barrel") return `$${numberText(value, 2)} per barrel`;
  if (normalized === "$/gallon") return `$${numberText(value, 2)} per gallon`;
  if (normalized === "index") return `${numberText(value, 2)} index points`;
  return `${numberText(value, 2)}${unitSuffix(unit)}`;
}

function periodText(series, date) {
  if (!validDate(date)) return "an unavailable period";
  const year = date.slice(0, 4);
  switch (String(series?.frequency || "").toLowerCase()) {
    case "annual":
      return `in ${year}`;
    case "quarterly":
      return `in Q${Math.ceil(Number(date.slice(5, 7)) / 3)} ${year}`;
    case "monthly":
      return `in ${new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })}`;
    default:
      return `on ${formatDate(date)}`;
  }
}

function changeText(value, unit, basis = "") {
  if (!Number.isFinite(value)) return "change unavailable";
  if (value === 0) return basis ? `unchanged ${basis}` : "unchanged";
  const direction = value > 0 ? "up" : "down";
  const suffix = unitSuffix(unit);
  return `${direction} ${numberText(Math.abs(value), 2)}${suffix}${basis ? ` ${basis}` : ""}`;
}

function movementUnit(entry) {
  const semanticUnit = String(
    entry.source?.unit || entry.display.unit || "",
  ).toLowerCase();
  if (
    semanticUnit.includes("%") ||
    semanticUnit.includes("percent") ||
    semanticUnit.includes("percentage")
  )
    return "percentage points";
  if (semanticUnit.includes("index")) return "index points";
  return entry.source?.unit || entry.display.unit || "reported units";
}

function isPercentageUnit(unit) {
  const value = String(unit || "").toLowerCase();
  return value.includes("%") || value.includes("percent");
}

function sourceLatest(entry) {
  return latestPoint(sourceRows(entry.source));
}

function narrativeName(entry, candidate, index = 0) {
  const labels = {
    "inflation-core": ["Headline CPI inflation", "Core PCE inflation"],
    jobs: ["Nonfarm payrolls"],
    "real-gdp": ["Real GDP"],
    "industrial-production": ["Industrial production"],
    "monetary-policy": ["The federal funds rate"],
    "yield-curve": ["The 10Y–2Y Treasury spread"],
    housing: ["Housing starts", "Building permits"],
    "credit-conditions": ["The financial conditions index"],
    "energy-prices": ["WTI", "Regular gasoline"],
    "commodity-index": ["The all-commodities index"],
    currency: ["The trade-weighted U.S. dollar"],
    trade: ["World trade"],
    productivity: ["Nonfarm business productivity"],
    "global-growth": ["World real GDP"],
    "fiscal-debt": ["Federal debt relative to GDP"],
  }[candidate?.id];
  if (labels?.[index]) return labels[index];
  return entry.source.name || entry.id;
}

function includesNativeLevel(candidate) {
  return candidate?.id === "energy-prices";
}

function levelVerb(candidate) {
  return candidate?.id === "housing" ? "were" : "was";
}

function yoyComparisonLabel(entry, candidate, index) {
  const name = narrativeName(entry, candidate, index);
  const labels = {
    "inflation-core": name,
    jobs: "Nonfarm payroll growth",
    "real-gdp": "Real GDP growth",
    "industrial-production": "Industrial production growth",
    "commodity-index": "All-commodities price growth",
    currency: "Trade-weighted U.S. dollar growth",
    productivity: "Nonfarm business productivity growth",
    "global-growth": "World real GDP growth",
  };
  return labels[candidate?.id] || `${name} YoY reading`;
}

function highlight(phrase) {
  return phrase ? { phrase } : null;
}

/**
 * Return safe text segments for a report renderer. This helper deliberately
 * returns data, never HTML; callers must escape every segment before adding a
 * highlight wrapper.
 */
export function highlightSegments(text, highlights = []) {
  const source = String(text ?? "");
  const matches = [];
  for (const metadata of Array.isArray(highlights) ? highlights : []) {
    const phrase = typeof metadata?.phrase === "string" ? metadata.phrase : "";
    if (!phrase) continue;
    let from = 0;
    while (from < source.length) {
      const start = source.indexOf(phrase, from);
      if (start < 0) break;
      matches.push({
        start,
        end: start + phrase.length,
        phrase,
      });
      from = start + phrase.length;
    }
  }
  matches.sort(
    (left, right) => left.start - right.start || right.end - left.end,
  );
  const segments = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    if (match.start > cursor)
      segments.push({
        text: source.slice(cursor, match.start),
        highlight: false,
      });
    segments.push({
      text: source.slice(match.start, match.end),
      highlight: true,
    });
    cursor = match.end;
  }
  if (cursor < source.length)
    segments.push({ text: source.slice(cursor), highlight: false });
  return segments.length ? segments : [{ text: source, highlight: false }];
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

function titleNativeValue(entry) {
  const point = sourceLatest(entry);
  if (!point) return "unavailable";
  const unit = String(entry.source.unit || "")
    .trim()
    .toLowerCase();
  if (unit === "$/barrel") return `$${numberText(point[1], 1)}/barrel`;
  if (unit === "$/gallon") return `$${numberText(point[1], 1)}/gallon`;
  return `${numberText(point[1], 1)}${unitSuffix(entry.source.unit)}`;
}

function titleChangePhrase(value) {
  if (!Number.isFinite(value)) return "unavailable YoY";
  if (value === 0) return "unchanged YoY";
  return `${value > 0 ? "up" : "down"} ${numberText(Math.abs(value), 1)}% YoY`;
}

function titleValuePhrase(entry, candidate) {
  if (candidate.measure === "yoy") {
    const point = entry.display.latest;
    if (!point) return "unavailable YoY";
    return titleChangePhrase(point[1]);
  }
  return titleNativeValue(entry);
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
        `${labels[index] ? `${labels[index]} ` : ""}${titleValuePhrase(entry, scored.candidate)}`,
    )
    .join(" · ");
  return `${scored.candidate.title}: ${values}`;
}

function relativeChangePhrase(value, candidate) {
  if (!Number.isFinite(value)) return "year-over-year change is unavailable";
  if (candidate?.id === "inflation-core") {
    return `was ${valueText(value, "%")} year over year`;
  }
  if (value === 0) return "was unchanged year over year";
  return `${value > 0 ? "rose" : "fell"} ${numberText(Math.abs(value), 2)}% year over year`;
}

function latestNarrative(entry, candidate) {
  const raw = sourceLatest(entry);
  const name = narrativeName(entry, candidate, candidate.ids.indexOf(entry.id));
  if (!raw) return { text: `${name} is unavailable`, highlights: [] };
  const [rawDate, rawValue] = raw;
  const rawPeriod = periodText(entry.source, rawDate);
  if (candidate.measure === "yoy") {
    const comparison = entry.display.latest;
    if (!comparison) {
      const text = `${name} was ${valueText(rawValue, entry.source.unit)} ${rawPeriod}; year-over-year change is unavailable.`;
      return {
        text,
        highlights: [highlight(valueText(rawValue, entry.source.unit))].filter(
          Boolean,
        ),
      };
    }
    const change = changeText(comparison[1], "%", "year over year");
    if (includesNativeLevel(candidate)) {
      const level = `${name} was ${valueText(rawValue, entry.source.unit)} ${rawPeriod}`;
      const text = `${level}, ${change}.`;
      return {
        text,
        highlights: [highlight(change)].filter(Boolean),
      };
    }
    const text = `${name} ${relativeChangePhrase(comparison[1], candidate)} ${rawPeriod}.`;
    return {
      text,
      highlights: [
        highlight(relativeChangePhrase(comparison[1], candidate)),
      ].filter(Boolean),
    };
  }
  if (candidate.measure === "change") {
    const comparison = entry.display.latest;
    if (!comparison) {
      const text = `${name} has no comparable change for ${rawPeriod}.`;
      return { text, highlights: [] };
    }
    const text = `${name} changed ${valueText(comparison[1], entry.display.unit)} ${rawPeriod}.`;
    return {
      text,
      highlights: [
        highlight(
          `${name} changed ${valueText(comparison[1], entry.display.unit)}`,
        ),
      ].filter(Boolean),
    };
  }
  if (candidate.id === "trade") {
    if (!isPercentageUnit(entry.source.unit)) {
      const reading = `${name} reading was ${valueText(rawValue, entry.source.unit)} ${rawPeriod}; source unit is unavailable`;
      return {
        text: `${reading}.`,
        highlights: [highlight(valueText(rawValue, entry.source.unit))].filter(
          Boolean,
        ),
      };
    }
    const reading = `${name} amounted to ${valueText(rawValue, entry.source.unit)} of global GDP ${rawPeriod}`;
    const text = `${reading}.`;
    return {
      text,
      highlights: [
        highlight(`${valueText(rawValue, entry.source.unit)} of global GDP`),
      ].filter(Boolean),
    };
  }
  const reading = `${name} ${levelVerb(candidate)} ${valueText(rawValue, entry.source.unit)} ${rawPeriod}`;
  const text = `${reading}.`;
  return {
    text,
    highlights: [highlight(valueText(rawValue, entry.source.unit))].filter(
      Boolean,
    ),
  };
}

function displayComparison(entry, candidate) {
  const index = candidate.ids.indexOf(entry.id);
  const name = narrativeName(entry, candidate, index);
  if (candidate.measure === "yoy") {
    const comparisonLabel = yoyComparisonLabel(entry, candidate, index);
    const latest = entry.display.points.at(-1);
    const prior = entry.display.points.at(-2);
    if (!latest) return `${comparisonLabel} is unavailable.`;
    const latestText = valueText(latest[1], entry.display.unit);
    if (!prior)
      return `${comparisonLabel} was ${latestText} ${periodText(entry.source, latest[0])}; no prior comparable reading is available.`;
    const delta = latest[1] - prior[1];
    const movement = changeText(delta, "percentage points");
    return `${comparisonLabel} was ${latestText} ${periodText(entry.source, latest[0])}, ${movement} from ${valueText(prior[1], entry.display.unit)} ${periodText(entry.source, prior[0])}.`;
  }
  const rawPoints = sourceRows(entry.source);
  const latest = rawPoints.at(-1);
  const prior = rawPoints.at(-2);
  if (!latest) return `${name} is unavailable.`;
  const latestText = valueText(latest[1], entry.source.unit);
  if (!prior)
    return candidate.id === "trade"
      ? isPercentageUnit(entry.source.unit)
        ? `${name} amounted to ${latestText} of global GDP ${periodText(entry.source, latest[0])}; no prior native observation is available.`
        : `${name} reading was ${latestText} ${periodText(entry.source, latest[0])}; source unit is unavailable and no prior native observation is available.`
      : `${name} ${levelVerb(candidate)} ${latestText} ${periodText(entry.source, latest[0])}; no prior native observation is available.`;
  const delta = latest[1] - prior[1];
  const movement = changeText(delta, movementUnit(entry));
  return candidate.id === "trade"
    ? isPercentageUnit(entry.source.unit)
      ? `${name} amounted to ${latestText} of global GDP ${periodText(entry.source, latest[0])}, ${movement} from ${valueText(prior[1], entry.source.unit)} ${periodText(entry.source, prior[0])}.`
      : `${name} reading was ${latestText} ${periodText(entry.source, latest[0])}, ${movement} from ${valueText(prior[1], entry.source.unit)} ${periodText(entry.source, prior[0])}; source unit is unavailable.`
    : `${name} ${levelVerb(candidate)} ${latestText} ${periodText(entry.source, latest[0])}, ${movement} from ${valueText(prior[1], entry.source.unit)} ${periodText(entry.source, prior[0])}.`;
}

function comparisonHighlight(entry, candidate) {
  const points =
    candidate.measure === "yoy"
      ? entry.display.points
      : sourceRows(entry.source);
  const latest = points.at(-1);
  const prior = points.at(-2);
  if (!latest) return null;
  if (!prior)
    return highlight(
      candidate.id === "trade" && isPercentageUnit(entry.source.unit)
        ? `${valueText(latest[1], entry.source.unit)} of global GDP`
        : valueText(latest[1], entry.display.unit || entry.source.unit),
    );
  if (candidate.id === "trade" && isPercentageUnit(entry.source.unit))
    return highlight(
      `${valueText(latest[1], entry.source.unit)} of global GDP`,
    );
  const movement = changeText(
    latest[1] - prior[1],
    candidate.measure === "yoy" ? "percentage points" : movementUnit(entry),
  );
  return highlight(movement);
}

function dynamicParagraphs(scored) {
  const readings = scored.entries.map((entry) =>
    latestNarrative(entry, scored.candidate),
  );
  const latestReadings = readings
    .map(({ text }) => text.replace(/\.$/, ""))
    .join("; ");
  const first = `${scored.candidate.description} Latest readings: ${latestReadings}.`;
  const comparisons = scored.entries.map((entry) =>
    displayComparison(entry, scored.candidate),
  );
  const second = comparisons.join(" ");
  const firstHighlights = readings.flatMap(({ highlights }) => highlights);
  const secondHighlights = scored.entries
    .map((entry) => comparisonHighlight(entry, scored.candidate))
    .filter(Boolean);
  return {
    paragraphs: [first, second],
    highlights: [firstHighlights, secondHighlights],
  };
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
  const indicatorPhrase = `Explore ${seriesRows.length.toLocaleString("en-US")} economic indicators`;
  return {
    text: `${indicatorPhrase} across ${topics.length} topics and ${geographies.length} geographies. The report follows ${selected.length} timely themes in ${selectedTopics}, selected from ${available} available themes by release freshness and movement within each indicator's own history. Figures, comparisons and theme selection update with the data; they describe the economy without attributing causes.`,
    summaryHighlights: [highlight(indicatorPhrase)].filter(Boolean),
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
  const findings = selected.map((entry) => {
    const narrative = dynamicParagraphs(entry);
    return {
      id: entry.candidate.id,
      topic: entry.candidate.topic,
      title: dynamicTitle(entry),
      paragraphs: narrative.paragraphs,
      paragraphHighlights: narrative.highlights,
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
    };
  });
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
    summaryHighlights: dataset.summaryHighlights,
    selection,
    findings,
    asOf,
    sourceMetadata,
    methodDefinitions,
  };
}
