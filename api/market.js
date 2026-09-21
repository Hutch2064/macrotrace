const symbolPattern = /^[A-Z0-9.^=-]{1,12}$/;

export default async function handler(request, response) {
  const symbol = String(request.query.symbol ?? "").trim().toUpperCase();
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed" });
  if (!symbolPattern.test(symbol)) return response.status(400).json({ error: "Invalid symbol" });

  const period1 = Math.floor(Date.UTC(1990, 0, 1) / 1000);
  const period2 = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=history`;
  try {
    const upstream = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 MacroTrace/1.0" } });
    if (!upstream.ok) return response.status(upstream.status === 404 ? 404 : 502).json({ error: "Market data unavailable" });
    const result = (await upstream.json()).chart.result?.[0];
    if (!result) return response.status(404).json({ error: "Ticker not found" });
    const prices = result.indicators.adjclose?.[0]?.adjclose ?? result.indicators.quote?.[0]?.close ?? [];
    const observations = result.timestamp.flatMap((timestamp, index) => Number.isFinite(prices[index]) ? [[new Date(timestamp * 1000).toISOString().slice(0, 10), Number(prices[index].toFixed(4))]] : []);
    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
    return response.status(200).json({
      id: symbol,
      name: result.meta.longName || result.meta.shortName || symbol,
      category: "Custom ticker",
      unit: result.meta.currency || "$",
      frequency: "daily",
      source: "Yahoo Finance",
      sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history`,
      observations,
    });
  } catch {
    return response.status(502).json({ error: "Market data unavailable" });
  }
}
