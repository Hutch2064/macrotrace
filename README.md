# MacroTrace

MacroTrace is a public economic report, interactive dashboard, and categorized source catalog built by Aidan Hutchison. It connects 148 macroeconomic, labor, inflation, growth, rate, housing, currency, and financial-condition series with 39 public long-history research indexes and 33 daily Yahoo market benchmarks (18 ETFs and 15 country/region indexes). A unified search adds FRED series or Yahoo Finance instruments immediately, while 21 presets load standardized sector, currency, commodity, labor, inflation, growth, rates, housing, conditions, global-market, century-asset-class, and size/style views. Annual World Bank inflation rates remain separate from monthly CPI indexes; native frequencies are never presented as live observations.

The dashboard has two explicit analytical modes. Macro mode uses percentile-ranked economic signals, observation-to-observation momentum, growth/level cycle percentiles, observation age, frequency-aware correlation, a month-over-month heat map, and category breadth. Markets mode uses cumulative return paths, horizon returns, return-momentum percentiles, drawdown, annualized log-return volatility, frequency-aware correlation, a return heat map, and return-versus-risk. Log scale is available only where it is mathematically valid. Time-series panels use uPlot with crosshairs, a below-chart value rail, clickable legends, drag zoom, keyboard date inspection, and full-screen expansion. Cumulative-change small multiples accompany twelve comparison and diagnostic panels. The responsive grid expands to five square cards across wide displays.

## Live sites

### September 2026 interaction update

The catalog now contains 220 series and 21 presets, including household debt service, credit-card delinquency, and residential mortgage delinquency from the Federal Reserve via FRED. These are quarterly releases—not daily measurements. The Data Sources catalog lists the 187 non-Yahoo series; securities-provider coverage is summarized separately without a ticker inventory.

Individual cards show the latest native-period change and the observation date alongside the snapshot check time. Daily market changes are close-to-close, not intraday quotes. Cards plot cumulative percentage change from the horizon boundary; rates use basis points and signed indexes use points. Expanded cards offer twelve horizon labels; “previous 12 months” and “1 year” intentionally use the same calendar window. Log mode plots the positive wealth index but converts axes and inspection readouts back to cumulative percent changes. The banner has its own persisted horizon, and each item opens its corresponding chart.

Four additional panels show rolling annual changes, rolling annualized variability, an empirical change distribution for the first selected series, and cross-series breadth/acceleration. Macro paths use full-history percentile ranks to compare incompatible units without clipping outliers. Monthly/quarterly/annual data are never interpolated into daily returns. Volatility uses adjacent native log returns for positive levels (semantic changes for rates/signed indexes), sample standard deviation, and the native annualization factor. Breadth is the share of measured series with positive complete-period changes; acceleration is the share whose change exceeds its preceding complete-period change. Neither means “economically good.” Distribution bins retain the full range, including genuine extremes.

Research references: [FRED aggregation and observation contract](https://fred.stlouisfed.org/docs/api/fred/series_observations.html), [Federal Reserve debt-service ratios](https://fred.stlouisfed.org/series/TDSP), [credit-card delinquency](https://fred.stlouisfed.org/series/DRCCLACBS), [mortgage delinquency](https://fred.stlouisfed.org/series/DRSFRMACBS), and [research on realized volatility and correlation](https://www.nber.org/papers/w7933). The older OECD normalized CLI mirror was reviewed but not bundled because its published observations stop in 2024.

Window and banner results are cached by immutable snapshot identity. Offscreen plots are prepared within 600 pixels of the viewport, while cached mode views preserve charts. Touch, pointer, and keyboard inspection use the full-resolution data. Daily publication remains automatic; an open page checks the version manifest hourly and on return to the tab.

- Vercel: https://macrotrace.vercel.app
- GitHub Pages: https://hutch2064.github.io/macrotrace/

## Run locally

```bash
npm install
npm run data:refresh
npm run dev
```

Run `npm run check` before publishing. It validates the data contract and creates all three production pages in `dist/`.

## Data and calculations

Macroeconomic observations come from the [Federal Reserve Bank of St. Louis FRED](https://fred.stlouisfed.org/) CSV service. The bundled daily benchmark catalog and on-demand ticker histories use adjusted closing prices from [Yahoo Finance](https://finance.yahoo.com/) when available. VT is explicitly an ETF proxy for global equities, not a published global index. Country indexes remain distinct from ETFs. Additional on-demand histories are cached in the browser rather than committed. Market responses use a five-minute CDN cache with a one-hour stale fallback and a bounded six-hour browser cache; bundled observations refresh daily, and arbitrary FRED series use a one-hour CDN cache. A collection hover prefetches its optional market symbols; first-time provider requests are not claimed to be instantaneous. Observation dates and successful check dates are disclosed. A latest daily Yahoo bar may still be in progress. Missing or non-numeric rows are removed and native release frequencies are preserved.

The long-history library is separate from live ETFs and contains no hidden splices:

- Seven monthly [Kenneth R. French Data Library](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html) research indexes begin in June 1926: the U.S. equity market plus large/small growth, core, and value portfolios. Source returns are percentages, missing sentinels (`-99.99`, `-999`) are rejected, and valid returns are compounded from a $100 anchor. These are academic research portfolios—not ETFs, investable funds, or backward extensions of modern tickers. French notes that histories can change when CRSP revises its database; each refresh records the exact source-archive SHA-256.
- Ten monthly U.S. industry research portfolios extend the French library back to 1926. Five regional markets (developed, developed ex-U.S., Europe, Japan, and Asia-Pacific ex-Japan) each expose a market index and clearly labeled long-short size/value factor indexes from 1990. Factor indexes are not ordinary long-only asset holdings.
- Seven annual [Aswath Damodaran / NYU Stern](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html) research indexes begin at year-end 1927: S&P 500 total return, bottom-decile U.S. small stocks, 3-month bills, 10-year Treasury total return, Baa corporate-bond total return, real estate, and gold price return. The published annual frequency is preserved with no monthly interpolation, and each refresh records the source-page SHA-256.

Public availability does not imply identical definitions or unrestricted commercial reuse. MacroTrace is a noncommercial course project, retains direct attribution/source links, publishes transformations rather than source workbooks, and keeps research portfolios visually distinct from live Yahoo instruments. Users should review each provider’s current terms before reusing the data elsewhere.

- Positive quantities, price indexes, currencies, and securities: `(last / first − 1) × 100`
- Rates and percentage-point series: `(last − first) × 100` basis points
- Signed economic indexes: `last − first` index points
- Macro position: 12-month growth for positive quantities, levels for rates/signed indexes, ranked against the same full-history signal with midpoint tie ranks
- Security volatility: sample standard deviation of adjacent log returns, annualized by native daily, weekly, monthly, quarterly, or annual frequency
- Correlation: Pearson correlation of aligned complete month/quarter/year changes at the coarsest selected frequency—never raw levels; sample counts are displayed
- Drawdown: `value / running peak − 1`, only for positive market-price paths

The committed snapshot pins every report number to reproducible data. Calendar cutoffs prefer an exact boundary observation, otherwise the prior observed boundary. Short horizons do not silently widen to twelve observations. Independent source-boundary tests cover CPI, payrolls, PCE, the French market index, and annual gold returns. A scheduled GitHub Action refreshes and verifies the snapshot daily, then explicitly dispatches both publishing workflows (bot pushes alone do not trigger them). Source failures retain the last successful observations with an explicit status; stale observations beyond frequency-specific limits fail the publication checks. A content-derived version binds each build to its snapshot. The refresh workflow runs daily at 11:17 UTC (GitHub may delay scheduled starts), commits both the snapshot and a small version manifest, and republishes both hosts. Every report heading is derived deterministically from the snapshot. Open pages check the manifest hourly and on returning to the tab; a newer snapshot updates the banner and report without manual editing or reloading. Values only change when their source publishes new or revised observations. The scrolling tape includes every bundled series with its observation date and an appropriate level or one-year change. Both analysis modes retain their rendered views for fast return visits; changing the horizon recalculates the affected view. This product uses FRED® data but is not endorsed or certified by the Federal Reserve Bank of St. Louis. Some source series may carry additional provider terms; MacroTrace provides attribution and source links for each series.

## Files

| Path                                 | Purpose                                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                         | Scrollable report with headline numbers, eight findings, eight charts, and a source-catalog link.                                      |
| `dashboard.html`                     | Two-mode interactive dashboard with essential controls, metrics, comparison/individual charts, and reset.                              |
| `src/common.js`                      | Shared data loading, formatting, navigation, calculation adapters, and Chart.js defaults.                                              |
| `src/analytics.js`                   | Pure calendar/frequency-aware transforms, returns, drawdowns, volatility, correlations, ranks, and regression-tested window semantics. |
| `src/time-chart.js`                  | Responsive uPlot time-series renderer with value rails, legends, zoom, and keyboard inspection.                                        |
| `src/series-cache.js`                | Bounded browser cache and in-flight request deduplication for optional provider histories.                                             |
| `src/report.js`                      | Reproducible report findings and chart rendering.                                                                                      |
| `src/dashboard.js`                   | Dashboard state, filtering, search, calculations, charts, retained mode views, and expanded-chart controls.                            |
| `src/presets.js`                     | Declarative high-level macro and market preset definitions.                                                                            |
| `src/styles.css`                     | Responsive black-and-gold visual system shared across the site.                                                                        |
| `public/data/snapshot.json`          | Versioned public snapshot used by the report and dashboard.                                                                            |
| `public/favicon.svg`                 | MacroTrace brand mark.                                                                                                                 |
| `scripts/catalog.mjs`                | Declarative catalog of FRED and market series.                                                                                         |
| `scripts/long-history.mjs`           | Validated Fama–French and Damodaran ingestion, compounding, labels, and provenance hashes.                                             |
| `scripts/refresh-data.mjs`           | Concurrent public-data ingestion and normalization.                                                                                    |
| `scripts/verify-data.mjs`            | Data-contract, ordering, metadata, and coverage checks.                                                                                |
| `scripts/verify-analytics.mjs`       | Deterministic calculation fixtures and snapshot checks.                                                                                |
| `scripts/verify-release.mjs`         | Independent exact source-boundary calculations and release health checks.                                                              |
| `scripts/verify-api.mjs`             | Offline, mocked endpoint validation and provider-failure tests.                                                                        |
| `scripts/verify-dashboard.mjs`       | Preset integrity and explicit macro/market semantic regression checks.                                                                 |
| `api/market.js`                      | Validated, CDN-cached Vercel endpoint for on-demand ticker history.                                                                    |
| `api/search.js`                      | Unified bundled, Yahoo Finance, and FRED search endpoint.                                                                              |
| `api/fred.js`                        | Validated, cached endpoint for arbitrary public FRED series.                                                                           |
| `.github/workflows/pages.yml`        | Builds and publishes the static site to GitHub Pages.                                                                                  |
| `.github/workflows/refresh-data.yml` | Refreshes, checks, and commits the public snapshot daily.                                                                              |
| `.github/workflows/vercel.yml`       | Verifies and publishes the production Vercel deployment.                                                                               |
| `package.json`, `package-lock.json`  | Reproducible dependencies and development, test, and formatting commands.                                                              |
| `.gitignore`                         | Excludes dependencies, build output, local settings, and credentials.                                                                  |
| `vite.config.js`                     | Three-page Vite production build configuration.                                                                                        |
| `vercel.json`                        | CDN and browser security headers.                                                                                                      |
| `.env.example`                       | Documents the optional public market API origin without secrets.                                                                       |
| `SUBMISSION.md`                      | Four-line course submission record.                                                                                                    |

### Source catalog and refresh support

| Path                                                                | Purpose                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `sources.html`, `src/sources.js`, `src/sources.css`                 | Searchable categorized references, per-series provenance, observed values, and CSV exports. |
| `src/ticker.js`                                                     | Unit-aware readings for every bundled series in the daily tape.                             |
| `src/horizons.js`, `src/series-view.js`                             | Shared horizon contract, native-period headlines, and cumulative/log chart transformations. |
| `src/select.js`, `src/disclosure.js`                                | Accessible shared selectors and animated source disclosures with reduced-motion support.    |
| `src/lazy-chart.js`                                                 | Viewport-aware chart construction and cleanup.                                              |
| `src/diagnostics.js`                                                | Pure rolling, distribution, and breadth diagnostics.                                        |
| `scripts/verify-interactions.mjs`, `scripts/verify-diagnostics.mjs` | Exhaustive horizon parity and diagnostic edge-case checks.                                  |
| `src/report-readings.js`                                            | Pure deterministic report-title calculations.                                               |
| `scripts/market-catalog.mjs`                                        | Explicit Yahoo benchmark identifiers, instrument types, names, and units.                   |
| `public/data/version.json`                                          | Small snapshot manifest for open-page background refresh.                                   |
| `scripts/verify-experience.mjs`                                     | Complete tape coverage, changing report findings, and daily workflow regression checks.     |
| `scripts/verify-sources.mjs`                                        | Source completeness and catalog wiring checks.                                              |

For a bounded update of only the bundled Yahoo benchmarks, run `npm run data:refresh -- --markets-only`. The scheduled workflow refreshes all providers.

## Privacy and security

MacroTrace has no accounts, tracking cookies, database, or private credentials. Optional provider data is cached in this browser’s local storage only; no user portfolio is stored. The public project contains no Simfolio source code, secrets, private endpoints, or internal data. The ticker endpoint accepts only a short validated symbol; it never accepts arbitrary upstream URLs.
