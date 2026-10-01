import { createHash } from "node:crypto";
import XLSX from "xlsx";

export const bisDatasets = Object.freeze([
  ["CBPOL", "Rates", "Central bank policy rate", "CBPOL"],
  ["LONG_CPI", "Inflation", "Consumer prices", "CPI"],
  ["TC", "Credit", "Credit to the non-financial sector", "TOTAL_CREDIT"],
  ["CREDIT_GAP", "Credit", "Credit-to-GDP gap", "CREDIT_GAPS"],
  ["DSR", "Credit", "Debt-service ratio", "DSR"],
  ["SPP", "Housing", "Residential property prices", "RPP"],
  ["EER", "Currencies", "Effective exchange rate", "EER"],
  ["CBTA", "Rates", "Central bank assets", "CBTA"],
  ["GLI", "Credit", "Global liquidity", "GLI"],
  ["CPP", "Housing", "Commercial property prices", "CPP"],
]);

const definitions = {
  CBPOL:
    "BIS-selected policy or representative monetary-policy rate, with source-documented instrument and regime changes. It is not necessarily an effective overnight market rate.",
  LONG_CPI:
    "BIS long consumer-price index, rebased to 2010=100; historical source coverage and breaks follow the BIS compilation.",
  TC: "BIS credit to the indicated non-financial borrowing sector, from all lending sectors, as a percentage of GDP, adjusted for breaks. Market and nominal valuation series remain separate.",
  CREDIT_GAP:
    "BIS private non-financial credit-to-GDP ratio minus its long-run trend, in percentage points. The trend is estimated by the BIS using a one-sided Hodrick-Prescott filter; this is a constructed indicator, not a raw observation.",
  DSR: "BIS estimated interest payments and amortisation as a share of income for the indicated borrowing sector. Published estimation assumptions and cross-country coverage apply.",
  SPP: "BIS selected residential property-price index, 2010=100. Real indexes are adjusted for consumer-price inflation; national property coverage and source breaks vary.",
  EER: "BIS broad trade-weighted effective exchange-rate index, 2020=100. A rising index indicates appreciation. Real indexes incorporate relative consumer prices; weights and available economy coverage follow the BIS.",
  CBTA: "BIS-spliced, break-adjusted central-bank total assets in the reported domestic-currency multiplier or as a percentage of GDP. No additional MacroTrace splice is applied.",
  GLI: "BIS global liquidity statistics for the specified currency, borrower sector, lender sector, location and instrument. Published levels, GDP ratios and year-on-year rates remain separate; overlapping measures are not additive.",
  CPP: "BIS commercial property-price series with the indicated country coverage, property type, vintage, price concept and seasonal adjustment. National index bases and source methodologies differ; raw levels are not comparable across countries.",
};

// BIS column-format files include quoted commas and multiline source notes.
export function csvRows(input) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("Unterminated BIS CSV field");
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function bisDate(period, frequency) {
  if (frequency === "A" && /^\d{4}$/.test(period)) return `${period}-12-31`;
  if (frequency === "M" && /^\d{4}-\d{2}$/.test(period)) return `${period}-01`;
  if (frequency === "Q" && /^\d{4}-Q[1-4]$/.test(period))
    return `${period.slice(0, 4)}-${String((Number(period.at(-1)) - 1) * 3 + 1).padStart(2, "0")}-01`;
  if (frequency === "D" && /^\d{4}-\d{2}-\d{2}$/.test(period)) return period;
  return null;
}

function selected(code, row) {
  if (code === "CBPOL") return row.FREQ === "D";
  if (code === "LONG_CPI") return row.UNIT_MEASURE === "628";
  if (code === "EER") return row.FREQ === "M" && row.EER_BASKET === "B";
  if (code === "SPP") return row.UNIT_MEASURE === "628";
  if (code === "TC")
    return (
      row.TC_LENDERS === "A" && row.TC_ADJUST === "A" && row.UNIT_TYPE === "770"
    );
  if (code === "CREDIT_GAP") return row.CG_DTYPE === "C";
  if (code === "CBTA")
    return row.TRANSFORMATION === "B" && row.UNIT_MEASURE !== "USD";
  if (code === "CPP")
    return row.COVERED_AREA === "0" && row.PRICED_UNIT === "6";
  return true;
}

function description(code, row) {
  if (code === "CBPOL") return ["Central bank policy rate", "%", "rate"];
  if (code === "LONG_CPI")
    return ["Consumer price index · long history", "index (2010=100)", "index"];
  if (code === "SPP")
    return [
      `${row.VALUE === "R" ? "Real" : "Nominal"} residential property price index`,
      "index (2010=100)",
      "index",
    ];
  if (code === "EER")
    return [
      `${row.EER_TYPE === "R" ? "Real" : "Nominal"} effective exchange rate · broad basket`,
      "index (2020=100)",
      "index",
    ];
  if (code === "CREDIT_GAP")
    return ["Private credit-to-GDP gap", "percentage points", "spread"];
  if (code === "DSR")
    return [`Debt-service ratio · ${row.Borrowers}`, "%", "rate"];
  if (code === "TC")
    return [
      `Credit share of GDP · ${row["Borrowing sector"]} · ${row["Valuation method"]}`,
      "%",
      "rate",
    ];
  if (code === "CPP")
    return [
      `Commercial property prices · ${row["Real estate type"]} · ${row["Real estate vintage"]} · ${row["Seasonal adjustment"]}`,
      "index (source base)",
      "index",
    ];
  if (code === "GLI") {
    const rate = ["770", "771"].includes(row.UNIT_MEASURE);
    return [
      row.TITLE ||
        `Global liquidity · ${row["Currency of denomination"]} · ${row["Borrowers' sector"]} · ${row["Position type"]} · ${row["Type of instruments"]}`,
      rate
        ? row.UNIT_MEASURE === "770"
          ? "% of GDP"
          : "% YoY"
        : `${Number(row.UNIT_MULT) ? `10^${row.UNIT_MULT} ` : ""}${row.UNIT_MEASURE}`,
      rate ? "rate" : "quantity",
    ];
  }
  const ratio = row.UNIT_MEASURE === "XDF_R_B1GQ";
  const multiplier = Number(row.UNIT_MULT || 0);
  return [
    ratio
      ? "Central bank assets share of GDP"
      : "Central bank total assets · break-adjusted",
    ratio ? "%" : `${multiplier ? `10^${multiplier} ` : ""}${row.CURRENCY}`,
    ratio ? "rate" : "quantity",
  ];
}

export function parseBisCsv(
  input,
  spec,
  {
    countries = [],
    checkedAt = new Date().toISOString(),
    sourceHash = "",
  } = {},
) {
  const [code, category, family, topic] = spec;
  const [header, ...rows] = csvRows(input);
  const boundary = header?.indexOf("Series");
  if (!(boundary > 0)) throw new Error(`BIS ${code}: missing series header`);
  const roster = new Map(
    countries
      .filter((country) => country.iso2Code)
      .map((country) => [country.iso2Code, country]),
  );
  const taiwan = countries.find((country) => country.id === "TWN");
  if (taiwan) roster.set("TW", taiwan);
  const periods = header.slice(boundary + 1);
  const cutoff = checkedAt.slice(0, 10);
  const series = [];
  for (const cells of rows) {
    const row = Object.fromEntries(
      header.slice(0, boundary + 1).map((key, i) => [key, cells[i] || ""]),
    );
    if (!selected(code, row)) continue;
    const iso2 = row.REF_AREA || row.BORROWERS_CTY;
    const sourceCountry = row["Reference area"] || row["Borrowers' country"];
    const euro = iso2 === "XM" || iso2 === "5C";
    const global = code === "GLI" && ["3P", "5J"].includes(iso2);
    const country = roster.get(iso2);
    if (!country && !euro && !global) continue; // Do not relabel regional aggregates as countries.
    const frequency = { D: "daily", M: "monthly", Q: "quarterly", A: "annual" }[
      row.FREQ
    ];
    if (!frequency) continue;
    const observations = periods.flatMap((period, i) => {
      const date = bisDate(period, row.FREQ);
      const raw = cells[boundary + 1 + i]?.trim();
      if (!date || date > cutoff || !raw || !Number.isFinite(Number(raw)))
        return [];
      return [[date, Number(raw)]];
    });
    if (observations.length < 24) continue;
    const [label, unit, semantic] = description(code, row);
    const id = `BIS_${code}_${row.Series.replace(/[^A-Za-z0-9]+/g, "_")}`;
    const name = country?.name || (global ? sourceCountry : "Euro Area");
    const sourceDefinition = [
      definitions[code],
      row.COMPILATION,
      row.COVERAGE,
      row.DATA_COMP,
      row.METHOD_REF,
      row.SUPP_INFO_BREAKS,
      row.BREAKS,
      row.COMMENT_TS,
    ]
      .filter(Boolean)
      .join(" ");
    series.push({
      id,
      name: `${label} · ${name}${frequency === "annual" ? " · annual long history" : ""}`,
      indicatorName: label,
      category,
      unit,
      frequency,
      semantic,
      changeType: ["rate", "spread"].includes(semantic)
        ? "basis-points"
        : "percent",
      countryCode: country?.id || (global ? "WLD" : "EMU"),
      country: euro || global ? null : name,
      geography: global
        ? "Global"
        : euro
          ? "Euro Area"
          : country.id === "USA"
            ? "US"
            : name,
      source: "Bank for International Settlements (BIS)",
      provider: "Bank for International Settlements",
      sourceFamily: `BIS · ${family}`,
      sourceUrl: `https://data.bis.org/topics/${topic}`,
      sourceFile: `https://data.bis.org/static/bulk/WS_${code}_csv_col.zip`,
      sourceSeriesKey: row.Series,
      sourceHash,
      sourceOrganization:
        row.SOURCE_REF ||
        row.COMPILING_ORG ||
        "BIS and national statistical authorities",
      sourceDefinition: definitions[code],
      sourceDimensions: row,
      dataset: "bis-macro",
      checkedAt,
      historyType: "published_macro_history",
      methodology:
        `${row.TITLE || row.TITLE_TS || label}. Source values and native frequency are preserved without interpolation or downstream splicing. ${sourceDefinition}`.trim(),
      rightsNote:
        "BIS statistics reproduced with attribution under its terms of permitted use; no BIS endorsement is implied. https://data.bis.org/help/legal",
      observations,
    });
  }
  if (!series.length)
    throw new Error(`BIS ${code}: no usable country histories`);
  return series;
}

export async function fetchBisMacro({
  previousSeries = [],
  countries = [],
  fetchImpl = globalThis.fetch,
} = {}) {
  const result = [];
  // Two concurrent downloads bound memory and provider load; each topic is one request.
  let cursor = 0;
  async function worker() {
    while (cursor < bisDatasets.length) {
      const spec = bisDatasets[cursor++];
      const url = `https://data.bis.org/static/bulk/WS_${spec[0]}_csv_col.zip`;
      try {
        const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(90000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        const zip = XLSX.CFB.read(buffer, { type: "buffer" });
        const file = zip.FileIndex.find(
          (entry) => entry.name === `WS_${spec[0]}_csv_col.csv`,
        );
        if (!file) throw new Error("Missing expected CSV archive member");
        result.push(
          ...parseBisCsv(file.content.toString(), spec, {
            countries,
            sourceHash: createHash("sha256").update(buffer).digest("hex"),
          }),
        );
      } catch (error) {
        const cached = previousSeries.filter((entry) =>
          entry.id.startsWith(`BIS_${spec[0]}_`),
        );
        if (!cached.length) throw new Error(`BIS ${spec[0]}: ${error.message}`);
        console.warn(
          `BIS ${spec[0]}: retaining ${cached.length} histories after ${error.message}`,
        );
        result.push(
          ...cached.map((entry) => ({
            ...entry,
            refreshStatus: "upstream-unavailable",
          })),
        );
      }
    }
  }
  await Promise.all([worker(), worker()]);
  return result.sort((a, b) => a.id.localeCompare(b.id));
}
