import { createHash } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";

const frenchBase =
  "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp";
const frenchLibraryUrl =
  "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html";

const sourceName = "Kenneth R. French Data Library";
const missingSentinels = [-99.99, -999];

function monthEnd(value) {
  const clean = String(value).trim();
  const year = Number(clean.slice(0, 4));
  const month = Number(clean.slice(4, 6));
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function priorMonthEnd(value) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

const validReturn = (value) =>
  Number.isFinite(value) && !missingSentinels.includes(value);

function indexFromReturns(returns, frequency) {
  if (!returns.length) throw new Error(`No valid ${frequency} returns`);
  const initialDate = priorMonthEnd(returns[0][0]);
  let level = 100;
  const observations = [[initialDate, level]];
  for (const [date, percent] of returns) {
    const prior = observations.at(-1)[0];
    const period = (value) =>
      Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7));
    if (period(date) - period(prior) !== 1)
      throw new Error(`Missing monthly factor return before ${date}`);
    if (!validReturn(percent) || percent <= -100)
      throw new Error(`Invalid ${frequency} return ${percent} on ${date}`);
    level *= 1 + percent / 100;
    if (!Number.isFinite(level) || level <= 0)
      throw new Error(`Invalid ${frequency} index level on ${date}`);
    observations.push([date, level]);
  }
  return { observations, initialDate };
}

async function unzipCsv(fileName) {
  const url = `${frenchBase}/${fileName}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const archive = new Uint8Array(await response.arrayBuffer());
  const files = unzipSync(archive);
  const csv = Object.entries(files).find(([name]) =>
    name.toLowerCase().endsWith(".csv"),
  );
  if (!csv) throw new Error(`${url}: CSV missing from archive`);
  return {
    fileName,
    csv: strFromU8(csv[1]),
    sourceHash: createHash("sha256").update(archive).digest("hex"),
  };
}

function monthlyBlock(csv, headerIncludes) {
  const lines = csv.replaceAll("\r", "").split("\n");
  const headerIndex = lines.findIndex((line) =>
    headerIncludes.every((header) =>
      line
        .split(",")
        .map((value) => value.trim())
        .includes(header),
    ),
  );
  if (headerIndex < 0)
    throw new Error(
      `Missing monthly header containing ${headerIncludes.join(",")}`,
    );
  const columns = lines[headerIndex].split(",").map((value) => value.trim());
  const rows = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = line.split(",").map((value) => value.trim());
    if (!/^\d{6}$/.test(cells[0])) break;
    rows.push({
      date: monthEnd(cells[0]),
      values: cells
        .slice(1)
        .map((value) => (value === "" ? NaN : Number(value))),
    });
  }
  return { columns, rows };
}

function series(
  id,
  name,
  observations,
  sourceFile,
  sourceHash,
  sourceColumn,
  dataRole,
  methodology,
) {
  return {
    id,
    name,
    category: "Long-History Asset Classes",
    unit: "research index",
    frequency: "monthly",
    kind: "market",
    historyType: "observed_public",
    source: sourceName,
    sourceUrl: frenchLibraryUrl,
    sourceAsOf: observations.at(-1)[0],
    coverageStart: observations[1]?.[0] ?? observations[0][0],
    expectedStart:
      id === "FF_US_SIZE" || id === "FF_US_VALUE"
        ? "1926-07-31"
        : id === "FF_US_MOMENTUM"
          ? "1927-01-31"
          : id.startsWith("FF_US_")
            ? "1963-07-31"
            : id === "FF_EM_PROFITABILITY"
              ? "1991-07-31"
              : id === "FF_EM_INVESTMENT"
                ? "1992-07-31"
                : id === "FF_EM_MOMENTUM"
                  ? "1990-01-31"
                  : id.startsWith("FF_EM_")
                    ? "1989-07-31"
                    : id.endsWith("_MOMENTUM")
                      ? "1990-11-30"
                      : "1990-07-31",
    sourceFile,
    sourceColumn,
    sourceHash,
    assetClass: "equity",
    dataRole,
    dividendTreatment: "source_defined",
    missingSentinels,
    methodology,
    observations,
  };
}

function factorMethodology(region, sourceColumn, initialDate) {
  const scope = region === "U.S." ? "U.S." : `${region} U.S.-dollar`;
  const factorText =
    sourceColumn === "Mkt-RF + RF"
      ? "The market index is the source Mkt-RF excess return plus the source one-month risk-free rate."
      : `The ${sourceColumn} series is the published ${region} long-short factor return.`;
  return `${factorText} Monthly ${scope} Fama–French research returns are compounded into a synthetic $100 index. The first observation is a documented synthetic baseline of 100 at ${initialDate}, the month-end preceding the first valid source return; it is not an observed return. Underlying source portfolios are value-weighted and source-defined total returns (including dividends where the source includes them). Factor indexes are research constructs, not investable funds or ETF total-return histories.`;
}

function factorSeries({
  prefix,
  region,
  label,
  file,
  block,
  column,
  idSuffix,
  name,
  dataRole = "research_factor_index",
}) {
  const returns = block.rows.flatMap(({ date, values }) => {
    const value = values[column];
    return validReturn(value) ? [[date, value]] : [];
  });
  const indexed = indexFromReturns(returns, "monthly");
  return series(
    `${prefix}_${idSuffix}`,
    name ?? `${label} ${idSuffix} · Fama–French Research Index`,
    indexed.observations,
    file.fileName,
    file.sourceHash,
    block.columns[column + 1],
    dataRole,
    factorMethodology(label, block.columns[column + 1], indexed.initialDate),
  );
}

function marketSeries({ prefix, label, file, block, marketColumn, rfColumn }) {
  const returns = block.rows.flatMap(({ date, values }) => {
    const marketExcess = values[marketColumn];
    const riskFree = values[rfColumn];
    return validReturn(marketExcess) && validReturn(riskFree)
      ? [[date, marketExcess + riskFree]]
      : [];
  });
  const indexed = indexFromReturns(returns, "monthly");
  return series(
    `${prefix}_MARKET`,
    `${label} Market · Fama–French Research Portfolio`,
    indexed.observations,
    file.fileName,
    file.sourceHash,
    "Mkt-RF + RF",
    "research_portfolio",
    factorMethodology(label, "Mkt-RF + RF", indexed.initialDate),
  );
}

function parseFactorBlock(file) {
  return monthlyBlock(file.csv, ["Mkt-RF", "SMB", "HML", "RMW", "CMA", "RF"]);
}

function parseThreeFactorBlock(file) {
  return monthlyBlock(file.csv, ["Mkt-RF", "SMB", "HML", "RF"]);
}

function parseMomentumBlock(file) {
  return monthlyBlock(file.csv, [
    file.fileName.startsWith("F-F_") ? "Mom" : "WML",
  ]);
}

const regionalFiles = [
  [
    "FF_DEVELOPED",
    "Developed Markets",
    "Developed_5_Factors_CSV.zip",
    "Developed_Mom_Factor_CSV.zip",
  ],
  [
    "FF_DEVELOPED_EXUS",
    "Developed ex U.S.",
    "Developed_ex_US_5_Factors_CSV.zip",
    "Developed_ex_US_Mom_Factor_CSV.zip",
  ],
  [
    "FF_EUROPE",
    "Europe",
    "Europe_5_Factors_CSV.zip",
    "Europe_Mom_Factor_CSV.zip",
  ],
  ["FF_JAPAN", "Japan", "Japan_5_Factors_CSV.zip", "Japan_Mom_Factor_CSV.zip"],
  [
    "FF_ASIAPAC_EXJP",
    "Asia Pacific ex Japan",
    "Asia_Pacific_ex_Japan_5_Factors_CSV.zip",
    "Asia_Pacific_ex_Japan_MOM_Factor_CSV.zip",
  ],
];

async function loadFiles() {
  const names = [
    "F-F_Research_Data_Factors_CSV.zip",
    "F-F_Research_Data_5_Factors_2x3_CSV.zip",
    "F-F_Momentum_Factor_CSV.zip",
    "Emerging_5_Factors_CSV.zip",
    "Emerging_MOM_Factor_CSV.zip",
    ...regionalFiles.flatMap(([, , factors, momentum]) => [factors, momentum]),
  ];
  const files = await Promise.all(names.map((fileName) => unzipCsv(fileName)));
  return new Map(files.map((file) => [file.fileName, file]));
}

export async function fetchFactorHistorySeries() {
  const files = await loadFiles();
  const output = [];

  const usThreeFactors = files.get("F-F_Research_Data_Factors_CSV.zip");
  const usThreeFactorBlock = parseThreeFactorBlock(usThreeFactors);
  for (const [idSuffix, name, column] of [
    ["SIZE", "U.S. Size Factor (SMB) · Fama–French Research Index", 1],
    ["VALUE", "U.S. Value Factor (HML) · Fama–French Research Index", 2],
  ]) {
    output.push(
      factorSeries({
        prefix: "FF_US",
        label: "U.S.",
        file: usThreeFactors,
        block: usThreeFactorBlock,
        column,
        idSuffix,
        name,
      }),
    );
  }
  const usFactors = files.get("F-F_Research_Data_5_Factors_2x3_CSV.zip");
  const usFactorBlock = parseFactorBlock(usFactors);
  for (const [idSuffix, name, column] of [
    [
      "PROFITABILITY",
      "U.S. Operating Profitability Factor (RMW) · Fama–French Research Index",
      3,
    ],
    [
      "INVESTMENT",
      "U.S. Investment Factor (CMA) · Fama–French Research Index",
      4,
    ],
  ]) {
    output.push(
      factorSeries({
        prefix: "FF_US",
        label: "U.S.",
        file: usFactors,
        block: usFactorBlock,
        column,
        idSuffix,
        name,
      }),
    );
  }
  const usMomentum = files.get("F-F_Momentum_Factor_CSV.zip");
  output.push(
    factorSeries({
      prefix: "FF_US",
      label: "U.S.",
      file: usMomentum,
      block: parseMomentumBlock(usMomentum),
      column: 0,
      idSuffix: "MOMENTUM",
      name: "U.S. Momentum Factor (Mom) · Fama–French Research Index",
    }),
  );

  const emergingFactors = files.get("Emerging_5_Factors_CSV.zip");
  const emergingFactorBlock = parseFactorBlock(emergingFactors);
  output.push(
    marketSeries({
      prefix: "FF_EM",
      label: "Emerging Markets",
      file: emergingFactors,
      block: emergingFactorBlock,
      marketColumn: 0,
      rfColumn: 5,
    }),
  );
  for (const [idSuffix, name, column] of [
    [
      "SIZE",
      "Emerging Markets Size Factor (SMB) · Fama–French Research Index",
      1,
    ],
    [
      "VALUE",
      "Emerging Markets Value Factor (HML) · Fama–French Research Index",
      2,
    ],
    [
      "PROFITABILITY",
      "Emerging Markets Operating Profitability Factor (RMW) · Fama–French Research Index",
      3,
    ],
    [
      "INVESTMENT",
      "Emerging Markets Investment Factor (CMA) · Fama–French Research Index",
      4,
    ],
  ]) {
    output.push(
      factorSeries({
        prefix: "FF_EM",
        label: "Emerging Markets",
        file: emergingFactors,
        block: emergingFactorBlock,
        column,
        idSuffix,
        name,
      }),
    );
  }
  const emergingMomentum = files.get("Emerging_MOM_Factor_CSV.zip");
  output.push(
    factorSeries({
      prefix: "FF_EM",
      label: "Emerging Markets",
      file: emergingMomentum,
      block: parseMomentumBlock(emergingMomentum),
      column: 0,
      idSuffix: "MOMENTUM",
      name: "Emerging Markets Momentum Factor (WML) · Fama–French Research Index",
    }),
  );

  for (const [
    prefix,
    label,
    factorFileName,
    momentumFileName,
  ] of regionalFiles) {
    const factorFile = files.get(factorFileName);
    const factorBlock = parseFactorBlock(factorFile);
    for (const [idSuffix, name, column] of [
      [
        "PROFITABILITY",
        `${label} Operating Profitability Factor (RMW) · Fama–French Research Index`,
        3,
      ],
      [
        "INVESTMENT",
        `${label} Investment Factor (CMA) · Fama–French Research Index`,
        4,
      ],
    ]) {
      output.push(
        factorSeries({
          prefix,
          label,
          file: factorFile,
          block: factorBlock,
          column,
          idSuffix,
          name,
        }),
      );
    }
    const momentumFile = files.get(momentumFileName);
    output.push(
      factorSeries({
        prefix,
        label,
        file: momentumFile,
        block: parseMomentumBlock(momentumFile),
        column: 0,
        idSuffix: "MOMENTUM",
        name: `${label} Momentum Factor (WML) · Fama–French Research Index`,
      }),
    );
  }

  return output;
}
