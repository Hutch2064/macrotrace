/*
 * Pure, source-backed model for the macro-only landing report.
 *
 * This module deliberately has no DOM, date-fns, chart, or data-loader
 * dependency. The caller supplies the already refreshed snapshot and can use
 * the returned `points` arrays directly with the report chart.
 */

export const REPORT_IDS = Object.freeze([
  "CPIAUCSL",
  "PCEPILFE",
  "UNRATE",
  "PAYEMS",
  "GDPC1",
  "FEDFUNDS",
  "HOUST",
  "PERMIT",
  "DCOILWTICO",
  "GASREGW",
  "INDPRO",
]);

const REPORT_THEMES = Object.freeze([
  {
    id: "inflation",
    topic: "Inflation",
    title: "Inflation: headline and core prices",
    ids: ["CPIAUCSL", "PCEPILFE"],
    transform: "yoy",
    suffix: "%",
  },
  {
    id: "labor-unemployment",
    topic: "Labor",
    title: "Labor: unemployment rate",
    ids: ["UNRATE"],
    transform: "level",
    suffix: "%",
  },
  {
    id: "jobs",
    topic: "Labor",
    title: "Jobs: nonfarm payrolls",
    ids: ["PAYEMS"],
    transform: "level",
    suffix: " thousand",
  },
  {
    id: "gdp",
    topic: "Growth",
    title: "Growth: real GDP",
    ids: ["GDPC1"],
    transform: "quarterly-yoy",
    suffix: "%",
  },
  {
    id: "monetary",
    topic: "Rates",
    title: "Monetary policy: federal funds rate",
    ids: ["FEDFUNDS"],
    transform: "level",
    suffix: "%",
  },
  {
    id: "housing",
    topic: "Housing",
    title: "Housing: starts and permits",
    ids: ["HOUST", "PERMIT"],
    transform: "level",
    suffix: " thousand",
  },
  {
    id: "energy",
    topic: "Commodities",
    title: "Energy: oil and gasoline",
    ids: ["DCOILWTICO", "GASREGW"],
    transform: "yoy",
    suffix: "%",
  },
  {
    id: "industrial",
    topic: "Growth",
    title: "Industry: industrial production",
    ids: ["INDPRO"],
    transform: "yoy",
    suffix: "%",
  },
]);

/**
 * Definitions shown in the report's closing methods section. These are kept
 * as data, rather than assembled by the browser, so the copy and formulas
 * remain deterministic across report renders.
 */
export const methodDefinitions = Object.freeze([
  {
    title: "Row grain",
    definition:
      "Each chart point preserves the source observation date and native release frequency. Monthly, quarterly, weekly, and daily rows are not resampled or mixed into a synthetic frequency.",
  },
  {
    title: "Sources",
    definition:
      "The report uses economic releases distributed by FRED, with the originating agency identified where available. The source catalog links each indicator and shows its observation coverage. Dashboard CSVs preserve source references, check times and refresh status.",
  },
  {
    title: "Dropped rows",
    definition:
      "A transformed point is omitted when the required source row is absent, either value is non-finite, or the percentage-change baseline is nonpositive. Monthly and quarterly comparisons require exact calendar dates; weekly/trading-day energy comparisons use only an observed row on or before the calendar boundary. No future-date or invented value is used. Native-level series retain finite source rows.",
  },
  {
    title: "Year-over-year formula",
    definition:
      "For monthly percent-change series, YoY = 100 × (x[t] / x[t − 12 calendar months] − 1), where the lag date must match exactly. Energy uses an observed row on or before that calendar boundary when a weekly/trading-day label has no exact match, but only when the observed row is no more than seven calendar days earlier; no future or remote fallback is used.",
  },
  {
    title: "Quarterly GDP formula",
    definition:
      "For real GDP, YoY = 100 × (GDP[t] / GDP[t − 4 quarters] − 1), implemented as an exact date match to the calendar date 12 months earlier; a future or nearby observation is never substituted.",
  },
  {
    title: "Native levels and percentage points",
    definition:
      "Unemployment, payrolls, federal funds, housing starts, and permits remain raw native levels. Percentage-valued rates use percentage-point subtraction, not a percent return; non-percent rates and signed quantities keep their native difference units. Chart panels never combine unlike units or average levels with growth rates.",
  },
  {
    title: "Deterministic refresh",
    definition:
      "Given the same ordered snapshot rows, report headings, prose values, transformations, and chart points are deterministic. Source-provider check time is metadata only and is never used as an observation date.",
  },
]);

// A named export makes the formula object convenient for non-UI consumers and
// keeps exact definitions available to verification scripts.
export const REPORT_METHODS = Object.freeze({
  rowGrain: methodDefinitions[0].definition,
  sources: methodDefinitions[1].definition,
  droppedRows: methodDefinitions[2].definition,
  annualChange: methodDefinitions[3].definition,
  quarterlyChange: methodDefinitions[4].definition,
  nativeLevels: methodDefinitions[5].definition,
  deterministicRefresh: methodDefinitions[6].definition,
});

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}

function finiteObservations(series) {
  if (!Array.isArray(series?.observations)) return [];
  return series.observations
    .filter(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        isDate(point[0]) &&
        Number.isFinite(point[1]),
    )
    .map(([date, value]) => [date, value])
    .sort(([left], [right]) => left.localeCompare(right));
}

function addMonths(date, months) {
  if (!isDate(date)) return null;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const monthIndex = year * 12 + (month - 1) + months;
  const shiftedYear = Math.floor(monthIndex / 12);
  const shiftedMonth = (monthIndex % 12) + 1;
  // Exact calendar matching intentionally rejects 29 February when the
  // corresponding month/day does not exist in the lag year.
  const candidate = `${String(shiftedYear).padStart(4, "0")}-${String(shiftedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isDate(candidate) ? candidate : null;
}

/**
 * Calculate exact-calendar year-over-year changes. Missing lag observations
 * are omitted rather than approximated with a nearby row.
 */
export function annualChange(observations) {
  const rows = Array.isArray(observations) ? observations : [];
  const byDate = new Map(
    rows.filter(
      (point) =>
        Array.isArray(point) && isDate(point[0]) && Number.isFinite(point[1]),
    ),
  );
  return rows.flatMap((point) => {
    if (
      !Array.isArray(point) ||
      !isDate(point[0]) ||
      !Number.isFinite(point[1])
    )
      return [];
    const lagDate = addMonths(point[0], -12);
    const lagValue = lagDate === null ? undefined : byDate.get(lagDate);
    if (!Number.isFinite(lagValue) || lagValue <= 0) return [];
    const value = (point[1] / lagValue - 1) * 100;
    return Number.isFinite(value) ? [[point[0], value]] : [];
  });
}

/** GDP uses the same exact calendar-date lookup, explicitly representing four quarters. */
export function quarterlyChange(observations) {
  return annualChange(observations);
}

/**
 * Energy prices have weekly/trading-day source labels. Compare each current
 * row with an observed row at the one-year calendar boundary, using the last
 * row on or before the boundary when that exact date is not a publication
 * day. This never selects a future row or invents a value.
 */
export function energyChange(observations) {
  const rows = (Array.isArray(observations) ? observations : [])
    .filter(
      (point) =>
        Array.isArray(point) && isDate(point[0]) && Number.isFinite(point[1]),
    )
    .sort(([left], [right]) => left.localeCompare(right));
  let priorIndex = -1;
  return rows.flatMap((point) => {
    const boundary = addMonths(point[0], -12);
    if (!boundary) return [];
    while (priorIndex + 1 < rows.length && rows[priorIndex + 1][0] <= boundary)
      priorIndex += 1;
    const prior = rows[priorIndex];
    if (
      !prior ||
      prior[1] <= 0 ||
      Date.parse(`${boundary}T00:00:00Z`) -
        Date.parse(`${prior[0]}T00:00:00Z`) >
        7 * 86400000
    )
      return [];
    const value = (point[1] / prior[1] - 1) * 100;
    return Number.isFinite(value) ? [[point[0], value]] : [];
  });
}

function latest(observations) {
  return observations.length ? observations[observations.length - 1] : null;
}

function findAtDate(observations, date) {
  if (!date) return null;
  return observations.find(([candidate]) => candidate === date) || null;
}

function valueAtLatest(series) {
  return latest(finiteObservations(series));
}

function displayDate(date) {
  if (!isDate(date)) return "an unavailable date";
  return `${MONTH_NAMES[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}, ${date.slice(0, 4)}`;
}

function numberText(value, decimals = 2) {
  if (!Number.isFinite(value)) return "unavailable";
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString("en-US", {
      maximumFractionDigits: 0,
    });
  }
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

function annualDifference(observations) {
  const rows = finiteObservations({ observations });
  const current = latest(rows);
  if (!current) return null;
  const priorDate = addMonths(current[0], -12);
  const prior = findAtDate(rows, priorDate);
  return prior ? { current, prior, difference: current[1] - prior[1] } : null;
}

function reportSeriesMeta(series, transformedUnit, transformedName) {
  return {
    id: series.id,
    name: transformedName || series.name || series.id,
    frequency: series.frequency || "unknown",
    unit: transformedUnit || series.unit || "reported units",
  };
}

function compactCount(value) {
  if (!Number.isFinite(value)) return "unavailable";
  return `${(value / 1000).toLocaleString("en-US", {
    maximumFractionDigits: 1,
  })}M`;
}

function buildSourceMetadata(series, snapshotFailureIds) {
  const observations = finiteObservations(series);
  const retained =
    series.refreshStatus === "upstream-unavailable" ||
    snapshotFailureIds.has(series.id);
  return {
    id: series.id,
    name: series.name || series.id,
    source: series.source || "Unknown source",
    sourceUrl: series.sourceUrl || null,
    frequency: series.frequency || "unknown",
    unit: series.unit || "reported units",
    observedThrough: latest(observations)?.[0] || null,
    checkedAt: series.checkedAt || null,
    refreshStatus: series.refreshStatus || "ok",
    retainedSnapshot: retained,
    freshnessNote: retained
      ? "Last successful observations retained after an unsuccessful upstream refresh; checkedAt is the latest source check recorded for this row."
      : "observedThrough is the latest source observation; checkedAt is the source check time.",
  };
}

function unavailableParagraphs(theme, missingIds) {
  const required = missingIds.join(", ");
  return [
    `Data unavailable: the required source series ${required} is missing or has no finite observations in this snapshot, so ${theme.title.toLowerCase()} cannot be calculated.`,
    "No substitute series, nearest-date value, or generated estimate is used when a required input is unavailable.",
  ];
}

function buildThemeData(theme, byId) {
  const missingIds = theme.ids.filter((id) => !byId.has(id));
  if (missingIds.length) {
    return { missingIds, entries: [], latest: [] };
  }
  const entries = theme.ids.map((id) => {
    const source = byId.get(id);
    const observations = finiteObservations(source);
    const transformed =
      theme.transform === "yoy"
        ? theme.id === "energy"
          ? energyChange(observations)
          : annualChange(observations)
        : theme.transform === "quarterly-yoy"
          ? quarterlyChange(observations)
          : observations;
    const transformedUnit =
      theme.transform === "level"
        ? theme.id === "housing"
          ? "thousands SAAR"
          : source.unit || "reported units"
        : "% YoY";
    const transformedName =
      theme.transform === "level"
        ? theme.id === "housing"
          ? `${source.name || source.id} (thousand SAAR)`
          : source.name || source.id
        : `${source.name || source.id} YoY`;
    return {
      source,
      observations,
      transformed,
      meta: reportSeriesMeta(source, transformedUnit, transformedName),
    };
  });
  return {
    missingIds: entries
      .filter((entry) => !entry.observations.length)
      .map((entry) => entry.source.id),
    entries,
    latest: entries.map((entry) => latest(entry.transformed)),
  };
}

function themeTitle(theme, data) {
  if (
    data.missingIds.length ||
    data.entries.some(({ transformed }) => !transformed.length)
  )
    return `${theme.topic} data unavailable`;
  const values = data.latest;
  switch (theme.id) {
    case "inflation":
      return `CPI inflation ${numberText(values[0][1], 1)}%; core PCE ${numberText(values[1][1], 1)}% YoY`;
    case "labor-unemployment":
      return `Unemployment is ${numberText(values[0][1], 1)}%`;
    case "jobs":
      return `Nonfarm payrolls are ${compactCount(values[0][1])}`;
    case "gdp":
      return `Real GDP grew ${numberText(values[0][1], 1)}% YoY`;
    case "monetary":
      return `Federal funds averaged ${numberText(values[0][1], 2)}%`;
    case "housing":
      return `Housing starts ${numberText(values[0][1], 0)}k; permits ${numberText(values[1][1], 0)}k`;
    case "energy":
      return `WTI ${numberText(values[0][1], 1)}%; gasoline ${numberText(values[1][1], 1)}% YoY`;
    case "industrial":
      return `Industrial production grew ${numberText(values[0][1], 1)}% YoY`;
    default:
      return theme.title;
  }
}

function themeParagraphs(theme, data) {
  if (
    data.missingIds.length ||
    data.entries.some(({ transformed }) => !transformed.length)
  ) {
    const missing = data.missingIds.length
      ? data.missingIds
      : data.entries
          .filter(({ transformed }) => !transformed.length)
          .map(({ source }) => source.id);
    return unavailableParagraphs(theme, missing);
  }

  const latestValues = data.latest;
  const entryById = new Map(
    data.entries.map((entry) => [entry.source.id, entry]),
  );
  switch (theme.id) {
    case "inflation": {
      const [cpi, pce] = latestValues;
      return [
        `The seasonally adjusted CPI index rose ${numberText(cpi[1], 2)}% year over year on ${displayDate(cpi[0])}; the seasonally adjusted core PCE index rose ${numberText(pce[1], 2)}% on ${displayDate(pce[0])}. These are 12-month changes in price indexes, not the official non-seasonally-adjusted CPI headline series or price levels.`,
        "The two measures retain their native monthly rows and are shown together only after both are expressed in percent year-over-year changes using exact 12-month calendar matches.",
      ];
    }
    case "labor-unemployment": {
      const entry = entryById.get("UNRATE");
      const current = latest(entry.transformed);
      const delta = annualDifference(entry.observations);
      const comparison = delta
        ? ` That is ${signedText(delta.difference, 1)} percentage points versus ${numberText(delta.prior[1], 1)}% on ${displayDate(delta.prior[0])}.`
        : " An exact one-year percentage-point comparison is unavailable.";
      return [
        `The unemployment rate was ${numberText(current[1], 1)}% on ${displayDate(current[0])}.${comparison}`,
        "The chart preserves the reported rate level. Percentage-point comparisons subtract two rate levels; they are not percent changes.",
      ];
    }
    case "jobs": {
      const entry = entryById.get("PAYEMS");
      const current = latest(entry.transformed);
      const delta = annualDifference(entry.observations);
      const comparison = delta
        ? ` The exact one-year change was ${signedText(delta.difference, 0)} thousand from ${displayDate(delta.prior[0])} to ${displayDate(delta.current[0])}.`
        : " An exact one-year comparison is unavailable.";
      return [
        `Nonfarm payrolls were ${compactCount(current[1])} (${numberText(current[1], 0)} thousand) on ${displayDate(current[0])}.${comparison}`,
        "Payrolls remain in the source's reported thousands, with no indexing or equity-market proxy substituted.",
      ];
    }
    case "gdp": {
      const current = latestValues[0];
      return [
        `Real GDP, a seasonally adjusted annual-rate level in the source, grew ${numberText(current[1], 2)}% year over year in the quarter dated ${displayDate(current[0])}. This is not an annualized quarter-over-quarter growth rate.`,
        "The growth point compares the quarter with the observation exactly four quarters earlier by calendar date; a nearby or future quarter is never used.",
      ];
    }
    case "monetary": {
      const current = latestValues[0];
      return [
        `The monthly-average federal funds rate was ${numberText(current[1], 2)}% in the observation dated ${displayDate(current[0])}.`,
        "This panel reports the native FRED level and monthly frequency; it is not converted into a return, spread, or policy forecast.",
      ];
    }
    case "housing": {
      const [starts, permits] = latestValues;
      return [
        `Housing starts were ${numberText(starts[1], 0)} thousand on ${displayDate(starts[0])}; building permits were ${numberText(permits[1], 0)} thousand on ${displayDate(permits[0])}.`,
        "Both series remain native reported seasonally adjusted annual-rate levels in thousands, so the panel does not imply that permits equal completed construction or combine unlike units.",
      ];
    }
    case "energy": {
      const [oil, gas] = latestValues;
      return [
        `WTI crude was ${numberText(oil[1], 2)}% year over year on ${displayDate(oil[0])}; regular gasoline was ${numberText(gas[1], 2)}% on ${displayDate(gas[0])}.`,
        "Both series are converted to the common percent year-over-year unit before plotting; their native dollar-per-barrel and dollar-per-gallon levels are not treated as comparable.",
      ];
    }
    case "industrial": {
      const current = latestValues[0];
      return [
        `Industrial production grew ${numberText(current[1], 2)}% year over year on ${displayDate(current[0])}.`,
        "The index is transformed to an exact 12-month percentage change, preserving monthly source dates and omitting rows without an exact lag observation.",
      ];
    }
    default:
      return [
        `${theme.title} has a latest value of ${numberText(latestValues[0]?.[1])} on ${displayDate(latestValues[0]?.[0])}.`,
        "The series is shown using the source-defined frequency and unit.",
      ];
  }
}

function themeNote(theme, data) {
  if (
    data.missingIds.length ||
    data.entries.some(({ transformed }) => !transformed.length)
  ) {
    return "Unavailable: required source data are missing or have no exact finite observations.";
  }
  if (theme.id === "energy")
    return "Energy YoY = 100 × (current observation / last observed value on or before the exact one-year calendar boundary − 1), only when that prior row is within seven calendar days of the boundary.";
  if (theme.transform === "yoy")
    return "YoY = 100 × (current observation / exact observation 12 calendar months earlier − 1).";
  if (theme.transform === "quarterly-yoy")
    return "GDP YoY = 100 × (current quarter / exact observation four quarters earlier − 1); the four-quarter lag is an exact calendar-date match.";
  return "Native source level; no resampling, rebasing, or synthetic value is applied.";
}

function buildHeadline(label, unit, id, series, transform) {
  const observations = finiteObservations(series);
  const points =
    transform === "level"
      ? observations
      : transform === "yoy"
        ? id === "DCOILWTICO" || id === "GASREGW"
          ? energyChange(observations)
          : annualChange(observations)
        : quarterlyChange(observations);
  const current = transform === "level" ? latest(observations) : latest(points);
  return {
    label,
    value: current?.[1] ?? null,
    unit,
    date: current?.[0] ?? null,
  };
}

function reportSummary(headlines) {
  const sentence = headlines
    .map((headline) =>
      headline.date === null
        ? `${headline.label} is unavailable`
        : `${headline.label} was ${numberText(headline.value, 2)}${headline.unit.startsWith("%") ? "%" : ` ${headline.unit}`} on ${displayDate(headline.date)}`,
    )
    .join("; ");
  return `This report follows U.S. inflation, employment, output, monetary policy, housing and energy using public economic releases. In the latest available observations, ${sentence}. Dates identify each source period, not the daily snapshot check.`;
}

function buildAsOf(snapshotSeries) {
  const asOfDates = Object.fromEntries(
    REPORT_IDS.map((id) => [
      id,
      latest(finiteObservations(snapshotSeries.get(id)))?.[0] || null,
    ]),
  );
  const observed = Object.values(asOfDates).filter(Boolean).sort();
  return {
    latest: observed.length ? observed[observed.length - 1] : null,
    bySeries: asOfDates,
  };
}

/**
 * Build the complete source-backed macro report from one snapshot.
 * Missing required inputs produce explicit unavailable findings/headlines;
 * they never silently borrow another series or snapshot timestamp.
 */
export function buildMacroReport(snapshot) {
  const sourceRows = Array.isArray(snapshot?.series) ? snapshot.series : [];
  const byId = new Map(
    sourceRows
      .filter((series) => typeof series?.id === "string")
      .map((series) => [series.id, series]),
  );
  const snapshotFailureIds = new Set(
    Array.isArray(snapshot?.refreshFailures) ? snapshot.refreshFailures : [],
  );

  const headlineSpecs = [
    ["Headline CPI (SA index) YoY", "% YoY", "CPIAUCSL", "yoy"],
    ["Core PCE (SA index) YoY", "% YoY", "PCEPILFE", "yoy"],
    ["Unemployment rate", "%", "UNRATE", "level"],
    ["Real GDP growth", "% YoY", "GDPC1", "quarterly-yoy"],
  ];
  const headlines = headlineSpecs.map(([label, unit, id, transform]) => {
    const series = byId.get(id);
    return series
      ? buildHeadline(label, unit, id, series, transform)
      : { label, value: null, unit, date: null };
  });

  const findings = REPORT_THEMES.map((theme) => {
    const data = buildThemeData(theme, byId);
    const transformedEntries = data.entries.map((entry) => entry.transformed);
    return {
      id: theme.id,
      topic: theme.topic,
      title: themeTitle(theme, data),
      paragraphs: themeParagraphs(theme, data),
      series: data.entries.map((entry) => entry.meta),
      points: transformedEntries,
      suffix: theme.suffix,
      note: themeNote(theme, data),
    };
  });

  const asOf = buildAsOf(byId);
  const sourceMetadata = REPORT_IDS.map((id) => {
    const series = byId.get(id);
    return series
      ? buildSourceMetadata(series, snapshotFailureIds)
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
          freshnessNote: "Required source row is unavailable in this snapshot.",
        };
  });

  return {
    headlines,
    summary: reportSummary(headlines),
    findings,
    asOf,
    sourceMetadata,
    methodDefinitions,
  };
}
