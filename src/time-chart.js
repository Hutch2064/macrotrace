import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { compact, format, palette } from "./common.js";

// Independent public implementation of the same uPlot visual/interaction contract.
export function timeChart(
  target,
  series,
  pointLists,
  {
    logarithmic = false,
    suffix = "",
    valueTransform = (value) => value,
    valueLabel = "",
  } = {},
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
      host,
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
      `${index == null ? "Latest" : (dates[index] ?? "")} ${valueLabel}`.trim();
    buttons.forEach(({ button, value }, i) => {
      const latest = pointLists[i].at(-1);
      const raw = index == null ? latest?.[1] : data[i + 1][index];
      const reading = Number.isFinite(raw) ? valueTransform(raw) : NaN;
      value.textContent = `${reading > 0 ? "+" : ""}${format(reading, suffix)}`;
      value.className =
        reading > 0 ? "positive" : reading < 0 ? "negative" : "";
      button.title = `${series[i].name} · ${index == null ? (latest?.[0] ?? "no observations") : dates[index]}`;
    });
  };
  const size = () => ({
    width: Math.max(160, host.clientWidth),
    height: Math.max(
      80,
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
              value == null ? "" : `${compact(valueTransform(value))}${suffix}`,
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
  // Touch inspection does not block vertical page scrolling. Horizontal drags
  // update the same date/legend readout as desktop hover, without synthetic data.
  const inspectTouch = (event) => {
    if (event.pointerType !== "touch") return;
    const bounds = plot.over.getBoundingClientRect();
    plot.setCursor({
      left: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
      top: Math.max(0, event.clientY - bounds.top),
    });
  };
  plot.over.style.touchAction = "pan-y";
  plot.over.addEventListener("pointerdown", inspectTouch);
  plot.over.addEventListener("pointermove", inspectTouch);
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
  const resize = () => {
    if (host.isConnected && host.clientWidth) plot.setSize(size());
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  return {
    host,
    reset() {
      plot.setScale("x", { min: x[0], max: x.at(-1) });
      buttons.forEach(({ button }, index) => {
        plot.setSeries(index + 1, { show: true });
        button.setAttribute("aria-pressed", "true");
      });
    },
    destroy() {
      observer.disconnect();
      plot.destroy();
      host.replaceChildren();
    },
    resize() {
      resize();
    },
  };
}
