import { createHash } from "node:crypto";
import { read, utils } from "xlsx";

const sourceUrl = "https://shillerdata.com/";
const category = "Long-Run Valuation & Housing";
const rightsNote =
  "Public research data attributed to Robert J. Shiller. The author disclaims accuracy and completeness; underlying source rights are not transferred by MacroTrace.";

export function shillerMonth(value) {
  if (!Number.isFinite(value)) return null;
  const year = Math.floor(value);
  const month = Math.round((value - year) * 100);
  if (year < 1800 || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

async function workbook(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`Shiller workbook: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    rows: utils.sheet_to_json(read(bytes).Sheets.Data, { header: 1 }),
    sourceHash: createHash("sha256").update(bytes).digest("hex"),
    sourceDownloadUrl: url,
  };
}

export async function fetchShillerHistorySeries() {
  const response = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Shiller catalog: ${response.status}`);
  const links = [
    ...(await response.text()).matchAll(/href="([^"]+\.xls[^\"]*)"/g),
  ].map((match) => new URL(match[1].replaceAll("&amp;", "&"), sourceUrl).href);
  const stockUrl = links.find((url) => url.includes("ie_data.xls"));
  const homeUrl = links.find((url) => url.includes("Fig3-1"));
  if (!stockUrl || !homeUrl) throw new Error("Shiller workbook links changed");
  const [stocks, homes] = await Promise.all([
    workbook(stockUrl),
    workbook(homeUrl),
  ]);
  const now = new Date();
  const completedMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0),
  )
    .toISOString()
    .slice(0, 10);
  const stockRows = stocks.rows.flatMap((row) => {
    const date = shillerMonth(row[0]);
    return date && date <= completedMonth ? [[date, row]] : [];
  });
  const common = (file, column, frequency, observations, methodology) => ({
    category,
    frequency,
    source: "Robert J. Shiller",
    sourceFamily: "Shiller research data",
    sourceUrl,
    sourceFile:
      file === stocks ? "ie_data.xls · Data" : "Fig3-1 (1).xls · Data",
    sourceColumn: column,
    sourceHash: file.sourceHash,
    sourceDownloadUrl: file.sourceDownloadUrl,
    checkedAt: now.toISOString(),
    sourceAsOf: observations.at(-1)?.[0],
    rightsNote,
    methodology,
    observations,
  });
  const specs = [
    [
      "SHILLER_PRICE",
      "U.S. equity prices · Shiller composite since 1871",
      "index",
      "P (B)",
      (r) => r[1],
      "market",
    ],
    [
      "SHILLER_REAL_PRICE",
      "U.S. real equity prices · Shiller",
      "real index",
      "Real Price (H)",
      (r) => r[7],
      "market",
    ],
    [
      "SHILLER_TR",
      "U.S. equity total-return proxy · Shiller",
      "research index",
      "Real Total Return Price (J) × CPI (E)",
      (r) =>
        Number.isFinite(r[9]) && Number.isFinite(r[4]) ? r[9] * r[4] : NaN,
      "market",
    ],
    [
      "SHILLER_REAL_TR",
      "U.S. real equity total-return proxy · Shiller",
      "real research index",
      "Real Total Return Price (J)",
      (r) => r[9],
      "market",
    ],
    [
      "SHILLER_DIVIDENDS",
      "U.S. equity dividends · annual-rate research estimate",
      "index dollars",
      "D (C)",
      (r) => r[2],
    ],
    [
      "SHILLER_EARNINGS",
      "U.S. equity earnings · annual-rate research estimate",
      "index dollars",
      "E (D)",
      (r) => r[3],
    ],
    [
      "SHILLER_CPI",
      "U.S. consumer prices · Shiller historical reconstruction",
      "index",
      "CPI (E)",
      (r) => r[4],
    ],
    [
      "SHILLER_LONG_RATE",
      "U.S. long-term government yield · Shiller",
      "%",
      "Rate GS10 (G)",
      (r) => r[6],
    ],
    [
      "SHILLER_CAPE",
      "U.S. cyclically adjusted P/E · Shiller CAPE",
      "ratio",
      "CAPE (M)",
      (r) => r[12],
    ],
    [
      "SHILLER_TR_CAPE",
      "U.S. total-return adjusted CAPE · Shiller",
      "ratio",
      "TR CAPE (O)",
      (r) => r[14],
    ],
    [
      "SHILLER_ECY",
      "U.S. excess CAPE yield · Shiller",
      "%",
      "Excess CAPE Yield (Q) × 100",
      (r) => (Number.isFinite(r[16]) ? r[16] * 100 : NaN),
    ],
  ];
  const series = specs.map(([id, name, unit, column, getter, kind]) => {
    let observations = stockRows.flatMap(([date, row]) =>
      Number.isFinite(getter(row)) ? [[date, getter(row)]] : [],
    );
    if (id.endsWith("_TR") || id === "SHILLER_TR") {
      const baseline = observations[0][1];
      observations = observations.map(([date, value]) => [
        date,
        (value / baseline) * 100,
      ]);
    }
    return {
      id,
      name,
      unit,
      kind,
      historyType: "research_reconstruction",
      assetClass: "equity",
      changeType:
        unit === "%" ? "basis-points" : unit === "ratio" ? "points" : "percent",
      ...common(
        stocks,
        column,
        "monthly",
        observations,
        "Author-published monthly research series. Prices are monthly averages, not month-end closes; early dividends/earnings are interpolated by the author, and pre-1913 CPI uses Warren–Pearson. Incomplete current calendar month is excluded; missing values are omitted, never zero-filled. Total-return indexes are rebased to 100; nominal total return reverses the published CPI deflation of the real total-return column. These are retrospective research estimates, not investable fund returns or point-in-time vintages.",
      ),
      availabilityNote:
        "Monthly reference periods dated at month-end. Source estimates and revisions can change past values; dividends and earnings can lag prices.",
    };
  });
  for (const [id, name, dateColumn, valueColumn] of [
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
  ]) {
    const years = new Map();
    for (const row of homes.rows) {
      const date = row[dateColumn],
        value = row[valueColumn];
      if (
        !Number.isFinite(date) ||
        !Number.isFinite(value) ||
        date < 1890 ||
        date >= now.getUTCFullYear()
      )
        continue;
      const year = Math.floor(date);
      if (!years.has(year)) years.set(year, []);
      years.get(year).push(value);
    }
    const observations = [...years]
      .filter(([year, values]) => year < 1953 || values.length === 12)
      .map(([year, values]) => [
        `${year}-12-31`,
        values.reduce((a, b) => a + b, 0) / values.length,
      ]);
    series.push({
      id,
      name,
      unit: "index",
      kind: "macro",
      assetClass: "real_estate",
      changeType: "percent",
      historyType: "research_reconstruction",
      ...common(
        homes,
        `${dateColumn === 0 ? "A/B" : "H/I"} · annual mean`,
        "annual",
        observations,
        "Shiller's linked historical house-price research series: annual observations before 1953, arithmetic mean of all twelve monthly observations thereafter. Incomplete years are excluded. Different historical source indexes are combined by the author; no rent, maintenance, financing, or transaction-cost return is implied. Annual labels are year-end reference labels, not transaction dates.",
      ),
    });
  }
  if (series.some((item) => item.observations.length < 100))
    throw new Error("Shiller history unexpectedly short");
  return series;
}
