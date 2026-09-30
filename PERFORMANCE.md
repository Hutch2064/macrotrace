# Delivery and performance

## Scope

MacroTrace is a static two-page site. The report and dashboard use the same
reviewed macro snapshot, a compact metadata catalog, and lossless,
content-addressed history files. There are no runtime API functions, database,
Fly worker, R2 bucket, paid compute tier, or Simfolio infrastructure changes.

This document describes delivery mechanisms and bounded work. It does not make
an unmeasured claim about end-to-end load time, CDN hit rate, hosting cost, or
production click-to-visible performance. Those require a separately recorded
browser/deployment measurement with its environment, cache state, network,
viewport, and snapshot identity.

## Delivery path

1. The scheduled refresh validates providers and writes the public snapshot,
   version manifest, and source inventory.
2. `scripts/build-data.mjs` writes a catalog with complete metadata and
   coverage, then writes each complete observation array to a SHA-256-named
   history file. No rounding, downsampling, clipping, or representative
   sample is used.
3. Vite builds exactly `index.html` and `dashboard.html`. The Vercel deployment
   allowlist includes their source modules, data scripts, static data, fonts,
   package manifests, and configuration, but no API directory.
4. The browser loads the catalog first. Report findings and the panel request
   only the selected histories; each response is verified against the catalog
   hash and expected observation count before use.

## Cache and persistence contract

History chunks and self-hosted fonts are served with immutable CDN cache
headers. Mutable catalog/version data uses a short revalidation policy so a
daily publication can become visible without replacing an old history URL.
The legacy `sources.html` path redirects to the report's `#sources` section.

Verified histories are retained in a bounded IndexedDB cache keyed by their
content hash. Concurrent requests for the same history share one promise.
Oldest-use records are evicted when the logical cache budget is exceeded. If
IndexedDB or private-mode storage is unavailable, the browser continues with
network delivery; persistence is an optimization, not a correctness
requirement. A missing old-deployment chunk triggers a version refresh instead
of combining histories from different snapshots.

## Rendering scheduling

The application keeps calculations local and preserves native observation
grain. Report plots and indicator plots are created lazily as they approach the
viewport; charts outside that window do not consume plot setup work until the
reader is likely to see them. Returning to an existing view reuses the loaded
snapshot/history state where possible. This is a scheduling design, not a
measured rendering-speed claim.

uPlot is the only chart runtime. The dashboard uses separate source-unit
readings and labels; it does not pool incompatible units into one aggregate.
Period changes, heat-map cells, percentile comparisons, and CSV exports operate
on the complete selected histories and leave unavailable comparisons explicit.

## Verification

```bash
npm ci
npm run check
```

The check pipeline verifies:

- snapshot/version metadata, date ordering, provenance, native frequencies,
  and macro scope;
- every generated history byte-for-byte against the reviewed snapshot and its
  SHA-256 digest;
- the ten default macro IDs (`UNRATE`, `CPIAUCSL`, `PCEPILFE`, `FEDFUNDS`,
  `GDPC1`, `PAYEMS`, `HOUST`, `PERMIT`, `INDPRO`, `DCOILWTICO`);
- request coalescing, bounded parallel history loading, IndexedDB reuse and
  eviction, storage-disabled fallback, integrity failure, and snapshot
  rollover;
- deterministic panel/report numerical fixtures and the exactly-two-page DOM
  and source contract; and
- the production Vite build.

The delivery script's gzip sizes are transfer diagnostics for the current
snapshot only. They are not browser timing, traffic forecasts, CDN billing, or
cost guarantees. Any future performance comparison must identify both snapshot
versions, the exact default selection, cold/warm cache state, device/browser,
network, and the full output contract being compared.

## Cost boundary

The public site remains on the existing static hosting arrangement. No paid
service or capacity setting is enabled by this project. If traffic or corpus
size changes materially, evaluate request count, transferred bytes, cache
behavior, and provider refresh costs together before changing the architecture;
do not infer a saving from payload size alone.
