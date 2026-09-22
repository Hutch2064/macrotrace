import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { indexedDB, IDBFactory } from "fake-indexeddb";
import { tickerReadings } from "../src/ticker.js";
import { horizons } from "../src/horizons.js";
import { presetById } from "../src/presets.js";

const snapshot = JSON.parse(
  await readFile("public/data/snapshot.json", "utf8"),
);
const catalogText = await readFile("public/data/runtime/catalog.json", "utf8");
const catalog = JSON.parse(catalogText);
const fontCss = await readFile("src/fonts.css", "utf8");
for (const file of await readdir("public/fonts")) {
  if (!file.endsWith(".woff2")) continue;
  const hash = createHash("sha256")
    .update(await readFile(`public/fonts/${file}`))
    .digest("hex")
    .slice(0, 8);
  assert.ok(file.endsWith(`-${hash}.woff2`), `${file}: immutable font hash`);
  assert.ok(fontCss.includes(file), `${file}: font face is wired`);
}
assert.equal(catalog.series.length, snapshot.series.length);
const chunks = new Map();
for (const entry of catalog.series) {
  assert.equal(
    entry.observations,
    undefined,
    "Catalog cannot conceal a full-history download",
  );
  const original = snapshot.series.find(({ id }) => id === entry.id);
  const body = await readFile(
    `public/data/runtime/${entry.history.file}`,
    "utf8",
  );
  assert.equal(
    createHash("sha256").update(body).digest("hex"),
    entry.history.hash,
  );
  assert.deepEqual(
    JSON.parse(body),
    original.observations,
    `${entry.id}: every observation is preserved`,
  );
  assert.deepEqual(entry.coverage, {
    count: original.observations.length,
    first: original.observations[0],
    latest: original.observations.at(-1),
  });
  const { coverage, history, bannerChanges, bannerSuffix, ...metadata } = entry;
  const { observations, ...sourceMetadata } = original;
  assert.deepEqual(
    metadata,
    sourceMetadata,
    `${entry.id}: full provenance preserved`,
  );
  chunks.set(`./data/runtime/${entry.history.file}`, body);
}
for (const [horizon] of horizons)
  assert.deepEqual(
    tickerReadings(catalog, horizon),
    tickerReadings(snapshot, horizon),
    `All banner entries at ${horizon}`,
  );

const ids = presetById("macro").series;
const compressed =
  gzipSync(catalogText).length +
  ids.reduce((sum, id) => {
    const entry = catalog.series.find((series) => series.id === id);
    return (
      sum + gzipSync(chunks.get(`./data/runtime/${entry.history.file}`)).length
    );
  }, 0);
assert.ok(
  compressed < 400000,
  `Default data transfer budget exceeded: ${compressed}`,
);
assert.ok(gzipSync(catalogText).length < 150000, "Source-only catalog budget");

globalThis.indexedDB = indexedDB;
globalThis.document = new EventTarget();
let historyRequests = 0;
globalThis.fetch = async (url) => {
  if (url.includes("catalog.json")) return new Response(catalogText);
  historyRequests++;
  assert.ok(chunks.has(url), `Unexpected request ${url}`);
  return new Response(chunks.get(url));
};
const store = await import("../src/data-store.js");
const loaded = await store.loadSnapshot([], "test");
assert.equal(historyRequests, 0, "Source catalog loads no histories");
const [first, second] = await Promise.all([
  store.loadHistory(loaded, ids[0]),
  store.loadHistory(loaded, ids[0]),
]);
assert.equal(first, second);
assert.equal(historyRequests, 1, "Concurrent identical requests are collapsed");
await store.loadHistories(loaded, ids);
assert.equal(
  historyRequests,
  ids.length,
  "Only selected histories are requested",
);
for (const id of ids)
  assert.deepEqual(
    loaded.series.find((s) => s.id === id).observations,
    snapshot.series.find((s) => s.id === id).observations,
  );
await new Promise((resolve) => setTimeout(resolve, 50));
const nextSession = await import("../src/data-store.js?session=2");
const next = await nextSession.loadSnapshot(ids, "test");
assert.equal(
  historyRequests,
  ids.length,
  "Persisted histories survive a new page session without network downloads",
);
assert.ok(next.series.filter((s) => s.observations).length === ids.length);

// Exercise the quota using logical byte sizes, without allocating 80 MiB.
const evictionFactory = new IDBFactory();
globalThis.indexedDB = evictionFactory;
const evictionStore = await import("../src/data-store.js?session=eviction");
const evictionSnapshot = await evictionStore.loadSnapshot([], "test");
await evictionStore.loadHistory(evictionSnapshot, ids[0]);
const db = await new Promise((resolve, reject) => {
  const request = evictionFactory.open("macrotrace-histories-v1", 1);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
await new Promise((resolve, reject) => {
  const transaction = db.transaction(["histories", "access"], "readwrite");
  for (const hash of ["older", "newer"]) {
    const entry = {
      hash,
      bytes: 40 * 1024 * 1024,
      usedAt: hash === "older" ? 0 : 1,
    };
    transaction.objectStore("access").put(entry);
    transaction.objectStore("histories").put({ ...entry, observations: [] });
  }
  transaction.oncomplete = resolve;
  transaction.onerror = () => reject(transaction.error);
});
await evictionStore.loadHistory(evictionSnapshot, ids[1]);
await new Promise((resolve) => setTimeout(resolve, 50));
const storedRows = await new Promise((resolve, reject) => {
  const request = db.transaction("access").objectStore("access").getAll();
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
assert.ok(
  storedRows.reduce((total, { bytes }) => total + bytes, 0) <= 64 * 1024 * 1024,
);
assert.ok(
  !storedRows.some(({ hash }) => hash === "older"),
  "Oldest history is evicted first",
);
assert.ok(
  storedRows.some(({ hash }) => hash === "newer"),
  "A newer history remains cached",
);
db.close();

globalThis.indexedDB = undefined;
const noStorage = await import("../src/data-store.js?session=3");
const beforePrivate = historyRequests;
await noStorage.loadSnapshot([ids[0]], "test");
assert.equal(
  historyRequests,
  beforePrivate + 1,
  "Private/storage-disabled browsing still works",
);
const corrupt = await noStorage.loadSnapshot([], "test");
globalThis.fetch = async () => new Response('[["2020-01-01",999]]');
await assert.rejects(noStorage.loadHistory(corrupt, ids[1]), /integrity/);
let refreshes = 0;
document.addEventListener("data-version-changed", () => refreshes++);
globalThis.fetch = async () => new Response("", { status: 404 });
await assert.rejects(noStorage.loadHistory(corrupt, ids[1]), /retry/);
assert.equal(
  refreshes,
  1,
  "Expired deployment chunks request a new catalog, never mixed-version data",
);
await assert.rejects(noStorage.loadHistory(corrupt, "NOT_BUNDLED"), /Unknown/);
console.log(
  `Verified ${catalog.series.length} lossless chunks, complete provenance and 12-horizon banner parity; persistence/deduplication/eviction/private-mode/integrity/rollover. Default data: ${compressed} gzip bytes versus ${gzipSync(await readFile("public/data/snapshot.json")).length} previously.`,
);
