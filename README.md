# MacroTrace

MacroTrace is a public, two-page economic report and interactive dashboard built by Aidan Hutchison. It connects 78 public macroeconomic, labor, inflation, growth, rate, housing, currency, and financial-condition series from FRED. A unified search adds FRED series or Yahoo Finance instruments immediately, while one-click presets load standardized sector, currency, commodity, labor, inflation, growth, rates, housing, conditions, and global-market views.

Every selected series flows through the same six-panel analytical grid: path, multi-horizon momentum, historical percentile, maximum drawdown, annualized volatility, and correlation to the first selected series. The path supports linear and logarithmic scaling (with a safe linear fallback for nonpositive data); every panel has exact-value tooltips, click-to-toggle legends where applicable, and a full-screen expand control.

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

Macroeconomic observations come from the [Federal Reserve Bank of St. Louis FRED](https://fred.stlouisfed.org/) CSV service. On-demand ticker histories use adjusted closing prices from [Yahoo Finance](https://finance.yahoo.com/) when available and are not committed to this repository. Market responses are cached for five minutes with a one-hour stale fallback; bundled FRED observations refresh daily, and arbitrary FRED series use a one-hour cache. The catalog records every bundled series ID, human-readable name, category, unit, frequency, transformation, and source link. Missing or non-numeric rows are removed and native release frequencies are preserved.

- Indexed: `value / first visible value × 100`
- Period change: `(last / first − 1) × 100`
- Year-over-year: `(latest / prior-year observation − 1) × 100`
- Volatility: sample standard deviation of adjacent log returns, annualized by native frequency
- Correlation: Pearson correlation of aligned calendar-month percentage changes
- Historical percentile: the latest active measure ranked against its full available history
- Drawdown and volatility: conventional returns for strictly positive series; range-normalized changes for series that cross zero

The committed snapshot pins every report number to reproducible data. A scheduled GitHub Action refreshes and verifies it daily. This product uses FRED® data but is not endorsed or certified by the Federal Reserve Bank of St. Louis. Some source series may carry additional provider terms; MacroTrace provides attribution and source links for each series.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Scrollable report with headline numbers, eight findings, eight charts, and methodology. |
| `dashboard.html` | Interactive dashboard with filters, metrics, four charts, source table, reset, and CSV download. |
| `src/common.js` | Shared data loading, calculations, formatting, navigation, and Chart.js defaults. |
| `src/report.js` | Reproducible report findings and chart rendering. |
| `src/dashboard.js` | Dashboard state, filtering, search, calculations, charts, table, and export. |
| `src/presets.js` | Declarative high-level macro and market preset definitions. |
| `src/styles.css` | Responsive black-and-gold visual system shared by both pages. |
| `public/data/snapshot.json` | Versioned public snapshot used by the report and dashboard. |
| `public/favicon.svg` | MacroTrace brand mark. |
| `scripts/catalog.mjs` | Declarative catalog of FRED and market series. |
| `scripts/refresh-data.mjs` | Concurrent public-data ingestion and normalization. |
| `scripts/verify-data.mjs` | Data-contract, ordering, metadata, and coverage checks. |
| `scripts/verify-dashboard.mjs` | Preset integrity, roll-up, percentile, drawdown, and volatility regression checks. |
| `api/market.js` | Validated, CDN-cached Vercel endpoint for on-demand ticker history. |
| `api/search.js` | Unified bundled, Yahoo Finance, and FRED search endpoint. |
| `api/fred.js` | Validated, cached endpoint for arbitrary public FRED series. |
| `.github/workflows/pages.yml` | Builds and publishes the static site to GitHub Pages. |
| `.github/workflows/refresh-data.yml` | Refreshes, checks, and commits the public snapshot daily. |
| `vite.config.js` | Two-page Vite production build configuration. |
| `vercel.json` | CDN and browser security headers. |
| `.env.example` | Documents the optional public market API origin without secrets. |
| `SUBMISSION.md` | Four-line course submission record. |

## Privacy and security

MacroTrace has no accounts, cookies, database, or private credentials. The public project contains no Simfolio source code, secrets, private endpoints, or internal data. The ticker endpoint accepts only a short validated symbol; it never accepts arbitrary upstream URLs.
