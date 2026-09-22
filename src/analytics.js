/**
 * Pure, frequency-aware analytics for the MacroTrace snapshot.
 *
 * Values returned by change(), periodChanges(), volatility(), and
 * annualizedCagr() are percentages in the usual UI sense: a 100 bp rate move
 * is returned as 100, while a 10% price return is returned as 10. Calendar
 * aggregation is end-of-period (last observation), never interpolation.
 *
 * A window has two distinct parts: observations whose dates are inside the
 * requested window and an optional `anchor`, the last real observation before
 * the cutoff. The anchor is useful for an exact boundary change, but is never
 * included in an observation count or returned calendar period.
 */

const DAY_MS = 86_400_000;
const FREQ_RANK = { daily: 1, weekly: 2, monthly: 3, quarterly: 4, annual: 5 };
const VOL_FACTOR = {
  daily: 252,
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  annual: 1,
};
const OBSERVATION_CACHE = new WeakMap();
const SERIES_OBSERVATION_CACHE = new WeakMap();
const CHANGE_TYPE_CACHE = new WeakMap();
const CALENDAR_CACHE = new WeakMap();

function asSource(input) {
  return Array.isArray(input) ? input : (input?.observations ?? []);
}

function dateValue(date) {
  const value =
    date instanceof Date
      ? date.getTime()
      : new Date(`${String(date).slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isFinite(value) ? value : NaN;
}

function dateText(date) {
  const value = dateValue(date);
  return Number.isFinite(value)
    ? new Date(value).toISOString().slice(0, 10)
    : null;
}

function cleanObservations(input) {
  const source = asSource(input);
  if (source && typeof source === "object" && OBSERVATION_CACHE.has(source))
    return OBSERVATION_CACHE.get(source);
  const byDate = new Map();
  for (const point of source) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const date = dateText(point[0]);
    const value = Number(point[1]);
    if (date && Number.isFinite(value)) byDate.set(date, [date, value]);
  }
  const cleaned = [...byDate.values()].sort(
    (a, b) => dateValue(a[0]) - dateValue(b[0]),
  );
  if (source && typeof source === "object")
    OBSERVATION_CACHE.set(source, cleaned);
  return cleaned;
}

function seriesObservations(series) {
  if (
    series &&
    typeof series === "object" &&
    SERIES_OBSERVATION_CACHE.has(series)
  )
    return SERIES_OBSERVATION_CACHE.get(series);
  const cleaned = cleanObservations(series);
  if (series && typeof series === "object")
    SERIES_OBSERVATION_CACHE.set(series, cleaned);
  return cleaned;
}

function frequencyOf(series) {
  return FREQ_RANK[series?.frequency] ? series.frequency : "monthly";
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

function horizonSpec(horizon) {
  if (horizon === "max" || horizon === undefined || horizon === null)
    return { max: true };
  if (horizon === "ytd") return { ytd: true };
  const text = String(horizon).trim().toLowerCase();
  if (text === "max") return { max: true };
  if (text === "ytd") return { ytd: true };
  const match = text.match(
    /^(\d+(?:\.\d+)?)\s*(d|day|days|w|week|weeks|m|month|months|q|quarter|quarters|y|yr|year|years)?$/,
  );
  if (!match) return { days: Number(horizon) };
  const amount = Number(match[1]);
  const unit = match[2] ?? "days";
  if (!Number.isFinite(amount)) return { days: NaN };
  if (unit.startsWith("y")) return { years: amount };
  if (unit.startsWith("q")) return { months: amount * 3 };
  if (unit.startsWith("m")) return { months: amount };
  if (unit.startsWith("w")) return { days: amount * 7 };
  // Legacy UI horizons are calendar-like labels: 30/90/182 map to 1/3/6
  // months and 365/1095/1825/3650 map to 1/3/5/10 years. This fixes leap-year
  // cutoffs while preserving the existing numeric UI contract.
  const calendarMonths = { 30: 1, 90: 3, 180: 6, 182: 6 };
  if (calendarMonths[amount]) return { months: calendarMonths[amount] };
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
  if (calendarYears[amount]) return { years: calendarYears[amount] };
  return { days: amount };
}

function cutoffForLatest(latest, horizon) {
  if (!latest) return null;
  const spec = horizonSpec(horizon);
  if (spec.max) return null;
  const latestDate = new Date(dateValue(latest));
  if (spec.ytd) return new Date(Date.UTC(latestDate.getUTCFullYear(), 0, 1));
  if (Number.isFinite(spec.years) || Number.isFinite(spec.months))
    return shiftCalendar(latestDate, {
      years: -(spec.years ?? 0),
      months: -(spec.months ?? 0),
    });
  if (Number.isFinite(spec.days))
    return new Date(latestDate.getTime() - spec.days * DAY_MS);
  return null;
}

/**
 * Return the actual observations inside a horizon and the actual prior point
 * immediately before its calendar cutoff. No trailing-observation fallback is
 * performed when a horizon has insufficient data.
 */
export function sliceWindow(input, horizon = "max") {
  const observations = cleanObservations(input);
  if (!observations.length)
    return {
      observations: [],
      anchor: null,
      cutoff: null,
      latest: null,
      points: [],
    };
  const latest = observations.at(-1);
  const cutoff = cutoffForLatest(latest[0], horizon);
  const startIndex = cutoff
    ? observations.findIndex(([date]) => dateValue(date) >= cutoff.getTime())
    : 0;
  if (startIndex < 0)
    return {
      observations: [],
      anchor: observations.at(-1),
      cutoff: cutoff.toISOString().slice(0, 10),
      latest,
      points: [],
    };
  const inside = observations.slice(startIndex);
  // An observation exactly on the cutoff is already the boundary baseline;
  // do not prepend the prior period and accidentally turn a one-year change
  // into thirteen months (or two annual returns).
  const exactCutoff = cutoff && dateValue(inside[0]?.[0]) === cutoff.getTime();
  const anchor =
    startIndex > 0 && !exactCutoff ? observations[startIndex - 1] : null;
  return {
    observations: inside,
    anchor,
    cutoff: cutoff ? cutoff.toISOString().slice(0, 10) : null,
    latest,
    points: anchor ? [anchor, ...inside] : inside,
  };
}

/** Backward-compatible name for callers that only need inside-window points. */
export function sliceHorizon(input, horizon = "max") {
  return sliceWindow(input, horizon).observations;
}

export function changeType(series) {
  if (series && typeof series === "object" && CHANGE_TYPE_CACHE.has(series))
    return CHANGE_TYPE_CACHE.get(series);
  const explicit = series?.changeType ?? series?.changeMode;
  if (["percent", "basis-points", "points"].includes(explicit)) {
    if (series && typeof series === "object")
      CHANGE_TYPE_CACHE.set(series, explicit);
    return explicit;
  }
  const category = String(series?.category ?? "").toLowerCase();
  const unit = String(series?.unit ?? "").toLowerCase();
  const market =
    series?.kind === "market" ||
    series?.source === "Yahoo Finance" ||
    ["markets", "currencies", "commodities"].includes(category);
  if (market) {
    if (series && typeof series === "object")
      CHANGE_TYPE_CACHE.set(series, "percent");
    return "percent";
  }
  if (unit === "%" || unit === "percentage points" || category === "rates") {
    if (series && typeof series === "object")
      CHANGE_TYPE_CACHE.set(series, "basis-points");
    return "basis-points";
  }
  const values = seriesObservations(series).map(([, value]) => value);
  const result =
    unit.includes("index") && values.some((value) => value <= 0)
      ? "points"
      : values.length && values.every((value) => value > 0)
        ? "percent"
        : "points";
  if (series && typeof series === "object")
    CHANGE_TYPE_CACHE.set(series, result);
  return result;
}

export function changeSuffix(series) {
  return changeType(series) === "basis-points"
    ? " bp"
    : changeType(series) === "points"
      ? " pts"
      : "%";
}

function changePair(previous, current, type) {
  if (!previous || !current) return NaN;
  const prior = previous[1];
  const value = current[1];
  if (type === "basis-points")
    return Number.isFinite(prior) && Number.isFinite(value)
      ? (value - prior) * 100
      : NaN;
  if (type === "points")
    return Number.isFinite(prior) && Number.isFinite(value)
      ? value - prior
      : NaN;
  return prior > 0 && value > 0 ? (value / prior - 1) * 100 : NaN;
}

function maxNativeGap(frequency) {
  return (
    { daily: 7, weekly: 14, monthly: 45, quarterly: 140, annual: 450 }[
      frequency
    ] ?? 45
  );
}

function minimumNativeDays(frequency) {
  return (
    { daily: 1, weekly: 7, monthly: 28, quarterly: 89, annual: 365 }[
      frequency
    ] ?? 28
  );
}

function minimumCalendarDays(period) {
  return { month: 28, quarter: 89, year: 365 }[period] ?? 28;
}

function horizonCoversMinimum(
  series,
  horizon,
  minimumDays = minimumNativeDays(frequencyOf(series)),
) {
  const observations = seriesObservations(series);
  if (
    !observations.length ||
    horizon === "max" ||
    horizon === undefined ||
    horizon === null
  )
    return true;
  const cutoff = cutoffForLatest(observations.at(-1)[0], horizon);
  if (!cutoff) return true;
  return (
    (dateValue(observations.at(-1)[0]) - cutoff.getTime()) / DAY_MS >=
    minimumDays
  );
}

function hasWindowCoverage(window) {
  return (
    !window.cutoff ||
    !window.observations.length ||
    dateValue(window.observations[0][0]) <= dateValue(window.cutoff)
  );
}

function periodNumber(date, period) {
  const parsed = new Date(dateValue(date));
  const year = parsed.getUTCFullYear();
  if (period === "year") return year;
  if (period === "quarter")
    return year * 4 + Math.floor(parsed.getUTCMonth() / 3);
  return year * 12 + parsed.getUTCMonth();
}

function adjacentNative(previous, current, frequency) {
  const priorDate = dateValue(previous[0]);
  const currentDate = dateValue(current[0]);
  const days = (currentDate - priorDate) / DAY_MS;
  if (frequency === "daily" || frequency === "weekly")
    return days > 0 && days <= maxNativeGap(frequency);
  const unit =
    frequency === "annual"
      ? "year"
      : frequency === "quarterly"
        ? "quarter"
        : "month";
  return periodNumber(previous[0], unit) + 1 === periodNumber(current[0], unit);
}

/** Native-frequency period changes, including one real boundary anchor when available. */
export function nativeChanges(series, horizon = "max") {
  if (!horizonCoversMinimum(series, horizon)) return [];
  const window = sliceWindow(series, horizon);
  const type = changeType(series);
  const frequency = frequencyOf(series);
  const points = window.anchor
    ? [window.anchor, ...window.observations]
    : window.observations;
  const insideDates = new Set(window.observations.map(([date]) => date));
  const changes = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!adjacentNative(previous, current, frequency)) continue;
    const value = changePair(previous, current, type);
    if (Number.isFinite(value) && insideDates.has(current[0]))
      changes.push({
        date: current[0],
        value,
        type,
        priorDate: previous[0],
        currentDate: current[0],
        isAnchorChange: previous === window.anchor,
      });
  }
  return changes;
}

function normalPeriod(period) {
  const text = String(period ?? "native").toLowerCase();
  if (["annual", "year", "yearly", "y"].includes(text)) return "year";
  if (["quarterly", "quarter", "q"].includes(text)) return "quarter";
  if (["monthly", "month", "m"].includes(text)) return "month";
  return "native";
}

function calendarKey(date, period) {
  const parsed = new Date(dateValue(date));
  const year = parsed.getUTCFullYear();
  if (period === "year") return String(year);
  if (period === "quarter")
    return `${year}-Q${Math.floor(parsed.getUTCMonth() / 3) + 1}`;
  return `${year}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodBounds(key, period) {
  if (period === "year") {
    const year = Number(key);
    return [new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year, 11, 31))];
  }
  if (period === "quarter") {
    const [, yearText, quarterText] = key.match(/^(\d{4})-Q(\d)$/) ?? [];
    const year = Number(yearText);
    const month = (Number(quarterText) - 1) * 3;
    return [
      new Date(Date.UTC(year, month, 1)),
      new Date(Date.UTC(year, month + 3, 0)),
    ];
  }
  const [, yearText, monthText] = key.match(/^(\d{4})-(\d{2})$/) ?? [];
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  return [
    new Date(Date.UTC(year, month, 1)),
    new Date(Date.UTC(year, month + 1, 0)),
  ];
}

function periodAdjacent(previous, current, period) {
  const previousNumber = periodNumber(
    periodBounds(previous, period)[0],
    period,
  );
  const currentNumber = periodNumber(periodBounds(current, period)[0], period);
  return currentNumber === previousNumber + 1;
}

function completeCalendarPeriod(points, series, key, period) {
  const frequency = frequencyOf(series);
  const rank = FREQ_RANK[frequency];
  const targetRank = { month: 3, quarter: 4, year: 5 }[period];
  if (rank >= targetRank) return points.length > 0;
  const [start, end] = periodBounds(key, period);
  const seriesLatest = dateValue(seriesObservations(series).at(-1)?.[0]);
  // A daily/weekly observation set cannot make the current calendar period
  // complete merely because its latest print is within a few days of month
  // end. If the period end is still in the future at the dataset as-of date,
  // it is partial and must not enter annual/quarterly/monthly comparisons.
  if (
    (frequency === "daily" || frequency === "weekly") &&
    end.getTime() > seriesLatest
  )
    return false;
  if (frequency === "monthly" && period === "year") {
    return (
      new Set(points.map(([date]) => calendarKey(date, "month"))).size >= 12
    );
  }
  if (frequency === "monthly" && period === "quarter") {
    return (
      new Set(points.map(([date]) => calendarKey(date, "month"))).size >= 3
    );
  }
  if (frequency === "quarterly" && period === "year") {
    return (
      new Set(points.map(([date]) => calendarKey(date, "quarter"))).size >= 4
    );
  }
  if (frequency === "daily" || frequency === "weekly") {
    const first = dateValue(points[0]?.[0]);
    const last = dateValue(points.at(-1)?.[0]);
    const grace = maxNativeGap(frequency);
    return (
      first <= start.getTime() + grace * DAY_MS &&
      last >= end.getTime() - grace * DAY_MS
    );
  }
  return points.length > 0;
}

/**
 * Calendar levels using the last actual observation in each complete period.
 * Incomplete current month/quarter/year periods are omitted for high-frequency
 * series; a monthly source must contain all twelve months before a year exists.
 */
export function aggregateCalendar(
  series,
  period = "year",
  { horizon = "max", method = "last", includeIncomplete = false } = {},
) {
  const target = normalPeriod(period);
  if (target === "native")
    return nativeChanges(series, horizon).map((item) => ({
      period: item.date,
      date: item.date,
      value: item.value,
      complete: true,
    }));
  const cacheable = horizon === "max" && series && typeof series === "object";
  const cacheKey = `${target}|${method}|${includeIncomplete}`;
  if (cacheable) {
    const cache = CALENDAR_CACHE.get(series);
    if (cache?.has(cacheKey)) return cache.get(cacheKey);
  }
  const observations = seriesObservations(series);
  const cutoff = cutoffForLatest(observations.at(-1)?.[0], horizon);
  const groups = new Map();
  for (const point of observations) {
    const key = calendarKey(point[0], target);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(point);
  }
  const rows = [];
  for (const [key, points] of groups) {
    const complete = completeCalendarPeriod(points, series, key, target);
    if (!complete && !includeIncomplete) continue;
    const selected =
      method === "mean"
        ? [
            points.at(-1)[0],
            points.reduce((sum, [, value]) => sum + value, 0) / points.length,
          ]
        : method === "sum"
          ? [
              points.at(-1)[0],
              points.reduce((sum, [, value]) => sum + value, 0),
            ]
          : method === "first"
            ? points[0]
            : points.at(-1);
    const end = periodBounds(key, target)[1];
    if (cutoff && end.getTime() < cutoff.getTime()) continue;
    rows.push({
      period: key,
      date: selected[0],
      value: selected[1],
      complete,
      count: points.length,
      periodEnd: end.toISOString().slice(0, 10),
    });
  }
  const result = rows.sort((a, b) => a.period.localeCompare(b.period));
  if (cacheable) {
    const cache = CALENDAR_CACHE.get(series) ?? new Map();
    cache.set(cacheKey, result);
    CALENDAR_CACHE.set(series, cache);
  }
  return result;
}

/** Calendar changes with complete periods only; a prior complete period can be used as a boundary anchor. */
export function periodChanges(series, period = "native", horizon = "max") {
  const target = normalPeriod(period);
  if (target === "native") return nativeChanges(series, horizon);
  if (!horizonCoversMinimum(series, horizon, minimumCalendarDays(target)))
    return [];
  // Aggregate the full history first so the boundary period can be found,
  // then apply the requested horizon to current periods only.
  const all = aggregateCalendar(series, target, { horizon: "max" });
  if (!all.length) return [];
  const observations = seriesObservations(series);
  const cutoff = cutoffForLatest(observations.at(-1)?.[0], horizon);
  const type = changeType(series);
  const changes = [];
  for (let index = 1; index < all.length; index += 1) {
    const previous = all[index - 1];
    const current = all[index];
    if (!periodAdjacent(previous.period, current.period, target)) continue;
    // The first current period at the cutoff is the boundary baseline (for a
    // monthly first-of-period source it is dated exactly on the cutoff). It is
    // not a reported heat-map change; reporting starts with the next period.
    if (cutoff && dateValue(current.date) <= cutoff.getTime()) continue;
    const value = changePair(
      [previous.date, previous.value],
      [current.date, current.value],
      type,
    );
    if (Number.isFinite(value))
      changes.push({
        date: current.date,
        period: current.period,
        value,
        type,
        priorDate: previous.date,
        currentDate: current.date,
        isAnchorChange: Boolean(
          cutoff && dateValue(previous.periodEnd) < cutoff.getTime(),
        ),
      });
  }
  return changes;
}

export function change(series, horizon = "365") {
  if (!horizonCoversMinimum(series, horizon)) return NaN;
  const window = sliceWindow(series, horizon);
  if (!window.observations.length) return NaN;
  if (
    window.cutoff &&
    !window.anchor &&
    dateValue(window.observations[0][0]) > dateValue(window.cutoff)
  )
    return NaN;
  const previous = window.anchor ?? window.observations[0];
  const current = window.observations.at(-1);
  if (previous === current) return NaN;
  return changePair(previous, current, changeType(series));
}

export const semanticChange = change;

function isPositivePriceIndex(series) {
  const unit = String(series?.unit ?? "").toLowerCase();
  const category = String(series?.category ?? "").toLowerCase();
  const role = String(series?.dataRole ?? "").toLowerCase();
  const indexLike =
    series?.kind === "market" ||
    series?.source === "Yahoo Finance" ||
    unit.includes("index") ||
    role.includes("index") ||
    role.includes("price") ||
    ["markets", "currencies", "commodities"].includes(category);
  return (
    indexLike && seriesObservations(series).every(([, value]) => value > 0)
  );
}

function elapsedYears(firstDate, lastDate) {
  const first = new Date(dateValue(firstDate));
  const last = new Date(dateValue(lastDate));
  if (!(last.getTime() > first.getTime())) return NaN;
  let wholeYears = last.getUTCFullYear() - first.getUTCFullYear();
  let anniversary = shiftCalendar(first, { years: wholeYears });
  if (anniversary.getTime() > last.getTime()) {
    wholeYears -= 1;
    anniversary = shiftCalendar(first, { years: wholeYears });
  }
  const nextAnniversary = shiftCalendar(anniversary, { years: 1 });
  const fraction =
    (last.getTime() - anniversary.getTime()) /
    (nextAnniversary.getTime() - anniversary.getTime());
  return wholeYears + fraction;
}

/** Annualized compound return for positive price/return indexes only. */
export function annualizedCagr(series, horizon = "max") {
  if (!isPositivePriceIndex(series)) return NaN;
  if (!horizonCoversMinimum(series, horizon)) return NaN;
  const window = sliceWindow(series, horizon);
  if (!window.observations.length) return NaN;
  if (!hasWindowCoverage(window)) return NaN;
  const first = window.anchor ?? window.observations[0];
  const last = window.observations.at(-1);
  const years = elapsedYears(first[0], last[0]);
  if (!(years > 0) || !(first[1] > 0) || !(last[1] > 0)) return NaN;
  return ((last[1] / first[1]) ** (1 / years) - 1) * 100;
}

export const cagr = annualizedCagr;

function sampleStandardDeviation(values) {
  if (values.length < 2) return NaN;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

/** Sample standard deviation of native-frequency log returns, annualized. No fallback window. */
export function logVolatility(series, horizon = "max") {
  if (!isPositivePriceIndex(series)) return NaN;
  if (!horizonCoversMinimum(series, horizon)) return NaN;
  const window = sliceWindow(series, horizon);
  if (!hasWindowCoverage(window)) return NaN;
  const points = window.anchor
    ? [window.anchor, ...window.observations]
    : window.observations;
  const returns = [];
  for (let index = 1; index < points.length; index += 1) {
    if (!adjacentNative(points[index - 1], points[index], frequencyOf(series)))
      continue;
    const value = Math.log(points[index][1] / points[index - 1][1]);
    if (Number.isFinite(value) && points[index] !== window.anchor)
      returns.push(value);
  }
  const deviation = sampleStandardDeviation(returns);
  const factor = VOL_FACTOR[series.frequency] ?? VOL_FACTOR.monthly;
  return Number.isFinite(deviation) ? deviation * Math.sqrt(factor) * 100 : NaN;
}

export const volatility = logVolatility;

/** Negative peak-to-trough percentages for each actual point in the window. */
export function drawdownPath(series, horizon = "max") {
  if (!isPositivePriceIndex(series)) return [];
  if (!horizonCoversMinimum(series, horizon)) return [];
  const window = sliceWindow(series, horizon);
  if (!hasWindowCoverage(window)) return [];
  if (!window.observations.length) return [];
  let peak = window.anchor?.[1] ?? -Infinity;
  const path = [];
  for (const [date, value] of window.observations) {
    peak = Math.max(peak, value);
    path.push([date, (value / peak - 1) * 100]);
  }
  return path;
}

export function maxDrawdown(series, horizon = "max") {
  const path = drawdownPath(series, horizon);
  return path.length ? Math.min(...path.map(([, value]) => value)) : NaN;
}

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length
    ? finite.reduce((sum, value) => sum + value, 0) / finite.length
    : NaN;
}

export function percentileRank(value, values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!Number.isFinite(value) || !sorted.length) return NaN;
  const below = sorted.filter((item) => item < value).length;
  const ties = sorted.filter((item) => item === value).length;
  return ((below + ties * 0.5) / sorted.length) * 100;
}

/** Midrank percentile of the latest meaningful period change, not a trending level. */
export function percentileOfChanges(
  series,
  { period = "native", horizon = "max" } = {},
) {
  const changes = periodChanges(series, period, horizon)
    .map(({ value }) => value)
    .filter(Number.isFinite);
  return changes.length >= 3 ? percentileRank(changes.at(-1), changes) : NaN;
}

export const changePercentile = percentileOfChanges;

function boundaryWithinTolerance(point, cutoff, frequency) {
  if (!point || !cutoff) return false;
  if (frequency === "monthly")
    return periodNumber(point[0], "month") === periodNumber(cutoff, "month");
  if (frequency === "quarterly")
    return (
      periodNumber(point[0], "quarter") === periodNumber(cutoff, "quarter")
    );
  if (frequency === "annual")
    return periodNumber(point[0], "year") === periodNumber(cutoff, "year");
  return (
    cutoff.getTime() - dateValue(point[0]) >= 0 &&
    cutoff.getTime() - dateValue(point[0]) <= maxNativeGap(frequency) * DAY_MS
  );
}

/**
 * Efficient rolling horizon changes. Each observation is compared with the
 * latest real observation at or before its calendar boundary; a boundary that
 * is too stale because of a data gap is omitted. Returned tuples are
 * `[currentDate, change]` and never contain synthetic anchors.
 */
export function rollingHorizonChanges(series, horizon = "365") {
  if (!horizonCoversMinimum(series, horizon)) return [];
  const observations = seriesObservations(series);
  const frequency = frequencyOf(series);
  const type = changeType(series);
  const output = [];
  let boundaryIndex = -1;
  for (let index = 0; index < observations.length; index += 1) {
    const cutoff = cutoffForLatest(observations[index][0], horizon);
    if (!cutoff) continue;
    while (
      boundaryIndex + 1 < index &&
      dateValue(observations[boundaryIndex + 1][0]) <= cutoff.getTime()
    )
      boundaryIndex += 1;
    if (
      boundaryIndex < 0 ||
      !boundaryWithinTolerance(observations[boundaryIndex], cutoff, frequency)
    )
      continue;
    const value = changePair(
      observations[boundaryIndex],
      observations[index],
      type,
    );
    if (Number.isFinite(value)) output.push([observations[index][0], value]);
  }
  return output;
}

function coarsestPeriod(first, second) {
  const rank = Math.max(
    FREQ_RANK[frequencyOf(first)],
    FREQ_RANK[frequencyOf(second)],
  );
  return rank >= 5 ? "year" : rank === 4 ? "quarter" : "month";
}

/**
 * Align changes on common complete calendar periods. Missing periods are not
 * bridged, and the returned n counts paired changes (not boundary anchors).
 */
export function alignedChanges(
  first,
  second,
  { period = "auto", horizon = "max", mode = "auto" } = {},
) {
  const target =
    period === "auto" ? coarsestPeriod(first, second) : normalPeriod(period);
  if (target === "native") return { period: "native", pairs: [] };
  if (
    !horizonCoversMinimum(first, horizon, minimumCalendarDays(target)) ||
    !horizonCoversMinimum(second, horizon, minimumCalendarDays(target))
  )
    return { period: target, pairs: [], n: 0 };
  const leftLevels = aggregateCalendar(first, target, { horizon: "max" });
  const rightLevels = aggregateCalendar(second, target, { horizon: "max" });
  const leftByPeriod = new Map(leftLevels.map((row) => [row.period, row]));
  const rightByPeriod = new Map(rightLevels.map((row) => [row.period, row]));
  const common = [...leftByPeriod.keys()]
    .filter((key) => rightByPeriod.has(key))
    .sort();
  if (!common.length) return { period: target, pairs: [] };
  const leftLatest = seriesObservations(first).at(-1)?.[0];
  const rightLatest = seriesObservations(second).at(-1)?.[0];
  const commonLatest =
    dateValue(leftLatest) <= dateValue(rightLatest) ? leftLatest : rightLatest;
  const cutoff = cutoffForLatest(commonLatest, horizon);
  const leftType = mode === "auto" ? changeType(first) : mode;
  const rightType = mode === "auto" ? changeType(second) : mode;
  const pairs = [];
  for (let index = 1; index < common.length; index += 1) {
    const previousKey = common[index - 1];
    const currentKey = common[index];
    if (!periodAdjacent(previousKey, currentKey, target)) continue;
    const current = leftByPeriod.get(currentKey);
    const rightCurrent = rightByPeriod.get(currentKey);
    if (
      cutoff &&
      (dateValue(current.date) <= cutoff.getTime() ||
        dateValue(rightCurrent.date) <= cutoff.getTime())
    )
      continue;
    const leftValue = changePair(
      [leftByPeriod.get(previousKey).date, leftByPeriod.get(previousKey).value],
      [current.date, current.value],
      leftType,
    );
    const rightPrevious = rightByPeriod.get(previousKey);
    const rightValue = changePair(
      [rightPrevious.date, rightPrevious.value],
      [rightCurrent.date, rightCurrent.value],
      rightType,
    );
    if (Number.isFinite(leftValue) && Number.isFinite(rightValue))
      pairs.push({
        period: currentKey,
        date:
          current.date > rightCurrent.date ? current.date : rightCurrent.date,
        left: leftValue,
        right: rightValue,
      });
  }
  return { period: target, pairs, leftType, rightType, n: pairs.length };
}

function pearson(pairs) {
  if (pairs.length < 3) return NaN;
  const meanLeft = mean(pairs.map(({ left }) => left));
  const meanRight = mean(pairs.map(({ right }) => right));
  const numerator = pairs.reduce(
    (sum, pair) => sum + (pair.left - meanLeft) * (pair.right - meanRight),
    0,
  );
  const denominator = Math.sqrt(
    pairs.reduce((sum, pair) => sum + (pair.left - meanLeft) ** 2, 0) *
      pairs.reduce((sum, pair) => sum + (pair.right - meanRight) ** 2, 0),
  );
  return denominator ? numerator / denominator : NaN;
}

function correlationOptions(options, legacyMode) {
  return typeof options === "string"
    ? { horizon: options, mode: legacyMode ?? "auto" }
    : (options ?? {});
}

export function correlationDetails(first, second, options = {}, legacyMode) {
  const aligned = alignedChanges(
    first,
    second,
    correlationOptions(options, legacyMode),
  );
  return { ...aligned, value: pearson(aligned.pairs) };
}

export function correlation(first, second, options = {}, legacyMode) {
  return correlationDetails(first, second, options, legacyMode).value;
}

export const periodChange = (series, horizon = "365") =>
  change(series, horizon);
