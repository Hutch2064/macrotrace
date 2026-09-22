import { createHash } from "node:crypto";

export const spliceSpecs = [
  [
    "SPY",
    "HIST_SP500_TR",
    "U.S. large-cap",
    "Annual source S&P 500 total returns precede the ETF. Historical index composition, including the pre-1957 predecessor index, and fund implementation differ. The separate Shiller history reaches 1871 but uses monthly averages and is not spliced into month-end ETF returns.",
  ],
  [
    "VTI",
    "FF_US_MARKET",
    "U.S. total market",
    "CRSP-based research market coverage and rebalancing differ from VTI's historical benchmark indexes.",
  ],
  [
    "IWD",
    "FF_LARGE_VALUE",
    "U.S. large-cap value",
    "French big/high-book-to-market portfolio differs from Russell 1000 Value membership, weighting, and style definitions.",
  ],
  [
    "IWF",
    "FF_LARGE_GROWTH",
    "U.S. large-cap growth",
    "French big/low-book-to-market portfolio differs from Russell 1000 Growth membership, weighting, and style definitions.",
  ],
  [
    "IWN",
    "FF_SMALL_VALUE",
    "U.S. small-cap value",
    "French small/high-book-to-market portfolio differs from Russell 2000 Value membership, weighting, and size/style definitions.",
  ],
  [
    "IWO",
    "FF_SMALL_GROWTH",
    "U.S. small-cap growth",
    "French small/low-book-to-market portfolio differs from Russell 2000 Growth membership, weighting, and size/style definitions.",
  ],
  [
    "XLE",
    "FF_INDUSTRY_ENERGY",
    "U.S. energy",
    "French SIC-defined energy industry differs from Select Sector GICS membership and market-cap coverage.",
  ],
  [
    "XLV",
    "FF_INDUSTRY_HEALTH",
    "U.S. health care",
    "French SIC-defined health industry differs from Select Sector GICS membership and market-cap coverage.",
  ],
  [
    "XLU",
    "FF_INDUSTRY_UTILITIES",
    "U.S. utilities",
    "French SIC-defined utilities industry differs from Select Sector GICS membership and market-cap coverage.",
  ],
  [
    "XLK",
    "FF_INDUSTRY_HITECH",
    "U.S. technology",
    "French SIC-defined high-tech industry differs from Select Sector GICS membership and historical sector reclassifications.",
  ],
  [
    "EEM",
    "FF_EM_MARKET",
    "Emerging-market equities",
    "French emerging-market research coverage differs from MSCI Emerging Markets membership, withholding taxes, and fund implementation.",
  ],
  [
    "GLD",
    "HIST_GOLD",
    "Gold",
    "Annual source gold-price returns exclude GLD's expenses and implementation. This annual proxy is not daily gold history or an ETF backtest before inception.",
  ],
];

export function completedPeriodCloses(observations, frequency, asOf) {
  const current = asOf.slice(0, frequency === "annual" ? 4 : 7);
  const periods = new Map();
  for (const [date, value] of observations) {
    const key = date.slice(0, current.length);
    if (key >= current || !Number.isFinite(value) || value <= 0) continue;
    const end =
      frequency === "annual"
        ? `${key}-12-31`
        : new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5)), 0))
            .toISOString()
            .slice(0, 10);
    periods.set(end, [end, value]);
  }
  return [...periods.values()];
}

function overlapDiagnostics(proxy, actual, frequency) {
  const a = new Map(actual),
    p = new Map(proxy);
  const dates = actual.map(([date]) => date).filter((date) => p.has(date));
  const periodNumber = (date) =>
    Number(date.slice(0, 4)) * (frequency === "annual" ? 1 : 12) +
    (frequency === "annual" ? 0 : Number(date.slice(5, 7)));
  const pairs = dates.slice(1).flatMap((date, index) => {
    const prior = dates[index];
    return periodNumber(date) - periodNumber(prior) === 1
      ? [
          [
            Math.log(p.get(date) / p.get(prior)),
            Math.log(a.get(date) / a.get(prior)),
          ],
        ]
      : [];
  });
  if (pairs.length < (frequency === "annual" ? 10 : 36))
    throw new Error("Insufficient proxy overlap");
  const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
  const mx = mean(pairs.map(([x]) => x)),
    my = mean(pairs.map(([, y]) => y));
  const covariance = pairs.reduce(
    (sum, [x, y]) => sum + (x - mx) * (y - my),
    0,
  );
  const denominator = Math.sqrt(
    pairs.reduce((sum, [x]) => sum + (x - mx) ** 2, 0) *
      pairs.reduce((sum, [, y]) => sum + (y - my) ** 2, 0),
  );
  const differences = pairs.map(([x, y]) => x - y),
    md = mean(differences);
  return {
    start: dates[0],
    end: dates.at(-1),
    pairedReturns: pairs.length,
    correlation: denominator ? covariance / denominator : null,
    annualizedTrackingDifferenceVolatility:
      100 *
      Math.sqrt(
        (differences.reduce((sum, d) => sum + (d - md) ** 2, 0) /
          (pairs.length - 1)) *
          (frequency === "annual" ? 1 : 12),
      ),
  };
}

function assertContiguous(points, frequency) {
  const period = (date) =>
    Number(date.slice(0, 4)) * (frequency === "annual" ? 1 : 12) +
    (frequency === "annual" ? 0 : Number(date.slice(5, 7)));
  for (let index = 1; index < points.length; index++)
    if (period(points[index][0]) - period(points[index - 1][0]) !== 1)
      throw new Error(
        `Missing or duplicated ${frequency} period at ${points[index][0]}`,
      );
}

export function spliceHistory(proxy, security, asOf, label, caveat) {
  if (!proxy || !security || security.valueType !== "adjusted_close")
    throw new Error("Proxy splice requires source and adjusted-close security");
  const frequency = proxy.frequency;
  if (!["monthly", "annual"].includes(frequency))
    throw new Error("Unsupported splice frequency");
  const actual = completedPeriodCloses(security.observations, frequency, asOf);
  const proxyByDate = new Map(proxy.observations);
  const anchor = actual.find(([date]) => proxyByDate.has(date));
  if (!anchor || proxy.observations[0][0] >= anchor[0])
    throw new Error("No older overlapping proxy history");
  const before = proxy.observations.filter(([date]) => date <= anchor[0]);
  assertContiguous(before, frequency);
  assertContiguous(
    actual.filter(([date]) => date >= anchor[0]),
    frequency,
  );
  if (before.some(([, value]) => !Number.isFinite(value) || value <= 0))
    throw new Error("Non-positive proxy value");
  const base = before[0][1],
    anchorIndex = (proxyByDate.get(anchor[0]) / base) * 100;
  const observations = [
    ...before.map(([date, value]) => [date, (value / base) * 100]),
    ...actual
      .filter(([date]) => date > anchor[0])
      .map(([date, value]) => [date, (anchorIndex * value) / anchor[1]]),
  ];
  const overlap = overlapDiagnostics(proxy.observations, actual, frequency);
  return {
    id: `${security.id}_SIM`,
    name: `${label} · ${security.id} extended proxy (SIM)`,
    category: "Extended ETF Proxies",
    frequency,
    kind: "market",
    unit: "simulated index",
    historyType: "proxy_splice",
    assetClass: security.assetClass || "equity",
    changeType: "percent",
    source: `${proxy.source} + Yahoo Finance`,
    sourceFamily: "Public-source / ETF proxy splice",
    sourceUrl: proxy.sourceUrl,
    sourceFile: proxy.sourceFile,
    sourceColumn: proxy.sourceColumn,
    sourceHash: createHash("sha256")
      .update(JSON.stringify({ proxy: proxy.sourceHash, actual, anchor }))
      .digest("hex"),
    sourceAsOf: observations.at(-1)[0],
    checkedAt: asOf,
    dataRole: "simulated_proxy_index",
    dividendTreatment:
      "Source-defined proxy returns before splice; Yahoo adjusted-close returns afterward",
    methodology: `Index starts at 100. Public proxy returns are retained through ${anchor[0]}; thereafter index(t) = index(anchor) × adjustedClose(t) / adjustedClose(anchor). Only completed ${frequency === "annual" ? "calendar years" : "calendar months"} are used; each ETF value is the last available trading close in that period. Missing periods are rejected; no forward filling, blending, leverage, or interpolation. Pre-inception values are proxy research results, not actual ${security.id} returns. No hypothetical ETF fee is deducted from proxy prehistory; subsequent adjusted-close returns reflect fund implementation and expenses indirectly, with no separate fee model. ${caveat}`,
    availabilityNote: `SIM: public proxy through ${anchor[0]}; actual ${security.id} adjusted-close changes thereafter. ${frequency === "annual" ? "Annual" : "Monthly"} history; open the unmodified ${security.id} series for current daily prices.`,
    rightsNote: `${proxy.rightsNote || "Public research observations retain the original provider's terms and attribution; no blanket redistribution license is granted."} Yahoo Finance supplies the later adjusted-close segment and retains its applicable provider terms.`,
    splice: {
      proxyId: proxy.id,
      securityId: security.id,
      anchorDate: anchor[0],
      securitySourceUrl: security.sourceUrl,
      securitySourceHash: createHash("sha256")
        .update(JSON.stringify(security.observations))
        .digest("hex"),
      securityValueType: security.valueType,
      securitySourceAsOf: security.observations.at(-1)[0],
      proxySourceHash: proxy.sourceHash,
      overlap,
    },
    ...(proxy.refreshStatus || security.refreshStatus
      ? { refreshStatus: "upstream-unavailable" }
      : {}),
    observations,
  };
}

export function buildSplicedHistory(series, asOf) {
  const byId = new Map(series.map((item) => [item.id, item]));
  return spliceSpecs.map(([ticker, proxy, label, caveat]) =>
    spliceHistory(byId.get(proxy), byId.get(ticker), asOf, label, caveat),
  );
}
