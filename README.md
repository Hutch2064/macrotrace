# MacroTrace

MacroTrace is a public, two-page economic report and interactive dashboard built by Aidan Hutchison. It connects 78 public macroeconomic, labor, inflation, growth, rate, housing, currency, and financial-condition series from FRED. A unified search adds FRED series or Yahoo Finance instruments immediately, while one-click presets load standardized sector, currency, commodity, labor, inflation, growth, rates, housing, conditions, and global-market views.

The dashboard has two explicit analytical modes. Macro mode uses standardized cycle position, release-to-release momentum, stationary-change percentiles, release freshness, monthly-change correlation, a month-over-month heat map, and category breadth. Markets mode uses indexed adjusted-close paths, horizon returns, price percentiles, drawdown, annualized log-return volatility, monthly-return correlation, a return heat map, and return-versus-risk. Log scale is available only where it is mathematically valid. Every panel has exact-value tooltips, interactive legends where applicable, and a full-screen expand control.

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

- Positive quantities, price indexes, currencies, and securities: `(last / first − 1) × 100`
- Rates and percentage-point series: `(last − first) × 100` basis points
- Signed economic indexes: `last − first` index points
- Macro position: the latest native-period semantic change ranked against its own full history, with midpoint tie ranks
- Security volatility: sample standard deviation of adjacent log returns, annualized by native frequency
- Correlation: Pearson correlation of independently transformed, aligned calendar-month changes—never raw levels
- Drawdown: `value / running peak − 1`, only for positive market-price paths

The committed snapshot pins every report number to reproducible data. A scheduled GitHub Action refreshes and verifies it daily. This product uses FRED® data but is not endorsed or certified by the Federal Reserve Bank of St. Louis. Some source series may carry additional provider terms; MacroTrace provides attribution and source links for each series.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Scrollable report with headline numbers, eight findings, eight charts, and methodology. |
| `dashboard.html` | Two-mode interactive dashboard with essential controls, metrics, eight charts, source table, reset, and CSV download. |
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
| `scripts/verify-dashboard.mjs` | Preset integrity and explicit macro/market semantic regression checks. |
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
