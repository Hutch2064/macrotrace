# Delivery and performance

## Architecture decision

MacroTrace is a static application with a small optional search/history API. The
daily ingestion job downloads and validates providers once, not once per visitor.
Production stays on the existing Vercel project; GitHub Pages remains the course
submission mirror. These are two deployments of MacroTrace, not Simfolio.

Do not add a database, Fly server, or R2 bucket to serve this small daily corpus.
The application already has a CDN origin. Adding object storage alone would not
remove browser parsing, chart computation, or CDN request costs. No paid service,
capacity tier, team billing setting, or Simfolio infrastructure was changed.

## What a visitor downloads

1. A compact catalog: complete provenance, coverage bounds, and precomputed banner
   changes for all twelve horizons, without observation arrays.
2. Only selected histories: SHA-256-named JSON files, validated before use.
   Histories are identical to the committed snapshot, without rounding,
   downsampling, clipping, or shortened coverage.
3. Browser IndexedDB retains verified histories across page navigation and visits.
   Unchanged observations reuse the same URL/hash after a daily refresh. Storage
   is bounded to 64 MiB of logical JSON bytes with oldest-use eviction; actual
   IndexedDB implementation overhead can be larger. Private-mode/storage failures
   fall back to network delivery without disabling charts.

Requests for the same history are coalesced. A collection loads at most four
histories concurrently. Collection prefetch is debounced and follows hover/focus
intent; it is disabled when the browser advertises Save-Data. The full library is
not silently prefetched. Data Sources initially requests no histories; CSV export
fetches the chosen complete history on demand.

Vercel history URLs use a one-year immutable cache policy. The mutable catalog has
a five-minute policy. The small version manifest is checked hourly and when the
tab becomes visible; changed catalogs refresh active data, report findings, source
coverage, and the banner. A missing old-deployment chunk requests a catalog refresh
and presents an explicit retry instead of mixing data versions. Source publication
frequency, daily ingestion cadence, and outage disclosures are unchanged.

## Measured payload budget

Snapshot vintage: `2026-09-22T06:14:26.015Z`. These are Node gzip byte counts for
data only, not whole-page transfer sizes or end-to-end load-time claims.

| Data                         |           Before |         After |
| ---------------------------- | ---------------: | ------------: |
| Default Macro view, cold     |  6,265,078 bytes | 247,469 bytes |
| Data Sources, cold           |  6,265,078 bytes | 102,836 bytes |
| Parsed catalog               | 25,390,423 bytes | 724,381 bytes |
| Complete histories available |              425 |           425 |

Default cold data is about **96% smaller**. The tradeoff is thirteen data requests
(catalog plus twelve histories) instead of one giant snapshot request. Browser
persistence eliminates those history fetches on a normal repeat visit. A viewport
sample of the default desktop dashboard went from 4,225 DOM elements to 921 after
the bounded banner; element counts vary with charts, expansion, and selections.

The normal animated banner keeps two groups of twelve links and rotates through
all 425 entries. Reduced-motion users get a static, manually scrollable complete
list. Hidden tabs and hover/focus pause animation. Closed source categories defer
their series markup. Report plots and dashboard time-series plots are initialized
near the viewport. Chart.js is no longer included in report/source entry bundles.
Fonts are self-hosted; normal page rendering needs no Google Fonts connection.
Repeated immutable-series calculations reuse cached results rather than rebuilding
identical calendar windows and returns.

## Optional API and abuse limits

The prebundled application does not invoke provider APIs while browsing, filtering,
or changing chart horizons. Arbitrary ticker/FRED lookup is separate. Existing
CDN policies remain: market history five minutes, FRED history one hour, search
fifteen minutes, with their existing stale-while-revalidate windows.

Each warm function instance also has bounded response caching and same-key
in-flight sharing. Market/FRED local successful responses live sixty seconds;
search lives five minutes. Provider failures live three seconds. Search reads
the 724 KB metadata catalog rather than parsing the 25 MB snapshot. Each endpoint
allows at most 32 distinct pending loads in one instance, then returns HTTP 429
with Retry-After. This is **not a global distributed rate limit**: many unique
requests spread across instances can still consume provider and hosting capacity.
No claim of unlimited free API traffic or guaranteed cold-provider latency is made.

## Cost and growth boundaries

Evaluate both transferred bytes and request count. One million fully cold default
Macro visits would represent approximately 247 GB of compressed data and 13
million data requests, **before** HTML, JavaScript, fonts, other pages, additional
selections, downloads, and arbitrary API traffic. This is an arithmetic workload
illustration, not a usage forecast or bill. Returning users usually need less.

The existing account is Pro, but enabling Flat Rate CDN was not verified. Its
documented included capacity is 1M CDN requests and 1 TB; optional paid tiers and
eligibility rules apply. Shared-team billing changes are deliberately out of scope.
See [Vercel CDN pricing](https://vercel.com/docs/pricing/flat-rate-cdn).

For sustained traffic beyond the existing allowance, compare a project-only static
migration to [Cloudflare Pages](https://developers.cloudflare.com/pages/functions/pricing/),
whose static requests and bandwidth are documented as free and unlimited, subject
to platform limits/terms. The generated library is ordinary static files and can
move without redesigning charts or data calculations. Arbitrary provider API
traffic still needs a separately costed service. Such a migration was not performed
or benchmarked here, and no global latency superiority is claimed.

[R2](https://developers.cloudflare.com/r2/pricing/) becomes more useful if the corpus
grows beyond static-deployment limits or data publication must be independent of
site deployment. R2 has storage/operation allowances and no direct egress charge;
it is not automatically cheaper than the static origin already included with the
site. A production CDN/custom-domain setup would still be necessary. Pricing was
reviewed September 22, 2026 and can change.

## Reproduce and verify

```bash
npm ci
npm run check
npm run performance:measure
```

`delivery:verify` checks every observation and provenance field, all twelve banner
horizons, transfer budgets, persistent reuse, request deduplication, cache eviction,
disabled storage, corrupted responses, and expired-deployment behavior. API tests
use mocked providers, including failures and concurrency. The performance command
measures pure analytics only, not browser/network speed. Validate production
separately: exact deployed commit, CDN headers, cold/repeat browser requests,
mobile overflow, expanded charts, source disclosures/exports, and runtime errors.
