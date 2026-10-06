# Spike facts settled before the plan

Each spike lives on a pushed branch of github.com/ngducn/esta with a REPORT.md. Cite the branch in Build boxes that use the result.

## S1. Agent SDK on the subscription token (spike/s1-agent-sdk, 83c56e0)

- The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk` 0.3.291) runs on `CLAUDE_CODE_OAUTH_TOKEN` from `apps/agent/.env.local`. `apiKeySource=none`. No `claude -p` fallback needed.
- Isolation. Pass `env` containing only the active credential plus `CLAUDE_CONFIG_DIR` pointing at an empty per-worker dir. `env` replaces the subprocess environment. An empty config dir hides Ryan's keychain login.
- Tool gating. A bare name in `allowedTools` auto-approves the tool before `canUseTool` runs, so the live model read `/etc/hosts` with AGENT.md §2.2's design. Use `tools: [...]` per job kind (ping gets `[]`, extract gets `['Read']`), a `PreToolUse` hook enforcing the job-dir path policy, `permissionMode: 'default'`, `strictMcpConfig: true`, `settingSources: []`, and `alwaysLoad: true` on `createSdkMcpServer`.
- Auth failures return `subtype: 'success'` with `is_error: true`. Check `is_error`. A 401 surfaces to operators as an auth error.
- Result fields `num_turns`, `session_id`, `total_cost_usd`, `usage`, `modelUsage`, `permission_denials` feed `agent_runs`.
- Model id comes from `ESTA_MODEL_ROUTINE` (spike used `claude-sonnet-5-5`). Ping cost 0.0144 USD in 4 turns.
- P0-15 updates AGENT.md §2.2 with these corrections.

## S2. Fonts (spike/s2-fonts, 31dd4a6)

- UI sans Source Sans 3. Figure and display serif Source Serif 4 (explicit `tnum` and `lnum`, optical size axis). OFL 1.1 from google/fonts commit `7085eb89`.
- Be Vietnam Pro and Fraunces fail the tabular-figures check (no `tnum`). Newsreader and Public Sans pass but lost on look.
- All candidates cover all 68 code points of the glyph test string at every tested weight.
- `spikes/s2-fonts/coverage.mjs` takes font paths with axis values, `--text` or `--text-file`, `--require-features`, exits 1 on any miss. It becomes `pnpm glyphs:check`.
- Self-host with `next/font/local`, vietnamese subsets. DESIGN.md typography text is in the S2 report.

## S3. Admin units (spike/s3-admin-units, 1945c64)

- Source. NSO catalog SOAP `danhmuchanhchinh.nso.gov.vn/DMDVHC.asmx` (`DanhMucTinh`, `DanhMucPhuongXa`, pinned `DenNgay` 06/10/2026) and NSO conversion table `BangChuyendoiĐVHCmoi_cu_final.xlsx`. Join on the 5-digit commune code. `fetch.sh` pins SHA-256.
- License basis. Government legal documents, excluded from copyright under IP Law Article 15. Ryan approves at plan review.
- Counts. 34 province-level (25 provinces, 9 cities after 2026 upgrades of Đồng Nai, Quảng Ninh, Bắc Ninh), 3,321 commune-level (709 wards, 2,599 communes, 13 special zones). 10,571 legacy rows, 969 partial, 441 split old communes with fan-out up to 5.
- `admin_units.kind` for province-level units comes from the catalog, never fixed.
- `admin_unit_legacy_map` shape. old_province_code, old_province_name, old_district_code, old_district_name, old_commune_code (null for island districts), old_commune_name, new_commune_code, merge_kind (`whole | partial`), source.
- Import cleanups. Derive old province from old district code. Collapse whitespace in names. Add curated rows with cited sources for gaps (Phường 2 Tân An merged 1 Dec 2024, two code typos).
- FND-6 frozen lookups. Phường Dĩ An → Phường Dĩ An 25942, TP. HCM 79. Phường 1 Vũng Tàu → Phường Vũng Tàu 26506, TP. HCM 79. Phường 2 Tân An → Phường Long An 27694, Tây Ninh 80 (needs curated row). Phường Tân Phong Biên Hòa → Phường Tân Triều 26188, TP. Đồng Nai 75. Phường 1 Bảo Lộc → Phường 1 Bảo Lộc 24823, Lâm Đồng 68.
- PRP-4. "Dĩ An, Bình Dương" lists Phường Dĩ An first then Tân Đông Hiệp 25945 and Đông Hòa 25951. "Quận 7" fans out to four wards. Split wards list every candidate and the user picks.
- Matching. đ→d, NFD strip marks, curly apostrophe to straight, dashes alike, expand `TP.` and strip one unit prefix, scope numeric names by parent, never key on name alone (ten accent-insensitive name collisions within provinces).

## S4. VietQR (spike/s4-vietqr, a7c9e76)

- DOMAIN-VN §10 payload shape holds. Esta emits tags 00, 01, 38 (00 GUID `A000000727`, 01.00 BIN, 01.01 account, 02 `QRIBFTTA`), 53 `704`, 54, 58 `VN`, 62.08, 63, in that order. No tags 52, 59, 60.
- Tag 01 is `12` when the QR carries an amount and `11` without. The spec defines `12` as single-use, so this is an `[app rule]`. The decoder accepts either.
- Tag 62.08 purpose is capped at 25 characters by the spec. `ESTA {memo_code}` is 13. Encoder rejects longer, decoder tolerates longer.
- Tag 54 is digits only, not zero, up to 13 characters, integer đồng.
- CRC is CRC-16/CCITT-FALSE over every byte before the value including `6304`, 4 uppercase hex, zero-padded. A widely copied gist drops the padding.
- NAPAS 247 caps one transfer below 500,000,000 VND. Default `[app rule]` pending Ryan's confirmation. At 500,000,000 or more, issue the QR without tag 54 and show the amount with a note to split the transfer.
- Memo matching (LSE-8). With spaces removed, `ESTA` appears inside words such as `FIESTA`. Check every `ESTA` occurrence and keep a candidate only if it is an issued household memo code. `spikes/s4-vietqr/src/memo.ts` shows the rule.
- Test vectors. 6 published payloads (NAPAS §6.3.3, three from `vietnam-qr-pay`, Viblo, vietqr.vn) re-encode byte for byte, 2 NAPAS card examples decode, 2 malformed samples are rejected. `vietnam-qr-pay` (MIT) serves as an independent cross-check. PNG round trip with `qrcode` and `jsQR` passes. 27 tests.
- BIN list. Seed `bank_bins` from the NAPAS list (74 entries, fields bin, name, code) as a committed snapshot with sha256 and fetch date, refreshed by hand. The NAPAS portal has no public API and its terms bar automated collection and allow personal non-commercial use with the source cited, so production never fetches it. Display short names come from a small curated `[app rule]` map. The VietQR.io mirror agrees on all 64 shared BINs but has stale names and is not a source (it would be a new external data source).
- DOMAIN-VN §10 corrections and the §9 known-codes matching rule are committed on the spike branch and fold into the spec in P0-16.

## S7. Receipts (spike/s7-receipt, 8548686)

- pdf-lib with @pdf-lib/fontkit for the A5 PDF, satori with @resvg/resvg-js for the PNG, Node runtime route handler.
- Traced function 11.56 MB uncompressed, 4.95 MB zipped, against Vercel's 250 MB limit (https://vercel.com/docs/functions/limitations, fetched 2026-10-06). @react-pdf/renderer works but is 18.76 MB. Headless Chromium rejected (about 70 MB alone).
- LSE-6 check passes via pdfjs-dist text extraction.
- Gotchas. `loadSystemFonts: false` in resvg, satori in `serverExternalPackages`, fonts via `outputFileTracingIncludes` from `process.cwd()`, static font instances for pdf-lib, NFC normalize text, A5 is 419.528 × 595.276 pt. Local timings PDF 44 ms warm, PNG 48 ms warm.
