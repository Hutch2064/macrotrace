// Additional U.S. macroeconomic series selected from the current FRED catalog.
// Every identifier below was checked against the FRED series page and CSV
// endpoint on 2026-09-30.  Keep this catalog separate so the refresh pipeline
// can adopt it with an explicit integration decision.

const VERIFIED_AT = "2026-09-30";

function fred(
  id,
  name,
  category,
  unit,
  frequency,
  {
    semantic,
    changeType,
    provider,
    sourceFamily,
    methodology,
    nativeUnits,
    seasonalAdjustment,
    ...metadata
  },
) {
  return [
    id,
    name,
    category,
    unit,
    frequency,
    "identity",
    {
      semantic,
      changeType,
      provider,
      sourceFamily,
      methodology,
      nativeUnits,
      seasonalAdjustment,
      sourceUrl: `https://fred.stlouisfed.org/series/${id}`,
      validationNote:
        "FRED series metadata and a non-empty FRED CSV observation stream were verified on 2026-09-30; source values remain at native frequency.",
      lastVerifiedDate: VERIFIED_AT,
      ...metadata,
    },
  ];
}

const beaNipa = {
  provider: "U.S. Bureau of Economic Analysis",
  sourceFamily: "BEA National Income and Product Accounts",
};

const fedBoard = {
  provider: "Board of Governors of the Federal Reserve System (US)",
  sourceFamily: "Federal Reserve Industrial Production and Capacity Utilization",
};

const bls = {
  provider: "U.S. Bureau of Labor Statistics",
  sourceFamily: "BLS Employment Cost Index and Labor Statistics",
};

const sloos = {
  provider: "Board of Governors of the Federal Reserve System (US)",
  sourceFamily: "Federal Reserve Senior Loan Officer Opinion Survey",
};

const additionalFredSeries = [
  // GDP expenditure contributions. These are percentage-point contributions
  // at annual rates, not growth rates to be compounded again.
  fred(
    "DPCERY2Q224SBEA",
    "Contribution to real GDP growth: Personal consumption expenditures",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of personal consumption expenditures to the quarterly percent change in real GDP; the published contribution is already annualized and is not a level or a second growth calculation.",
    },
  ),
  fred(
    "A822RY2Q224SBEA",
    "Contribution to real GDP growth: Government consumption and investment",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of government consumption expenditures and gross investment to the quarterly percent change in real GDP; source contribution is annualized percentage points.",
    },
  ),
  fred(
    "A019RY2Q224SBEA",
    "Contribution to real GDP growth: Net exports",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of net exports of goods and services to the quarterly percent change in real GDP; a negative observation is a drag measured in percentage points.",
    },
  ),
  fred(
    "A006RY2Q224SBEA",
    "Contribution to real GDP growth: Gross private domestic investment",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of gross private domestic investment to the quarterly percent change in real GDP; the inventory and fixed-investment components remain separately measurable.",
    },
  ),
  fred(
    "A007RY2Q224SBEA",
    "Contribution to real GDP growth: Private fixed investment",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of gross private domestic investment fixed investment to quarterly real GDP growth, expressed in annualized percentage points.",
    },
  ),
  fred(
    "A008RY2Q224SBEA",
    "Contribution to real GDP growth: Nonresidential fixed investment",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of nonresidential fixed investment to quarterly real GDP growth, including its published equipment, structures, and intellectual-property subcomponents.",
    },
  ),
  fred(
    "A009RY2Q224SBEA",
    "Contribution to real GDP growth: Nonresidential structures",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of nonresidential structures fixed investment to quarterly real GDP growth; signed source points are preserved.",
    },
  ),
  fred(
    "A011RY2Q224SBEA",
    "Contribution to real GDP growth: Residential fixed investment",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of residential fixed investment to quarterly real GDP growth; it is a signed percentage-point contribution, not a residential price or level series.",
    },
  ),
  fred(
    "A014RY2Q224SBEA",
    "Contribution to real GDP growth: Change in private inventories",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of the change in private inventories to quarterly real GDP growth; inventory swings are retained as signed annualized percentage points.",
    },
  ),
  fred(
    "A015RY2Q224SBEA",
    "Contribution to real GDP growth: Nonfarm inventories",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of the nonfarm change in private inventories to quarterly real GDP growth; signed source points are not converted into percent changes.",
    },
  ),
  fred(
    "A020RY2Q224SBEA",
    "Contribution to real GDP growth: Exports",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of exports of goods and services to quarterly real GDP growth; published annualized percentage points are preserved.",
    },
  ),
  fred(
    "A021RY2Q224SBEA",
    "Contribution to real GDP growth: Imports",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of imports of goods and services to quarterly real GDP growth; the source sign convention is retained because imports subtract from domestic output.",
    },
  ),
  fred(
    "A353RY2Q224SBEA",
    "Contribution to real GDP growth: Goods",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of goods output to quarterly real GDP growth; source contribution points are retained at the native annualized quarterly frequency.",
    },
  ),
  fred(
    "A341RY2Q224SBEA",
    "Contribution to real GDP growth: Services",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of services output to quarterly real GDP growth; source contribution points are retained at the native annualized quarterly frequency.",
    },
  ),
  fred(
    "DGDSRY2Q224SBEA",
    "Contribution to real GDP growth: PCE goods",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of personal consumption expenditures on goods to quarterly real GDP growth, with published annualized points preserved.",
    },
  ),
  fred(
    "DSERRY2Q224SBEA",
    "Contribution to real GDP growth: PCE services",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of personal consumption expenditures on services to quarterly real GDP growth, with published annualized points preserved.",
    },
  ),
  fred(
    "DDURRY2Q224SBEA",
    "Contribution to real GDP growth: PCE durable goods",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of durable goods personal consumption expenditures to quarterly real GDP growth; signed contribution points are not treated as level changes.",
    },
  ),
  fred(
    "DNDGRY2Q224SBEA",
    "Contribution to real GDP growth: PCE nondurable goods",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of nondurable goods personal consumption expenditures to quarterly real GDP growth; source contribution points are preserved.",
    },
  ),
  fred(
    "A823RY2Q224SBEA",
    "Contribution to real GDP growth: Federal government",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of federal government consumption expenditures and gross investment to quarterly real GDP growth.",
    },
  ),
  fred(
    "A824RY2Q224SBEA",
    "Contribution to real GDP growth: Federal national defense",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of federal national-defense consumption expenditures and gross investment to quarterly real GDP growth.",
    },
  ),
  fred(
    "B935RY2Q224SBEA",
    "Contribution to real GDP growth: Computers and peripherals",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of computers and peripheral equipment within nonresidential information-processing investment to quarterly real GDP growth.",
    },
  ),
  fred(
    "B985RY2Q224SBEA",
    "Contribution to real GDP growth: Software investment",
    "Growth",
    "percentage points",
    "quarterly",
    {
      ...beaNipa,
      semantic: "contribution",
      changeType: "points",
      nativeUnits: "Percentage Points at Annual Rate",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BEA contribution of software within nonresidential intellectual-property investment to quarterly real GDP growth.",
    },
  ),

  // Real disposable income, saving, and household-flow denominators.
  fred(
    "DSPIC96",
    "Real Disposable Personal Income",
    "Growth",
    "billions",
    "monthly",
    {
      ...beaNipa,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Billions of Chained 2017 Dollars, Seasonally Adjusted Annual Rate",
      seasonalAdjustment: "Seasonally adjusted annual rate",
      methodology:
        "BEA real disposable personal income at a monthly seasonally adjusted annual rate in chained 2017 dollars; do not splice into the quarterly real-DPI observations.",
    },
  ),
  fred(
    "A229RX0",
    "Real Disposable Personal Income per Capita",
    "Growth",
    "dollars",
    "monthly",
    {
      ...beaNipa,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Chained 2017 Dollars, Seasonally Adjusted Annual Rate",
      seasonalAdjustment: "Seasonally adjusted annual rate",
      methodology:
        "BEA real disposable personal income per capita in chained 2017 dollars at a monthly seasonally adjusted annual rate; population scaling is source-defined.",
    },
  ),
  fred(
    "PSAVERT",
    "Personal Saving Rate",
    "Growth",
    "%",
    "monthly",
    {
      ...beaNipa,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent, Seasonally Adjusted Annual Rate",
      seasonalAdjustment: "Seasonally adjusted annual rate",
      methodology:
        "BEA personal saving as a percentage of disposable personal income; it is a source rate, not a reconstructed ratio from the expanded catalog.",
    },
  ),
  fred(
    "A072RC1Q156SBEA",
    "Personal Saving as a Percent of Disposable Income",
    "Growth",
    "%",
    "quarterly",
    {
      ...beaNipa,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent, Seasonally Adjusted Annual Rate",
      seasonalAdjustment: "Seasonally adjusted annual rate",
      methodology:
        "BEA quarterly personal saving rate, retained separately from the monthly PSAVERT series at native frequency.",
    },
  ),
  fred(
    "PSAVE",
    "Personal Saving",
    "Growth",
    "billions",
    "quarterly",
    {
      ...beaNipa,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Billions of Dollars, Seasonally Adjusted Annual Rate",
      seasonalAdjustment: "Seasonally adjusted annual rate",
      methodology:
        "BEA personal saving flow in billions of dollars at a quarterly seasonally adjusted annual rate; the level is retained rather than inferred from PSAVERT.",
    },
  ),
  fred(
    "DPI",
    "Disposable Personal Income",
    "Growth",
    "billions",
    "quarterly",
    {
      ...beaNipa,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Billions of Dollars, Seasonally Adjusted Annual Rate",
      seasonalAdjustment: "Seasonally adjusted annual rate",
      methodology:
        "BEA nominal disposable personal income in billions of dollars at a quarterly seasonally adjusted annual rate.",
    },
  ),
  fred(
    "PINCOME",
    "Personal Income",
    "Growth",
    "billions",
    "quarterly",
    {
      ...beaNipa,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Billions of Dollars, Seasonally Adjusted Annual Rate",
      seasonalAdjustment: "Seasonally adjusted annual rate",
      methodology:
        "BEA personal income flow in billions of dollars at a quarterly seasonally adjusted annual rate, before disposable-income deductions.",
    },
  ),
  fred(
    "A792RC0Q052SBEA",
    "Personal Income per Capita",
    "Growth",
    "dollars",
    "quarterly",
    {
      ...beaNipa,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Dollars, Seasonally Adjusted Annual Rate",
      seasonalAdjustment: "Seasonally adjusted annual rate",
      methodology:
        "BEA nominal personal income per capita in dollars at a quarterly seasonally adjusted annual rate.",
    },
  ),

  // Capacity utilization: total, broad industry, and selected NAICS sectors.
  fred(
    "TCU",
    "Capacity Utilization: Total Index",
    "Growth",
    "%",
    "monthly",
    {
      ...fedBoard,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Federal Reserve capacity utilization rate across manufacturing, mining, and electric and gas utilities; this is an operating-rate measure, not an output level.",
    },
  ),
  fred(
    "MCUMFN",
    "Capacity Utilization: Manufacturing (NAICS)",
    "Growth",
    "%",
    "monthly",
    {
      ...fedBoard,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Federal Reserve manufacturing capacity utilization under the NAICS classification; source percent is retained at monthly frequency.",
    },
  ),
  fred(
    "CAPUTLG21S",
    "Capacity Utilization: Mining (NAICS 21)",
    "Growth",
    "%",
    "monthly",
    {
      ...fedBoard,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Federal Reserve mining capacity utilization rate for NAICS 21; it is a published sector operating rate.",
    },
  ),
  fred(
    "CAPUTLG2211A2S",
    "Capacity Utilization: Electric and Gas Utilities",
    "Growth",
    "%",
    "monthly",
    {
      ...fedBoard,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Federal Reserve capacity utilization for electric power generation, transmission, distribution, and natural-gas utilities.",
    },
  ),
  fred(
    "CAPUTLG311A2S",
    "Capacity Utilization: Food, Beverage, and Tobacco",
    "Growth",
    "%",
    "monthly",
    {
      ...fedBoard,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Federal Reserve capacity utilization for NAICS 311-312 food, beverage, and tobacco manufacturing.",
    },
  ),
  fred(
    "CAPUTLG324S",
    "Capacity Utilization: Petroleum and Coal Products",
    "Growth",
    "%",
    "monthly",
    {
      ...fedBoard,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Federal Reserve capacity utilization for NAICS 324 petroleum and coal products manufacturing.",
    },
  ),
  fred(
    "CAPUTLG325S",
    "Capacity Utilization: Chemical Manufacturing",
    "Growth",
    "%",
    "monthly",
    {
      ...fedBoard,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Federal Reserve capacity utilization for NAICS 325 chemical manufacturing.",
    },
  ),
  fred(
    "CAPUTLG331S",
    "Capacity Utilization: Primary Metal Manufacturing",
    "Growth",
    "%",
    "monthly",
    {
      ...fedBoard,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Federal Reserve capacity utilization for NAICS 331 primary-metal manufacturing.",
    },
  ),
  fred(
    "CAPUTLG333S",
    "Capacity Utilization: Machinery Manufacturing",
    "Growth",
    "%",
    "monthly",
    {
      ...fedBoard,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Federal Reserve capacity utilization for NAICS 333 machinery manufacturing.",
    },
  ),
  fred(
    "CAPUTLG334S",
    "Capacity Utilization: Computer and Electronic Products",
    "Growth",
    "%",
    "monthly",
    {
      ...fedBoard,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Federal Reserve capacity utilization for NAICS 334 computer and electronic product manufacturing.",
    },
  ),
  fred(
    "CAPUTLG3361T3S",
    "Capacity Utilization: Motor Vehicles and Parts",
    "Growth",
    "%",
    "monthly",
    {
      ...fedBoard,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Federal Reserve capacity utilization for NAICS 3361-3363 motor vehicles and parts manufacturing.",
    },
  ),

  // Employment cost and labor-market slack. ECI index bases and CPS/JOLTS
  // adjustment conventions are kept explicit rather than homogenized.
  fred(
    "ECIWAG",
    "Employment Cost Index: Private Wages and Salaries",
    "Labor",
    "index",
    "quarterly",
    {
      ...bls,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index Dec 2005=100, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS Employment Cost Index for private-industry wages and salaries, rebased to December 2005=100; source index is quarterly.",
    },
  ),
  fred(
    "ECIALLCIV",
    "Employment Cost Index: Total Compensation, All Civilian",
    "Labor",
    "index",
    "quarterly",
    {
      ...bls,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index Dec 2005=100, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS Employment Cost Index for total compensation of all civilian workers, including wages and employer benefit costs; index base is December 2005=100.",
    },
  ),
  fred(
    "ECICONWAG",
    "Employment Cost Index: Private Wages, Construction",
    "Labor",
    "index",
    "quarterly",
    {
      ...bls,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index Dec 2005=100, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS Employment Cost Index for private construction-industry wages and salaries, index base December 2005=100.",
    },
  ),
  fred(
    "ECIMANWAG",
    "Employment Cost Index: Private Wages, Manufacturing",
    "Labor",
    "index",
    "quarterly",
    {
      ...bls,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index Dec 2005=100, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS Employment Cost Index for private manufacturing wages and salaries, index base December 2005=100.",
    },
  ),
  fred(
    "ECIBEN",
    "Employment Cost Index: Private Benefits",
    "Labor",
    "index",
    "quarterly",
    {
      ...bls,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index Dec 2005=100, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS Employment Cost Index for private-industry benefit costs, rebased to December 2005=100.",
    },
  ),
  fred(
    "ECIGVTWAG",
    "Employment Cost Index: State and Local Government Wages",
    "Labor",
    "index",
    "quarterly",
    {
      ...bls,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index Dec 2005=100, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS Employment Cost Index for state and local government wages and salaries, index base December 2005=100.",
    },
  ),
  fred(
    "ECICOM",
    "Employment Cost Index: Private Compensation",
    "Labor",
    "index",
    "quarterly",
    {
      ...bls,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index Dec 2005=100, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS Employment Cost Index for private-industry total compensation, including wages and benefits; index base December 2005=100.",
    },
  ),
  fred(
    "ECICONCOM",
    "Employment Cost Index: Private Compensation, Construction",
    "Labor",
    "index",
    "quarterly",
    {
      ...bls,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index Dec 2005=100, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS Employment Cost Index for private construction total compensation, including wages and benefits; index base December 2005=100.",
    },
  ),
  fred(
    "ECIGVTCOM",
    "Employment Cost Index: State and Local Government Compensation",
    "Labor",
    "index",
    "quarterly",
    {
      ...bls,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index Dec 2005=100, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS Employment Cost Index for state and local government total compensation, index base December 2005=100.",
    },
  ),
  fred(
    "CIU1010000000000I",
    "Employment Cost Index: Total Compensation, All Civilian Workers",
    "Labor",
    "index",
    "quarterly",
    {
      ...bls,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index Dec 2005=100, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "BLS detailed Employment Cost Index total-compensation series for all civilian workers, all industries and occupations; index base December 2005=100.",
    },
  ),
  fred(
    "CIU2010000000000I",
    "Employment Cost Index: Private Total Compensation",
    "Labor",
    "index",
    "quarterly",
    {
      ...bls,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index Dec 2005=100, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "BLS detailed Employment Cost Index total compensation for private workers across all industries and occupations; the detailed source is not seasonally adjusted.",
    },
  ),
  fred(
    "CIU2020000000000I",
    "Employment Cost Index: Private Wages and Salaries",
    "Labor",
    "index",
    "quarterly",
    {
      ...bls,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index Dec 2005=100, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "BLS detailed Employment Cost Index wages and salaries for private workers across all industries and occupations; the detailed source is not seasonally adjusted.",
    },
  ),
  fred(
    "CIU2030000000000I",
    "Employment Cost Index: Private Benefits",
    "Labor",
    "index",
    "quarterly",
    {
      ...bls,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index Dec 2005=100, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "BLS detailed Employment Cost Index benefit costs for private workers across all industries and occupations; the detailed source is not seasonally adjusted.",
    },
  ),
  fred(
    "CIU2023000000000I",
    "Employment Cost Index: Private Manufacturing Wages",
    "Labor",
    "index",
    "quarterly",
    {
      ...bls,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index Dec 2005=100, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "BLS detailed Employment Cost Index wages and salaries for private manufacturing workers; the source index is not seasonally adjusted.",
    },
  ),
  fred(
    "CIU2012300000000I",
    "Employment Cost Index: Private Construction Compensation",
    "Labor",
    "index",
    "quarterly",
    {
      ...bls,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index Dec 2005=100, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "BLS detailed Employment Cost Index total compensation for private construction workers; the source index is not seasonally adjusted.",
    },
  ),
  fred(
    "CIU201520A000000I",
    "Employment Cost Index: Private Financial Activities Total Compensation",
    "Labor",
    "index",
    "quarterly",
    {
      ...bls,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index Dec 2005=100, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "BLS detailed Employment Cost Index total compensation for private financial-activities workers; the source index is not seasonally adjusted.",
    },
  ),
  fred(
    "U2RATE",
    "Unemployment Rate: Job Losers (U-2)",
    "Labor",
    "%",
    "monthly",
    {
      ...bls,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS U-2 alternative labor-underutilization rate for job losers and people who completed temporary jobs; it is distinct from the headline UNRATE.",
    },
  ),
  fred(
    "U4RATE",
    "Unemployment Rate: U-4 Including Discouraged Workers",
    "Labor",
    "%",
    "monthly",
    {
      ...bls,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS U-4 alternative labor-underutilization rate adding discouraged workers to unemployment; source rate is seasonally adjusted monthly.",
    },
  ),
  fred(
    "U5RATE",
    "Unemployment Rate: U-5 Including Marginally Attached Workers",
    "Labor",
    "%",
    "monthly",
    {
      ...bls,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS U-5 alternative labor-underutilization rate adding discouraged and other marginally attached workers; source rate is seasonally adjusted monthly.",
    },
  ),
  fred(
    "UEMPMED",
    "Median Weeks Unemployed",
    "Labor",
    "weeks",
    "monthly",
    {
      ...bls,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Weeks, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS median duration of unemployment in weeks from the Current Population Survey; a duration measure, not an unemployment rate.",
    },
  ),
  fred(
    "UEMPMEAN",
    "Average Weeks Unemployed",
    "Labor",
    "weeks",
    "monthly",
    {
      ...bls,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Weeks, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS average duration of unemployment in weeks from the Current Population Survey; source duration is seasonally adjusted monthly.",
    },
  ),
  fred(
    "UEMP27OV",
    "Unemployed 27 Weeks and Over",
    "Labor",
    "thousands",
    "monthly",
    {
      ...bls,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Thousands of Persons, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS number of unemployed people for 27 weeks and over, in thousands; the duration bucket is retained as a level separate from UEMPMED.",
    },
  ),
  fred(
    "LNS13025703",
    "Share of Unemployed 27 Weeks and Over",
    "Labor",
    "%",
    "monthly",
    {
      ...bls,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS share of total unemployed people who have been unemployed 27 weeks or more; source share is seasonally adjusted monthly.",
    },
  ),
  fred(
    "LNS12032194",
    "Part-Time Employment for Economic Reasons",
    "Labor",
    "thousands",
    "monthly",
    {
      ...bls,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Thousands of Persons, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS employment level of people working part-time for economic reasons; this is the U-6 slack component, not a total part-time employment count.",
    },
  ),
  fred(
    "LNS12032195",
    "Part-Time for Economic Reasons: Slack Work or Business Conditions",
    "Labor",
    "thousands",
    "monthly",
    {
      ...bls,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Thousands of Persons, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS part-time-for-economic-reasons employment attributable to slack work or business conditions, in thousands and seasonally adjusted.",
    },
  ),
  fred(
    "LNS12032196",
    "Part-Time for Economic Reasons: Could Only Find Part-Time Work",
    "Labor",
    "thousands",
    "monthly",
    {
      ...bls,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Thousands of Persons, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS part-time-for-economic-reasons employment attributable to only finding part-time work, in thousands and seasonally adjusted.",
    },
  ),
  fred(
    "LNS12300060",
    "Employment-Population Ratio: Prime Age 25-54",
    "Labor",
    "%",
    "monthly",
    {
      ...bls,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS employment-population ratio for prime-age people 25-54 from the Current Population Survey; source rate is seasonally adjusted monthly.",
    },
  ),
  fred(
    "TEMPHELPS",
    "Temporary Help Services Employment",
    "Labor",
    "thousands",
    "monthly",
    {
      ...bls,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Thousands of Persons, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS nonfarm payroll employment in temporary help services, in thousands and seasonally adjusted; it is an observed employment-demand indicator.",
    },
  ),
  fred(
    "JTSJOR",
    "Job Openings Rate: Total Nonfarm",
    "Labor",
    "%",
    "monthly",
    {
      ...bls,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Rate, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS JOLTS job-openings rate for total nonfarm establishments; rate is seasonally adjusted monthly and complements the existing job-openings level.",
    },
  ),
  fred(
    "JTSLDR",
    "Layoffs and Discharges Rate: Total Nonfarm",
    "Labor",
    "%",
    "monthly",
    {
      ...bls,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Rate, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS JOLTS layoffs-and-discharges rate for total nonfarm establishments; source rate is seasonally adjusted monthly.",
    },
  ),
  fred(
    "JTSOSR",
    "Other Separations Rate: Total Nonfarm",
    "Labor",
    "%",
    "monthly",
    {
      ...bls,
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Rate, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "BLS JOLTS other-separations rate for total nonfarm establishments; source rate is seasonally adjusted monthly.",
    },
  ),

  // Senior Loan Officer Opinion Survey: published net responses are signed
  // survey percentages, not probabilities or forecasts.
  fred(
    "DRTSCILM",
    "SLOOS: Banks Tightening C&I Standards, Large and Middle-Market Firms",
    "Credit",
    "%",
    "quarterly",
    {
      ...sloos,
      semantic: "rate",
      changeType: "points",
      nativeUnits: "Percent, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Net percentage of domestic banks reporting tighter commercial and industrial lending standards for large and middle-market firms in the Federal Reserve SLOOS.",
    },
  ),
  fred(
    "DRTSCIS",
    "SLOOS: Banks Tightening C&I Standards, Small Firms",
    "Credit",
    "%",
    "quarterly",
    {
      ...sloos,
      semantic: "rate",
      changeType: "points",
      nativeUnits: "Percent, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Net percentage of domestic banks reporting tighter commercial and industrial lending standards for small firms in the Federal Reserve SLOOS.",
    },
  ),
  fred(
    "DRSDCILM",
    "SLOOS: Stronger C&I Loan Demand, Large and Middle-Market Firms",
    "Credit",
    "%",
    "quarterly",
    {
      ...sloos,
      semantic: "rate",
      changeType: "points",
      nativeUnits: "Percent, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Net percentage of domestic banks reporting stronger commercial and industrial loan demand from large and middle-market firms in the Federal Reserve SLOOS.",
    },
  ),
  fred(
    "DRSDCIS",
    "SLOOS: Stronger C&I Loan Demand, Small Firms",
    "Credit",
    "%",
    "quarterly",
    {
      ...sloos,
      semantic: "rate",
      changeType: "points",
      nativeUnits: "Percent, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Net percentage of domestic banks reporting stronger commercial and industrial loan demand from small firms in the Federal Reserve SLOOS.",
    },
  ),
  fred(
    "DRTSCLCC",
    "SLOOS: Banks Tightening Credit Card Standards",
    "Credit",
    "%",
    "quarterly",
    {
      ...sloos,
      semantic: "rate",
      changeType: "points",
      nativeUnits: "Percent, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Net percentage of domestic banks reporting tighter standards for credit-card loans in the Federal Reserve SLOOS.",
    },
  ),
  fred(
    "STDSAUTO",
    "SLOOS: Banks Tightening Auto-Loan Standards",
    "Credit",
    "%",
    "quarterly",
    {
      ...sloos,
      semantic: "rate",
      changeType: "points",
      nativeUnits: "Percent, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Net percentage of domestic banks reporting tighter standards for auto loans in the Federal Reserve SLOOS.",
    },
  ),
  fred(
    "STDSOTHCONS",
    "SLOOS: Banks Tightening Other Consumer-Loan Standards",
    "Credit",
    "%",
    "quarterly",
    {
      ...sloos,
      semantic: "rate",
      changeType: "points",
      nativeUnits: "Percent, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Net percentage of domestic banks reporting tighter standards for consumer loans excluding credit-card and auto loans in the Federal Reserve SLOOS.",
    },
  ),
  fred(
    "DEMOTHCONS",
    "SLOOS: Stronger Demand for Other Consumer Loans",
    "Credit",
    "%",
    "quarterly",
    {
      ...sloos,
      semantic: "rate",
      changeType: "points",
      nativeUnits: "Percent, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Net percentage of domestic banks reporting stronger demand for consumer loans excluding credit-card and auto loans in the Federal Reserve SLOOS.",
    },
  ),
  fred(
    "SUBLPDRCSN",
    "SLOOS: Tightening CRE Standards, Nonfarm Nonresidential",
    "Credit",
    "%",
    "quarterly",
    {
      ...sloos,
      semantic: "rate",
      changeType: "points",
      nativeUnits: "Percent, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Net percentage of domestic banks tightening standards for commercial real-estate loans secured by nonfarm nonresidential structures; current SLOOS series.",
    },
  ),
  fred(
    "SUBLPDRCSM",
    "SLOOS: Tightening CRE Standards, Multifamily",
    "Credit",
    "%",
    "quarterly",
    {
      ...sloos,
      semantic: "rate",
      changeType: "points",
      nativeUnits: "Percent, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Net percentage of domestic banks tightening standards for commercial real-estate loans secured by multifamily residential structures; current SLOOS series.",
    },
  ),
  fred(
    "SUBLPDRCSC",
    "SLOOS: Tightening CRE Standards, Construction and Land Development",
    "Credit",
    "%",
    "quarterly",
    {
      ...sloos,
      semantic: "rate",
      changeType: "points",
      nativeUnits: "Percent, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Net percentage of domestic banks tightening commercial real-estate standards for construction and land-development loans; current SLOOS series.",
    },
  ),
  fred(
    "SUBLPDRCDN",
    "SLOOS: Stronger CRE Demand, Nonfarm Nonresidential",
    "Credit",
    "%",
    "quarterly",
    {
      ...sloos,
      semantic: "rate",
      changeType: "points",
      nativeUnits: "Percent, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Net percentage of domestic banks reporting stronger demand for commercial real-estate loans secured by nonfarm nonresidential structures; current SLOOS series.",
    },
  ),
  fred(
    "SUBLPDRCDM",
    "SLOOS: Stronger CRE Demand, Multifamily",
    "Credit",
    "%",
    "quarterly",
    {
      ...sloos,
      semantic: "rate",
      changeType: "points",
      nativeUnits: "Percent, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Net percentage of domestic banks reporting stronger demand for commercial real-estate loans secured by multifamily residential structures; current SLOOS series.",
    },
  ),
  fred(
    "SUBLPDRCDC",
    "SLOOS: Stronger CRE Demand, Construction and Land Development",
    "Credit",
    "%",
    "quarterly",
    {
      ...sloos,
      semantic: "rate",
      changeType: "points",
      nativeUnits: "Percent, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Net percentage of domestic banks reporting stronger demand for commercial real-estate loans for construction and land development; current SLOOS series.",
    },
  ),

  // Federal receipts, outlays, balances, and interest burden. Signed fiscal
  // balances use native-point changes, not percentage changes.
  fred(
    "FGRECPT",
    "Federal Government Current Receipts",
    "Fiscal",
    "billions",
    "quarterly",
    {
      ...beaNipa,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Billions of Dollars, Seasonally Adjusted Annual Rate",
      seasonalAdjustment: "Seasonally adjusted annual rate",
      methodology:
        "BEA federal-government current receipts in billions of dollars at a quarterly seasonally adjusted annual rate.",
    },
  ),
  fred(
    "FGEXPND",
    "Federal Government Current Expenditures",
    "Fiscal",
    "billions",
    "quarterly",
    {
      ...beaNipa,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Billions of Dollars, Seasonally Adjusted Annual Rate",
      seasonalAdjustment: "Seasonally adjusted annual rate",
      methodology:
        "BEA federal-government current expenditures in billions of dollars at a quarterly seasonally adjusted annual rate.",
    },
  ),
  fred(
    "M318501Q027NBEA",
    "Federal Government Budget Surplus or Deficit",
    "Fiscal",
    "billions",
    "quarterly",
    {
      ...beaNipa,
      semantic: "signed_quantity",
      changeType: "points",
      nativeUnits: "Billions of Dollars, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "BEA federal-government budget surplus or deficit, with negative values denoting deficits; quarterly source balance is retained without percent transformation.",
    },
  ),
  fred(
    "A091RC1Q027SBEA",
    "Federal Government Current Expenditures: Interest Payments",
    "Fiscal",
    "billions",
    "quarterly",
    {
      ...beaNipa,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Billions of Dollars, Seasonally Adjusted Annual Rate",
      seasonalAdjustment: "Seasonally adjusted annual rate",
      methodology:
        "BEA federal-government current interest payments in billions of dollars at a quarterly seasonally adjusted annual rate.",
    },
  ),
  fred(
    "W006RC1Q027SBEA",
    "Federal Government Current Tax Receipts",
    "Fiscal",
    "billions",
    "quarterly",
    {
      ...beaNipa,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Billions of Dollars, Seasonally Adjusted Annual Rate",
      seasonalAdjustment: "Seasonally adjusted annual rate",
      methodology:
        "BEA federal-government current tax receipts in billions of dollars at a quarterly seasonally adjusted annual rate.",
    },
  ),
  fred(
    "M318011Q027NBEA",
    "Federal Government Budget Receipts",
    "Fiscal",
    "billions",
    "quarterly",
    {
      ...beaNipa,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Billions of Dollars, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "BEA federal-government budget receipts in billions of dollars, not seasonally adjusted quarterly source observations.",
    },
  ),
  fred(
    "M318191Q027NBEA",
    "Federal Government Budget Outlays",
    "Fiscal",
    "billions",
    "quarterly",
    {
      ...beaNipa,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Billions of Dollars, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "BEA federal-government budget outlays in billions of dollars, not seasonally adjusted quarterly source observations.",
    },
  ),
  fred(
    "MTSDS133FMS",
    "Federal Surplus or Deficit",
    "Fiscal",
    "millions",
    "monthly",
    {
      provider: "U.S. Department of the Treasury, Fiscal Service",
      sourceFamily: "Treasury Monthly Treasury Statement",
      semantic: "signed_quantity",
      changeType: "points",
      nativeUnits: "Millions of Dollars, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Treasury Fiscal Service monthly federal surplus or deficit; negative values denote deficits and are retained as signed dollar balances, not percent changes.",
    },
  ),
  fred(
    "FYOIGDA188S",
    "Federal Outlays: Interest as Percent of GDP",
    "Fiscal",
    "%",
    "annual",
    {
      provider: "U.S. Office of Management and Budget",
      sourceFamily: "OMB Historical Tables",
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent of GDP, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "OMB/FRED annual federal outlays for interest as a percent of GDP; the published ratio is retained and is not recomputed from nominal flows.",
    },
  ),
  fred(
    "FYONGDA188S",
    "Federal Net Outlays as Percent of GDP",
    "Fiscal",
    "%",
    "annual",
    {
      provider: "U.S. Office of Management and Budget",
      sourceFamily: "OMB Historical Tables",
      semantic: "rate",
      changeType: "basis-points",
      nativeUnits: "Percent of GDP, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "OMB/FRED annual federal net outlays as a percent of GDP; the published fiscal ratio is retained at annual frequency.",
    },
  ),

  // Current regional activity measures from Federal Reserve district sources;
  // future-expectations and nowcast series are intentionally excluded.
  fred(
    "CFNAIMA3",
    "Chicago Fed National Activity Index: Three-Month Average",
    "Growth",
    "index",
    "monthly",
    {
      provider: "Federal Reserve Bank of Chicago",
      sourceFamily: "Chicago Fed National Activity Index",
      semantic: "index",
      changeType: "points",
      nativeUnits: "Index, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Chicago Fed three-month moving average of the National Activity Index; zero denotes trend growth and signed index points are retained.",
    },
  ),
  fred(
    "CFNAIDIFF",
    "Chicago Fed National Activity Index: Diffusion Index",
    "Growth",
    "index",
    "monthly",
    {
      provider: "Federal Reserve Bank of Chicago",
      sourceFamily: "Chicago Fed National Activity Index",
      semantic: "index",
      changeType: "points",
      nativeUnits: "Index, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Chicago Fed diffusion version of the National Activity Index; the signed published index is retained rather than percent-transformed.",
    },
  ),
  fred(
    "EUANDH",
    "Chicago Fed National Activity Index: Employment, Unemployment and Hours",
    "Growth",
    "index",
    "monthly",
    {
      provider: "Federal Reserve Bank of Chicago",
      sourceFamily: "Chicago Fed National Activity Index",
      semantic: "index",
      changeType: "points",
      nativeUnits: "Index, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Chicago Fed National Activity Index employment, unemployment, and hours component; signed source index points are retained.",
    },
  ),
  fred(
    "PANDI",
    "Chicago Fed National Activity Index: Production and Income",
    "Growth",
    "index",
    "monthly",
    {
      provider: "Federal Reserve Bank of Chicago",
      sourceFamily: "Chicago Fed National Activity Index",
      semantic: "index",
      changeType: "points",
      nativeUnits: "Index, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Chicago Fed National Activity Index production-and-income component; signed source index points are retained.",
    },
  ),
  fred(
    "SOANDI",
    "Chicago Fed National Activity Index: Sales, Orders and Inventories",
    "Growth",
    "index",
    "monthly",
    {
      provider: "Federal Reserve Bank of Chicago",
      sourceFamily: "Chicago Fed National Activity Index",
      semantic: "index",
      changeType: "points",
      nativeUnits: "Index, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Chicago Fed National Activity Index sales, orders, and inventories component; signed source index points are retained.",
    },
  ),
  fred(
    "CANDH",
    "Chicago Fed National Activity Index: Personal Consumption and Housing",
    "Growth",
    "index",
    "monthly",
    {
      provider: "Federal Reserve Bank of Chicago",
      sourceFamily: "Chicago Fed National Activity Index",
      semantic: "index",
      changeType: "points",
      nativeUnits: "Index, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "Chicago Fed National Activity Index personal-consumption-and-housing component; signed source index points are retained.",
    },
  ),
  fred(
    "GACDFSA066MSFRBPHI",
    "Philadelphia Fed Current General Activity",
    "Growth",
    "index",
    "monthly",
    {
      provider: "Federal Reserve Bank of Philadelphia",
      sourceFamily: "Philadelphia Fed Manufacturing Business Outlook Survey",
      semantic: "index",
      changeType: "points",
      nativeUnits: "Diffusion Index, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Philadelphia Fed current general-activity diffusion index for the district manufacturing survey; current responses are retained and future-expectations series are not substituted.",
    },
  ),
  fred(
    "BACDINA066MNFRBNY",
    "New York Fed Current Business Activity",
    "Growth",
    "index",
    "monthly",
    {
      provider: "Federal Reserve Bank of New York",
      sourceFamily: "Empire State Manufacturing Survey",
      semantic: "index",
      changeType: "points",
      nativeUnits: "Diffusion Index, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "New York Fed current business-activity diffusion index from the Empire State Manufacturing Survey; source current conditions are retained.",
    },
  ),
  fred(
    "BACTSAMFRBDAL",
    "Dallas Fed Current General Business Activity",
    "Growth",
    "index",
    "monthly",
    {
      provider: "Federal Reserve Bank of Dallas",
      sourceFamily: "Texas Manufacturing Outlook Survey",
      semantic: "index",
      changeType: "points",
      nativeUnits: "Diffusion Index, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Dallas Fed current general-business-activity diffusion index for Texas; source current conditions are retained without adding future expectations.",
    },
  ),
  fred(
    "MEIM683SFRBCHI",
    "Chicago Fed Midwest Economy Index",
    "Growth",
    "index",
    "monthly",
    {
      provider: "Federal Reserve Bank of Chicago",
      sourceFamily: "Chicago Fed Midwest Economy Index",
      semantic: "index",
      changeType: "points",
      nativeUnits: "Index, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Chicago Fed Midwest Economy Index summarizing current Midwest economic conditions; signed index points are retained.",
    },
  ),
  fred(
    "FRBKCLMCILA",
    "Kansas City Fed Labor Market Conditions: Level of Activity",
    "Labor",
    "index",
    "monthly",
    {
      provider: "Federal Reserve Bank of Kansas City",
      sourceFamily: "Kansas City Fed Labor Market Conditions Index",
      semantic: "index",
      changeType: "points",
      nativeUnits: "Index, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Kansas City Fed labor-market conditions level-of-activity indicator; current published index values are retained without the separate momentum indicator.",
    },
  ),

  // Energy production, utility activity, and petroleum-product inventories.
  // Physical EIA series with a one-month forecast tail are intentionally not
  // used; the retained series are observed Fed, Census, and BEA indicators.
  fred(
    "IPG211S",
    "Industrial Production: Oil and Gas Extraction",
    "Growth",
    "index",
    "monthly",
    {
      ...fedBoard,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index 2017=100, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Federal Reserve industrial-production index for NAICS 211 oil and gas extraction, a current quantity/activity proxy at monthly frequency.",
    },
  ),
  fred(
    "IPG21112S",
    "Industrial Production: Crude Oil",
    "Growth",
    "index",
    "monthly",
    {
      ...fedBoard,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index 2017=100, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Federal Reserve industrial-production index for NAICS 21112 crude-oil extraction, retained as a published monthly activity index.",
    },
  ),
  fred(
    "IPG21113S",
    "Industrial Production: Natural Gas and Natural Gas Liquids",
    "Growth",
    "index",
    "monthly",
    {
      ...fedBoard,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index 2017=100, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Federal Reserve industrial-production index for NAICS 21113 natural gas and natural-gas liquids, retained at native monthly frequency.",
    },
  ),
  fred(
    "IPUTIL",
    "Industrial Production: Electric and Gas Utilities",
    "Growth",
    "index",
    "monthly",
    {
      ...fedBoard,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index 2017=100, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Federal Reserve industrial-production index for electric and gas utilities, retained as an observed monthly activity series.",
    },
  ),
  fred(
    "IPG2211S",
    "Industrial Production: Electric Power Utilities",
    "Growth",
    "index",
    "monthly",
    {
      ...fedBoard,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index 2017=100, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Federal Reserve industrial-production index for NAICS 2211 electric power generation, transmission, and distribution.",
    },
  ),
  fred(
    "IPG2212S",
    "Industrial Production: Natural Gas Distribution",
    "Growth",
    "index",
    "monthly",
    {
      ...fedBoard,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index 2017=100, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Federal Reserve industrial-production index for NAICS 2212 natural-gas distribution.",
    },
  ),
  fred(
    "IPG324S",
    "Industrial Production: Petroleum and Coal Products",
    "Growth",
    "index",
    "monthly",
    {
      ...fedBoard,
      semantic: "index",
      changeType: "percent",
      nativeUnits: "Index 2017=100, Seasonally Adjusted",
      seasonalAdjustment: "Seasonally adjusted",
      methodology:
        "Federal Reserve industrial-production index for NAICS 324 petroleum and coal products manufacturing.",
    },
  ),
  fred(
    "A24STI",
    "Manufacturers' Total Inventories: Petroleum and Coal Products",
    "Growth",
    "millions",
    "monthly",
    {
      provider: "U.S. Census Bureau",
      sourceFamily: "Census Manufacturer's Shipments, Inventories, and Orders Survey",
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Millions of Dollars, Seasonally Adjusted, End of Period",
      seasonalAdjustment: "Seasonally adjusted, end of period",
      methodology:
        "Census M3 survey total manufacturer inventories for petroleum and coal products, in millions of dollars at month end; this is an inventory value, not a physical barrel count.",
    },
  ),
  fred(
    "A24SFI",
    "Manufacturers' Finished Goods Inventories: Petroleum and Coal Products",
    "Growth",
    "millions",
    "monthly",
    {
      provider: "U.S. Census Bureau",
      sourceFamily: "Census Manufacturer's Shipments, Inventories, and Orders Survey",
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Millions of Dollars, Seasonally Adjusted, End of Period",
      seasonalAdjustment: "Seasonally adjusted, end of period",
      methodology:
        "Census M3 finished-goods inventory value for petroleum and coal products, in millions of dollars at month end.",
    },
  ),
  fred(
    "A24SWI",
    "Manufacturers' Work-in-Process Inventories: Petroleum and Coal Products",
    "Growth",
    "millions",
    "monthly",
    {
      provider: "U.S. Census Bureau",
      sourceFamily: "Census Manufacturer's Shipments, Inventories, and Orders Survey",
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Millions of Dollars, Seasonally Adjusted, End of Period",
      seasonalAdjustment: "Seasonally adjusted, end of period",
      methodology:
        "Census M3 work-in-process inventory value for petroleum and coal products, in millions of dollars at month end.",
    },
  ),
  fred(
    "A24SMI",
    "Manufacturers' Materials and Supplies Inventories: Petroleum and Coal Products",
    "Growth",
    "millions",
    "monthly",
    {
      provider: "U.S. Census Bureau",
      sourceFamily: "Census Manufacturer's Shipments, Inventories, and Orders Survey",
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Millions of Dollars, Seasonally Adjusted, End of Period",
      seasonalAdjustment: "Seasonally adjusted, end of period",
      methodology:
        "Census M3 materials-and-supplies inventory value for petroleum and coal products, in millions of dollars at month end.",
    },
  ),
  fred(
    "A24ATI",
    "Manufacturers' Total Inventories: Petroleum Refineries",
    "Growth",
    "millions",
    "monthly",
    {
      provider: "U.S. Census Bureau",
      sourceFamily: "Census Manufacturer's Shipments, Inventories, and Orders Survey",
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Millions of Dollars, Seasonally Adjusted, End of Period",
      seasonalAdjustment: "Seasonally adjusted, end of period",
      methodology:
        "Census M3 total inventory value for petroleum refineries, in millions of dollars at month end.",
    },
  ),
  fred(
    "DGOERC1Q027SBEA",
    "PCE: Gasoline and Other Energy Goods",
    "Growth",
    "billions",
    "quarterly",
    {
      ...beaNipa,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Billions of Dollars, Seasonally Adjusted Annual Rate",
      seasonalAdjustment: "Seasonally adjusted annual rate",
      methodology:
        "BEA personal consumption expenditures on gasoline and other energy goods, in billions of dollars at a quarterly seasonally adjusted annual rate.",
    },
  ),
  fred(
    "DNRGRC1Q027SBEA",
    "PCE: Energy Goods and Services",
    "Growth",
    "billions",
    "quarterly",
    {
      ...beaNipa,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Billions of Dollars, Seasonally Adjusted Annual Rate",
      seasonalAdjustment: "Seasonally adjusted annual rate",
      methodology:
        "BEA personal consumption expenditures on energy goods and services, in billions of dollars at a quarterly seasonally adjusted annual rate.",
    },
  ),

  // Actual international accounts, excluding IMF projection feeds and
  // security-specific portfolio series.
  fred(
    "EXPGSC1",
    "Real Exports of Goods and Services",
    "Growth",
    "billions",
    "quarterly",
    {
      ...beaNipa,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Billions of Chained 2017 Dollars, Seasonally Adjusted Annual Rate",
      seasonalAdjustment: "Seasonally adjusted annual rate",
      methodology:
        "BEA real exports of goods and services in chained 2017 dollars at a quarterly seasonally adjusted annual rate.",
    },
  ),
  fred(
    "IMPGSC1",
    "Real Imports of Goods and Services",
    "Growth",
    "billions",
    "quarterly",
    {
      ...beaNipa,
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Billions of Chained 2017 Dollars, Seasonally Adjusted Annual Rate",
      seasonalAdjustment: "Seasonally adjusted annual rate",
      methodology:
        "BEA real imports of goods and services in chained 2017 dollars at a quarterly seasonally adjusted annual rate.",
    },
  ),
  fred(
    "NETEXC",
    "Real Net Exports of Goods and Services",
    "Growth",
    "billions",
    "quarterly",
    {
      ...beaNipa,
      semantic: "signed_quantity",
      changeType: "points",
      nativeUnits: "Billions of Chained 2017 Dollars, Seasonally Adjusted Annual Rate",
      seasonalAdjustment: "Seasonally adjusted annual rate",
      methodology:
        "BEA real net exports in chained 2017 dollars at a quarterly seasonally adjusted annual rate; the signed balance is displayed in native points rather than percent changes.",
    },
  ),
  fred(
    "IIPUSNETIQ",
    "U.S. Net International Investment Position",
    "Growth",
    "millions",
    "quarterly",
    {
      provider: "U.S. Bureau of Economic Analysis",
      sourceFamily: "BEA International Investment Position",
      semantic: "signed_quantity",
      changeType: "points",
      nativeUnits: "Millions of Dollars, Not Seasonally Adjusted, End of Period",
      seasonalAdjustment: "Not seasonally adjusted, end of period",
      methodology:
        "BEA quarter-end U.S. net international investment position; accumulated assets less liabilities are a signed balance level and are not percent-transformed.",
    },
  ),
  fred(
    "IIPNETINQ",
    "U.S. Net International Investment Position Excluding Derivatives",
    "Growth",
    "millions",
    "quarterly",
    {
      provider: "U.S. Bureau of Economic Analysis",
      sourceFamily: "BEA International Investment Position",
      semantic: "signed_quantity",
      changeType: "points",
      nativeUnits: "Millions of Dollars, Not Seasonally Adjusted, End of Period",
      seasonalAdjustment: "Not seasonally adjusted, end of period",
      methodology:
        "BEA quarter-end U.S. net international investment position excluding financial derivatives; signed accumulated net assets remain in native dollar points.",
    },
  ),
  fred(
    "IIPUSASSQ",
    "U.S. International Investment Position: Assets",
    "Growth",
    "millions",
    "quarterly",
    {
      provider: "U.S. Bureau of Economic Analysis",
      sourceFamily: "BEA International Investment Position",
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Millions of Dollars, Not Seasonally Adjusted, End of Period",
      seasonalAdjustment: "Not seasonally adjusted, end of period",
      methodology:
        "BEA quarter-end gross U.S. international assets; aggregate assets are retained without exposing disaggregated financial-instrument subcomponents.",
    },
  ),
  fred(
    "IIPUSLIAQ",
    "U.S. International Investment Position: Liabilities",
    "Growth",
    "millions",
    "quarterly",
    {
      provider: "U.S. Bureau of Economic Analysis",
      sourceFamily: "BEA International Investment Position",
      semantic: "quantity",
      changeType: "percent",
      nativeUnits: "Millions of Dollars, Not Seasonally Adjusted, End of Period",
      seasonalAdjustment: "Not seasonally adjusted, end of period",
      methodology:
        "BEA quarter-end gross U.S. international liabilities; aggregate liabilities are retained without exposing disaggregated financial-instrument subcomponents.",
    },
  ),
  fred(
    "B1265C1A027NBEA",
    "Balance on Current Account, International Transactions Accounts",
    "Growth",
    "billions",
    "annual",
    {
      ...beaNipa,
      semantic: "signed_quantity",
      changeType: "points",
      nativeUnits: "Billions of Dollars, Not Seasonally Adjusted",
      seasonalAdjustment: "Not seasonally adjusted",
      methodology:
        "BEA annual balance on the current account in the International Transactions Accounts; negative balances remain signed dollar points and are not percent-transformed.",
    },
  ),
];

export { additionalFredSeries };
