const DEFAULT_MAX_ENTRIES = 64;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_PENDING = 32;
const DEFAULT_TTL_MS = 60 * 1000;
const DEFAULT_NEGATIVE_TTL_MS = 3 * 1000;

function byteLength(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Keep only bounded, unexpired response values in a warm serverless instance.
 * A pending load is shared by callers, but an expired value is never served as
 * a stale fallback. Loaders return the complete HTTP-shaped result and may set
 * cacheable=false for degraded provider responses.
 */
export function createResponseCache({
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxBytes = DEFAULT_MAX_BYTES,
  maxPending = DEFAULT_MAX_PENDING,
  ttlMs = DEFAULT_TTL_MS,
  negativeTtlMs = DEFAULT_NEGATIVE_TTL_MS,
} = {}) {
  const entries = new Map();
  const pending = new Map();
  let totalBytes = 0;

  function remove(key) {
    const entry = entries.get(key);
    if (!entry) return;
    totalBytes -= entry.bytes;
    entries.delete(key);
  }

  function pruneExpired(now = Date.now()) {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) remove(key);
    }
  }

  function read(key) {
    pruneExpired();
    const entry = entries.get(key);
    if (!entry) return undefined;
    entries.delete(key);
    entries.set(key, entry);
    return entry.value;
  }

  function write(key, value, ttl) {
    if (!ttl || ttl <= 0) return;
    const bytes = byteLength(value);
    if (!Number.isFinite(bytes) || bytes > maxBytes) return;
    remove(key);
    entries.set(key, { value, expiresAt: Date.now() + ttl, bytes });
    totalBytes += bytes;
    while (entries.size > maxEntries || totalBytes > maxBytes) {
      remove(entries.keys().next().value);
    }
  }

  async function getOrLoad(key, loader) {
    const cached = read(key);
    if (cached !== undefined) return cached;

    const existing = pending.get(key);
    if (existing) return existing;

    if (pending.size >= maxPending)
      return {
        status: 429,
        body: { error: "Too many concurrent requests; retry shortly" },
        cacheable: false,
        cacheTtlMs: 0,
        cacheControl: "no-store",
        retryAfter: "1",
      };

    const request = Promise.resolve()
      .then(loader)
      .then((value) => {
        const ttl =
          value?.cacheTtlMs ??
          (value?.cacheable === false ? negativeTtlMs : ttlMs);
        write(key, value, ttl);
        return value;
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }

  return { getOrLoad };
}
