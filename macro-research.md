# MacroTrace extension research

Research and endpoint validation date: **2026-09-22**. This note covers the
extension catalog in `scripts/extended-macro-catalog.mjs`, now integrated into
the daily snapshot, source inventory, and dashboard presets.

## Validation contract

Every accepted ID below was requested from the public FRED CSV endpoint with
`cosd=1000-01-01`:

`https://fred.stlouisfed.org/graph/fredgraph.csv?id=SERIES_ID&cosd=1000-01-01`

All 38 accepted endpoints returned HTTP 200, at least 38 numeric observations,
strictly increasing dates, and the coverage shown below. Units and frequencies
were checked against the corresponding FRED series page on the same date.
FRED's latest observation can move after this validation date; annual and
quarterly releases are intentionally not interpolated.

## Accepted FRED series

| Block                   | ID                   | Frequency | Numeric coverage (observations) | Provider / source family                                 |
| ----------------------- | -------------------- | --------- | ------------------------------- | -------------------------------------------------------- |
| Money / credit          | `M1SL`               | Monthly   | 1959-01 to 2026-07 (811)        | Federal Reserve Board, H.6                               |
| Money / credit          | `TOTRESNS`           | Monthly   | 1959-01 to 2026-07 (811)        | Federal Reserve Board, H.6                               |
| Money / credit          | `H8B1001NCBCMG`      | Monthly   | 1947-02 to 2026-08 (955)        | Federal Reserve Board, H.8                               |
| Money / credit          | `BUSLOANS`           | Monthly   | 1947-01 to 2026-08 (956)        | Federal Reserve Board, H.8                               |
| Money / credit          | `TOTALSL`            | Monthly   | 1943-01 to 2026-07 (1,003)      | Federal Reserve Board, G.19                              |
| Money / credit          | `HCCSDODNS`          | Quarterly | 1945-10 to 2026-04 (305)        | Federal Reserve Board, Financial Accounts Z.1            |
| Money / credit          | `HHMSDODNS`          | Quarterly | 1945-10 to 2026-04 (305)        | Federal Reserve Board, Financial Accounts Z.1            |
| Money / credit          | `NCBDBIQ027S`        | Quarterly | 1945-10 to 2026-04 (305)        | Federal Reserve Board, Financial Accounts Z.1            |
| Fiscal                  | `GFDEBTN`            | Quarterly | 1966-01 to 2026-01 (241)        | U.S. Treasury Fiscal Service                             |
| Fiscal                  | `GFDEGDQ188S`        | Quarterly | 1966-01 to 2026-01 (241)        | U.S. Treasury Fiscal Service                             |
| Fiscal                  | `FYFSD`              | Annual    | 1901-06 to 2025-09 (125)        | OMB Historical Tables / fiscal-year observations         |
| Fiscal                  | `FYFRGDA188S`        | Annual    | 1929-01 to 2025-01 (97)         | OMB Historical Tables                                    |
| Fiscal                  | `FYFSGDA188S`        | Annual    | 1929-01 to 2025-01 (97)         | OMB Historical Tables                                    |
| Productivity            | `OPHNFB`             | Quarterly | 1947-01 to 2026-04 (318)        | BLS Productivity and Costs                               |
| Productivity            | `ULCNFB`             | Quarterly | 1947-01 to 2026-04 (318)        | BLS Productivity and Costs                               |
| Productivity            | `COMPNFB`            | Quarterly | 1947-01 to 2026-04 (318)        | BLS Productivity and Costs                               |
| Productivity            | `MPU4900013`         | Annual    | 1988-01 to 2025-01 (38)         | BLS Multifactor Productivity                             |
| Demography              | `POPTHM`             | Monthly   | 1959-01 to 2026-07 (811)        | BEA NIPA population estimate                             |
| Demography              | `LFWA64TTUSM647S`    | Monthly   | 1977-01 to 2026-07 (595)        | OECD Infra-Annual Labor Statistics                       |
| Demography              | `SPDYNCBRTINUSA`     | Annual    | 1960-01 to 2024-01 (65)         | World Bank WDI, SP.DYN.CBRT.IN                           |
| Demography              | `SPDYNTFRTINUSA`     | Annual    | 1960-01 to 2024-01 (65)         | World Bank WDI, SP.DYN.TFRT.IN                           |
| Demography              | `SPDYNLE00INUSA`     | Annual    | 1960-01 to 2024-01 (65)         | World Bank WDI, SP.DYN.LE00.IN                           |
| Demography              | `SPPOP65UPTOZSWLD`   | Annual    | 1960-01 to 2025-01 (66)         | World Bank WDI, SP.POP.65UP.TO.ZS                        |
| Housing                 | `RHORUSQ156N`        | Quarterly | 1965-01 to 2026-04 (246)        | U.S. Census housing surveys                              |
| Housing                 | `RRVRUSQ156N`        | Quarterly | 1956-01 to 2026-04 (282)        | U.S. Census housing surveys                              |
| Housing                 | `HOUST5F`            | Monthly   | 1959-01 to 2026-08 (812)        | U.S. Census new residential construction                 |
| Housing                 | `EVACANTUSQ176N`     | Quarterly | 2000-04 to 2026-04 (105)        | U.S. Census housing surveys                              |
| International growth    | `NYGDPMKTPCDWLD`     | Annual    | 1960-01 to 2025-01 (66)         | World Bank WDI, current-dollar world GDP                 |
| International growth    | `CLVMNACSCAB1GQEA19` | Quarterly | 1995-01 to 2026-04 (126)        | Eurostat National Accounts, euro area 19                 |
| International inflation | `CPIUKA`             | Annual    | 1209-01 to 2016-01 (808)        | Bank of England Millennium archive                       |
| International inflation | `CPIIUKA`            | Annual    | 1210-01 to 2016-01 (807)        | Bank of England Millennium archive                       |
| International rates     | `BOERUKA`            | Annual    | 1694-01 to 2016-01 (323)        | Bank of England Millennium archive                       |
| International growth    | `RGDPMPUKA`          | Annual    | 1700-01 to 2016-01 (317)        | Bank of England Millennium archive                       |
| International rates     | `LTCYUKA`            | Annual    | 1703-01 to 2016-01 (314)        | Bank of England Millennium archive                       |
| Long history            | `GDPCA`              | Annual    | 1929-01 to 2025-01 (97)         | BEA NIPA, real GDP                                       |
| Long history            | `GNPCA`              | Annual    | 1929-01 to 2025-01 (97)         | BEA NIPA, real GNP                                       |
| Long history            | `A191RL1A225NBEA`    | Annual    | 1930-01 to 2025-01 (96)         | BEA NIPA, published real GDP growth                      |
| Archived labor context  | `M0892AUSM156SNBR`   | Monthly   | 1929-04 to 1942-06 (159)        | NBER Macrohistory / National Industrial Conference Board |

The script contains the exact units, semantic change type, provider notes,
methodology, source-specific rights notes, and validation coverage for each
tuple. The annual `GDPCA` series is deliberately not a pre-1947 splice of the
existing quarterly `GDPC1`; `GNPCA` is a different national-accounts concept;
and `M0892AUSM156SNBR` is explicitly archived rather than a continuation of
the modern BLS `UNRATE` definition.

## Primary sources and rights review

- [FRED series observations contract](https://fred.stlouisfed.org/docs/api/fred/series_observations.html)
  and [FRED CSV graph service](https://fred.stlouisfed.org/graph/fredgraph.csv).
- [Federal Reserve H.6 money stock measures](https://www.federalreserve.gov/releases/h6/),
  [H.8 commercial-bank assets and liabilities](https://www.federalreserve.gov/releases/h8/),
  and [Financial Accounts Z.1](https://www.federalreserve.gov/releases/z1/).
- [Treasury Fiscal Data](https://fiscaldata.treasury.gov/) for total public debt.
- [BEA National Income and Product Accounts](https://www.bea.gov/iTable/?reqid=19)
  for GDP, GNP, and population estimates.
- [OMB Historical Tables](https://www.whitehouse.gov/omb/information-resources/budget/)
  for the long federal surplus/deficit and receipts-ratio series.
- [BLS Productivity and Costs](https://www.bls.gov/productivity/) and
  [multifactor productivity](https://www.bls.gov/mfp/) for productivity levels and growth.
- [Census Housing Vacancies and Homeownership](https://www.census.gov/housing/hvs/)
  and [New Residential Construction](https://www.census.gov/construction/nrc/).
- [OECD Data Explorer](https://data-explorer.oecd.org/) for the U.S. working-age
  population series.
- [Eurostat National Accounts](https://ec.europa.eu/eurostat/web/national-accounts)
  for the euro-area real-GDP aggregate.
- [Bank of England Millennium of Macroeconomic Data](https://www.bankofengland.co.uk/statistics/research-datasets)
  and the [FRED release-389 mirror](https://fred.stlouisfed.org/release?rid=389)
  for explicitly archived U.K. CPI, policy-rate, real-GDP, and consol-yield histories.
- [World Bank World Development Indicators](https://databank.worldbank.org/source/world-development-indicators)
  for the demographic and world-output indicators.
- [NBER Macrohistory Database](https://www.nber.org/research/data/nber-macrohistory-database)
  for the archival unemployment series; its original source is identified in
  the FRED metadata as the National Industrial Conference Board series published
  by G.H. Moore.

Public accessibility does not automatically grant identical reuse rights.
MacroTrace should keep the FRED, original-provider, and original-source links,
avoid copying provider workbooks, and re-check current OECD, World Bank, BLS,
BEA, Treasury, and NBER terms before any commercial redistribution.

## Reviewed but rejected or deferred

- **Existing catalog duplicates:** M2, Federal Funds, total housing starts,
  broad industrial production, current U.S. GDP, existing labor/inflation
  series, and the already catalogued IMF country GDP panel were not copied into
  this extension. The new annual GDP/GNP rows provide a distinct long-history
  contract instead of splicing them into quarterly levels.
- **Existing-home sales (`EXHOSLUSM495S`):** the current FRED endpoint returned
  only 13 observations from 2025-08 through 2026-08 on the validation date, so
  it did not meet the requested long-history/value-density bar.
- **OECD euro-area unemployment (`LRHUTTTTEZM156S`):** the FRED mirror stopped
  at 2023-01 on validation. It was not included as an active signal; a future
  archive import would need `historyStatus: "archived"`, an explicit
  `archiveReason`, and a separate stale-history display policy.
- **OECD euro-area interbank rate (`IR3TIB01EZM156N`):** the FRED mirror's
  latest observation was January 2026 on validation, so it failed the active
  monthly freshness bar. It was omitted rather than relabelled as current.
- **Bank of England Millennium definitions:** five high-value series are
  included above only as explicit archives. The official material ends in 2016,
  combines historical definitions, and requires Bank/FRED attribution; none is
  treated as a live feed or spliced into modern U.K. series.
- **Jordà–Schularick–Taylor (JST) Macrofinancial History Database:** deferred.
  Its CC BY-NC-SA 4.0 terms are not a clean fit for a broadly redistributed
  public dashboard, and definition boundaries would require a separate source
  adapter. No JST observations were copied.
- **Unresolved or nonexistent FRED IDs:** candidate `HDTGPDQ188S`,
  `SPPOP65UPTOZUSA`, `CLVMNACSCAB1GQEURO`, and several guessed NBER IDs returned
  HTTP 404 and were excluded rather than substituted silently.

## Integration recommendation

Import `extendedFredSeries` only after deciding whether the dashboard should
show all 38 rows or use category presets. Preserve the tuple metadata, append
the array to the live FRED fetch list, and add a duplicate-ID assertion. The
refresh verifier should exempt only rows carrying both
`historyStatus === "archived"` and `archiveReason` (the six explicitly marked
rows here); all other rows should obey the normal frequency-specific freshness
policy. Do not merge annual, quarterly, or archival definitions into existing
series merely to make a longer chart.
