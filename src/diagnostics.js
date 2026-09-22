/**
 * Pure, chart-ready diagnostic contracts for MacroTrace.
 *
 * These helpers intentionally return observations plus explicit units and
 * sample counts. They do not clip, winsorize, interpolate, or silently bridge
 * missing calendar periods. The existing analytics module owns frequency,
 * change-type, and complete-period semantics; this module composes those
 * primitives into a small set of renderer-friendly panel contracts.
 */

import {
  changeType,
  mean,
  median,
  nativeChanges,
  periodChanges,
  rollingHorizonChanges,
} from "./analytics.js";

const DAY_MS = 86_400_000;
const VOL_FACTOR = {
  daily: 252,
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  annual: 1,
};

const FREQUENCY_RANK = {
  daily: 1,
  weekly: 2,
  monthly: 3,
  quarterly: 4,
  annual: 5,
};
const CLEAN_CACHE = new WeakMap();
const NATIVE_CHANGE_CACHE = new WeakMap();
const DATE_VALUE_CACHE = new Map();
// Most selected series share native dates; horizon cutoffs are reused across
// those series while preserving the same calendar-boundary semantics.
const CUTOFF_CACHE = new Map();

/** Stable metadata for parent renderers and documentation. */
export const diagnosticContracts = Object.freeze({
  rollingAnnualReturn: Object.freeze({
    question: "What is the trailing one-year change or return?",
    rows: "date, value, unit, type",
    units: "percent, basis points, or points according to source semantics",
  }),
  rollingVolatility: Object.freeze({
    question: "How has trailing realized variability changed?",
    rows: "date, value, unit, type, count, annualizationFactor",
    units:
      "annualized percent, basis points, or points; count is native changes",
  }),
  changeDistribution: Object.freeze({
    question:
      "What is the empirical distribution and downside profile of changes?",
    rows: "lower, upper, midpoint, count, share",
    units: "source semantic change unit; no outlier clipping",
  }),
  breadthAcceleration: Object.freeze({
    question:
      "How broad is positive/negative movement, and is that breadth accelerating?",
    rows: "period, positiveSharePct, negativeSharePct, accelerationPositiveSharePct, percentileMean",
    units: "shares are percent of valid series; percentile ranks are 0-100",
  }),
});

function sourceObservations(input) {
  return Array.isArray(input) ? input : (input?.observations ?? []);
}

function dateText(value) {
  const parsed =
    value instanceof Date
      ? value
      : new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(parsed.getTime())
    ? parsed.toISOString().slice(0, 10)
    : null;
}

function dateValue(value) {
  if (value instanceof Date && !Number.isFinite(value.getTime())) return NaN;
  const text =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value).slice(0, 10);
  if (!text) return NaN;
  if (DATE_VALUE_CACHE.has(text)) return DATE_VALUE_CACHE.get(text);
  const parsed = Date.parse(`${text}T00:00:00Z`);
  DATE_VALUE_CACHE.set(text, parsed);
  return parsed;
}

/** Normalize fixture/data input; analytics remains authoritative for semantics. */
function cleanObservations(input) {
  const cacheable = input && typeof input === "object";
  if (cacheable && CLEAN_CACHE.has(input)) return CLEAN_CACHE.get(input);
  const byDate = new Map();
  for (const point of sourceObservations(input)) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const date = dateText(point[0]);
    const value = Number(point[1]);
    if (date && Number.isFinite(value)) byDate.set(date, [date, value]);
  }
  const result = [...byDate.values()].sort(
    (left, right) => dateValue(left[0]) - dateValue(right[0]),
  );
  if (cacheable) CLEAN_CACHE.set(input, result);
  return result;
}

function fullNativeChanges(series) {
  const cacheable = series && typeof series === "object";
  if (cacheable && NATIVE_CHANGE_CACHE.has(series))
    return NATIVE_CHANGE_CACHE.get(series);
  const result = nativeChanges(series, "max");
  if (cacheable) NATIVE_CHANGE_CACHE.set(series, result);
  return result;
}

function labelOf(series, fallback = "Series") {
  return series?.name ?? series?.label ?? series?.id ?? fallback;
}

function frequencyOf(series) {
  return FREQUENCY_RANK[series?.frequency] ? series.frequency : "monthly";
}

function changeUnit(type) {
  if (type === "basis-points") return "basis points";
  if (type === "points") return "points";
  return "percent";
}

function annualizedUnit(type) {
  return `${changeUnit(type)} annualized`;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function shiftCalendar(date, { years = 0, months = 0, days = 0 } = {}) {
  const source = new Date(dateValue(date));
  if (!Number.isFinite(source.getTime())) return new Date(NaN);
  const monthIndex =
    source.getUTCFullYear() * 12 + source.getUTCMonth() + months + years * 12;
  const year = Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const day = Math.min(source.getUTCDate(), daysInMonth(year, month));
  const result = new Date(
    Date.UTC(
      year,
      month,
      day,
      source.getUTCHours(),
      source.getUTCMinutes(),
      source.getUTCSeconds(),
      source.getUTCMilliseconds(),
    ),
  );
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Match analytics.js horizon semantics for a moving current observation. */
function cutoffForDate(date, horizon) {
  if (horizon === "max" || horizon === undefined || horizon === null)
    return null;
  const key = `${String(date).slice(0, 10)}|${String(horizon)}`;
  if (CUTOFF_CACHE.has(key)) return CUTOFF_CACHE.get(key);
  const text = String(horizon).trim().toLowerCase();
  if (text === "max") return null;
  const current = new Date(dateValue(date));
  if (!Number.isFinite(current.getTime())) return null;
  if (text === "ytd") {
    const result = new Date(Date.UTC(current.getUTCFullYear(), 0, 1));
    CUTOFF_CACHE.set(key, result);
    return result;
  }
  const match = text.match(
    /^(\d+(?:\.\d+)?)\s*(d|day|days|w|week|weeks|m|month|months|q|quarter|quarters|y|yr|year|years)?$/,
  );
  if (!match) {
    const result = new Date(current.getTime() - Number(horizon) * DAY_MS);
    CUTOFF_CACHE.set(key, result);
    return result;
  }
  const amount = Number(match[1]);
  const unit = match[2] ?? "days";
  if (!Number.isFinite(amount)) return new Date(NaN);
  let result;
  if (unit.startsWith("y")) result = shiftCalendar(current, { years: -amount });
  else if (unit.startsWith("q"))
    result = shiftCalendar(current, { months: -amount * 3 });
  else if (unit.startsWith("m"))
    result = shiftCalendar(current, { months: -amount });
  else if (unit.startsWith("w"))
    result = new Date(current.getTime() - amount * 7 * DAY_MS);
  const calendarMonths = { 30: 1, 90: 3, 180: 6, 182: 6 };
  if (!result && calendarMonths[amount])
    result = shiftCalendar(current, { months: -calendarMonths[amount] });
  const calendarYears = {
    365: 1,
    1095: 3,
    1460: 4,
    1825: 5,
    2190: 6,
    2555: 7,
    2920: 8,
    3285: 9,
    3650: 10,
  };
  if (!result && calendarYears[amount])
    result = shiftCalendar(current, { years: -calendarYears[amount] });
  if (!result) result = new Date(current.getTime() - amount * DAY_MS);
  CUTOFF_CACHE.set(key, result);
  return result;
}

function hasBoundaryObservation(observations, cutoff) {
  return (
    !cutoff ||
    (observations.length > 0 &&
      dateValue(observations[0][0]) <= cutoff.getTime())
  );
}

function minimumVolatilitySamples(series, horizon, configured) {
  if (configured !== undefined && configured !== null)
    return Math.max(2, Math.floor(configured));
  if (horizon === "max" || horizon === undefined || horizon === null) return 3;
  return (
    { daily: 20, weekly: 8, monthly: 6, quarterly: 3, annual: 3 }[
      frequencyOf(series)
    ] ?? 6
  );
}

function lowerBound(sorted, value) {
  let left = 0;
  let right = sorted.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (sorted[middle] < value) left = middle + 1;
    else right = middle;
  }
  return left;
}

function upperBound(sorted, value) {
  let left = 0;
  let right = sorted.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (sorted[middle] <= value) left = middle + 1;
    else right = middle;
  }
  return left;
}

function rankFromSorted(value, sorted) {
  if (!Number.isFinite(value) || !sorted.length) return NaN;
  const below = lowerBound(sorted, value);
  const ties = upperBound(sorted, value) - below;
  return ((below + ties * 0.5) / sorted.length) * 100;
}

function isPositiveLevel(series) {
  const observations = cleanObservations(series);
  return (
    observations.length > 0 && observations.every(([, value]) => value > 0)
  );
}

function semanticReturn(value, type) {
  if (type === "percent") {
    // nativeChanges() uses simple percentage returns. Convert to log returns
    // for standard market volatility without changing the displayed return.
    return value > -100 ? Math.log1p(value / 100) * 100 : NaN;
  }
  return value;
}

/**
 * Rolling annual change/return path. For positive market-style indexes the
 * value is a percentage return; rates and signed indexes retain basis-point or
 * point semantics from analytics.changeType().
 */
export function rollingAnnualReturn(series, { horizon = "1y" } = {}) {
  const type = changeType(series);
  const rows = rollingHorizonChanges(series, horizon).map(([date, value]) => ({
    date,
    value,
    unit: changeUnit(type),
    type,
  }));
  return {
    metric: "rolling annual return",
    horizon,
    type,
    unit: changeUnit(type),
    rows,
    n: rows.length,
  };
}

/**
 * Rolling annualized volatility path. The same complete, adjacent native
 * changes used by analytics are used for each prefix. Positive price/index
 * series use log returns; zero-crossing and rate series use semantic changes.
 */
export function rollingVolatilityPath(
  series,
  { horizon = "1y", minimumObservations } = {},
) {
  const observations = cleanObservations(series);
  const type = changeType(series);
  const useLog = type === "percent" && isPositiveLevel(series);
  const factor = VOL_FACTOR[frequencyOf(series)] ?? VOL_FACTOR.monthly;
  const minimum = minimumVolatilitySamples(
    series,
    horizon,
    minimumObservations,
  );
  const changes = [];
  for (const change of fullNativeChanges(series)) {
    const value = semanticReturn(change.value, useLog ? "percent" : type);
    if (Number.isFinite(value)) changes.push({ date: change.date, value });
  }
  const rows = [];
  const window = [];
  let sum = 0;
  let sumSquares = 0;
  let left = 0;
  for (const change of changes) {
    const cutoff = cutoffForDate(change.date, horizon);
    while (
      left < window.length &&
      cutoff &&
      dateValue(window[left].date) <= cutoff.getTime()
    ) {
      sum -= window[left].value;
      sumSquares -= window[left].value ** 2;
      left += 1;
    }
    window.push(change);
    sum += change.value;
    sumSquares += change.value ** 2;
    // A bounded rolling window is valid only when the source has an actual
    // observation at or before its calendar boundary. This prevents a sparse
    // two-month prefix from masquerading as a one-year volatility estimate.
    if (cutoff && !hasBoundaryObservation(observations, cutoff)) continue;
    const count = window.length - left;
    if (count < minimum) continue;
    const variance =
      (sumSquares - (sum * sum) / count) / Math.max(1, count - 1);
    const deviation = variance > 0 ? Math.sqrt(variance) : 0;
    if (!Number.isFinite(deviation)) continue;
    rows.push({
      date: change.date,
      value: deviation * Math.sqrt(factor),
      unit: annualizedUnit(useLog ? "percent" : type),
      type: useLog ? "percent" : type,
      count,
      annualizationFactor: factor,
      method: useLog
        ? "log-return sample standard deviation"
        : "semantic-change sample standard deviation",
    });
  }
  return {
    metric: "rolling annualized volatility",
    horizon,
    unit: annualizedUnit(useLog ? "percent" : type),
    type: useLog ? "percent" : type,
    method: useLog ? "log-return" : "semantic-change",
    rows,
    n: rows.length,
  };
}

function linearQuantile(sorted, probability) {
  if (!sorted.length) return NaN;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function distributionBins(values, bins) {
  if (!values.length) return [];
  const lower = Math.min(...values);
  const upper = Math.max(...values);
  if (lower === upper)
    return [
      { lower, upper, midpoint: lower, count: values.length, share: 100 },
    ];
  const width = (upper - lower) / bins;
  const counts = Array.from({ length: bins }, () => 0);
  for (const value of values) {
    const index = Math.min(bins - 1, Math.floor((value - lower) / width));
    counts[index] += 1;
  }
  return counts.map((count, index) => ({
    lower: lower + index * width,
    upper: index === bins - 1 ? upper : lower + (index + 1) * width,
    midpoint: lower + (index + 0.5) * width,
    count,
    share: (count / values.length) * 100,
  }));
}

/**
 * Empirical change distribution plus downside summary. True extremes remain
 * in values and bins; the optional percentile rank is a bounded display aid,
 * never a replacement for the underlying observation.
 */
export function changeDistribution(
  series,
  {
    period = "native",
    horizon = "max",
    bins = 12,
    probabilities = [0.05, 0.25, 0.5, 0.75, 0.95],
  } = {},
) {
  const type = changeType(series);
  const changes =
    period === "native"
      ? horizon === "max"
        ? fullNativeChanges(series)
        : nativeChanges(series, horizon)
      : periodChanges(series, period, horizon);
  const observations = changes
    .filter(({ value }) => Number.isFinite(value))
    .map(({ date, period: periodKey, value }) => ({
      date,
      period: periodKey ?? date,
      value,
      unit: changeUnit(type),
    }));
  const values = observations.map(({ value }) => value);
  const sorted = [...values].sort((left, right) => left - right);
  const negative = values.filter((value) => value < 0);
  const safeBins = Math.max(1, Math.floor(Number(bins) || 1));
  const quantiles = probabilities
    .filter(
      (probability) =>
        Number.isFinite(probability) && probability >= 0 && probability <= 1,
    )
    .map((probability) => ({
      percentile: probability * 100,
      value: linearQuantile(sorted, probability),
      unit: changeUnit(type),
    }));
  const downsideDeviation = values.length
    ? Math.sqrt(
        values.reduce((sum, value) => sum + (value < 0 ? value ** 2 : 0), 0) /
          values.length,
      )
    : NaN;
  const latest = observations.at(-1)?.value;
  return {
    metric: "change distribution",
    period,
    horizon,
    type,
    unit: changeUnit(type),
    rows: distributionBins(values, safeBins).map((row) => ({
      ...row,
      unit: changeUnit(type),
    })),
    observations,
    values,
    quantiles,
    summary: {
      n: values.length,
      mean: mean(values),
      median: median(values),
      minimum: sorted[0] ?? NaN,
      maximum: sorted.at(-1) ?? NaN,
      downsideProbabilityPct: values.length
        ? (negative.length / values.length) * 100
        : NaN,
      downsideMean: negative.length ? mean(negative) : NaN,
      downsideDeviation,
      latest,
      latestPercentile: Number.isFinite(latest)
        ? rankFromSorted(latest, sorted)
        : NaN,
    },
    n: values.length,
  };
}

function normalPeriod(period) {
  const value = String(period ?? "auto").toLowerCase();
  if (["year", "annual", "y"].includes(value)) return "year";
  if (["quarter", "quarterly", "q"].includes(value)) return "quarter";
  if (["month", "monthly", "m"].includes(value)) return "month";
  return "auto";
}

function commonPeriod(seriesList) {
  const rank = Math.max(
    ...seriesList.map((series) => FREQUENCY_RANK[frequencyOf(series)] ?? 3),
  );
  return rank >= 5 ? "year" : rank === 4 ? "quarter" : "month";
}

function periodNumber(key, period) {
  if (period === "year") return Number(String(key).slice(0, 4));
  if (period === "quarter") {
    const match = String(key).match(/^(\d{4})-Q(\d)$/);
    return match ? Number(match[1]) * 4 + Number(match[2]) - 1 : NaN;
  }
  const match = String(key).match(/^(\d{4})-(\d{2})$/);
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : NaN;
}

function adjacentPeriod(left, right, period) {
  return periodNumber(right, period) === periodNumber(left, period) + 1;
}

function seriesRows(series, period, horizon) {
  const changes = periodChanges(series, period, horizon);
  const type = changeType(series);
  const values = changes.map(({ value }) => value).filter(Number.isFinite);
  const sorted = [...values].sort((left, right) => left - right);
  return {
    type,
    unit: changeUnit(type),
    rows: changes
      .filter(({ value }) => Number.isFinite(value))
      .map((row) => ({
        period: row.period,
        date: row.date,
        value: row.value,
        unit: changeUnit(type),
        percentile: rankFromSorted(row.value, sorted),
      })),
  };
}

/**
 * Cross-series macro breadth and acceleration. Raw per-series changes remain
 * available in `series`; aggregate rows use signs and percentile ranks so
 * rates, indexes, dollars, and counts are not averaged in incompatible units.
 */
export function breadthAcceleration(
  seriesList,
  { period = "auto", horizon = "max" } = {},
) {
  const inputs = Array.isArray(seriesList) ? seriesList.filter(Boolean) : [];
  const target =
    normalPeriod(period) === "auto"
      ? commonPeriod(inputs)
      : normalPeriod(period);
  const perSeries = inputs.map((series) => ({
    id: series.id ?? labelOf(series),
    label: labelOf(series),
    ...seriesRows(series, target, horizon),
  }));
  const rowLookups = perSeries.map((item) => {
    const lookup = new Map();
    item.rows.forEach((row, index) => {
      lookup.set(row.period, { current: row, previous: item.rows[index - 1] });
    });
    return lookup;
  });
  const byPeriod = new Map();
  for (const item of perSeries) {
    for (const row of item.rows) {
      if (!byPeriod.has(row.period)) byPeriod.set(row.period, []);
      byPeriod.get(row.period).push({ item, row });
    }
  }
  const rows = [...byPeriod.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([periodKey, entries]) => {
      const positive = entries.filter(({ row }) => row.value > 0).length;
      const negative = entries.filter(({ row }) => row.value < 0).length;
      const percentiles = entries
        .map(({ row }) => row.percentile)
        .filter(Number.isFinite);
      const acceleration = [];
      for (let index = 0; index < perSeries.length; index += 1) {
        const item = perSeries[index];
        const { current, previous } = rowLookups[index].get(periodKey) ?? {};
        if (
          current &&
          previous &&
          adjacentPeriod(previous.period, current.period, target)
        )
          acceleration.push({ value: current.value - previous.value, item });
      }
      const accelerationPositive = acceleration.filter(
        ({ value }) => value > 0,
      ).length;
      const accelerationNegative = acceleration.filter(
        ({ value }) => value < 0,
      ).length;
      return {
        period: periodKey,
        date: entries
          .map(({ row }) => row.date)
          .sort()
          .at(-1),
        positiveSharePct: entries.length
          ? (positive / entries.length) * 100
          : NaN,
        negativeSharePct: entries.length
          ? (negative / entries.length) * 100
          : NaN,
        validCount: entries.length,
        seriesCount: perSeries.length,
        unit: "percent of valid series",
        percentileMean: percentiles.length ? mean(percentiles) : NaN,
        percentileMedian: percentiles.length ? median(percentiles) : NaN,
        percentileUnit: "percentile rank (0-100)",
        accelerationPositiveSharePct: acceleration.length
          ? (accelerationPositive / acceleration.length) * 100
          : NaN,
        accelerationNegativeSharePct: acceleration.length
          ? (accelerationNegative / acceleration.length) * 100
          : NaN,
        accelerationValidCount: acceleration.length,
        accelerationUnit:
          "change-unit difference within each source; aggregate is share",
      };
    });
  return {
    metric: "macro breadth and acceleration",
    period: target,
    horizon,
    rows,
    series: perSeries,
    n: rows.length,
  };
}
