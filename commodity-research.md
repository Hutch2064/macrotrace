# World Bank Pink Sheet commodity-history audit

Audited 22 September 2026 against the World Bank Prospects Group's official
Commodity Markets page and the current linked workbooks (published/updated 2
September 2026):

- [Commodity Markets / Pink Sheet landing page](https://www.worldbank.org/en/research/commodity-markets)
- [Monthly workbook](https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx)
- [Annual workbook](https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Annual.xlsx)
- [World Bank Data Catalog: Commodity prices—history and projections](https://datacatalog.worldbank.org/search/dataset/0038238/commodity-prices-history-and-projections)
- [Summary terms of use](https://data.worldbank.org/summary-terms-of-use)

## What was downloaded and parsed

`node scripts/verify-commodity-history.mjs` downloads both XLSX files and
re-parses them on every run. The current result is 172 series:

- 87 monthly series through `2026-08-01`: 71 nominal benchmark price columns
  plus 16 nominal commodity indices, with source rows beginning in `1960M01`
  where the benchmark exists.
- 85 annual nominal series through `2025-01-01`: 69 annual price columns plus
  16 nominal indices. The annual workbook has a slightly different price
  column set from the monthly workbook (for example, some oilseed series are
  not present), so the parser does not invent missing annual observations.

The module is [`scripts/commodity-history.mjs`](scripts/commodity-history.mjs)
and exports `WORLD_BANK_PINK_SHEET`, `discoverPinkSheetUrls()`, and
`fetchCommodityHistorySeries({ includeAnnual = false, includeAnnualReal = false,
fetchImpl, urls })`. The default result contains 87 monthly series.
`includeAnnual:true` adds annual nominal prices and indices. The annual
workbook's real-dollar price and index sheets are available only when
`includeAnnualReal:true` is requested.

Each returned object follows the snapshot shape (`id`, `name`, `category`,
`unit`, `frequency`, `source`, `sourceUrl`, `methodology`, `observations`) and
also includes `provenance`, `sourceAsOf`, `sourceHash`, `kind`, `historyType`,
`assetClass`, `dataRole`, `valueType`, and an explicit non-total-return
treatment in `dividendTreatment`. Missing workbook cells (`…`, `...`, and
other nonnumeric placeholders) are omitted; dates are not interpolated or
forward-filled. Every file hash is retained in both `sourceHash` and
`provenance.sourceHash`.

`discoverPinkSheetUrls()` first reads the official landing page and extracts
the current monthly/annual XLSX links. If the page is unavailable or does not
expose the links, the module falls back to the last tested direct URLs above;
the verification script therefore makes a stale-link problem visible.

## Frequency and economic semantics

The World Bank's Pink Sheet table is a set of benchmark price levels and group
price indices. It is not a total-return database:

- Monthly benchmark prices are source-reported monthly averages in nominal U.S.
  dollars, not end-of-month closes. The [World Bank Global Economic Prospects
  report](https://documents1.worldbank.org/curated/en/957321641964985120/pdf/Global-Economic-Prospects-January-2022.pdf)
  describes these as monthly average price data in U.S. dollar terms.
- Monthly indices are nominal 2010=100 source indices. The workbook's
  definitions identify the index construction as Laspeyres-based with
  source-defined weights.
- Annual rows are source-published calendar-year values. The parser represents
  them at `YYYY-01-01` solely as a canonical annual date; it does not label
  them as year-end observations or manufacture an annual close.
- The workbook says monthly series are available only in nominal dollars. The
  annual workbook additionally provides real 2010-dollar prices and indices;
  those are opt-in and are not silently mixed with nominal series.

Individual benchmark definitions, units, grades, delivery bases, and source
changes are retained by the workbook's `Description` sheet and attached to the
workbook through `provenance.sourceFile`, `provenance.sheet`, and
`provenance.sourceColumn`. Examples include WTI beginning in 1982 in this
vintage, later changes to coal and LME settlement-price definitions, and
estimated recent observations for some LNG series. Three current-vintage price
columns have persistent empty tails (Barley, Sorghum, and Mexican shrimp); the
parser marks these objects `historyStatus: "archived"` with a plain-English
`archiveReason`, and preserves the last observed date instead of forward-filling.
The U.S. import tobacco column also lags the workbook's latest row in this
vintage, but is explicitly marked `availabilityStatus: "source_lagged"`, not
archived, because a short source tail alone does not establish delisting. These
are precise data-state classifications, not unsupported claims that an
underlying market ceased trading. A benchmark with a long history is therefore
not necessarily one unchanged physical instrument.

The broad indices include total, energy, non-energy, agriculture, beverages,
food, oils and meals, grains, other food, raw materials, timber, fertilizers,
metals and minerals, base metals excluding iron ore, and precious metals.
They are useful for comparative nominal price-level analysis, but should not be
read as investable baskets or total-return portfolios.

## Redistribution and attribution

The World Bank's [Summary Terms of Use](https://data.worldbank.org/summary-terms-of-use)
says that, unless metadata indicates otherwise, datasets may be copied,
distributed, adapted, displayed, or included in other products at no cost under
CC BY 4.0. It requires attribution to the World Bank and data providers,
permits APIs for dataset access, prohibits implying World Bank endorsement, and
warns that some datasets or indicators may contain third-party material with
additional restrictions. The Data Catalog currently classifies the commodity
prices dataset as public and lists Creative Commons Attribution 4.0.

The module keeps the World Bank source name, direct workbook URL, landing page,
terms URL, workbook vintage, source sheet/column, and SHA-256 hash in its
metadata so a downstream snapshot or hosted page can provide attribution and
reproduce the exact vintage. The direct `thedocs.worldbank.org` URL contains a
publication document identifier and may change when a new Pink Sheet workbook
is published; discovery reduces manual URL updates, but rerun verification
when the landing page points to a new file.
