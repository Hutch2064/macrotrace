import { createHash } from "node:crypto";
import { read, utils } from "xlsx";

const sourceUrl = "https://shillerdata.com/";
// Housing only: never download the separate equity/CAPE workbook.
export async function fetchShillerHousing() {
  const catalog = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(30000),
  });
  if (!catalog.ok) throw new Error(`Shiller catalog: ${catalog.status}`);
  const links = [
    ...(await catalog.text()).matchAll(/href="([^"]+\.xls[^"]*)"/g),
  ];
  const link = links.find((match) => match[1].includes("Fig3-1"));
  if (!link) throw new Error("Shiller housing workbook link changed");
  const url = new URL(link[1].replaceAll("&amp;", "&"), sourceUrl).href;
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`Shiller housing: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const workbook = read(bytes);
  if (!workbook.Sheets.Data) throw new Error("Shiller housing sheet changed");
  const rows = utils.sheet_to_json(workbook.Sheets.Data, { header: 1 });
  const checkedAt = new Date().toISOString();
  const year = new Date(checkedAt).getUTCFullYear();
  return [
    [
      "SHILLER_HOME_REAL",
      "U.S. real home prices · long-run annual history",
      0,
      1,
    ],
    [
      "SHILLER_HOME_NOMINAL",
      "U.S. nominal home prices · long-run annual history",
      7,
      8,
    ],
  ].map(([id, name, dateColumn, valueColumn]) => {
    const years = new Map();
    for (const row of rows) {
      const date = row[dateColumn],
        value = row[valueColumn];
      if (
        !Number.isFinite(date) ||
        !Number.isFinite(value) ||
        date < 1890 ||
        date >= year
      )
        continue;
      const period = Math.floor(date);
      if (!years.has(period)) years.set(period, []);
      years.get(period).push(value);
    }
    const observations = [...years]
      .filter(([date, values]) => date < 1953 || values.length === 12)
      .map(([date, values]) => [
        `${date}-12-31`,
        values.reduce((sum, value) => sum + value, 0) / values.length,
      ])
      .sort(([a], [b]) => a.localeCompare(b));
    if (observations.length < 100)
      throw new Error(`Shiller housing unexpectedly short: ${id}`);
    return {
      id,
      name,
      category: "Housing",
      geography: "US",
      country: "United States",
      unit: "index",
      frequency: "annual",
      kind: "macro",
      historyType: "research_reconstruction",
      changeType: "percent",
      checkedAt,
      source: "Robert J. Shiller",
      sourceFamily: "Shiller research data",
      sourceUrl,
      sourceFile: "Fig3-1 (1).xls · Data",
      sourceColumn: `${dateColumn === 0 ? "A/B" : "H/I"} · annual mean`,
      sourceHash: createHash("sha256").update(bytes).digest("hex"),
      sourceDownloadUrl: url,
      sourceAsOf: observations.at(-1)[0],
      rightsNote:
        "Public housing research data attributed to Robert J. Shiller; underlying source rights are not transferred by MacroTrace.",
      methodology:
        "Shiller's linked house-price research index: annual observations before 1953; arithmetic mean of all twelve monthly observations thereafter. Incomplete years are excluded. Historical source indexes are combined by the author. These are house-price indexes, not investment returns; no rent, maintenance, financing or transaction costs are included. Annual dates are year-end reference labels.",
      observations,
    };
  });
}
