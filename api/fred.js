const idPattern = /^[A-Z0-9_-]{1,64}$/;

function parseCsv(text) {
  const [, ...rows] = text.trim().split(/\r?\n/);
  return rows.flatMap((row) => {
    const [date, raw] = row.split(",");
    const clean = raw?.trim();
    const value = Number(clean);
    return date && clean && clean !== "." && Number.isFinite(value) ? [[date, value]] : [];
  });
}

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed" });
  const id = String(request.query.id ?? "").trim().toUpperCase();
  const name = String(request.query.name ?? id).trim().slice(0, 180);
  if (!idPattern.test(id)) return response.status(400).json({ error: "Invalid FRED series" });
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}&cosd=1990-01-01`;
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0 MacroTrace/1.0" } });
    if (!upstream.ok) return response.status(upstream.status === 404 ? 404 : 502).json({ error: "FRED data unavailable" });
    const observations = parseCsv(await upstream.text());
    if (!observations.length) return response.status(404).json({ error: "FRED series not found" });
    response.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return response.status(200).json({ id, name, category: "FRED search", unit: "reported", frequency: "native", source: "Federal Reserve Bank of St. Louis (FRED)", sourceUrl: `https://fred.stlouisfed.org/series/${id}`, observations });
  } catch {
    return response.status(502).json({ error: "FRED data unavailable" });
  }
}
