// All observations remain available, but only requested histories cross the wire.
const pending = new Map();
const hydrated = new Set();
const MAX_BYTES = 64 * 1024 * 1024;
let database;

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return (database ??= new Promise((resolve) => {
    const request = indexedDB.open("macrotrace-histories-v1", 1);
    let settled = false;
    const finish = (db) => {
      if (settled) return db?.close();
      settled = true;
      clearTimeout(timer);
      resolve(db);
    };
    const timer = setTimeout(() => finish(null), 1500);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("histories", { keyPath: "hash" });
      request.result.createObjectStore("access", { keyPath: "hash" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      finish(request.result);
    };
    request.onerror = request.onblocked = () => {
      finish(null);
    };
  }));
}

async function stored(hash) {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db
        .transaction("histories")
        .objectStore("histories")
        .get(hash);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function persist(entry) {
  const db = await openDatabase();
  if (!db) return;
  try {
    const transaction = db.transaction(["histories", "access"], "readwrite");
    const store = transaction.objectStore("histories");
    if (entry.observations) store.put(entry);
    const access = transaction.objectStore("access");
    access.put({ hash: entry.hash, bytes: entry.bytes, usedAt: entry.usedAt });
    // Evict oldest used records without reading their large observation arrays.
    const records = [];
    const cursor = access.openCursor();
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (item) {
        records.push({
          hash: item.key,
          bytes: item.value.bytes,
          usedAt: item.value.usedAt,
        });
        item.continue();
      } else {
        let bytes = records.reduce((total, row) => total + row.bytes, 0);
        for (const row of records.sort((a, b) => a.usedAt - b.usedAt)) {
          if (bytes <= MAX_BYTES) break;
          store.delete(row.hash);
          access.delete(row.hash);
          bytes -= row.bytes;
        }
      }
    };
    transaction.onerror = () => {}; // Private mode/quota cannot prevent chart use.
  } catch {
    /* Persistence is optional. */
  }
}

export async function loadSnapshot(ids = [], version = __SNAPSHOT_VERSION__) {
  const response = await fetch(
    `./data/runtime/catalog.json?v=${encodeURIComponent(version)}`,
  );
  if (!response.ok) throw new Error("The data catalog could not be loaded.");
  const snapshot = await response.json();
  if (snapshot.schemaVersion !== 1 || !snapshot.series?.length)
    throw new Error("Unsupported data catalog. Please reload MacroTrace.");
  await loadHistories(snapshot, ids);
  return snapshot;
}

export function loadedHistoryIds() {
  return [...hydrated];
}

export async function loadHistory(snapshot, id) {
  const series = snapshot.series.find((item) => item.id === id);
  if (!series) throw new Error(`Unknown bundled series: ${id}`);
  if (series.observations) return series;
  const { hash, file, bytes } = series.history;
  if (!pending.has(hash)) {
    const work = (async () => {
      const cached = await stored(hash);
      if (cached?.observations?.length === series.coverage.count) {
        void persist({ hash, bytes, usedAt: Date.now() });
        return cached.observations;
      }
      const response = await fetch(`./data/runtime/${file}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        if (response.status === 404)
          document.dispatchEvent(new Event("data-version-changed"));
        throw new Error(
          `${series.name} could not be loaded. Please retry after the data refresh.`,
        );
      }
      const body = await response.text();
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(body),
      );
      const actual = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      if (actual !== hash)
        throw new Error(`History integrity check failed for ${id}.`);
      const observations = JSON.parse(body);
      if (observations.length !== series.coverage.count)
        throw new Error(`Incomplete history for ${id}.`);
      void persist({ hash, observations, bytes, usedAt: Date.now() });
      return observations;
    })();
    pending.set(hash, work);
    work.finally(() => pending.delete(hash)).catch(() => {});
  }
  series.observations = await pending.get(hash);
  hydrated.add(id);
  return series;
}

export async function loadHistories(snapshot, ids) {
  const queue = [...new Set(ids)].filter((id) =>
    snapshot.series.some((series) => series.id === id),
  );
  await Promise.all(
    Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) await loadHistory(snapshot, queue.shift());
    }),
  );
  return snapshot;
}
