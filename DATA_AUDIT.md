# Macro-only data audit — September 29, 2026

MacroTrace now publishes only economic indicators: prices, labor, output,
housing, monetary policy, credit, fiscal conditions, productivity, demography,
exchange rates and commodity reference prices. Stocks, ETFs, equity indexes,
investment-factor portfolios and simulated/spliced investment returns were
removed from the snapshot, application, refresh path and deployable histories.
No private Simfolio infrastructure or credentials are used.

## Retained coverage

The reviewed snapshot contains **294 series and 615,455 observations**.
Its daily provider check is dated **2026-09-29T16:54:50.951Z**; observation
coverage runs from **1209-01-01 through 2026-09-28**. This does not imply all
series are current: archived NBER and Bank of England histories retain their
actual end dates and archive explanations.

| Topic        | Series |
| ------------ | -----: |
| Commodities  |     99 |
| Credit       |     20 |
| Currencies   |     20 |
| Demography   |      8 |
| Fiscal       |      5 |
| Growth       |     41 |
| Housing      |     16 |
| Inflation    |     23 |
| Labor        |     38 |
| Productivity |      4 |
| Rates        |     20 |

Source families are FRED (185), World Bank Pink Sheet (87), World Development
Indicators (20), and Robert J. Shiller's housing indexes (2). FRED is the
distributor, not necessarily the original author; series-level provider links
and definitions remain visible. The [generated inventory](public/data/source-inventory.md)
and [CSV](public/data/source-inventory.csv) list every series, its units,
frequency, actual coverage and attribution. These inventories update with each
successful scheduled refresh; the counts in this audit are a dated checkpoint.

## Definitions and boundaries

- Each row is one indicator, geography, actual source date and reported value.
  Native daily, weekly, monthly, quarterly and annual grain is preserved.
- Levels retain original units. Percentage-valued rates use percentage-point
  differences. Signed/diffusion indexes use point differences; signed dollar
  quantities and non-percent rates keep their native difference units.
- Positive prices/counts use `100 × (current / baseline − 1)`; a missing or
  nonpositive baseline is unavailable, never a fabricated return.
- YoY matches the same calendar period a year earlier. Daily/weekly comparisons
  use the last observation on or before that boundary, at most seven days old;
  unmatched leap-day boundaries remain unavailable. Previous-observation change
  uses the preceding actual release, not an assumed daily/monthly interval.
- Monthly heat-map cells are the last actual observation in each month, using
  the selected measure. Annual histories have cells only in their source month.
  Missing comparisons remain blank; no forward filling or interpolation occurs.
- Latest-reading percentiles use midranks within each series' filtered history.
  Direction counts are above/below/equal-to-zero counts, not an economic health
  score. Unlike units are never pooled into a growth rate or level average.
- Pink Sheet prices are nominal monthly averages and price indexes, not futures
  returns. Shiller home prices are author-defined annual housing research indexes
  from 1890, not tradable securities; complete post-1953 years use monthly means.

## Refresh, verification and delivery

The scheduled 11:17 UTC workflow checks accepted providers daily, validates
the result and republishes the same site to Vercel and the course GitHub Pages
mirror. Release frequency remains source-defined. Retrieval failures preserve
the last successful observations with explicit status and original check time.
Provider check time is never substituted for an economic observation date.

`npm run check` verifies macro eligibility, provenance, finite/order/date
contracts, every lossless history hash, browser persistence/fallback/version
behavior, numeric fixtures, all report/dashboard point parity, the two-page
contract and the production build. Obsolete generated history files are removed
before publishing so excluded securities cannot survive in the runtime corpus.
The report's eight findings and four headlines are calculated from source rows,
not hardcoded economic values.

This is an explicit product scope and validation audit, not a claim to have
exhausted every public dataset on the internet. Public accessibility does not
waive provider attribution or third-party reuse conditions. No additional paid
storage, worker, database or capacity setting was introduced.

## Redesign verification checkpoint

Local production-build checks used Chromium at 1440/1920-pixel desktop and
360/390-pixel mobile viewports. These are browser-emulated viewports, not a
physical-phone certification. The report rendered all eight plots, four
headlines and 294 catalog entries with Outfit and the current SIMFOL.io base
palette. Topic, period, measure and group selectors were exercised through
the visible UI; geographic/frequency/custom-date combinations were also
checked diagnostically. No horizontal page overflow or browser errors were
observed in those checks.

The full-history reported-level view exposed all 615,455 actual source rows;
the observation table remained paginated at 40 rows. A Labor CSV contained
exactly the selected 2,326 rows, not only the displayed table page. Empty-search
and reset states were checked. Expanded-chart period selection, log eligibility,
keyboard legend inspection, legend toggling/reset and nested mobile selectors
worked. Reduced-motion emulation stopped the decorative orbit at rest while
keyboard rotation remained available. Independent formula fixtures passed,
and all 18,899 report points matched the dashboard transforms.

The final label review corrected [initial claims](https://fred.stlouisfed.org/series/ICSA)
to a count of claims, not thousands, and [PPOILUSDM](https://fred.stlouisfed.org/series/PPOILUSDM)
to palm oil in USD per metric ton, not crude oil per barrel. VIX was removed as
an equity-options-derived market indicator. Global IMF commodity references,
world aggregates and euro-area GDP are not attributed to the United States.
