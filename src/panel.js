/**
 * Pure data-model helpers for the macro panel explorer.
 *
 * The panel deliberately keeps source observations at their native
 * frequency.  Transforms never interpolate, aggregate, or invent dates:
 * every returned row belongs to an actual source observation.  A comparison
 * that cannot be made is represented by `value: null` while raw is retained.
 */

const FREQUENCIES = new Set([
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "annual",
]);
const POINT_UNIT = "percentage points";
const INDEX_POINT_UNIT = "index points";
const DAY_MS = 86_400_000;
const OBSERVATION_CACHE = new WeakMap();

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function dateText(value) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const source = text(value);
  const match = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    )
      return date.toISOString().slice(0, 10);
    return null;
  }
  const parsed = new Date(source);
  return Number.isFinite(parsed.getTime())
    ? parsed.toISOString().slice(0, 10)
    : null;
}

function dateValue(value) {
  const date = dateText(value);
  return date ? Date.parse(`${date}T00:00:00Z`) : NaN;
}

function numericRaw(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function sourceObservations(series) {
  const source = Array.isArray(series)
    ? series
    : Array.isArray(series?.observations)
      ? series.observations
      : [];
  const cacheKey = series && typeof series === "object" ? series : source;
  const cached = OBSERVATION_CACHE.get(cacheKey);
  if (cached?.source === source) return cached.points;
  const points = source
    .map((point, index) => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const date = dateText(point[0]);
      const time = dateValue(date);
      return date && Number.isFinite(time)
        ? { date, raw: numericRaw(point[1]), index, time }
        : null;
    })
    .filter(Boolean);
  let ordered = true;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index - 1].date > points[index].date) {
      ordered = false;
      break;
    }
  }
  if (!ordered)
    points.sort((left, right) =>
      left.date === right.date
        ? left.index - right.index
        : left.date < right.date
          ? -1
          : 1,
    );
  OBSERVATION_CACHE.set(cacheKey, { source, points });
  return points;
}

function frequencyOf(series) {
  const frequency = lower(series?.frequency);
  return FREQUENCIES.has(frequency) ? frequency : "monthly";
}

/** Geography is metadata only; do not infer it from observations. */
export function geographyOf(series) {
  return text(
    series?.geography || series?.country || series?.region || "Unknown",
  );
}

function metadataHaystack(series) {
  return [
    series?.id,
    series?.name,
    series?.category,
    geographyOf(series),
    series?.frequency,
    series?.unit,
    series?.provider,
    series?.source,
  ]
    .map(lower)
    .join(" ");
}

function matchesValue(actual, expected) {
  const wanted = lower(expected);
  return !wanted || wanted === "all" || lower(actual) === wanted;
}

/**
 * Filter metadata only.  In particular this function never reads
 * series.observations, so filtering cannot accidentally discard history.
 */
export function filterSeries(seriesList, filters = {}) {
  const list = Array.isArray(seriesList) ? seriesList : [];
  const category = filters.category ?? "all";
  const geography = filters.geography ?? "all";
  const frequency = filters.frequency ?? "all";
  const query = lower(filters.search);
  const tokens = query.split(/[^a-z0-9%]+/).filter(Boolean);
  return list.filter((series) => {
    if (!matchesValue(series?.category, category)) return false;
    if (!matchesValue(geographyOf(series), geography)) return false;
    if (!matchesValue(series?.frequency, frequency)) return false;
    const haystack = metadataHaystack(series);
    return tokens.every((token) => haystack.includes(token));
  });
}

function isRateLike(series) {
  const unit = lower(series?.unit);
  return (
    unit.includes("%") ||
    unit.includes("percent") ||
    unit.includes("percentage")
  );
}

function isDiffusionLike(series) {
  const metadata = `${lower(series?.id)} ${lower(series?.name)} ${lower(series?.category)} ${lower(series?.unit)}`;
  return (
    series?.signed === true ||
    series?.semantic === "point" ||
    series?.changeType === "points" ||
    /diffusion|cfnai|nfci|financial conditions|financial stress index|national activity index|surplus|deficit|spread/.test(
      metadata,
    )
  );
}

function outputUnit(series, semantic, measure) {
  if (measure === "level") return text(series?.unit);
  if (semantic === "rate") return POINT_UNIT;
  if (semantic === "point")
    return /index|diffusion/i.test(series?.unit || "")
      ? INDEX_POINT_UNIT
      : text(series?.unit);
  return "%";
}

function semanticOf(series) {
  if (isRateLike(series)) return "rate";
  if (/basis point|^bps$/i.test(series?.unit || "")) return "point";
  if (isDiffusionLike(series)) return "point";
  return "relative";
}

function isoWeek(date) {
  const value = new Date(dateValue(date));
  // Thursday identifies the ISO week-year.
  const weekday = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - weekday);
  const year = value.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstWeekday = firstThursday.getUTCDay() || 7;
  const week =
    1 +
    Math.round(
      (value.getTime() -
        firstThursday.getTime() +
        (firstWeekday - 1) * DAY_MS) /
        (7 * DAY_MS),
    );
  return { year, week };
}

function periodKey(date, frequency) {
  const value = new Date(dateValue(date));
  const year = value.getUTCFullYear();
  if (frequency === "annual") return String(year);
  if (frequency === "quarterly")
    return `${year}-Q${Math.floor(value.getUTCMonth() / 3) + 1}`;
  if (frequency === "monthly")
    return `${year}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
  if (frequency === "weekly") {
    const { year: weekYear, week } = isoWeek(date);
    return `${weekYear}-W${String(week).padStart(2, "0")}`;
  }
  return dateText(date);
}

function priorPeriodKey(date, frequency) {
  const value = new Date(dateValue(date));
  if (frequency === "weekly") {
    const { year, week } = isoWeek(date);
    return `${year - 1}-W${String(week).padStart(2, "0")}`;
  }
  if (frequency === "daily") return null;
  const year = value.getUTCFullYear() - 1;
  if (frequency === "annual") return String(year);
  if (frequency === "quarterly")
    return `${year}-Q${Math.floor(value.getUTCMonth() / 3) + 1}`;
  return `${year}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildPeriodMap(observations, frequency) {
  const periodMap = new Map();
  for (const observation of observations)
    periodMap.set(periodKey(observation.date, frequency), observation);
  return periodMap;
}

function onOrBeforeWithin(observations, boundary, maxGap) {
  let low = 0;
  let high = observations.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (observations[middle].time <= boundary) low = middle + 1;
    else high = middle;
  }
  const candidate = observations[low - 1];
  return candidate && boundary - candidate.time <= maxGap ? candidate : null;
}

function yearEarlierValue(observations, current, frequency, periodMap) {
  if (frequency === "daily") {
    const date = new Date(current.time);
    const expected = new Date(
      Date.UTC(
        date.getUTCFullYear() - 1,
        date.getUTCMonth(),
        date.getUTCDate(),
      ),
    );
    if (expected.getUTCMonth() !== date.getUTCMonth()) return null;
    return (
      onOrBeforeWithin(observations, expected.getTime(), 7 * DAY_MS)?.raw ??
      null
    );
  }
  if (frequency === "weekly") {
    const date = new Date(current.time);
    const expected = new Date(
      Date.UTC(
        date.getUTCFullYear() - 1,
        date.getUTCMonth(),
        date.getUTCDate(),
      ),
    );
    if (expected.getUTCMonth() !== date.getUTCMonth()) return null;
    return (
      onOrBeforeWithin(observations, expected.getTime(), 7 * DAY_MS)?.raw ??
      null
    );
  }
  const key = priorPeriodKey(current.date, frequency);
  return periodMap.get(key)?.raw ?? null;
}

function comparisonValue(raw, baseline, semantic) {
  if (raw === null || baseline === null) return null;
  if (semantic === "rate" || semantic === "point") return raw - baseline;
  if (!(baseline > 0)) return null;
  return ((raw - baseline) / baseline) * 100;
}

function inRange(date, start, end) {
  return (!start || date >= start) && (!end || date <= end);
}

/**
 * Transform actual native observations.  `start` and `end` are inclusive.
 * YoY uses the same native period one calendar year earlier; change uses the
 * immediately preceding native observation.  Point semantics apply to rate
 * and diffusion/index series, including signed series such as CFNAI/NFCI.
 */
export function transformSeries(series, state = {}) {
  const measure = lower(state.measure || "yoy");
  if (!["level", "yoy", "change"].includes(measure))
    throw new RangeError(`Unsupported panel measure: ${state.measure}`);
  const start = state.start ? dateText(state.start) : null;
  const end = state.end ? dateText(state.end) : null;
  if (
    (state.start && !start) ||
    (state.end && !end) ||
    (start && end && start > end)
  )
    return [];
  const observations = sourceObservations(series);
  const frequency = frequencyOf(series);
  const semantic = semanticOf(series);
  const unit = outputUnit(series, semantic, measure);
  const periodMap =
    frequency === "daily" || frequency === "weekly"
      ? null
      : buildPeriodMap(observations, frequency);
  const previousMap = new WeakMap();
  for (let index = 1; index < observations.length; index += 1)
    previousMap.set(observations[index], observations[index - 1]);
  return observations
    .filter(({ date }) => inRange(date, start, end))
    .map((observation) => {
      let value = observation.raw;
      if (measure === "yoy") {
        value = comparisonValue(
          observation.raw,
          yearEarlierValue(observations, observation, frequency, periodMap),
          semantic,
        );
      } else if (measure === "change") {
        value = comparisonValue(
          observation.raw,
          previousMap.get(observation)?.raw ?? null,
          semantic,
        );
      }
      return { date: observation.date, raw: observation.raw, value, unit };
    });
}
