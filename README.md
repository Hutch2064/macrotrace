# MacroTrace

MacroTrace is a public, two-page economic report and interactive dashboard built by Aidan Hutchison. It connects 24 macroeconomic series from FRED with 16 market and sector histories, then calculates comparable horizons, normalized paths, changes, volatility, and monthly correlations directly in the browser.

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

Macroeconomic observations come from the [Federal Reserve Bank of St. Louis FRED](https://fred.stlouisfed.org/) CSV service. Market histories use adjusted closing prices from [Yahoo Finance](https://finance.yahoo.com/) when available. The catalog records every series ID, human-readable name, category, unit, frequency, and source link. Missing or non-numeric rows are removed and native release frequencies are preserved.

- Indexed: `value / first visible value × 100`
- Period change: `(last / first − 1) × 100`
- Year-over-year: `(latest / prior-year observation − 1) × 100`
- Volatility: sample standard deviation of adjacent percentage changes, annualized by native frequency
- Correlation: Pearson correlation of aligned calendar-month percentage changes

The committed snapshot pins every report number to reproducible data. A scheduled GitHub Action refreshes and verifies it daily. This product uses FRED® data but is not endorsed or certified by the Federal Reserve Bank of St. Louis. Some source series may carry additional provider terms; MacroTrace provides attribution and source links for each series.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Scrollable report with headline numbers, eight findings, eight charts, and methodology. |
| `dashboard.html` | Interactive dashboard with filters, metrics, four charts, source table, reset, and CSV download. |
| `src/common.js` | Shared data loading, calculations, formatting, navigation, and Chart.js defaults. |
| `src/report.js` | Reproducible report findings and chart rendering. |
| `src/dashboard.js` | Dashboard state, filtering, search, calculations, charts, table, and export. |
| `src/styles.css` | Responsive black-and-gold visual system shared by both pages. |
| `public/data/snapshot.json` | Versioned public snapshot used by the report and dashboard. |
| `public/favicon.svg` | MacroTrace brand mark. |
| `scripts/catalog.mjs` | Declarative catalog of FRED and market series. |
| `scripts/refresh-data.mjs` | Concurrent public-data ingestion and normalization. |
| `scripts/verify-data.mjs` | Data-contract, ordering, metadata, and coverage checks. |
| `api/market.js` | Validated, CDN-cached Vercel endpoint for on-demand ticker history. |
| `.github/workflows/pages.yml` | Builds and publishes the static site to GitHub Pages. |
| `.github/workflows/refresh-data.yml` | Refreshes, checks, and commits the public snapshot daily. |
| `vite.config.js` | Two-page Vite production build configuration. |
| `vercel.json` | CDN and browser security headers. |
| `.env.example` | Documents the optional public market API origin without secrets. |
| `SUBMISSION.md` | Four-line course submission record. |

## Privacy and security

MacroTrace has no accounts, cookies, database, or private credentials. The public project contains no Simfolio source code, secrets, private endpoints, or internal data. The ticker endpoint accepts only a short validated symbol; it never accepts arbitrary upstream URLs.
