import { strFromU8, unzipSync } from "fflate";
import { createHash } from "node:crypto";

const frenchBase =
  "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp";
const damodaranUrl =
  "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html";
const frenchLibraryUrl =
  "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html";

function monthEnd(value) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function priorMonthEnd(value) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function indexFromReturns(returns, initialDate, frequency) {
  let price = 100;
  return [
    [initialDate, price],
    ...returns.map(([date, percent]) => {
      if (!Number.isFinite(percent) || percent <= -100)
        throw new Error(`Invalid ${frequency} return ${percent} on ${date}`);
      price *= 1 + percent / 100;
      return [date, price];
    }),
  ].filter(([, value]) => Number.isFinite(value) && value > 0);
}

async function unzipCsv(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const archive = new Uint8Array(await response.arrayBuffer());
  const files = unzipSync(archive);
  const csv = Object.entries(files).find(([name]) =>
    name.toLowerCase().endsWith(".csv"),
  );
  if (!csv) throw new Error(`${url}: CSV missing from archive`);
  return {
    csv: strFromU8(csv[1]),
    sourceHash: createHash("sha256").update(archive).digest("hex"),
  };
}

function monthlyBlock(csv, header) {
  const lines = csv.replaceAll("\r", "").split("\n");
  const start = lines.findIndex((line) => line.trim().startsWith(header));
  if (start < 0) throw new Error(`Missing ${header} header`);
  const columns = lines[start]
    .split(",")
    .slice(1)
    .map((value) => value.trim());
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    const cells = line.split(",").map((value) => value.trim());
    if (!/^\d{6}$/.test(cells[0])) break;
    rows.push([
      monthEnd(cells[0]),
      ...cells.slice(1).map((value) => (value === "" ? NaN : Number(value))),
    ]);
  }
  return { columns, rows };
}

const validReturn = (value) =>
  Number.isFinite(value) && value !== -99.99 && value !== -999;

function series(
  id,
  name,
  observations,
  source,
  sourceUrl,
  frequency,
  methodology,
  sourceHash,
  metadata,
) {
  return {
    id,
    name,
    category: "Long-History Asset Classes",
    unit: "research index",
    frequency,
    kind: "market",
    historyType: "observed_public",
    source,
    sourceUrl,
    sourceAsOf: observations.at(-1)[0],
    methodology,
    sourceHash,
    ...metadata,
    observations: observations.map(([date, value]) => [date, value]),
  };
}

async function famaFrenchSeries() {
  const [factorsFile, portfoliosFile] = await Promise.all([
    unzipCsv(`${frenchBase}/F-F_Research_Data_Factors_CSV.zip`),
    unzipCsv(`${frenchBase}/6_Portfolios_2x3_CSV.zip`),
  ]);
  const factors = monthlyBlock(factorsFile.csv, ",Mkt-RF,SMB,HML,RF");
  const portfolios = monthlyBlock(
    portfoliosFile.csv,
    ",SMALL LoBM,ME1 BM2,SMALL HiBM,BIG LoBM,ME2 BM2,BIG HiBM",
  );
  const factorReturns = factors.rows.filter((row) =>
    row.slice(1).every(validReturn),
  );
  const portfolioRows = portfolios.rows.filter((row) =>
    row.slice(1).every(validReturn),
  );
  const portfolio = (column) =>
    indexFromReturns(
      portfolioRows.map((row) => [row[0], row[column + 1]]),
      "1926-06-30",
      "monthly",
    );
  const sourceUrl =
    "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html";
  const sourceName = "Kenneth R. French Data Library";
  const method =
    "Monthly value-weighted research-portfolio returns compounded into a $100 index; portfolios are reconstituted using the Data Library methodology and are not investable funds.";
  return [
    series(
      "FF_US_MARKET",
      "U.S. Equity Market · Fama–French Research Portfolio",
      indexFromReturns(
        factorReturns.map((row) => [row[0], row[1] + row[4]]),
        "1926-06-30",
        "monthly",
      ),
      sourceName,
      sourceUrl,
      "monthly",
      "Monthly market excess return plus the one-month risk-free rate, compounded into a $100 research index.",
      factorsFile.sourceHash,
      {
        assetClass: "equity",
        dataRole: "research_portfolio",
        dividendTreatment: "source_defined",
        missingSentinels: [-99.99, -999],
        sourceFile: "F-F_Research_Data_Factors_CSV.zip",
        sourceColumn: "Mkt-RF + RF",
      },
    ),
    ...[
      [
        "FF_SMALL_GROWTH",
        "U.S. Small-Cap Growth · Fama–French Research Portfolio",
        0,
        "SMALL LoBM",
      ],
      [
        "FF_SMALL_CORE",
        "U.S. Small-Cap Core · Fama–French Research Portfolio",
        1,
        "ME1 BM2",
      ],
      [
        "FF_SMALL_VALUE",
        "U.S. Small-Cap Value · Fama–French Research Portfolio",
        2,
        "SMALL HiBM",
      ],
      [
        "FF_LARGE_GROWTH",
        "U.S. Large-Cap Growth · Fama–French Research Portfolio",
        3,
        "BIG LoBM",
      ],
      [
        "FF_LARGE_CORE",
        "U.S. Large-Cap Core · Fama–French Research Portfolio",
        4,
        "ME2 BM2",
      ],
      [
        "FF_LARGE_VALUE",
        "U.S. Large-Cap Value · Fama–French Research Portfolio",
        5,
        "BIG HiBM",
      ],
    ].map(([id, name, column, sourceColumn]) =>
      series(
        id,
        name,
        portfolio(column),
        sourceName,
        sourceUrl,
        "monthly",
        method,
        portfoliosFile.sourceHash,
        {
          assetClass: "equity",
          dataRole: "research_portfolio",
          dividendTreatment: "source_defined",
          missingSentinels: [-99.99, -999],
          sourceFile: "6_Portfolios_2x3_CSV.zip",
          sourceColumn,
        },
      ),
    ),
  ];
}

async function industrySeries() {
  const fileName = "10_Industry_Portfolios_CSV.zip";
  const file = await unzipCsv(`${frenchBase}/${fileName}`);
  const block = monthlyBlock(
    file.csv,
    ",NoDur,Durbl,Manuf,Enrgy,HiTec,Telcm,Shops,Hlth,Utils,Other",
  );
  const rows = block.rows.filter((row) => row.slice(1).every(validReturn));
  const initialDate = priorMonthEnd(rows[0][0]);
  const labels = [
    ["FF_INDUSTRY_NONDURABLES", "Nondurables"],
    ["FF_INDUSTRY_DURABLES", "Durables"],
    ["FF_INDUSTRY_MANUFACTURING", "Manufacturing"],
    ["FF_INDUSTRY_ENERGY", "Energy"],
    ["FF_INDUSTRY_HITECH", "High Tech"],
    ["FF_INDUSTRY_TELECOM", "Telecommunications"],
    ["FF_INDUSTRY_SHOPS", "Shops"],
    ["FF_INDUSTRY_HEALTH", "Health Care"],
    ["FF_INDUSTRY_UTILITIES", "Utilities"],
    ["FF_INDUSTRY_OTHER", "Other"],
  ];
  const method =
    "Monthly value-weighted U.S. industry research-portfolio returns compounded into a $100 index; portfolios include dividends and are reconstituted using the Fama–French Data Library methodology. They are not investable funds.";
  return labels.map(([id, label], column) =>
    series(
      id,
      `U.S. ${label} · Fama–French Industry Research Portfolio`,
      indexFromReturns(
        rows.map((row) => [row[0], row[column + 1]]),
        initialDate,
        "monthly",
      ),
      "Kenneth R. French Data Library",
      frenchLibraryUrl,
      "monthly",
      method,
      file.sourceHash,
      {
        assetClass: "industry",
        dataRole: "research_portfolio",
        dividendTreatment: "source_defined",
        missingSentinels: [-99.99, -999],
        sourceFile: fileName,
        sourceColumn: block.columns[column],
      },
    ),
  );
}

const regionalFactors = [
  ["FF_DEVELOPED", "Developed Markets", "Developed_3_Factors_CSV.zip"],
  [
    "FF_DEVELOPED_EXUS",
    "Developed ex U.S.",
    "Developed_ex_US_3_Factors_CSV.zip",
  ],
  ["FF_EUROPE", "Europe", "Europe_3_Factors_CSV.zip"],
  ["FF_JAPAN", "Japan", "Japan_3_Factors_CSV.zip"],
  [
    "FF_ASIAPAC_EXJP",
    "Asia Pacific ex Japan",
    "Asia_Pacific_ex_Japan_3_Factors_CSV.zip",
  ],
];

async function regionalFactorSeries() {
  const files = await Promise.all(
    regionalFactors.map(async ([prefix, region, fileName]) => ({
      prefix,
      region,
      fileName,
      file: await unzipCsv(`${frenchBase}/${fileName}`),
    })),
  );
  return files.flatMap(({ prefix, region, fileName, file }) => {
    const block = monthlyBlock(file.csv, ",Mkt-RF,SMB,HML,RF");
    const rows = block.rows.filter((row) => row.slice(1).every(validReturn));
    const initialDate = priorMonthEnd(rows[0][0]);
    const method = `Monthly U.S.-dollar Fama–French ${region} factor returns compounded into $100 research indexes. The market series is Mkt-RF plus RF; SMB and HML are long-short factor returns. Returns include dividends and capital gains and are not investable funds.`;
    const metadata = (sourceColumn, dataRole) => ({
      assetClass: "equity",
      dataRole,
      dividendTreatment: "source_defined",
      missingSentinels: [-99.99, -999],
      sourceFile: fileName,
      sourceColumn,
    });
    return [
      series(
        `${prefix}_MARKET`,
        `${region} · Fama–French Market Research Portfolio`,
        indexFromReturns(
          rows.map((row) => [row[0], row[1] + row[4]]),
          initialDate,
          "monthly",
        ),
        "Kenneth R. French Data Library",
        frenchLibraryUrl,
        "monthly",
        method,
        file.sourceHash,
        metadata("Mkt-RF + RF", "research_portfolio"),
      ),
      series(
        `${prefix}_SMALL`,
        `${region} · Fama–French Size Factor`,
        indexFromReturns(
          rows.map((row) => [row[0], row[2]]),
          initialDate,
          "monthly",
        ),
        "Kenneth R. French Data Library",
        frenchLibraryUrl,
        "monthly",
        method,
        file.sourceHash,
        metadata("SMB", "research_factor_index"),
      ),
      series(
        `${prefix}_VALUE`,
        `${region} · Fama–French Value Factor`,
        indexFromReturns(
          rows.map((row) => [row[0], row[3]]),
          initialDate,
          "monthly",
        ),
        "Kenneth R. French Data Library",
        frenchLibraryUrl,
        "monthly",
        method,
        file.sourceHash,
        metadata("HML", "research_factor_index"),
      ),
    ];
  });
}

function textContent(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function damodaranSeries() {
  const response = await fetch(damodaranUrl);
  if (!response.ok) throw new Error(`${damodaranUrl}: ${response.status}`);
  const html = await response.text();
  const sourceHash = createHash("sha256").update(html).digest("hex");
  const rows = [];
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (cell) => textContent(cell[1]),
    );
    if (!/^\d{4}$/.test(cells[0] ?? "") || cells.length < 8) continue;
    const returns = cells
      .slice(1, 8)
      .map((value) => Number(value.replace("%", "").replaceAll(",", "")));
    if (returns.every(Number.isFinite))
      rows.push([`${cells[0]}-12-31`, ...returns]);
  }
  if (rows.length < 90)
    throw new Error(
      `Damodaran history unexpectedly short: ${rows.length} rows`,
    );
  const indexed = (column) =>
    indexFromReturns(
      rows.map((row) => [row[0], row[column + 1]]),
      "1927-12-31",
      "annual",
    );
  const sourceName = "Aswath Damodaran, NYU Stern";
  const totalReturnMethod =
    "Published annual total returns compounded into a $100 research index. Annual frequency is preserved; no monthly observations are interpolated.";
  const goldMethod =
    "Published annual gold price returns compounded into a $100 research index. This is a price-return series without income; annual frequency is preserved.";
  return [
    [
      "HIST_SP500_TR",
      "S&P 500 Total Return · Damodaran",
      0,
      "equity",
      "S&P 500 (includes dividends)",
      "reinvested",
    ],
    [
      "HIST_US_SMALL",
      "U.S. Small Stocks (Bottom Decile) · Damodaran",
      1,
      "equity",
      "US Small cap (bottom decile)",
      "source_defined",
    ],
    [
      "HIST_TBILL",
      "U.S. 3-Month Treasury Bills · Damodaran",
      2,
      "cash",
      "3-month T.Bill",
      "source_defined",
    ],
    [
      "HIST_TBOND10",
      "U.S. 10-Year Treasury Bond Total Return · Damodaran",
      3,
      "bonds",
      "US T. Bond (10-year)",
      "reinvested",
    ],
    [
      "HIST_BAA_CORP",
      "U.S. Baa Corporate Bond Total Return · Damodaran",
      4,
      "credit",
      "Baa Corporate Bond",
      "reinvested",
    ],
    [
      "HIST_REAL_ESTATE",
      "U.S. Real Estate Research Series · Damodaran",
      5,
      "real_estate",
      "Real Estate",
      "source_defined",
    ],
    [
      "HIST_GOLD",
      "Gold Price Return · Damodaran",
      6,
      "commodity",
      "Gold",
      "none",
    ],
  ].map(([id, name, column, assetClass, sourceColumn, dividendTreatment]) =>
    series(
      id,
      name,
      indexed(column),
      sourceName,
      damodaranUrl,
      "annual",
      column === 6 ? goldMethod : totalReturnMethod,
      sourceHash,
      {
        assetClass,
        dataRole: column === 6 ? "price_return" : "total_return_index",
        dividendTreatment,
        sourceFile: "histretSP.html",
        sourceColumn,
      },
    ),
  );
}

export async function fetchLongHistorySeries() {
  const [famaFrench, damodaran, industries, regional] = await Promise.all([
    famaFrenchSeries(),
    damodaranSeries(),
    industrySeries(),
    regionalFactorSeries(),
  ]);
  return [...famaFrench, ...damodaran, ...industries, ...regional];
}
