import { writeFile } from "node:fs/promises";

export const externalSeries = (snapshot) =>
  snapshot.series.filter((series) => series.source !== "Yahoo Finance");

export async function writeSourceInventory(snapshot) {
  const rows = externalSeries(snapshot).map((series) => ({
    id: series.id,
    name: series.name,
    category: series.category,
    source: series.source,
    source_url: series.sourceUrl,
    frequency: series.frequency,
    unit: series.unit,
    start: series.observations[0][0],
    end: series.observations.at(-1)[0],
    years: Number(
      (
        (Date.parse(series.observations.at(-1)[0]) -
          Date.parse(series.observations[0][0])) /
        86400000 /
        365.2425
      ).toFixed(1),
    ),
    observations: series.observations.length,
    classification:
      series.historyStatus === "archived"
        ? "archived"
        : series.historyType || "published observations",
    proxy_source: series.splice?.proxyId || "",
    splice_date: series.splice?.anchorDate || "",
    methodology:
      series.methodology ||
      "Published source values at native frequency; missing values omitted.",
  }));
  const columns = Object.keys(rows[0]);
  const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  await writeFile(
    "public/data/source-inventory.csv",
    `${columns.join(",")}\n${rows.map((row) => columns.map((key) => csv(row[key])).join(",")).join("\n")}\n`,
  );
  const groups = Map.groupBy
    ? Map.groupBy(rows, (row) => row.category)
    : rows.reduce(
        (map, row) =>
          map.set(row.category, [...(map.get(row.category) || []), row]),
        new Map(),
      );
  const sections = [...groups].map(
    ([category, items]) =>
      `## ${category}\n\n| ID | Series | Frequency | From | Through | Years |\n| --- | --- | --- | --- | --- | --- |\n${items.map((row) => `| [${row.id}](${row.source_url}) | ${row.name.replaceAll("|", "/")} | ${row.frequency} | ${row.start} | ${row.end} | ${row.years} |`).join("\n")}`,
  );
  await writeFile(
    "public/data/source-inventory.md",
    `# MacroTrace non-Yahoo source inventory\n\nSnapshot: ${snapshot.generatedAt}. ${rows.length} series, including explicitly labeled derived proxy histories that combine external research with Yahoo adjusted closes. Coverage is the actual first/last stored observation, not the data-download date. A compounded index's initial 100 is a reference baseline, not a return observation. Archived data do not become live when refreshed.\n\n${sections.join("\n\n")}\n`,
  );
  return rows;
}
