# Fama–French factor-history expansion

`scripts/factor-history.mjs` exports `fetchFactorHistorySeries()` and is integrated
into the `french-factors` refresh dataset and the public snapshot. The bounded
set contains 26 monthly research indexes:

- U.S.: the longest available SMB (size) and HML (value) factors, plus RMW
  (operating profitability), CMA (investment), and Mom (momentum).
- Emerging markets: market (the requested `FF_EM_MARKET`), SMB, HML, RMW,
  CMA, and WML/Mom.
- Existing regional families (Developed, Developed ex U.S., Europe, Japan,
  and Asia Pacific ex Japan): the missing RMW, CMA, and WML/Mom legs. Their
  market, SMB, and HML series already live in `long-history.mjs`.

All 26 are currently present in the 425-series snapshot as non-Yahoo public
research histories; the twelve ETF extensions are separate `proxy_splice`
histories and never replace these factor observations.

The module downloads the official CSV archives from the [Kenneth R. French
Data Library](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html),
hashes each complete ZIP archive with SHA-256, parses the monthly block only,
and retains each factor's native monthly dates. Missing source sentinels
`-99.99` and `-999` are omitted from that factor's observations; rows are not
intersected across factors. This matters for emerging-market RMW (first valid
return July 1991) and CMA (first valid return July 1992), while the emerging
market, SMB, and HML histories begin in July 1989.

Each output starts with a documented synthetic `[month-end before first valid
return, 100]` baseline, then compounds the published percentage returns. The
baseline is not observed data. Factor indexes are research constructs, not
investable funds and must not be described as cumulative ETF histories. The
published factors are based on value-weighted source portfolios; dividends and
capital gains are represented according to the source's return construction and
are recorded as `dividendTreatment: "source_defined"`. Each object carries
`coverageStart` for the actual first valid source return and a fixed
source-defined `expectedStart`; the latter is not derived from the fetched rows.
The preceding `observations[0]` is only the synthetic baseline. The refresh
verifier rejects a series whose actual coverage starts later than its fixed
expectation.

## Source methodology and rights

The module uses the longest available [U.S. three-factor archive](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_CSV.zip)
for `FF_US_SIZE` and `FF_US_VALUE`, and the [U.S. five-factor detail](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/f-f_5_factors_2x3.html)
describes Mkt-RF, SMB, HML, RMW, and CMA as being constructed from value-weighted
size/book-to-market, size/operating-profitability, and size/investment portfolios.
The [monthly momentum detail](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/det_mom_factor.html)
describes Mom as high-minus-low prior (2–12) returns from six value-weighted
size/momentum portfolios, with NYSE size median and 30th/70th prior-return
breakpoints. The [developed-region factor detail](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/f-f_5developed.html)
and [emerging-market factor detail](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/f-f_5emerging.html)
document the analogous regional 5-factor construction; the [emerging momentum
detail](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/f-f_emerging_mom.html)
documents WML for emerging markets.

The library page carries a notice that its images and code are property of Ken
French and that reuse in whole or in part requires permission from Ken French or
Dimensional Fund Advisors. The page does not present a broad open-data license
for the research-return archives. Keep the attribution, source links, archive
names, and hashes; publish only the transformed research observations permitted
by the project's noncommercial/public-use context; and review the provider's
current terms before any commercial redistribution or bulk republication.

## Validated source coverage (2026-09-22)

All 26 outputs validated with the current archives had `sourceAsOf` 2026-07-31.
The first date is the synthetic baseline; the next date is the first valid
source return.

| Family                                                                     | Output IDs                                  | First valid return | Synthetic baseline |
| -------------------------------------------------------------------------- | ------------------------------------------- | ------------------ | ------------------ |
| U.S. size/value (3-factor archive)                                         | `FF_US_SIZE`, `FF_US_VALUE`                 | 1926-07-31         | 1926-06-30         |
| U.S. 5-factor profitability/investment                                     | `FF_US_PROFITABILITY`, `FF_US_INVESTMENT`   | 1963-07-31         | 1963-06-30         |
| U.S. momentum                                                              | `FF_US_MOMENTUM`                            | 1927-01-31         | 1926-12-31         |
| Emerging market + SMB/HML                                                  | `FF_EM_MARKET`, `FF_EM_SIZE`, `FF_EM_VALUE` | 1989-07-31         | 1989-06-30         |
| Emerging RMW                                                               | `FF_EM_PROFITABILITY`                       | 1991-07-31         | 1991-06-30         |
| Emerging CMA                                                               | `FF_EM_INVESTMENT`                          | 1992-07-31         | 1992-06-30         |
| Emerging momentum                                                          | `FF_EM_MOMENTUM`                            | 1990-01-31         | 1989-12-31         |
| Developed, developed ex U.S., Europe, Japan, Asia Pacific ex Japan RMW/CMA | each `*_PROFITABILITY`, `*_INVESTMENT`      | 1990-07-31         | 1990-06-30         |
| Those five regional momentum files                                         | each `*_MOMENTUM`                           | 1990-11-30         | 1990-10-31         |

The existing source files do not publish capitalization weights for a single
small-cap or large-cap total-return level. The 2x3 files provide separate small
and big legs, and SMB is a long-short factor, but equal-averaging the legs would
be a new methodology. No synthetic small/large aggregate is therefore emitted.

## Proxy guidance for monthly splice research

The current bundled Yahoo catalog contains the following defensible _labeled
approximations_ for a parent splice study:

| Research series                                  | Yahoo symbol                                          | Why it is only a proxy                                                                                                                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| U.S. broad market / `FF_US_MARKET`               | `VTI` (preferred); `SPY` only as a large-cap fallback | ETF inception dates are far later than French's 1926/1963 research histories; VTI is broad U.S. equity while SPY is S&P 500 large cap. Adjusted close is an ETF market series, not French's value-weighted research portfolio. |
| `FF_LARGE_VALUE` / `FF_LARGE_GROWTH`             | `IWD` / `IWF`                                         | Russell 1000 style definitions, fees, reconstitution, and inception dates differ from French's 2x3 book-to-market portfolios.                                                                                                  |
| `FF_SMALL_VALUE` / `FF_SMALL_GROWTH`             | `IWN` / `IWO`                                         | Russell 2000 style definitions are not the French small legs; they are investable ETF total-return proxies only after inception.                                                                                               |
| `FF_EM_MARKET`                                   | `EEM` or `VWO`                                        | MSCI vs FTSE country classifications, holdings, fees, withholding taxes, and inception dates differ; neither is a backfill for the 1989 French EM market series.                                                               |
| Industry energy / health / utilities / high tech | `XLE` / `XLV` / `XLU` / `XLK`                         | Sector ETFs have provider-specific classifications, fees, and launch gaps versus French industry research portfolios.                                                                                                          |

Do not splice an ETF into SMB, HML, RMW, CMA, or momentum. Those are long-short
factor returns, not price levels, and the listed ETFs are not equivalent
long-short factor portfolios. Any splice should carry an explicit
`proxy`/`simulation` label, preserve the observed research segment, use
adjusted-close distributions, and never claim exact index parity. `EFA` is a
reasonable broad developed-ex-U.S. _approximation_ but excludes Canada and is
not a direct substitute for the French developed-ex-U.S. universe; `^STOXX50E`
and `^N225` are price-index observations rather than total-return ETF proxies
for Europe and Japan. No current catalog instrument is a defensible exact
Asia Pacific ex Japan total-return backfill.
