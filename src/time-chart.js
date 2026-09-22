import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { compact, format, palette } from "./common.js";

// Independent public implementation of the same uPlot visual/interaction contract.
export function timeChart(
  target,
  series,
  pointLists,
  { logarithmic = false, suffix = "" } = {},
) {
  const host =
    typeof target === "string" ? document.querySelector(target) : target;
  host.replaceChildren();
  const valid = pointLists.some((points) => points.length > 1);
  if (!valid) {
    const empty = document.createElement("p");
    empty.className = "chart-empty";
    empty.textContent =
      "Not enough observations in this window. Choose a longer horizon.";
    host.append(empty);
    return {
      destroy() {
        host.replaceChildren();
      },
      resize() {},
    };
  }
  const plotted = pointLists.map((points, seriesIndex) => {
    const maxGap =
      { daily: 7, weekly: 14, monthly: 45, quarterly: 140, annual: 450 }[
        series[seriesIndex].frequency
      ] || 45;
    return points.flatMap((point, index) => {
      const previous = points[index - 1];
      if (
        !previous ||
        Date.parse(point[0]) - Date.parse(previous[0]) <= maxGap * 86400000
      )
        return [point];
      const gapDate = new Date(
        (Date.parse(point[0]) + Date.parse(previous[0])) / 2,
      )
        .toISOString()
        .slice(0, 10);
      return [[gapDate, null], point];
    });
  });
  const dates = [
    ...new Set(plotted.flatMap((points) => points.map(([date]) => date))),
  ].sort();
  const x = dates.map((date) => Date.parse(`${date}T00:00:00Z`) / 1000);
  const data = [
    x,
    ...plotted.map((points) => {
      const map = new Map(points);
      return dates.map((date) => map.get(date));
    }),
  ];
  const plotHost = document.createElement("div");
  const rail = document.createElement("div");
  rail.className = "chart-rail";
  const dateLabel = document.createElement("time");
  rail.append(dateLabel);
  const buttons = series.map((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-pressed", "true");
    const marker = document.createElement("i");
    marker.style.background = palette[index % palette.length];
    const label = document.createElement("span");
    label.textContent = item.name;
    const value = document.createElement("b");
    button.append(marker, label, value);
    rail.append(button);
    return { button, value };
  });
  host.append(plotHost, rail);
  const updateRail = (plot) => {
    const index = plot.cursor.idx;
    dateLabel.textContent =
      index == null ? "Latest observations" : (dates[index] ?? "");
    buttons.forEach(({ button, value }, i) => {
      const latest = pointLists[i].at(-1);
      value.textContent = format(
        index == null ? latest?.[1] : data[i + 1][index],
        suffix,
      );
      button.title = `${series[i].name} · ${index == null ? (latest?.[0] ?? "no observations") : dates[index]}`;
    });
  };
  const size = () => ({
    width: Math.max(160, host.clientWidth),
    height: Math.max(
      130,
      host.clientHeight - Math.min(110, rail.offsetHeight + 10),
    ),
  });
  const plot = new uPlot(
    {
      ...size(),
      padding: [12, 12, 0, 0],
      legend: { show: false },
      cursor: { x: true, y: true, drag: { x: true, y: false } },
      scales: {
        x: { time: true },
        y: {
          distr:
            logarithmic &&
            pointLists.every((points) => points.every(([, value]) => value > 0))
              ? 3
              : 1,
        },
      },
      axes: [
        {
          stroke: "rgba(255,255,255,.62)",
          grid: { show: false },
          ticks: { show: false },
          font: "11px Inter",
          size: 34,
          space: 75,
        },
        {
          stroke: "rgba(255,255,255,.62)",
          grid: { stroke: "rgba(255,255,255,.07)", width: 1 },
          ticks: { show: false },
          font: "11px Inter",
          size: 52,
          values: (_, values) =>
            values.map((value) =>
              value == null ? "" : `${compact(value)}${suffix}`,
            ),
        },
      ],
      series: [
        {},
        ...series.map((item, index) => ({
          label: item.name,
          stroke: palette[index % palette.length],
          width: 1.5,
          spanGaps: false,
          points: { show: false },
        })),
      ],
      hooks: { setCursor: [updateRail], ready: [updateRail] },
    },
    data,
    plotHost,
  );
  buttons.forEach(({ button }, index) =>
    button.addEventListener("click", () => {
      const show = !plot.series[index + 1].show;
      plot.setSeries(index + 1, { show });
      button.setAttribute("aria-pressed", String(show));
    }),
  );
  plot.over.setAttribute("tabindex", "0");
  plot.over.setAttribute("role", "img");
  plot.over.setAttribute(
    "aria-label",
    `${series.map(({ name }) => name).join(", ")} time series. Drag to zoom, double click to reset. Arrow keys inspect dates.`,
  );
  let keyboardIndex = dates.length - 1;
  plot.over.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    keyboardIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? dates.length - 1
          : Math.max(
              0,
              Math.min(
                dates.length - 1,
                keyboardIndex + (event.key === "ArrowRight" ? 1 : -1),
              ),
            );
    plot.setCursor({ left: plot.valToPos(x[keyboardIndex], "x"), top: 0 });
  });
  const observer = new ResizeObserver(() => plot.setSize(size()));
  observer.observe(host);
  return {
    destroy() {
      observer.disconnect();
      plot.destroy();
      host.replaceChildren();
    },
    resize() {
      plot.setSize(size());
    },
  };
}
