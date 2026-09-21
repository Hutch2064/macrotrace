export const presets = [
  {
    id: "macro",
    label: "Macro pulse",
    description: "Prices, jobs, growth, policy, housing, and stress",
    series: ["CPIAUCSL", "UNRATE", "PAYEMS", "INDPRO", "FEDFUNDS", "HOUST", "NFCI"],
    measure: "yoy",
  },
  {
    id: "sectors",
    label: "U.S. sectors",
    description: "Every S&P 500 sector ETF",
    symbols: ["XLC", "XLY", "XLP", "XLE", "XLF", "XLV", "XLI", "XLK", "XLB", "XLRE", "XLU"],
    measure: "indexed",
  },
  {
    id: "currencies",
    label: "Currencies",
    description: "Major currencies in consistent USD-per-unit terms",
    series: ["DEXUSAL", "DEXCAUS", "DEXSZUS", "DEXUSEU", "DEXUSUK", "DEXJPUS", "DEXUSNZ"],
    measure: "indexed",
  },
  {
    id: "commodities",
    label: "Commodities",
    description: "Energy, metals, and agriculture futures",
    symbols: ["CL=F", "NG=F", "GC=F", "SI=F", "HG=F", "ZC=F", "ZW=F", "ZS=F"],
    measure: "indexed",
  },
  {
    id: "labor",
    label: "Labor",
    description: "Employment, claims, openings, and sector payrolls",
    series: ["UNRATE", "PAYEMS", "ICSA", "JTSJOL", "USCONS", "MANEMP", "USINFO", "USFIRE", "USPBS", "USEHS", "USLAH"],
    measure: "yoy",
  },
  {
    id: "inflation",
    label: "Inflation",
    description: "Headline and core consumer-price gauges",
    series: ["CPIAUCSL", "CPILFESL", "PCEPI", "PCEPILFE"],
    measure: "yoy",
  },
  {
    id: "growth",
    label: "Growth",
    description: "Output, consumption, production, and retail demand",
    series: ["GDPC1", "PCECC96", "INDPRO", "RSAFS"],
    measure: "yoy",
  },
  {
    id: "rates",
    label: "Rates & curve",
    description: "Policy, Treasury yields, and curve slope",
    series: ["FEDFUNDS", "DGS2", "DGS10", "T10Y2Y"],
    measure: "level",
    changeMode: "basis-points",
  },
  {
    id: "housing",
    label: "Housing",
    description: "Construction starts and permits",
    series: ["HOUST", "PERMIT"],
    measure: "yoy",
  },
  {
    id: "conditions",
    label: "Financial conditions",
    description: "Liquidity, stress, money, and the dollar",
    series: ["NFCI", "STLFSI4", "M2SL", "DTWEXBGS"],
    measure: "level",
    changeMode: "points",
  },
  {
    id: "markets",
    label: "Global markets",
    description: "U.S., international, bonds, credit, and gold",
    symbols: ["SPY", "QQQ", "IWM", "EFA", "EEM", "TLT", "HYG", "GLD"],
    measure: "indexed",
  },
];

export function presetById(id) {
  return presets.find((preset) => preset.id === id);
}
