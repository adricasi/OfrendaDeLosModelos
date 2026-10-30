# Fonts

Self-hosted, subset to Latin plus Spanish (á é í ó ú ü ñ ¿ ¡ and punctuation), woff2.
Both are licensed under the SIL Open Font License 1.1 (copies and copyright notices below).
Fonts are assets, not npm packages. The page loads nothing from a font host (CSP `font-src 'self'`).

| File | Family | Use | Source (official repository, fetched 2026-10-30, branch `main`) | Copyright |
|---|---|---|---|---|
| `Gloock-latin.woff2` | Gloock Regular | Display: headings, names, the question | https://github.com/duartp/gloock (`fonts/ttf/Gloock-Regular.ttf`) | 2022 The Gloock Project Authors (Duarte Pinto); `OFL-Gloock.txt` |
| `BricolageGrotesque-latin.woff2` | Bricolage Grotesque, variable weight 400-700 | Body text | https://github.com/ateliertriay/bricolage (`fonts/variable/BricolageGrotesque[opsz,wdth,wght].ttf`) | 2022 The Bricolage Grotesque Project Authors (Mathieu Triay); `OFL-BricolageGrotesque.txt` |

The repositories' commit SHAs could not be read from the build environment (only raw file
access was available), so the source is recorded by URL, path and date.

## How the files were made

- Bricolage Grotesque: `fonttools varLib.instancer ... wdth=100 opsz=14 wght=400:700`
  (width and optical size fixed, weight kept variable), then `pyftsubset`.
- Both: `pyftsubset --unicodes=U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+2013-2014,U+2018-201A,U+201C-201E,U+2022,U+2026,U+2039-203A,U+20AC,U+2190-2193,U+21B5,U+2423,U+2212 --flavor=woff2 --no-hinting`.
- The OFL declares no Reserved Font Name for either family, so the subset keeps the family names.
