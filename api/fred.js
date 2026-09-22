import { createResponseCache } from "../src/api-cache.js";

const idPattern = /^[A-Z0-9_-]{1,64}$/;
const requestCache = createResponseCache({
  maxEntries: 48,
  maxBytes: 8 * 1024 * 1024,
  maxPending: 32,
  ttlMs: 60 * 1000,
  negativeTtlMs: 3 * 1000,
});

function parseCsv(text) {
  const [, ...rows] = text.trim().split(/\r?\n/);
  return rows.flatMap((row) => {
    const [date, raw] = row.split(",");
    const clean = raw?.trim();
    const value = Number(clean);
    return date && clean && clean !== "." && Number.isFinite(value)
      ? [[date, value]]
      : [];
  });
}

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET")
    return response.status(405).json({ error: "Method not allowed" });
  const id = String(request.query.id ?? "")
    .trim()
    .toUpperCase();
  if (!idPattern.test(id))
    return response.status(400).json({ error: "Invalid FRED series" });

  const result = await requestCache.getOrLoad(`fred:${id}`, async () => {
    const sourceUrl = `https://fred.stlouisfed.org/series/${id}`;
    const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}&cosd=1800-01-01`;
    try {
      const [upstream, metadata] = await Promise.all(
        [url, sourceUrl].map((address) =>
          fetch(address, {
            signal: AbortSignal.timeout(8000),
            headers: { "User-Agent": "Mozilla/5.0 MacroTrace/1.0" },
          }),
        ),
      );
      if (!upstream.ok)
        return {
          status: upstream.status === 404 ? 404 : 502,
          body: { error: "FRED data unavailable" },
          cacheable: false,
        };
      const observations = parseCsv(await upstream.text());
      if (!observations.length)
        return {
          status: 404,
          body: { error: "FRED series not found" },
          cacheable: false,
        };
      const html = metadata.ok ? await metadata.text() : "";
      const clean = (value) =>
        String(value ?? "")
          .replace(/<[^>]+>/g, "")
          .replaceAll("&amp;", "&")
          .replaceAll("&#39;", "'")
          .replaceAll("&quot;", '"')
          .trim();
      const field = (name) =>
        clean(
          html.match(new RegExp(`class="${name}">([\\s\\S]*?)<\\/span>`))?.[1],
        );
      const rawUnit = field("series-meta-value-units");
      const unit = rawUnit === "Percent" ? "%" : rawUnit || "reported units";
      const nativeFrequency = field(
        "series-meta-value-frequency",
      ).toLowerCase();
      const frequency =
        ["daily", "weekly", "monthly", "quarterly", "annual"].find((value) =>
          nativeFrequency.startsWith(value),
        ) || "unknown";
      const name =
        clean(html.match(/<title>([\s\S]*?)<\/title>/)?.[1])
          .replace(/\s*\|\s*FRED.*$/, "")
          .replace(new RegExp(`\\s*\\(${id}\\)$`), "") || id;
      if (!rawUnit || frequency === "unknown")
        return {
          status: 502,
          body: {
            error:
              "FRED metadata unavailable; retry shortly to avoid unverified units.",
          },
          cacheable: false,
        };
      return {
        status: 200,
        cacheControl: "s-maxage=3600, stale-while-revalidate=86400",
        body: {
          id,
          name,
          category: "FRED search",
          unit,
          frequency,
          source: "Federal Reserve Bank of St. Louis (FRED)",
          sourceUrl,
          checkedAt: new Date().toISOString(),
          observations,
        },
      };
    } catch {
      return {
        status: 502,
        body: { error: "FRED data unavailable" },
        cacheable: false,
      };
    }
  });

  if (result.cacheControl)
    response.setHeader("Cache-Control", result.cacheControl);
  if (result.retryAfter) response.setHeader("Retry-After", result.retryAfter);
  return response.status(result.status).json(result.body);
}
