import { Chart, registerables } from "chart.js";

const crosshair = {
  id: "simfolioCrosshair",
  afterDraw(chart) {
    const point = chart.tooltip?._active?.[0];
    if (!point) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(point.element.x, chartArea.top);
    ctx.lineTo(point.element.x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};
const emptyState = {
  id: "emptyState",
  afterDraw(chart) {
    const hasData = chart.data.datasets.some(({ data }) =>
      data.some((value) =>
        typeof value === "number"
          ? Number.isFinite(value)
          : value && Number.isFinite(value.x) && Number.isFinite(value.y),
      ),
    );
    if (hasData) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px Inter";
    ctx.textAlign = "center";
    ctx.fillText(
      "Insufficient observations in this window",
      (chartArea.left + chartArea.right) / 2,
      (chartArea.top + chartArea.bottom) / 2,
    );
    ctx.restore();
  },
};
Chart.register(...registerables, crosshair, emptyState);
Chart.defaults.color = "rgba(255,255,255,.9)";
Chart.defaults.borderColor = "rgba(255,255,255,.07)";
Chart.defaults.font.family = "Inter, system-ui, sans-serif";
Chart.defaults.animation.duration = 320;
export { Chart };
