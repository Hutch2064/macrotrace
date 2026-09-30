# MacroTrace bundled fonts

MacroTrace self-hosts the Latin subsets used by the dashboard so the public
site does not depend on a runtime request to Google Fonts. The WOFF2 filenames
include the first eight characters of each file's SHA-256 digest; changing a
font creates a new immutable asset path and preserves browser/CDN caching.

## Outfit

- Family: Outfit, normal, variable `wght` axis 300–900
- Asset: `outfit-latin-92684e4a.woff2`
- SHA-256: `92684e4acde79ef07758cd09380b7e01e9824d8b061eddeda046f78c166d7b12`
- Google Fonts CSS2 source:
  <https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap>
- Google Fonts asset source:
  <https://fonts.gstatic.com/s/outfit/v15/QGYvz_MVcBeNP4NJtEtqUYLknw.woff2>
- Upstream source: <https://github.com/Outfitio/Outfit-Fonts>

## Geist Mono

- Family: Geist Mono, normal, variable `wght` axis 400–600
- Asset: `geist-mono-latin-5f3d6ad6.woff2`
- SHA-256: `5f3d6ad60f29d6cb708414ec6887163d63bf197377ef5417d2483ff31ace6c3b`
- Google Fonts CSS2 source:
  <https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&display=swap>
- Google Fonts asset source:
  <https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFrcdmhHkjko.woff2>
- Upstream source: <https://github.com/vercel/geist-font>

Both fonts are distributed under the SIL Open Font License, Version 1.1. The
copyright notices and full license text are in `OFL.txt`.
