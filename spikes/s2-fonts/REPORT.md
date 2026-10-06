# S2: Vietnamese font coverage and figure support

Throwaway spike. Question: which UI sans and figure/display serif cover Vietnamese fully at every weight used and give tabular lining figures (SPEC §11 S2, FND-5, DESIGN-BRIEF §5.1).

## Decision

**Source Sans 3 (UI) + Source Serif 4 (figures and display).** Both are OFL, pass the coverage script at every tested weight, and give uniform-width lining digits.

Be Vietnam Pro was tried first and fails the tabular check. Its digits are proportional and the font has no `tnum` feature (digit advances run 385 to 710 of 1000 units, so "1" is about half as wide as "0"; visible in the "Sans digits in a column" block of `bvp-ss4-light-1440x900.png`). Its Vietnamese coverage is complete and its diacritics stack well, so it remains the fallback if Ryan prefers its character. If chosen, a rule is needed: digits that stack in a column (dates, phone numbers, areas) are set in Source Serif 4.

Why Source Sans 3 over the other sans options:
- Public Sans passes, but its `tnum` digits are wide and loose next to Source Serif 4 in the date column (`pub-ss4-light-1440x900.png`).
- Source Sans 3 has tabular digits by default (no `tnum` tag; `pnum` is the opt-in), so numbers line up in a column with no CSS (`ss3-ss4-light-1440x900.png`). It shares a design lineage with Source Serif 4, so x-height and color match.

Why Source Serif 4 over the other serifs:
- Fraunces fails: the Google Fonts build has no `tnum` or `lnum`, digits are proportional.
- Newsreader passes (`tnum` present, default digits lining) but has no `lnum` feature, so lining is only the default. Source Serif 4 has `tnum`, `lnum`, `onum`, `pnum`, `zero`, so lining tabular is explicit.
- Source Serif 4 has the `opsz` axis (display cut at large sizes). At 32 and 44 px "3.500.000 ₫" and "Đặng Thị Hường" render cleanly. Stacked marks (ặ, ữ, ỡ, ờ, Ướ) do not collide with the line above at line-height 1.3 or more. ₫ renders as đ with an underbar and sits slightly smaller than the digits, which is acceptable.

What I saw in the screenshots: amounts align on the right edge in the table; dark theme (`oklch(19% .01 60)` paper) keeps 16 px diacritics readable. Source Sans 3 is plainer than Be Vietnam Pro. The serif carries the personality, which matches "numbers are the hero".

## Sources

All fonts are from the Google Fonts repository (`google/fonts`), pinned to commit `7085eb89a950e85db5b166b7a58d414544b4140c` (main, 2026-10-05), under `ofl/`. License SIL OFL 1.1 for all (copies in `fonts/OFL-*.txt`). `fetch-fonts.sh` downloads them at that commit and prints SHA-256 sums.

| Family | File | Version | Axes |
| --- | --- | --- | --- |
| Be Vietnam Pro | `BeVietnamPro-{Regular,Medium,SemiBold,Bold}.ttf` | 1.002 | static |
| Source Sans 3 | `SourceSans3[wght].ttf` | 3.052 | wght |
| Public Sans | `PublicSans[wght].ttf` | 2.001 | wght |
| Source Serif 4 | `SourceSerif4[opsz,wght].ttf` | 4.004 | opsz, wght |
| Newsreader | `Newsreader[opsz,wght].ttf` | 1.003 | opsz, wght |
| Fraunces | `Fraunces[SOFT,WONK,opsz,wght].ttf` | 1.000 | SOFT, WONK, opsz, wght |

Font files are committed (4.4 MB). `fetch-fonts.sh` re-fetches them.

## Coverage script

`coverage.mjs` (Node, fontkit). Input is font paths with an optional variable instance (`path@wght=400,opsz=16`) and the string via `--text` or `--text-file`. Flag `--require-features tnum,lnum`. Exits 1 on any missing code point, on non-uniform digit widths when `tnum` is required, or on non-lining digits when `lnum` is required. `tnum` passes when applying `tnum` yields equal digit advances, which also covers fonts tabular by default. `lnum` passes when digit height under `lnum` is at least 0.85 of cap height. The string is in `glyph-test-string.txt`, copied from DESIGN-BRIEF §5.1 (68 unique code points, NFC). Feature tags were cross-checked against fontTools reading GSUB. This is the seed of `pnpm glyphs:check`.

Run `./run-coverage.sh`. Output (exit 1 because Be Vietnam Pro and Fraunces fail):

```
| font                                                | cps | missing | tnum | lnum feat | lining digits | tnum digits uniform | default digits proportional | result |
|-----------------------------------------------------|-----|---------|------|-----------|---------------|---------------------|-----------------------------|--------|
| BeVietnamPro-Regular.ttf                            | 68  | 0       | NO   | NO        | yes           | NO                  | yes                         | FAIL   |
| BeVietnamPro-Medium.ttf                             | 68  | 0       | NO   | NO        | yes           | NO                  | yes                         | FAIL   |
| BeVietnamPro-SemiBold.ttf                           | 68  | 0       | NO   | NO        | yes           | NO                  | yes                         | FAIL   |
| BeVietnamPro-Bold.ttf                               | 68  | 0       | NO   | NO        | yes           | NO                  | yes                         | FAIL   |
| Newsreader[opsz,wght].ttf@wght=400,opsz=16          | 68  | 0       | yes  | NO        | yes           | yes                 | no                          | PASS   |
| Newsreader[opsz,wght].ttf@wght=500,opsz=16          | 68  | 0       | yes  | NO        | yes           | yes                 | no                          | PASS   |
| Newsreader[opsz,wght].ttf@wght=600,opsz=16          | 68  | 0       | yes  | NO        | yes           | yes                 | no                          | PASS   |
| Newsreader[opsz,wght].ttf@wght=400,opsz=72          | 68  | 0       | yes  | NO        | yes           | yes                 | no                          | PASS   |
| Newsreader[opsz,wght].ttf@wght=600,opsz=72          | 68  | 0       | yes  | NO        | yes           | yes                 | no                          | PASS   |
| SourceSerif4[opsz,wght].ttf@wght=400,opsz=16        | 68  | 0       | yes  | yes       | yes           | yes                 | no                          | PASS   |
| SourceSerif4[opsz,wght].ttf@wght=500,opsz=16        | 68  | 0       | yes  | yes       | yes           | yes                 | no                          | PASS   |
| SourceSerif4[opsz,wght].ttf@wght=600,opsz=16        | 68  | 0       | yes  | yes       | yes           | yes                 | no                          | PASS   |
| SourceSerif4[opsz,wght].ttf@wght=400,opsz=60        | 68  | 0       | yes  | yes       | yes           | yes                 | no                          | PASS   |
| SourceSerif4[opsz,wght].ttf@wght=600,opsz=60        | 68  | 0       | yes  | yes       | yes           | yes                 | no                          | PASS   |
| Fraunces[SOFT,WONK,opsz,wght].ttf@wght=400,opsz=14  | 68  | 0       | NO   | NO        | yes           | NO                  | yes                         | FAIL   |
| Fraunces[SOFT,WONK,opsz,wght].ttf@wght=500,opsz=14  | 68  | 0       | NO   | NO        | yes           | NO                  | yes                         | FAIL   |
| Fraunces[SOFT,WONK,opsz,wght].ttf@wght=600,opsz=14  | 68  | 0       | NO   | NO        | yes           | NO                  | yes                         | FAIL   |
| Fraunces[SOFT,WONK,opsz,wght].ttf@wght=400,opsz=144 | 68  | 0       | NO   | NO        | yes           | NO                  | yes                         | FAIL   |
| Fraunces[SOFT,WONK,opsz,wght].ttf@wght=600,opsz=144 | 68  | 0       | NO   | NO        | yes           | NO                  | yes                         | FAIL   |
| SourceSans3[wght].ttf@wght=400                      | 68  | 0       | NO   | NO        | yes           | yes                 | no                          | PASS   |
| SourceSans3[wght].ttf@wght=500                      | 68  | 0       | NO   | NO        | yes           | yes                 | no                          | PASS   |
| SourceSans3[wght].ttf@wght=600                      | 68  | 0       | NO   | NO        | yes           | yes                 | no                          | PASS   |
| SourceSans3[wght].ttf@wght=700                      | 68  | 0       | NO   | NO        | yes           | yes                 | no                          | PASS   |
| PublicSans[wght].ttf@wght=400                       | 68  | 0       | yes  | yes       | yes           | yes                 | yes                         | PASS   |
| PublicSans[wght].ttf@wght=500                       | 68  | 0       | yes  | yes       | yes           | yes                 | yes                         | PASS   |
| PublicSans[wght].ttf@wght=600                       | 68  | 0       | yes  | yes       | yes           | yes                 | yes                         | PASS   |
| PublicSans[wght].ttf@wght=700                       | 68  | 0       | yes  | yes       | yes           | yes                 | yes                         | PASS   |
```

Every font covers all 68 code points at every tested instance (`missing` is 0 in every row). The differences are only in figure behavior. Instances: sans 400, 500, 600, 700; serif 400, 500, 600 at a text optical size and 400, 600 at a display optical size.

## Screenshots

Static pages in `pages/`, screenshotted with `shots.mjs` (Node Playwright, headless chromium) at 390x844 (2x) and 1440x900, light and dark, full page. Files: `shots/<pair>-<light|dark>-<390x844|1440x900>.png`.

- `bvp-ss4`: Be Vietnam Pro + Source Serif 4
- `ss3-ss4`: Source Sans 3 + Source Serif 4 (chosen)
- `bvp-nr`: Be Vietnam Pro + Newsreader
- `pub-ss4`: Public Sans + Source Serif 4

The 390 px table wraps names because the throwaway table is not responsive. That is not a font finding. I inspected `bvp-ss4` light 1440 and dark 390, `ss3-ss4` light 1440 and `pub-ss4` light 1440. The rest were generated but not inspected.

## Self-hosting later

- Use `next/font/local` with the OFL files in `apps/web`, not a CDN.
- Convert to WOFF2 and subset to Latin, Latin Extended and Vietnamese plus U+20AB (₫), ² and ½. Keep layout features (`ccmp`, `mark`, `mkmk`, `locl`, and `tnum`, `lnum` for the serif): `pyftsubset --layout-features='*'`.
- Keep variable files variable: Source Sans 3 `wght` 400 to 700, Source Serif 4 `wght` 400 to 600 plus `opsz`. Instance away unused axis range if size matters.
- `display: swap`, `adjustFontFallback` on, preload sans 400 and serif 500.
- Run `pnpm glyphs:check` on the shipped (post-subset) files, not the sources.

## Text for DESIGN.md typography section

> **UI sans: Source Sans 3** (variable, weights 400, 500, 600, 700). **Figures and display: Source Serif 4** (variable, weights 400, 500, 600, optical size auto). Both are OFL, self-hosted, subset to Latin, Latin Extended and Vietnamese. Chosen in spike S2 because both cover every code point of the glyph test string at every weight used and give uniform-width lining digits (Source Sans 3 by default, Source Serif 4 via `font-variant-numeric: lining-nums tabular-nums`). Rejected: Be Vietnam Pro (proportional digits, no `tnum`), Fraunces (no `tnum` or `lnum`); Newsreader and Public Sans pass but pair less well. Amounts, page titles and names at display size use Source Serif 4 with `font-variant-numeric: lining-nums tabular-nums`; amounts are right-aligned in tables. Never Inter, Arial, Roboto or system fonts. `pnpm glyphs:check` guards both files.
