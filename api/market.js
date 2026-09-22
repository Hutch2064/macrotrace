import { createResponseCache } from "../src/api-cache.js";

const symbolPattern = /^[A-Z0-9.^=-]{1,12}$/;
const requestCache = createResponseCache({
  maxEntries: 64,
  maxBytes: 8 * 1024 * 1024,
  maxPending: 32,
  ttlMs: 60 * 1000,
  negativeTtlMs: 3 * 1000,
});

export default async function handler(request, response) {
  const symbol = String(request.query.symbol ?? "")
    .trim()
    .toUpperCase();
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET")
    return response.status(405).json({ error: "Method not allowed" });
  if (!symbolPattern.test(symbol))
    return response.status(400).json({ error: "Invalid symbol" });

  const result = await requestCache.getOrLoad(`market:${symbol}`, async () => {
    const period1 = Math.floor(Date.UTC(1900, 0, 1) / 1000);
    const period2 = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=history`;
    try {
      const upstream = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0 MacroTrace/1.0" },
      });
      if (!upstream.ok)
        return {
          status: upstream.status === 404 ? 404 : 502,
          body: { error: "Market data unavailable" },
          cacheable: false,
        };
      const payload = await upstream.json();
      const result = payload.chart.result?.[0];
      if (!result)
        return {
          status: 404,
          body: { error: "Ticker not found" },
          cacheable: false,
        };
      const prices =
        result.indicators.adjclose?.[0]?.adjclose ??
        result.indicators.quote?.[0]?.close ??
        [];
      const observations = result.timestamp.flatMap((timestamp, index) =>
        Number.isFinite(prices[index])
          ? [
              [
                new Date(timestamp * 1000).toISOString().slice(0, 10),
                Number(prices[index].toFixed(4)),
              ],
            ]
          : [],
      );
      if (!observations.length)
        return {
          status: 404,
          body: { error: "No usable price observations" },
          cacheable: false,
        };
      return {
        status: 200,
        cacheControl: "s-maxage=300, stale-while-revalidate=3600",
        body: {
          id: symbol,
          name: result.meta.longName || result.meta.shortName || symbol,
          category: "Custom ticker",
          unit:
            symbol === "^VIX"
              ? "%"
              : result.meta.instrumentType === "INDEX"
                ? "index"
                : result.meta.currency || "quoted units",
          frequency: "daily",
          kind: "market",
          checkedAt: new Date().toISOString(),
          valueType: result.indicators.adjclose?.[0]?.adjclose
            ? "adjusted_close"
            : "unadjusted_close",
          source: "Yahoo Finance",
          sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history`,
          observations,
        },
      };
    } catch {
      return {
        status: 502,
        body: { error: "Market data unavailable" },
        cacheable: false,
      };
    }
  });

  if (result.cacheControl)
    response.setHeader("Cache-Control", result.cacheControl);
  if (result.retryAfter) response.setHeader("Retry-After", result.retryAfter);
  return response.status(result.status).json(result.body);
}
