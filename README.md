# MacroTrace

MacroTrace is a public, two-page economic report and interactive dashboard built by Aidan Hutchison. It connects 145 macroeconomic, labor, inflation, growth, rate, housing, currency, and financial-condition series with 39 public long-history research indexes. A unified search adds FRED series or Yahoo Finance instruments immediately, while 20 presets load standardized sector, currency, commodity, labor, inflation, growth, rates, housing, conditions, global-market, century-asset-class, and size/style views. Annual World Bank inflation rates remain separate from monthly CPI indexes; native frequencies are never presented as live observations.

The dashboard has two explicit analytical modes. Macro mode uses standardized economic signals, observation-to-observation momentum, growth/level cycle percentiles, observation age, frequency-aware correlation, a month-over-month heat map, and category breadth. Markets mode uses indexed return paths, horizon returns, return-momentum percentiles, drawdown, annualized log-return volatility, frequency-aware correlation, a return heat map, and return-versus-risk. Log scale is available only where it is mathematically valid. Time-series panels use uPlot with crosshairs, a below-chart value rail, clickable legends, drag zoom, keyboard date inspection, and full-screen expansion. Native-unit small multiples accompany the eight comparison panels. The responsive grid expands to five square cards across wide displays.

## Live sites

- Vercel: https://macrotrace.vercel.app
- GitHub Pages: https://hutch2064.github.io/macrotrace/

## Run locally

```bash
npm install
npm run data:refresh
npm run dev
```

Run `npm run check` before publishing. It validates the data contract and creates both production pages in `dist/`.

## Data and calculations

Macroeconomic observations come from the [Federal Reserve Bank of St. Louis FRED](https://fred.stlouisfed.org/) CSV service. On-demand ticker histories use adjusted closing prices from [Yahoo Finance](https://finance.yahoo.com/) when available and are not committed to this repository. Market responses use a five-minute CDN cache with a one-hour stale fallback and a bounded six-hour browser cache; bundled observations refresh daily, and arbitrary FRED series use a one-hour CDN cache. A collection hover prefetches its optional market symbols; first-time provider requests are not claimed to be instantaneous. Observation dates and successful check dates are disclosed. A latest daily Yahoo bar may still be in progress. Missing or non-numeric rows are removed and native release frequencies are preserved.

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

The committed snapshot pins every report number to reproducible data. Calendar cutoffs prefer an exact boundary observation, otherwise the prior observed boundary. Short horizons do not silently widen to twelve observations. Independent source-boundary tests cover CPI, payrolls, PCE, the French market index, and annual gold returns. A scheduled GitHub Action refreshes and verifies the snapshot daily, then explicitly dispatches both publishing workflows (bot pushes alone do not trigger them). Source failures preserve prior data for diagnosis but block publication until checks pass. A content-derived version binds each build to its snapshot. This product uses FRED® data but is not endorsed or certified by the Federal Reserve Bank of St. Louis. Some source series may carry additional provider terms; MacroTrace provides attribution and source links for each series.

## Files

| Path                                 | Purpose                                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                         | Scrollable report with headline numbers, eight findings, eight charts, and methodology.                                                |
| `dashboard.html`                     | Two-mode interactive dashboard with essential controls, metrics, eight charts, source table, reset, and CSV download.                  |
| `src/common.js`                      | Shared data loading, formatting, navigation, calculation adapters, and Chart.js defaults.                                              |
| `src/analytics.js`                   | Pure calendar/frequency-aware transforms, returns, drawdowns, volatility, correlations, ranks, and regression-tested window semantics. |
| `src/time-chart.js`                  | Responsive uPlot time-series renderer with value rails, legends, zoom, and keyboard inspection.                                        |
| `src/series-cache.js`                | Bounded browser cache and in-flight request deduplication for optional provider histories.                                             |
| `src/report.js`                      | Reproducible report findings and chart rendering.                                                                                      |
| `src/dashboard.js`                   | Dashboard state, filtering, search, calculations, charts, table, and export.                                                           |
| `src/presets.js`                     | Declarative high-level macro and market preset definitions.                                                                            |
| `src/styles.css`                     | Responsive black-and-gold visual system shared by both pages.                                                                          |
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
| `vite.config.js`                     | Two-page Vite production build configuration.                                                                                          |
| `vercel.json`                        | CDN and browser security headers.                                                                                                      |
| `.env.example`                       | Documents the optional public market API origin without secrets.                                                                       |
| `SUBMISSION.md`                      | Four-line course submission record.                                                                                                    |

## Privacy and security

MacroTrace has no accounts, tracking cookies, database, or private credentials. Optional provider data is cached in this browser’s local storage only; no user portfolio is stored. The public project contains no Simfolio source code, secrets, private endpoints, or internal data. The ticker endpoint accepts only a short validated symbol; it never accepts arbitrary upstream URLs.
