// Candidate extension catalog, validated against the FRED CSV endpoint on
// 2026-09-22. These tuples intentionally remain separate from catalog.mjs so
// integration can add an explicit freshness policy for the archival feeds.
//
// Tuple shape matches scripts/catalog.mjs:
// [id, name, category, unit, frequency, transform, metadata]
export const extendedFredSeries = [
  [
    "M1SL",
    "M1 Money Stock",
    "Credit",
    "billions",
    "monthly",
    "identity",
    {
      semantic: "quantity",
      changeType: "percent",
      provider: "Board of Governors of the Federal Reserve System",
      sourceFamily: "Federal Reserve H.6 Money Stock Measures",
      methodology:
        "M1 money stock: currency, demand deposits, and other checkable deposits. Seasonally adjusted monthly level. The H.6 definition changed materially in 2020 when savings deposits were added; the pre- and post-2020 observations must be interpreted as a definition-break series, not treated as a seamless splice.",
      validationNote:
        "Validated coverage: 1959-01-01 through 2026-07-01 (811 numeric observations) on 2026-09-22.",
      rightsNote:
        "FRED republishes the Federal Reserve release; retain FRED and Federal Reserve attribution and check current source terms before redistribution.",
    },
  ],
  [
    "TOTRESNS",
    "Total Reserves of Depository Institutions",
    "Credit",
    "billions",
    "monthly",
    "identity",
    {
      semantic: "quantity",
      changeType: "percent",
      provider: "Board of Governors of the Federal Reserve System",
      sourceFamily: "Federal Reserve H.6 Money Stock Measures",
      methodology:
        "Total reserves held by depository institutions, not seasonally adjusted; monthly level in billions of dollars.",
      validationNote:
        "Validated coverage: 1959-01-01 through 2026-07-01 (811 numeric observations) on 2026-09-22.",
    },
  ],
  [
    "H8B1001NCBCMG",
    "Commercial Bank Credit Growth",
    "Credit",
    "%",
    "monthly",
    "identity",
    {
      semantic: "rate",
      changeType: "basis-points",
      provider: "Board of Governors of the Federal Reserve System",
      sourceFamily:
        "Federal Reserve H.8 Assets and Liabilities of Commercial Banks",
      methodology:
        "Bank credit at all commercial banks reported as percent change at an annual rate; this is already a growth-rate series, not a bank-credit level.",
      validationNote:
        "Validated coverage: 1947-02-01 through 2026-08-01 (955 numeric observations) on 2026-09-22.",
    },
  ],
  [
    "BUSLOANS",
    "Commercial and Industrial Loans",
    "Credit",
    "billions",
    "monthly",
    "identity",
    {
      semantic: "quantity",
      changeType: "percent",
      provider: "Board of Governors of the Federal Reserve System",
      sourceFamily:
        "Federal Reserve H.8 Assets and Liabilities of Commercial Banks",
      methodology:
        "Commercial and industrial loans held by all commercial banks; monthly level in billions of U.S. dollars.",
      validationNote:
        "Validated coverage: 1947-01-01 through 2026-08-01 (956 numeric observations) on 2026-09-22.",
    },
  ],
  [
    "TOTALSL",
    "Total Consumer Credit Owned and Securitized",
    "Credit",
    "millions",
    "monthly",
    "identity",
    {
      semantic: "quantity",
      changeType: "percent",
      provider: "Board of Governors of the Federal Reserve System",
      sourceFamily: "Federal Reserve G.19 Consumer Credit",
      methodology:
        "Total consumer credit owned and securitized by depository and finance institutions; monthly level in millions of dollars.",
      validationNote:
        "Validated coverage: 1943-01-01 through 2026-07-01 (1,003 numeric observations) on 2026-09-22.",
    },
  ],
  [
    "HCCSDODNS",
    "Household Consumer Credit Liabilities",
    "Credit",
    "millions",
    "quarterly",
    "identity",
    {
      semantic: "quantity",
      changeType: "percent",
      provider: "Board of Governors of the Federal Reserve System",
      sourceFamily: "Federal Reserve Financial Accounts (Z.1)",
      methodology:
        "Households and nonprofit organizations consumer-credit liability level from the Financial Accounts; quarterly, in millions of dollars.",
      validationNote:
        "Validated coverage: 1945-10-01 through 2026-04-01 (305 numeric observations) on 2026-09-22.",
      rightsNote:
        "Financial Accounts tables can be revised substantially; use the latest FRED observations as a coherent vintage and retain Federal Reserve attribution.",
    },
  ],
  [
    "HHMSDODNS",
    "Household Residential Mortgage Liabilities",
    "Credit",
    "millions",
    "quarterly",
    "identity",
    {
      semantic: "quantity",
      changeType: "percent",
      provider: "Board of Governors of the Federal Reserve System",
      sourceFamily: "Federal Reserve Financial Accounts (Z.1)",
      methodology:
        "Households and nonprofit organizations one-to-four-family residential mortgage liability level; quarterly, in millions of dollars.",
      validationNote:
        "Validated coverage: 1945-10-01 through 2026-04-01 (305 numeric observations) on 2026-09-22.",
      rightsNote:
        "Financial Accounts tables can be revised substantially; use the latest FRED observations as a coherent vintage and retain Federal Reserve attribution.",
    },
  ],
  [
    "NCBDBIQ027S",
    "Nonfinancial Corporate Debt Securities",
    "Credit",
    "millions",
    "quarterly",
    "identity",
    {
      semantic: "quantity",
      changeType: "percent",
      provider: "Board of Governors of the Federal Reserve System",
      sourceFamily: "Federal Reserve Financial Accounts (Z.1)",
      methodology:
        "Nonfinancial corporate business debt-securities liability level; quarterly, in millions of dollars. This is a debt-instrument component, not total corporate debt.",
      validationNote:
        "Validated coverage: 1945-10-01 through 2026-04-01 (305 numeric observations) on 2026-09-22.",
      rightsNote:
        "Financial Accounts tables can be revised substantially; use the latest FRED observations as a coherent vintage and retain Federal Reserve attribution.",
    },
  ],
  [
    "GFDEBTN",
    "Federal Debt: Total Public Debt",
    "Fiscal",
    "millions",
    "quarterly",
    "identity",
    {
      semantic: "quantity",
      changeType: "percent",
      provider: "U.S. Department of the Treasury, Fiscal Service",
      sourceFamily: "Treasury Fiscal Data",
      methodology:
        "Total public debt outstanding, reported quarterly in millions of dollars. Keep separate from the debt-to-GDP ratio and from daily debt-to-the-penny measures.",
      validationNote:
        "Validated coverage: 1966-01-01 through 2026-01-01 (241 numeric observations) on 2026-09-22.",
      rightsNote:
        "Treasury Fiscal Data is an official public source; retain Treasury and FRED attribution and review current data-use terms.",
    },
  ],
  [
    "GFDEGDQ188S",
    "Federal Debt: Total Public Debt as Percent of GDP",
    "Fiscal",
    "%",
    "quarterly",
    "identity",
    {
      semantic: "rate",
      changeType: "basis-points",
      provider: "U.S. Department of the Treasury, Fiscal Service",
      sourceFamily: "Treasury Fiscal Data",
      methodology:
        "Total public debt as a percent of gross domestic product; quarterly ratio, not a level and not a splice with GFDEBTN.",
      validationNote:
        "Validated coverage: 1966-01-01 through 2026-01-01 (241 numeric observations) on 2026-09-22.",
    },
  ],
  [
    "FYFSD",
    "Federal Surplus or Deficit [-]",
    "Fiscal",
    "millions",
    "annual",
    "identity",
    {
      semantic: "signed_quantity",
      changeType: "points",
      provider: "U.S. Office of Management and Budget",
      sourceFamily: "OMB Historical Tables",
      methodology:
        "Federal surplus or deficit, with a negative value denoting a deficit; annual fiscal-year observations are dated to fiscal-year reference dates and can be revised.",
      validationNote:
        "Validated coverage: 1901-06-30 through 2025-09-30 (125 numeric observations) on 2026-09-22; dates are fiscal-year observations rather than calendar-year endpoints.",
    },
  ],
  [
    "FYFRGDA188S",
    "Federal Receipts as Percent of GDP",
    "Fiscal",
    "%",
    "annual",
    "identity",
    {
      semantic: "rate",
      changeType: "basis-points",
      provider: "U.S. Office of Management and Budget",
      sourceFamily: "OMB Historical Tables",
      methodology:
        "Federal receipts divided by GDP, expressed as a percent of GDP; annual observations preserve the source calendar-year frequency.",
      validationNote:
        "Validated coverage: 1929-01-01 through 2025-01-01 (97 numeric observations) on 2026-09-22.",
    },
  ],
  [
    "FYFSGDA188S",
    "Federal Surplus or Deficit [-] as Percent of GDP",
    "Fiscal",
    "%",
    "annual",
    "identity",
    {
      semantic: "rate",
      changeType: "basis-points",
      provider: "U.S. Office of Management and Budget",
      sourceFamily: "OMB Historical Tables",
      methodology:
        "Federal surplus or deficit divided by GDP; negative values indicate deficits, and annual observations are not interpolated to quarters.",
      validationNote:
        "Validated coverage: 1929-01-01 through 2025-01-01 (97 numeric observations) on 2026-09-22.",
    },
  ],
  [
    "OPHNFB",
    "Nonfarm Business Labor Productivity",
    "Productivity",
    "index",
    "quarterly",
    "identity",
    {
      semantic: "index",
      changeType: "percent",
      provider: "U.S. Bureau of Labor Statistics",
      sourceFamily: "BLS Productivity and Costs",
      methodology:
        "Output per hour for all workers in the nonfarm business sector, index 2017=100; quarterly source index.",
      validationNote:
        "Validated coverage: 1947-01-01 through 2026-04-01 (318 numeric observations) on 2026-09-22.",
      rightsNote:
        "BLS data are public with attribution; BLS revisions can change historical productivity levels and growth rates.",
    },
  ],
  [
    "ULCNFB",
    "Nonfarm Business Unit Labor Costs",
    "Productivity",
    "index",
    "quarterly",
    "identity",
    {
      semantic: "index",
      changeType: "percent",
      provider: "U.S. Bureau of Labor Statistics",
      sourceFamily: "BLS Productivity and Costs",
      methodology:
        "Unit labor costs for all workers in the nonfarm business sector, index 2017=100; quarterly source index.",
      validationNote:
        "Validated coverage: 1947-01-01 through 2026-04-01 (318 numeric observations) on 2026-09-22.",
      rightsNote:
        "BLS data are public with attribution; BLS revisions can change historical productivity levels and growth rates.",
    },
  ],
  [
    "COMPNFB",
    "Nonfarm Business Hourly Compensation",
    "Productivity",
    "index",
    "quarterly",
    "identity",
    {
      semantic: "index",
      changeType: "percent",
      provider: "U.S. Bureau of Labor Statistics",
      sourceFamily: "BLS Productivity and Costs",
      methodology:
        "Hourly compensation for all workers in the nonfarm business sector, index 2017=100; quarterly source index.",
      validationNote:
        "Validated coverage: 1947-01-01 through 2026-04-01 (318 numeric observations) on 2026-09-22.",
      rightsNote:
        "BLS data are public with attribution; BLS revisions can change historical productivity levels and growth rates.",
    },
  ],
  [
    "MPU4900013",
    "Private Business Total Factor Productivity Growth",
    "Productivity",
    "%",
    "annual",
    "identity",
    {
      semantic: "rate",
      changeType: "basis-points",
      provider: "U.S. Bureau of Labor Statistics",
      sourceFamily: "BLS Multifactor Productivity",
      methodology:
        "Total factor productivity for the private business sector, reported as percent change from a year earlier; annual source growth rate, not an index level.",
      validationNote:
        "Validated coverage: 1988-01-01 through 2025-01-01 (38 numeric observations) on 2026-09-22.",
      rightsNote:
        "BLS data are public with attribution; BLS revisions can change historical productivity levels and growth rates.",
    },
  ],
  [
    "POPTHM",
    "U.S. Population",
    "Demography",
    "thousands",
    "monthly",
    "identity",
    {
      semantic: "quantity",
      changeType: "percent",
      provider: "U.S. Bureau of Economic Analysis",
      sourceFamily: "National Income and Product Accounts",
      methodology:
        "U.S. population estimate in thousands; monthly source series. It is a demographic denominator, not a labor-force measure.",
      validationNote:
        "Validated coverage: 1959-01-01 through 2026-07-01 (811 numeric observations) on 2026-09-22.",
    },
  ],
  [
    "LFWA64TTUSM647S",
    "U.S. Working-Age Population, Ages 15–64",
    "Demography",
    "persons",
    "monthly",
    "identity",
    {
      semantic: "quantity",
      changeType: "percent",
      provider: "Organisation for Economic Co-operation and Development",
      sourceFamily: "OECD Infra-Annual Labor Statistics",
      methodology:
        "Population aged 15 through 64 in persons; monthly OECD series for the United States, retained at its native frequency.",
      validationNote:
        "Validated coverage: 1977-01-01 through 2026-07-01 (595 numeric observations) on 2026-09-22.",
      rightsNote:
        "OECD data are redistributed through FRED; preserve OECD/FRED attribution and review current OECD terms before commercial reuse.",
    },
  ],
  [
    "SPDYNCBRTINUSA",
    "U.S. Crude Birth Rate",
    "Demography",
    "births per 1,000 people",
    "annual",
    "identity",
    {
      semantic: "rate",
      changeType: "points",
      provider: "World Bank",
      sourceFamily: "World Development Indicators",
      methodology:
        "Annual live births per 1,000 mid-year population for the United States; World Bank indicator SP.DYN.CBRT.IN.",
      validationNote:
        "Validated coverage: 1960-01-01 through 2024-01-01 (65 numeric observations) on 2026-09-22; annual publication lag is expected.",
      rightsNote:
        "World Bank WDI data are provided under World Bank data terms; retain indicator attribution and verify current license terms.",
    },
  ],
  [
    "SPDYNTFRTINUSA",
    "U.S. Total Fertility Rate",
    "Demography",
    "births per woman",
    "annual",
    "identity",
    {
      semantic: "rate",
      changeType: "points",
      provider: "World Bank",
      sourceFamily: "World Development Indicators",
      methodology:
        "Annual total fertility rate for the United States in births per woman; World Bank indicator SP.DYN.TFRT.IN.",
      validationNote:
        "Validated coverage: 1960-01-01 through 2024-01-01 (65 numeric observations) on 2026-09-22; annual publication lag is expected.",
      rightsNote:
        "World Bank WDI data are provided under World Bank data terms; retain indicator attribution and verify current license terms.",
    },
  ],
  [
    "SPDYNLE00INUSA",
    "U.S. Life Expectancy at Birth",
    "Demography",
    "years",
    "annual",
    "identity",
    {
      semantic: "rate",
      changeType: "points",
      provider: "World Bank",
      sourceFamily: "World Development Indicators",
      methodology:
        "Annual life expectancy at birth for the United States in years; World Bank indicator SP.DYN.LE00.IN.",
      validationNote:
        "Validated coverage: 1960-01-01 through 2024-01-01 (65 numeric observations) on 2026-09-22; annual publication lag is expected.",
      rightsNote:
        "World Bank WDI data are provided under World Bank data terms; retain indicator attribution and verify current license terms.",
    },
  ],
  [
    "SPPOP65UPTOZSWLD",
    "World Population Ages 65 and Above",
    "Demography",
    "%",
    "annual",
    "identity",
    {
      semantic: "rate",
      changeType: "basis-points",
      provider: "World Bank",
      sourceFamily: "World Development Indicators",
      methodology:
        "Share of world population aged 65 and above; annual percentage of total, World Bank indicator SP.POP.65UP.TO.ZS.",
      validationNote:
        "Validated coverage: 1960-01-01 through 2025-01-01 (66 numeric observations) on 2026-09-22.",
      rightsNote:
        "World Bank WDI data are provided under World Bank data terms; retain indicator attribution and verify current license terms.",
    },
  ],
  [
    "RHORUSQ156N",
    "U.S. Homeownership Rate",
    "Housing",
    "%",
    "quarterly",
    "identity",
    {
      semantic: "rate",
      changeType: "basis-points",
      provider: "U.S. Census Bureau",
      sourceFamily: "Census Housing Vacancies and Homeownership",
      methodology:
        "Quarterly homeownership rate for the United States; distinct from housing starts, permits, and home-price indexes.",
      validationNote:
        "Validated coverage: 1965-01-01 through 2026-04-01 (246 numeric observations) on 2026-09-22.",
    },
  ],
  [
    "RRVRUSQ156N",
    "U.S. Rental Vacancy Rate",
    "Housing",
    "%",
    "quarterly",
    "identity",
    {
      semantic: "rate",
      changeType: "basis-points",
      provider: "U.S. Census Bureau",
      sourceFamily: "Census Housing Vacancies and Homeownership",
      methodology:
        "Quarterly rental vacancy rate for the United States; a market-tightness measure distinct from the existing price and construction series.",
      validationNote:
        "Validated coverage: 1956-01-01 through 2026-04-01 (282 numeric observations) on 2026-09-22.",
    },
  ],
  [
    "HOUST5F",
    "Housing Starts in Buildings with 5+ Units",
    "Housing",
    "thousands",
    "monthly",
    "identity",
    {
      semantic: "quantity",
      changeType: "percent",
      provider: "U.S. Census Bureau",
      sourceFamily: "Census New Residential Construction",
      methodology:
        "Monthly privately owned housing units started in buildings with five units or more; multi-family component kept separate from the existing total-starts series.",
      validationNote:
        "Validated coverage: 1959-01-01 through 2026-08-01 (812 numeric observations) on 2026-09-22.",
    },
  ],
  [
    "EVACANTUSQ176N",
    "U.S. Vacant Housing Units",
    "Housing",
    "thousands",
    "quarterly",
    "identity",
    {
      semantic: "quantity",
      changeType: "percent",
      provider: "U.S. Census Bureau",
      sourceFamily: "Census Housing Vacancies and Homeownership",
      methodology:
        "Quarterly estimate of vacant housing units in the United States, in thousands; this is an inventory count, not the rental vacancy rate.",
      validationNote:
        "Validated coverage: 2000-04-01 through 2026-04-01 (105 numeric observations) on 2026-09-22.",
    },
  ],
  [
    "NYGDPMKTPCDWLD",
    "World Gross Domestic Product",
    "International Growth",
    "current U.S. dollars",
    "annual",
    "identity",
    {
      semantic: "quantity",
      changeType: "percent",
      provider: "World Bank",
      sourceFamily: "World Development Indicators",
      methodology:
        "World GDP in current U.S. dollars; annual World Bank national-accounts aggregate, not a real or inflation-adjusted output measure.",
      validationNote:
        "Validated coverage: 1960-01-01 through 2025-01-01 (66 numeric observations) on 2026-09-22.",
      rightsNote:
        "World Bank WDI data are provided under World Bank data terms; retain indicator attribution and verify current license terms.",
    },
  ],
  [
    "CLVMNACSCAB1GQEA19",
    "Real GDP · Euro Area (19 Countries)",
    "International Growth",
    "millions chained 2010 euros",
    "quarterly",
    "identity",
    {
      semantic: "quantity",
      changeType: "percent",
      provider: "Eurostat",
      sourceFamily: "Eurostat National Accounts via FRED",
      methodology:
        "Seasonally adjusted real GDP for the euro area (19 countries), quarterly; the aggregate is retained as published and is not assembled from country series.",
      validationNote:
        "Validated coverage: 1995-01-01 through 2026-04-01 (126 numeric observations) on 2026-09-22.",
      rightsNote:
        "Eurostat data are redistributed through FRED; preserve Eurostat/FRED attribution and review current Eurostat terms before commercial reuse.",
    },
  ],
  [
    "CPIUKA",
    "Consumer Price Index · United Kingdom · Millennium Archive",
    "International Inflation",
    "index",
    "annual",
    "identity",
    {
      semantic: "index",
      changeType: "percent",
      provider: "Bank of England",
      sourceFamily: "Millennium of Macroeconomic Data (FRED release 389)",
      historyStatus: "archived",
      archiveReason:
        "The Bank of England Millennium dataset v3.1 ends in 2016; retain this long pre-modern inflation history only as an explicitly archived context series, not as a current UK CPI feed.",
      methodology:
        "Annual U.K. consumer price index, 2015=100, from the Bank of England Millennium historical dataset. No modern CPI observations are spliced onto this archive.",
      validationNote:
        "Validated coverage: 1209-01-01 through 2016-01-01 (808 numeric observations) on 2026-09-22.",
      rightsNote:
        "FRED mirrors the Bank of England release; cite both FRED and the Bank of England, review the current Millennium dataset terms, and do not assume commercial redistribution rights.",
    },
  ],
  [
    "CPIIUKA",
    "Consumer Price Inflation · United Kingdom · Millennium Archive",
    "International Inflation",
    "%",
    "annual",
    "identity",
    {
      semantic: "rate",
      changeType: "basis-points",
      provider: "Bank of England",
      sourceFamily: "Millennium of Macroeconomic Data (FRED release 389)",
      historyStatus: "archived",
      archiveReason:
        "The Bank of England Millennium dataset v3.1 ends in 2016; retain this long pre-modern inflation history only as an explicitly archived context series, not as a current UK inflation feed.",
      methodology:
        "Annual U.K. consumer price inflation rate from the Bank of England Millennium historical dataset. This is a published rate and is not reconstructed from the CPIUKA level series.",
      validationNote:
        "Validated coverage: 1210-01-01 through 2016-01-01 (807 numeric observations) on 2026-09-22.",
      rightsNote:
        "FRED mirrors the Bank of England release; cite both FRED and the Bank of England, review the current Millennium dataset terms, and do not assume commercial redistribution rights.",
    },
  ],
  [
    "BOERUKA",
    "Bank of England Policy Rate · Millennium Archive",
    "International Rates",
    "%",
    "annual",
    "identity",
    {
      semantic: "rate",
      changeType: "basis-points",
      provider: "Bank of England",
      sourceFamily: "Millennium of Macroeconomic Data (FRED release 389)",
      historyStatus: "archived",
      archiveReason:
        "The Bank of England Millennium dataset v3.1 ends in 2016; this historical policy-rate series is not a continuation of the modern Bank Rate feed.",
      methodology:
        "Annual Bank of England policy rate in percent, from the Millennium historical dataset; source conventions and historical regime changes are retained as published.",
      validationNote:
        "Validated coverage: 1694-01-01 through 2016-01-01 (323 numeric observations) on 2026-09-22.",
      rightsNote:
        "FRED mirrors the Bank of England release; cite both FRED and the Bank of England, review the current Millennium dataset terms, and do not assume commercial redistribution rights.",
    },
  ],
  [
    "RGDPMPUKA",
    "Real GDP at Market Prices · United Kingdom · Millennium Archive",
    "International Growth",
    "millions local currency",
    "annual",
    "identity",
    {
      semantic: "quantity",
      changeType: "percent",
      provider: "Bank of England",
      sourceFamily: "Millennium of Macroeconomic Data (FRED release 389)",
      historyStatus: "archived",
      archiveReason:
        "The Bank of England Millennium dataset v3.1 ends in 2016; retain this long-run U.K. output history separately from current OECD/IMF output series.",
      methodology:
        "Annual U.K. real GDP at market prices in millions of chained 2013 British pounds, from the Millennium historical dataset. No country-series splice is performed.",
      validationNote:
        "Validated coverage: 1700-01-01 through 2016-01-01 (317 numeric observations) on 2026-09-22.",
      rightsNote:
        "FRED mirrors the Bank of England release; cite both FRED and the Bank of England, review the current Millennium dataset terms, and do not assume commercial redistribution rights.",
    },
  ],
  [
    "LTCYUKA",
    "Consol Long-Term Bond Yield · United Kingdom · Millennium Archive",
    "International Rates",
    "%",
    "annual",
    "identity",
    {
      semantic: "rate",
      changeType: "basis-points",
      provider: "Bank of England",
      sourceFamily: "Millennium of Macroeconomic Data (FRED release 389)",
      historyStatus: "archived",
      archiveReason:
        "The Bank of England Millennium dataset v3.1 ends in 2016; this consol yield history is a historical benchmark, not a live sovereign curve observation.",
      methodology:
        "Annual U.K. consol (long-term bond) yield in percent from the Millennium historical dataset; historical instrument conventions are retained as published.",
      validationNote:
        "Validated coverage: 1703-01-01 through 2016-01-01 (314 numeric observations) on 2026-09-22.",
      rightsNote:
        "FRED mirrors the Bank of England release; cite both FRED and the Bank of England, review the current Millennium dataset terms, and do not assume commercial redistribution rights.",
    },
  ],
  [
    "GDPCA",
    "Real Gross Domestic Product · Annual Long History",
    "Growth",
    "billions",
    "annual",
    "identity",
    {
      semantic: "quantity",
      changeType: "percent",
      provider: "U.S. Bureau of Economic Analysis",
      sourceFamily: "National Income and Product Accounts",
      methodology:
        "Annual real GDP in billions of chained 2017 dollars, beginning in 1929. This is a separate annual source series and must not be spliced into the existing quarterly GDPC1 observations.",
      validationNote:
        "Validated coverage: 1929-01-01 through 2025-01-01 (97 numeric observations) on 2026-09-22.",
      rightsNote:
        "BEA data are public with attribution; revisions can alter the chain-dollar history.",
    },
  ],
  [
    "GNPCA",
    "Real Gross National Product · Annual Long History",
    "Growth",
    "billions",
    "annual",
    "identity",
    {
      semantic: "quantity",
      changeType: "percent",
      provider: "U.S. Bureau of Economic Analysis",
      sourceFamily: "National Income and Product Accounts",
      methodology:
        "Annual real gross national product in billions of chained 2017 dollars, beginning in 1929; GNP is not GDP and should remain separately labeled.",
      validationNote:
        "Validated coverage: 1929-01-01 through 2025-01-01 (97 numeric observations) on 2026-09-22.",
      rightsNote:
        "BEA data are public with attribution; revisions can alter the chain-dollar history.",
    },
  ],
  [
    "A191RL1A225NBEA",
    "Real GDP Growth · Annual Long History",
    "Growth",
    "%",
    "annual",
    "identity",
    {
      semantic: "rate",
      changeType: "basis-points",
      provider: "U.S. Bureau of Economic Analysis",
      sourceFamily: "National Income and Product Accounts",
      methodology:
        "Real GDP percent change from the preceding period, annual; this is a published growth-rate series, not a second reconstructed level series.",
      validationNote:
        "Validated coverage: 1930-01-01 through 2025-01-01 (96 numeric observations) on 2026-09-22.",
      rightsNote:
        "BEA data are public with attribution; revisions can alter the chain-dollar history and growth rates.",
    },
  ],
  [
    "M0892AUSM156SNBR",
    "U.S. Unemployment Rate · NBER Historical Archive",
    "Labor",
    "%",
    "monthly",
    "identity",
    {
      semantic: "rate",
      changeType: "basis-points",
      provider: "National Bureau of Economic Research Macrohistory Database",
      sourceFamily: "NBER Macrohistory Series",
      historyStatus: "archived",
      archiveReason:
        "The FRED/NBER series ends in June 1942 and is not a current release; retain it only for pre-1948 historical context and never present it as a live unemployment signal.",
      methodology:
        "Historical U.S. unemployment rate from the National Industrial Conference Board series published by G.H. Moore in Business Cycle Indicators; archival observations are kept separate from the modern BLS UNRATE definition.",
      validationNote:
        "Validated coverage: 1929-04-01 through 1942-06-01 (159 numeric observations) on 2026-09-22; no post-1942 observations are implied.",
      rightsNote:
        "NBER provides the historical data for scholarly use with citation to the original source; retain NBER/FRED attribution and review current terms before redistribution.",
    },
  ],
];
