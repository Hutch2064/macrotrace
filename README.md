# MacroTrace

MacroTrace is a public, static-first view of the economy. It has exactly two
pages: a source-backed long-form report and an exploratory macroeconomic panel.
There are no stock prices, securities, investment-factor portfolios, or hidden
proxy splices in the product surface.

## Pages

- `index.html` is the report. Its long-form panels pair a narrative finding
  with the underlying observations, source links, and a compact data/methods
  section. The `#sources` section is the public source catalog and methodology
  anchor.
- `dashboard.html` is the panel. Filter indicators by topic, geography,
  native frequency, date period, and text search; inspect paginated plots,
  comparisons, a monthly view, and the complete filtered observation table.
  Every plot keeps its source unit and grain visible.

The former `sources.html` URL redirects to `index.html#sources` for old links.
The Vercel deployment has no function endpoints; the browser reads the static
catalog and content-addressed history files.

## Data contract

Each row represents one indicator, geography, native observation date, reported
value, unit, and public source. The panel keeps daily, weekly, monthly,
quarterly, and annual observations at their published grain. It never invents
daily values between releases, averages unlike units, or presents a mixed-unit
aggregate as an economic score.

The selectable measures are calculated per series:

- reported level: the original source value and unit;
- year-over-year change: a calendar comparison to the prior available native
  observation, expressed as percent for positive quantities/prices, percentage
  points for rates, or native points for signed indexes;
- previous-observation change: the difference from the prior actual release,
  with the same unit-specific conventions.

Short or incomplete comparisons remain unavailable. Monthly heat-map cells use
the last actual observation in that month; annual and low-frequency series are
not interpolated. The report and panel retain complete histories and disclose
observation dates separately from the daily snapshot check time.

The public snapshot is refreshed by the scheduled workflow's daily source
checks and is cached into the published static files; the browser does not call
providers while a reader filters or charts the panel. Source metadata,
coverage, units, frequencies, transformations, and direct attribution links
are shipped with the site. Provider failures retain the last successful values
and expose the refresh status rather than substituting estimates.

## Delivery and caching

`build-data.mjs` creates a lossless catalog plus SHA-256-addressed history
chunks. The catalog contains provenance and coverage but no observation arrays;
the browser requests only histories required by the current report or panel.
Vercel serves immutable history chunks and fonts through the CDN. The browser
keeps verified histories in a bounded IndexedDB cache, coalesces concurrent
requests, and falls back to network delivery when storage is unavailable.
These are delivery mechanisms, not changes to the public data contract.

## Run locally

```bash
npm ci
npm run check
npm run dev
```

`npm run check` verifies the normalized data contract, lossless delivery and
integrity/persistence behavior, numeric panel/report fixtures, the two-page DOM
and source contract, and the production Vite build. Run
`npm run data:refresh` only when intentionally updating the public snapshot;
the committed snapshot is sufficient for local development.

## File map

### Application

| Path                                               | Purpose                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `index.html`                                       | Long-form report and `#sources` methodology/catalog section.                   |
| `dashboard.html`                                   | Filterable macro panel, plots, comparisons, heat map, and observation table.   |
| `src/common.js`                                    | Shared loading, formatting, chrome, CSV delivery, and error handling.          |
| `src/data-store.js`                                | Verified history loading, request sharing, and bounded IndexedDB persistence.  |
| `src/dashboard.js`                                 | Panel state, filters, transforms, charts, comparisons, and table interactions. |
| `src/macro-report.js`                              | Deterministic report findings and headline calculations.                       |
| `src/panel.js`                                     | Macro-only filtering and unit/frequency-aware transformations.                 |
| `src/report.js`                                    | Report rendering, source-method section, and lazy plot setup.                  |
| `src/source-catalog.js`                            | Source metadata and coverage rendering for the report.                         |
| `src/time-chart.js`                                | uPlot renderer with legends, crosshair inspection, and expansion support.      |
| `src/lazy-chart.js`                                | Viewport-aware plot creation and cleanup.                                      |
| `src/orbit.js`                                     | Decorative report illustration; it is not a data chart.                        |
| `src/select.js`                                    | Accessible select enhancement.                                                 |
| `src/disclosure.js`                                | Animated, semantic source-catalog disclosures.                                 |
| `src/styles.css`, `src/fonts.css`, `public/fonts/` | Shared visual system and self-hosted fonts.                                    |

### Data and release

| Path                                                                  | Purpose                                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `public/data/snapshot.json`                                           | Reviewed macro snapshot source of truth.                                 |
| `public/data/version.json`                                            | Small freshness manifest used by open pages.                             |
| `public/data/source-inventory.csv`, `public/data/source-inventory.md` | Generated source coverage and attribution inventory.                     |
| `scripts/build-data.mjs`                                              | Packs the snapshot into lossless, hashed runtime histories.              |
| `scripts/refresh-data.mjs`                                            | Scheduled public-provider refresh and normalization entrypoint.          |
| `scripts/macro-scope.mjs`                                             | Shared macro-only eligibility and metadata normalization rules.          |
| `scripts/deploy-vercel.mjs`                                           | Explicit tracked-file Vercel deployment allowlist and readiness wait.    |
| `vite.config.js`                                                      | Two-entry Vite production build.                                         |
| `vercel.json`                                                         | Legacy-source redirect, CDN cache headers, and browser security headers. |
| `package.json`, `package-lock.json`                                   | Reproducible scripts and dependencies.                                   |

The refresh adapter directory also contains provider-specific parsers and
catalogues used by the scheduled data job. They are not browser entrypoints:
`catalog.mjs`, `extended-macro-catalog.mjs`, `commodity-history.mjs`,
`shiller-history.mjs` (housing only), and `world-development.mjs`.

### Verification

| Path                              | Purpose                                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/verify-data.mjs`         | Snapshot/version, provenance, ordering, unit, and coverage checks.                                                                                   |
| `scripts/verify-delivery.mjs`     | Lossless chunk/hash checks, ten default macro histories, request deduplication, persistence, eviction, private-mode fallback, and rollover behavior. |
| `scripts/verify-panel.mjs`        | Numeric panel transform and native-frequency fixtures.                                                                                               |
| `scripts/verify-macro-report.mjs` | Deterministic report fixture and source-boundary checks.                                                                                             |
| `scripts/verify-parity.mjs`       | Every report point compared with its corresponding dashboard transformation.                                                                         |
| `scripts/verify-site.mjs`         | Exactly-two-page DOM/source contract and legacy-entrypoint checks.                                                                                   |

The repository's operational support files are `.github/workflows/pages.yml`
(GitHub Pages build), `.github/workflows/vercel.yml` (Vercel build),
`.github/workflows/refresh-data.yml` (daily source refresh), `DATA_AUDIT.md`
(scope and acceptance record), `macro-research.md` and `commodity-research.md` (dated source notes), `PERFORMANCE.md` (delivery contract),
`SUBMISSION.md` (course handoff), `public/favicon.svg` (brand mark), and
`public/fonts/OFL.txt` and `public/fonts/README.md` (font licenses, attribution and hashes), `.gitignore` (generated/local artifacts), and `.prettierignore` (generated-data formatting exclusions).

## Privacy and security

MacroTrace has no accounts, tracking cookies, database, or embedded private
credentials. Deployment credentials are supplied only through the publishing
workflow's secret environment. The browser cache stores public histories, not
user portfolios. Public source terms and attribution remain the responsibility
of anyone reusing the data.

## Design

The shared typography is Outfit and Geist Mono, self-hosted with their font
licenses. Warm-charcoal surfaces, gold accents and the heading gradient match
the current SIMFOL.io theme; its repositories remain unchanged. Interactive
wireframe/globe treatments on [21st.dev](https://21st.dev/@moazamtrade/components/wireframe-dotted-globe)
were a visual reference, not a copied component or dependency. MacroTrace's
orbit is original mathematical canvas geometry, explicitly decorative rather
than an economic chart, and honors reduced-motion preferences.
