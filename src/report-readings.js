import { change } from "./analytics.js";

const formatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const format = (value) =>
  Number.isFinite(value) ? formatter.format(value) : "unavailable";
const signed = (value) => (value >= 0 ? "+" : "") + format(value);

export function reportTitles(snapshot) {
  const byId = Object.fromEntries(
    snapshot.series.map((series) => [series.id, series]),
  );
  const latest = (id) => byId[id].observations.at(-1)[1];
  const growth = (id, horizon = "1y") => change(byId[id], horizon);
  return [
    `Unemployment is ${format(latest("UNRATE"))}%; hiring demand has its own cycle.`,
    `Consumer prices changed ${format(growth("CPIAUCSL"))}% over twelve months.`,
    `Real output changed ${signed(growth("GDPC1", "5y"))}% over five years.`,
    `The 10-year Treasury yields ${format(latest("DGS10"))}%.`,
    `Housing starts changed ${signed(growth("HOUST"))}% over a year.`,
    `WTI crude changed ${signed(growth("DCOILWTICO"))}% over a year.`,
    `Financial conditions register ${format(latest("NFCI"))} on the Chicago Fed index.`,
    `Education and health payrolls changed ${signed(growth("USEHS"))}% over a year.`,
  ];
}
