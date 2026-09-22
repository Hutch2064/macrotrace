import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createResponseCache } from "../src/api-cache.js";

const responseCache = createResponseCache({
  maxEntries: 128,
  maxBytes: 2 * 1024 * 1024,
  maxPending: 32,
  ttlMs: 5 * 60 * 1000,
  negativeTtlMs: 3 * 1000,
});
let catalogPromise;
const MAX_QUERY_LENGTH = 80;
const SUCCESS_CACHE_CONTROL = "s-maxage=900, stale-while-revalidate=86400";
const matchesSearch = (series, query) => {
  const text = `${series.id} ${series.name} ${series.category}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .every((token) => text.includes(token));
};

function decode(value) {
  return String(value ?? "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

async function bundledResults(query) {
  if (!catalogPromise) {
    catalogPromise = readFile(
      join(process.cwd(), "public/data/runtime/catalog.json"),
      "utf8",
    )
      .then(JSON.parse)
      .catch((error) => {
        catalogPromise = undefined;
        throw error;
      });
  }
  const catalog = await catalogPromise;
  return catalog.series
    .filter((series) => matchesSearch(series, query))
    .slice(0, 8)
    .map((series) => ({
      id: series.id,
      name: series.name,
      kind: series.kind === "market" ? "market" : "fred",
      source: series.source,
      bundled: true,
      meta: `${series.category} · ${series.frequency}`,
    }));
}

async function yahooResults(query) {
  const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
  url.searchParams.set("q", query);
  url.searchParams.set("quotesCount", "8");
  url.searchParams.set("newsCount", "0");
  url.searchParams.set("listsCount", "0");
  url.searchParams.set("enableFuzzyQuery", "true");
  const upstream = await fetch(url, {
    signal: AbortSignal.timeout(2500),
    headers: {
      accept: "application/json",
      "User-Agent": "Mozilla/5.0 MacroTrace/1.0",
    },
  });
  if (!upstream.ok) throw new Error("Yahoo search unavailable");
  const payload = await upstream.json();
  const allowed = new Set([
    "EQUITY",
    "ETF",
    "MUTUALFUND",
    "INDEX",
    "CURRENCY",
    "CRYPTOCURRENCY",
    "FUTURE",
  ]);
  return (payload.quotes ?? [])
    .flatMap((quote) => {
      const id = String(quote.symbol ?? "").toUpperCase();
      const type = String(quote.quoteType ?? "").toUpperCase();
      if (!id || !allowed.has(type)) return [];
      return [
        {
          id,
          name: quote.longname || quote.shortname || id,
          kind: "market",
          source: "Yahoo Finance",
          meta: [type, quote.exchange].filter(Boolean).join(" · "),
        },
      ];
    })
    .slice(0, 8);
}

async function fredResults(query) {
  const upstream = await fetch(
    `https://fred.stlouisfed.org/searchresults?st=${encodeURIComponent(query)}`,
    {
      signal: AbortSignal.timeout(2500),
      headers: { "User-Agent": "Mozilla/5.0 MacroTrace/1.0" },
    },
  );
  if (!upstream.ok) throw new Error("FRED search unavailable");
  const html = await upstream.text();
  const pattern =
    /<a href="\/series\/([A-Z0-9_-]+)" aria-label="([^"]+)" class="series-title[^>]*>[\s\S]*?<\/a>[\s\S]*?<span class="search-result-meta">([\s\S]*?)<\/span>/g;
  const results = [];
  for (const match of html.matchAll(pattern)) {
    const meta = decode(
      match[3]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );
    results.push({
      id: match[1],
      name: decode(match[2]),
      kind: "fred",
      source: "FRED",
      bundled: false,
      meta,
    });
    if (results.length === 8) break;
  }
  return results;
}

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET")
    return response.status(405).json({ error: "Method not allowed" });
  const query = String(request.query.q ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!query || query.length > MAX_QUERY_LENGTH)
    return response.status(200).json({ results: [] });
  const key = query.toLowerCase();

  const result = await responseCache.getOrLoad(`search:${key}`, async () => {
    const [bundled, yahoo, fred] = await Promise.allSettled([
      bundledResults(query),
      yahooResults(query),
      fredResults(query),
    ]);
    const ordered = [
      ...(bundled.value ?? []),
      ...(yahoo.value ?? []),
      ...(fred.value ?? []),
    ];
    const seen = new Set();
    const results = ordered
      .filter(
        (item) =>
          !seen.has(`${item.kind}:${item.id}`) &&
          seen.add(`${item.kind}:${item.id}`),
      )
      .slice(0, 14);
    if (yahoo.status === "rejected" || fred.status === "rejected")
      return {
        status: results.length ? 200 : 502,
        body: { results },
        cacheable: false,
        cacheTtlMs: 3 * 1000,
        cacheControl: "no-store",
      };
    return {
      status: 200,
      body: { results },
      cacheControl: SUCCESS_CACHE_CONTROL,
    };
  });

  if (result.cacheControl)
    response.setHeader("Cache-Control", result.cacheControl);
  if (result.retryAfter) response.setHeader("Retry-After", result.retryAfter);
  return response.status(result.status).json(result.body);
}
