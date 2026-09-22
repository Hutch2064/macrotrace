import {
  change,
  changeType,
  changeSuffix,
  nativeChanges,
  sliceWindow,
} from "./analytics.js";

export function latestChange(series) {
  const latest = series.observations.at(-1);
  // A daily quote is a close-to-close trading-day change, not intraday data.
  const move = nativeChanges({
    ...series,
    changeType: changeType(series),
    observations: series.observations.slice(-2),
  }).at(-1);
  return {
    value: move?.date === latest?.[0] ? move.value : NaN,
    date: latest?.[0],
    suffix: changeSuffix(series),
    label:
      {
        daily: "1D",
        weekly: "1W",
        monthly: "1M",
        quarterly: "1Q",
        annual: "1Y",
      }[series.frequency] || "Latest period",
  };
}

export function cumulativeView(series, horizon, logarithmic = false) {
  const type = changeType(series);
  const window = sliceWindow(series, horizon);
  const measurable = Number.isFinite(change(series, horizon));
  const points = measurable ? window.points : [];
  const base = points[0]?.[1];
  const log =
    logarithmic && type === "percent" && points.every(([, value]) => value > 0);
  return {
    points: points.map(([date, value]) => [
      date,
      type === "percent"
        ? log
          ? (value / base) * 100
          : (value / base - 1) * 100
        : (value - base) * (type === "basis-points" ? 100 : 1),
    ]),
    logarithmic: log,
    suffix: changeSuffix(series),
    valueTransform: log ? (value) => value - 100 : (value) => value,
    label:
      type === "percent"
        ? "Cumulative change"
        : type === "basis-points"
          ? "Rate change"
          : "Index change",
  };
}
