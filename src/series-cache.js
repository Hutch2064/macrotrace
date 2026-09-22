// Public provider data only. Bounded per-browser cache; never stores credentials.
const TTL = 6 * 60 * 60 * 1000;
const PREFIX = "macrotrace-series-v2:";
const pending = new Map();

export async function requestSeries(item, apiOrigin = "") {
  const key = `${PREFIX}${item.kind}:${item.id}`;
  try {
    const cached = JSON.parse(localStorage.getItem(key));
    if (cached?.expiresAt > Date.now()) return cached.series;
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
  if (pending.has(key)) return pending.get(key);
  const promise = (async () => {
    const path =
      item.kind === "fred"
        ? `/api/fred?id=${encodeURIComponent(item.id)}`
        : `/api/market?symbol=${encodeURIComponent(item.id)}`;
    const response = await fetch(`${apiOrigin}${path}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        `${item.name || item.id} is temporarily unavailable. Other series remain usable.`,
      );
    const series = await response.json();
    if (!series.observations?.length)
      throw new Error(`No observations for ${item.id}.`);
    try {
      const keys = Object.keys(localStorage).filter((entry) =>
        entry.startsWith(PREFIX),
      );
      if (keys.length >= 60 && !keys.includes(key))
        localStorage.removeItem(keys[0]);
      localStorage.setItem(
        key,
        JSON.stringify({ expiresAt: Date.now() + TTL, series }),
      );
    } catch {
      /* Cache is an optimization, never a requirement. */
    }
    return series;
  })();
  pending.set(key, promise);
  try {
    return await promise;
  } finally {
    pending.delete(key);
  }
}
