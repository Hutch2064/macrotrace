import { readFile } from "node:fs/promises";
import { join } from "node:path";

const cache = new Map();
const MAX_QUERY_LENGTH = 80;

function decode(value) {
  return String(value ?? "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

async function bundledResults(query) {
  const snapshot = JSON.parse(await readFile(join(process.cwd(), "public/data/snapshot.json"), "utf8"));
  const needle = query.toLowerCase();
  return snapshot.series
    .filter((series) => `${series.id} ${series.name} ${series.category}`.toLowerCase().includes(needle))
    .slice(0, 8)
    .map((series) => ({ id: series.id, name: series.name, kind: "fred", source: "FRED", bundled: true, meta: `${series.category} · ${series.frequency}` }));
}

async function yahooResults(query) {
  const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
  url.searchParams.set("q", query);
  url.searchParams.set("quotesCount", "8");
  url.searchParams.set("newsCount", "0");
  url.searchParams.set("listsCount", "0");
  url.searchParams.set("enableFuzzyQuery", "true");
  const upstream = await fetch(url, { headers: { accept: "application/json", "User-Agent": "Mozilla/5.0 MacroTrace/1.0" } });
  if (!upstream.ok) return [];
  const payload = await upstream.json();
  const allowed = new Set(["EQUITY", "ETF", "MUTUALFUND", "INDEX", "CURRENCY", "CRYPTOCURRENCY", "FUTURE"]);
  return (payload.quotes ?? []).flatMap((quote) => {
    const id = String(quote.symbol ?? "").toUpperCase();
    const type = String(quote.quoteType ?? "").toUpperCase();
    if (!id || !allowed.has(type)) return [];
    return [{ id, name: quote.longname || quote.shortname || id, kind: "market", source: "Yahoo Finance", meta: [type, quote.exchange].filter(Boolean).join(" · ") }];
  }).slice(0, 8);
}

async function fredResults(query) {
  const upstream = await fetch(`https://fred.stlouisfed.org/searchresults?st=${encodeURIComponent(query)}`, { headers: { "User-Agent": "Mozilla/5.0 MacroTrace/1.0" } });
  if (!upstream.ok) return [];
  const html = await upstream.text();
  const pattern = /<a href="\/series\/([A-Z0-9_-]+)" aria-label="([^"]+)" class="series-title[^>]*>[\s\S]*?<\/a>[\s\S]*?<span class="search-result-meta">([\s\S]*?)<\/span>/g;
  const results = [];
  for (const match of html.matchAll(pattern)) {
    const meta = decode(match[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    results.push({ id: match[1], name: decode(match[2]), kind: "fred", source: "FRED", bundled: false, meta });
    if (results.length === 8) break;
  }
  return results;
}

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed" });
  const query = String(request.query.q ?? "").trim();
  if (!query || query.length > MAX_QUERY_LENGTH) return response.status(200).json({ results: [] });
  const key = query.toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return response.status(200).json({ results: cached.results });
  const [bundled, yahoo, fred] = await Promise.allSettled([bundledResults(query), yahooResults(query), fredResults(query)]);
  const ordered = [...(bundled.value ?? []), ...(yahoo.value ?? []), ...(fred.value ?? [])];
  const seen = new Set();
  const results = ordered.filter((item) => !seen.has(`${item.kind}:${item.id}`) && seen.add(`${item.kind}:${item.id}`)).slice(0, 14);
  cache.set(key, { results, expiresAt: Date.now() + 15 * 60 * 1000 });
  response.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=86400");
  return response.status(200).json({ results });
}
