# Spike S7. Receipt PDF and PNG with Vietnamese fonts inside a Vercel function

Question (SPEC §11 S7). Can the app generate an A5 "Biên nhận tiền thuê" PDF and a PNG sized for Zalo, with Vietnamese fonts embedded, inside a Vercel Node function under the documented size limit?

Answer. Yes. pdf-lib with @pdf-lib/fontkit makes the PDF and satori with @resvg/resvg-js makes the PNG. The traced route weighs 11.56 MB uncompressed against the documented 250 MB limit.

## Approaches compared

| Approach | PDF | PNG | Traced route, uncompressed | Zipped | Files | LSE-6 text check |
| --- | --- | --- | --- | --- | --- | --- |
| A | @react-pdf/renderer | satori + resvg | 18.76 MB | 6.44 MB | 406 | PASS |
| B (chosen) | pdf-lib + @pdf-lib/fontkit | satori + resvg | 11.56 MB | 4.95 MB | 198 | PASS |
| Headless Chromium | not built | not built | `@sparticuz/chromium` alone is about 70 MB unpacked | | | |

Sizes include the linux-x64-gnu resvg binary (4.18 MB), swapped in by hand because nft traced the darwin binary. They come from nft traces of `next build`, not from a Vercel deploy. See `out/bundle-sizes.txt`.

Limit source. https://vercel.com/docs/functions/limitations, fetched 2026-10-06, page updated 2026-08-24. 250 MB uncompressed.

## Evidence

- `out/receipt-b-pdflib.pdf`, `out/receipt-b-pdflib-page1.png`, `out/receipt.png` for approach B. `out/receipt-a-reactpdf*` for approach A.
- `out/next-route.pdf` and `out/next-route.png` served by `next-app/app/api/receipt/[id]/route.ts` under `next start`.
- `out/route-extract.txt`. pdfjs-dist text extraction contains "Đặng Thị Hường" for both route PDFs. The household, unit, title, total in words, memo and "3.500.000 ₫" also extract correctly.
- `out/route-timings.txt`. Local `next start`, PDF 99 ms cold and 44 ms warm for pdf-lib, PNG 64 ms first and 48 ms warm. Lambda cold start not measured.
- `out/run-output.txt`. Raw run logs.

## Gotchas for the Phase 3 build

- Set `font: { loadSystemFonts: false }` in resvg. Scanning system fonts made the PNG take about 1.4 s.
- Put satori in `serverExternalPackages`, otherwise `next build` fails on a `harfbuzzjs/hb.wasm` ENOENT.
- Load fonts from `process.cwd()` and list them in `outputFileTracingIncludes`.
- Variable-only upstream fonts need static instances cut with fonttools before pdf-lib can embed them.
- Normalize all text to NFC before drawing. Subsetting and ToUnicode then extract correctly.
- A5 is 419.528 × 595.276 pt.
- The spike used Be Vietnam Pro and Newsreader. Phase 3 uses the S2 pairing, Source Sans 3 and Source Serif 4, and reruns the LSE-6 extraction check.
- The QR was a dummy EMV payload embedded as a raster, not scanned by a banking app. Bank-app scanning happens at the Phase 3 gate.

## Decision

Approach B. pdf-lib with @pdf-lib/fontkit for the PDF, satori with @resvg/resvg-js for the PNG, in a Node runtime route handler.
