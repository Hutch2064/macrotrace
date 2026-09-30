# MacroTrace

MacroTrace is a static, public macroeconomic report and exploration panel. It
is published on GitHub Pages:

<https://hutch2064.github.io/macrotrace/>

The project has exactly two pages:

- `index.html` is the source-backed long-form report. Its findings, charts,
  headlines, and methods section are calculated from the published snapshot.
  Its interactive globe includes geography independently of data availability,
  without a country dropdown, and rotates in both
  directions on mouse or touch drag. Countries
  with available economic data are highlighted in gold; other countries remain
  neutral. Gentle rotation resumes after release, except when reduced motion
  is requested by the device. Country selection does not change the scrolling
  report.
  Every geographic unit supports country-name hover identification, including
  no-data territories and tiny islands. Tooltips use Simfolio's verified
  300 ms scale-and-fade motion with MacroTrace's font, closing immediately on
  pointer exit. Touch selection identifies a place through the persistent
  caption. Expanded island hit areas apply over water, not neighboring land;
  date-line polygons are unwrapped before hit testing. Shared national or
  territorial aggregates are explicitly labeled on the metric cards.
- `dashboard.html` is the exploration panel. It filters by topic, geography,
  native frequency, period, measure, and text search; it exposes plots,
  comparisons, a monthly view, and the complete filtered observation table.
  Indicator charts are paginated in groups of eight; only the final page can
  contain fewer charts.

There are no accounts, API endpoints, stock prices, securities, investment
factors, proxy-spliced investment histories, database, worker, or paid runtime.
GitHub Pages is the only hosting target.

## Data contract

Each observation keeps its indicator, geography, source date, reported value,
unit, frequency, provider, and source URL. The source frequency is preserved:
daily, weekly, monthly, quarterly, and annual observations remain at that
grain. An annual or monthly release is not represented as a daily observation,
and missing periods are not filled or interpolated.

The current macro scope combines public FRED economic indicators, World Bank
Pink Sheet commodity reference prices, World Development Indicators,
UN Statistics Division and Pacific Community national accounts, Taiwan DGBAS,
official territorial statistics, IMF WEO actuals, and the
two retained Shiller annual housing indexes. FRED distributes many series but
is not necessarily the original author; each row keeps the relevant provider
and attribution. Pink Sheet values are nominal monthly averages or source
indexes, not futures returns. World Bank and Shiller annual histories retain
their source-year semantics. Archived or lagged provider tails remain labeled
and are not silently made current.

World Development Indicators supplies 32 annual indicator families for the
World Bank's complete non-aggregate roster of 217 economies: output and income,
inflation, employment, population, sector composition, trade, investment,
credit, money, reserves, remittances, external debt, and public finances.
Availability varies by indicator. UN and Pacific Community sources supplement
territories missing from that roster and provide additional national accounts.
Taiwan's primary readings come directly from its Directorate-General of Budget,
Accounting and Statistics (DGBAS). Annual CPI inflation is derived only from
adjacent published positive CPI indexes; the source index is retained separately.
IMF WEO histories remain separate and are truncated at each indicator's published
last-actual-year cutoff. Each refresh discovers the latest full WEO release when
accessible; later staff projections are not historical data. If an upstream
provider rejects a request, previously verified histories retain their original
check time and an explicit retained-cache status.
Territorial coverage adds Jersey's official GDP and RPI, Åland's GDP and CPI,
Caribbean Netherlands island-level GDP and CPI, and INSEE's accounts for
Guadeloupe, Martinique, French Guiana, Réunion, and Mayotte. Jersey's CKAN API
discovers current resources and constant-price base years; INSEE's stable Melodi
dataset supplies current regional accounts; ÅSUB PxWeb and CBS OData supply
updated tables. Each is checked in the same daily workflow. Island-level figures
are not silently presented as Caribbean Netherlands aggregates, and Guadeloupe's
combined account explicitly includes Saint-Martin. Provisional,
semi-definitive, archived fallback, and retained-cache statuses remain visible.

Nominal and real GDP, base years, currency multipliers, modeled estimates, and
source units remain explicitly distinguished. Available core headline readings
are preserved. A missing slot may show another published indicator for that
same economy, prioritizing population and total GDP, then other supported
economic measures. Each replacement keeps its own label, unit, date, and source;
it is not an estimate of the missing core metric. Indicators are not duplicated
across the four cards. Slots without any supported alternative remain unavailable,
never zero. Provisional official releases are labeled, not treated as final.

Geography uses every mapped unit from Natural Earth's 1:10 million map-unit
dataset, including separate small islands and overseas territories. The generated
[geographic coverage audit](public/data/geographic-coverage.json) checks all
249 ISO-listed geographies plus Kosovo independently of the economic roster.
The bundle currently contains 298 named map units. Source-resolution coastlines
are not a survey of every rock or a claim about sovereignty. A visible territory
does not imply a recent or available economic series.

The generated [country coverage audit](public/data/country-coverage.json) lists
every available series, its actual first and last reference year, provider check
time, and retained-cache status. The source catalog groups countries under
indicator families and shows official definitions and original organizations.
The [CSV inventory](public/data/source-inventory.csv) and
[readable inventory](public/data/source-inventory.md) contain every series and
its source link. Reference-year endings are annual labels, not release dates;
projections and incomplete calendar years are not ingested.

Measures are calculated separately for each series:

- Reported level is the original value and unit.
- Year-over-year change uses the corresponding calendar boundary. Daily and
  weekly series use an observed row on or before that boundary under the
  source-specific tolerance; monthly, quarterly, and annual comparisons do
  not substitute a nearby or future period.
- Previous-observation change uses the preceding actual release, not an
  assumed daily or monthly interval.

Positive quantities and prices use a percentage change from the valid baseline.
Rates use percentage-point differences and signed indexes use native points. A zero,
missing, non-finite, or otherwise unavailable baseline remains unavailable.
Unlike units are never pooled into an average, aggregate score, growth rate, or
single chart axis. Monthly heat-map cells use the last actual observation in
that month; annual series appear only in their source month.

The report and panel retain source links, calculation definitions, observation
dates, and snapshot check time. A provider check timestamp is never presented
as an economic observation date.

## Refresh and delivery

`.github/workflows/refresh-data.yml` checks the accepted public providers daily
at 11:17 UTC and also supports an explicit manual dispatch. GitHub's scheduled
jobs can be delayed; this is a daily provider check, not a real-time feed.
`npm run data:refresh` is the
local/on-demand refresh command. The job starts from a fresh `main`, validates
the complete snapshot, refuses to overwrite concurrent `main` edits, commits
only generated `public/data` files, uses a guarded push, and explicitly
dispatches the Pages workflow after a successful commit. A GitHub push made by
the bot does not rely on another workflow triggering automatically.

`scripts/build-data.mjs` writes a metadata catalog and complete,
SHA-256-addressed history chunks. Country histories share one lossless bundle
per WDI indicator, so comparing many economies does not require one request per
economy. Shared source metadata is stored once per indicator. The browser loads static files only and
requests the histories needed by the report or current panel view. Verified
histories are retained in bounded 64 MiB memory and IndexedDB caches; concurrent requests for
the same history are shared. Storage failure falls back to static network
delivery. Content addressing supports safe reuse, but this project does not
claim custom response headers or a measured CDN performance result from GitHub
Pages.

The report ranks sixteen curated macro themes by the latest movement's
position in its own history and native-frequency-adjusted freshness, selecting
up to ten available chart-backed findings. All figures and comparisons are
recalculated from the snapshot. Selection is descriptive, not a causal model or
investment recommendation; annual country data remains explicitly annual.

## Local checks

```bash
npm ci
npm run check
npm run dev
```

`npm run check` runs the consolidated `tests/run.mjs` verification entrypoint
and then the Vite production build. The checks cover macro eligibility,
metadata/provenance, date ordering, lossless history hashes, persistence and
integrity failure behavior, panel/report numerical fixtures, report/dashboard
parity, the exactly-two-page DOM contract, and generated output. The committed
snapshot is sufficient for development; use `npm run data:refresh` only when an
intentional source refresh is wanted.

The focused commands remain available for data and delivery work:
`npm run data:verify` checks the source snapshot, while
`npm run delivery:verify` repacks and checks the browser delivery artifacts.

## Repository map

### Pages and application

| Path                                               | Purpose                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `index.html`                                       | Long-form report and source/methodology section.                                         |
| `dashboard.html`                                   | Filterable macro panel, charts, comparisons, heat map, and observation table.            |
| `src/common.js`                                    | Shared loading, formatting, page chrome, CSV export, and errors.                         |
| `src/data-store.js`                                | Catalog/history loading, SHA-256 validation, request sharing, and IndexedDB persistence. |
| `src/dashboard.js`                                 | Panel state, filters, transformations, charts, comparisons, and table.                   |
| `src/macro-report.js`                              | Deterministic report findings, headlines, and method definitions.                        |
| `src/panel.js`                                     | Macro-only filtering and native-frequency transformations.                               |
| `src/report.js`                                    | Report rendering and lazy chart setup.                                                   |
| `src/source-catalog.js`                            | Source metadata, coverage, and attribution rendering.                                    |
| `src/time-chart.js`                                | uPlot charts, legends, crosshair inspection, and expansion.                              |
| `src/lazy-chart.js`                                | Viewport-aware chart scheduling.                                                         |
| `src/globe.js`, `src/countries.js`                 | Lightweight spherical map, country interaction, and source-bound headline calculations.  |
| `src/select.js`, `src/disclosure.js`               | Accessible controls and source disclosures.                                              |
| `src/styles.css`, `src/fonts.css`, `public/fonts/` | Visual system, self-hosted fonts, and licenses.                                          |

### Data and automation

| Path                                                                  | Purpose                                                                                                                |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `public/data/snapshot.json`                                           | Reviewed macro snapshot source of truth.                                                                               |
| `public/data/version.json`                                            | Snapshot freshness manifest.                                                                                           |
| `public/data/source-inventory.csv`, `public/data/source-inventory.md` | Generated current source inventory.                                                                                    |
| `public/data/country-coverage.json`                                   | Machine-readable economy, indicator, coverage, and freshness audit.                                                    |
| `public/data/geographic-coverage.json`                                | Geographic coverage against ISO and UN M49, independent of statistics availability.                                    |
| `scripts/build-data.mjs`                                              | Packs complete histories into hashed runtime files.                                                                    |
| `scripts/refresh-data.mjs`                                            | Fetches, validates, normalizes, and writes public data.                                                                |
| `scripts/macro-scope.mjs`                                             | Shared macro eligibility and metadata normalization.                                                                   |
| `scripts/catalog.mjs`, `scripts/extended-macro-catalog.mjs`           | FRED catalogues and source metadata.                                                                                   |
| `scripts/commodity-history.mjs`                                       | World Bank Pink Sheet parser and provenance.                                                                           |
| `scripts/shiller-history.mjs`                                         | Retained Shiller housing parser and provenance.                                                                        |
| `scripts/world-development.mjs`                                       | Dynamic World Bank roster, paginated annual observations, source metadata, and per-indicator fallback.                 |
| `scripts/international-supplement.mjs`                                | UN, Pacific Community, Taiwan DGBAS, and actual-only IMF histories with native units and cache fallback.               |
| `scripts/territory-data.mjs`                                          | Official territorial releases, latest-resource discovery, native-period parsing, and provider-isolated cache fallback. |
| `scripts/build-map.mjs`, `public/world.json`                          | Rebuild script and bundled Natural Earth country outlines; independent of economic data.                               |
| `public/favicon.svg`                                                  | MacroTrace mark.                                                                                                       |
| `.github/workflows/pages.yml`                                         | GitHub Pages build and deployment.                                                                                     |
| `.github/workflows/refresh-data.yml`                                  | Daily/manual refresh, guarded commit, and Pages dispatch.                                                              |
| `package.json`, `package-lock.json`                                   | Reproducible commands and dependencies.                                                                                |
| `vite.config.js`, `.gitignore`                                        | Relative-path two-page build and local/generated-file exclusions.                                                      |
| `README.md`, `SUBMISSION.txt`                                         | Project documentation and four-line course submission.                                                                 |

### Tests

| Path                                        | Purpose                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `tests/run.mjs`                             | Single verification entrypoint used by `npm run check`.                                                          |
| `tests/verify-data.mjs`                     | Snapshot scope, metadata, provenance, and date checks.                                                           |
| `tests/verify-delivery.mjs`                 | Lossless chunks, hashes, persistence, deduplication, eviction, and fallback.                                     |
| `tests/verify-panel.mjs`                    | Native-frequency panel transforms and grouping fixtures.                                                         |
| `tests/verify-macro-report.mjs`             | Deterministic report calculations and source-boundary fixtures.                                                  |
| `tests/verify-parity.mjs`                   | Report/dashboard point parity.                                                                                   |
| `tests/verify-countries.mjs`                | Country geometry, all headline sources, and percent/point formatting.                                            |
| `tests/verify-globe.mjs`                    | Geographic picking, tiny islands, date-line boundaries, tooltip lifecycle, touch and drag behavior, and cleanup. |
| `tests/verify-world-development.mjs`        | Roster exclusions, pagination integrity, annual dates, missing values, and forecasts.                            |
| `tests/verify-international-supplement.mjs` | Supplementary provider schemas, missing values, forecast exclusions, and units.                                  |
| `tests/verify-territory-data.mjs`           | Territorial provider parsing, resource discovery, missing periods, units, and retained-cache behavior.           |
| `tests/verify-site.mjs`                     | Exactly-two-page DOM/source contract.                                                                            |

## Attribution and limitations

Source URLs and provider notes are published with each series. Public access
does not remove provider attribution or third-party reuse conditions; review
current FRED, World Bank, UN, SPC, DGBAS, IMF, Shiller, and other original-source terms before
redistributing data. MacroTrace is informational and does not provide
investment advice. No claim of real-time quotes, universal freshness, custom
cache headers, or performance improvement is made without current evidence.

Map geometry uses the public-domain [Natural Earth country maps](https://www.naturalearthdata.com/about/terms-of-use/): lightweight 1:110m outlines, missing-economy 1:50m outlines, and label-coordinate pins where needed.
The checked-in outline file needs no runtime third-party request; rebuild it
with `node scripts/build-map.mjs` when intentionally updating geography.
Self-hosted Outfit and Geist Mono fonts retain their attribution and licenses
in `public/fonts/README.md` and `public/fonts/OFL.txt`.
