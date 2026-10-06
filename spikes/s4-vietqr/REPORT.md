# S4: VietQR payload and the NAPAS BIN list

Spike S4 (SPEC §11) asks two questions. Is the VietQR payload in DOMAIN-VN §10 correct, and what is the authoritative source for bank BINs? Short answers:

- The §10 table is correct in substance. Five details need tightening (see "Corrections to DOMAIN-VN §10"). None changes the bytes Esta emits for an invoice.
- NAPAS publishes the BIN list on its VietQR portal, `vietqr.net`, with no documented public API. The common mirror `api.vietqr.io/v2/banks` agrees on every shared BIN but lags NAPAS on renames.

`src/vietqr.ts` reproduces 6 published payloads byte for byte, decodes 2 more, rejects 2 malformed ones, and survives a PNG render and scan. It is a throwaway sketch that seeds `packages/core/vietqr`. Fetched and run on 2026-10-06.

## Sources

| Key | Source | Notes |
| --- | --- | --- |
| N | NAPAS, *Technical Specifications on NAPAS QR Switching* v1.5.2, `https://vietqr.net/portal-service/download/documents/QR_Format_T&C_v1.5.2_EN_102022.pdf` | Official. Listed by the `vietqr.net` document endpoint as "VietQR Code Format Technical Specification", created by NAPAS 2022-10-05. The only other listed document is the 2021 Vietnamese v1.0. The `vietqr.net` TLS certificate names "NATIONAL PAYMENT CORPORATION OF VIET NAM". PDF sha256 `ca5bdd13ed8713c2afd8e320378d2552a0381edd988efc2cc63eba63e243c989`. Not committed (NAPAS copyright). |
| H | HKMA, *Common QR Code Specification*, `https://www.hkma.gov.hk/media/chi/doc/key-functions/financial-infrastructure/infrastructure/retail-payment-initiatives/Common_QR_Code_Specification.pdf` | Central-bank restatement of EMVCo MPM. EMVCo's PDF sits behind a licence page. Its CRC, amount, and tag 62 text matches N. |
| P | `https://napas.com.vn/dich-vu-chuyen-tien-nhanh-napas-247-ngan-hang` | "Hạn mức chuyển lên đến dưới 500 triệu VND/giao dịch". |
| Q | `vietnam-qr-pay` 1.5.1 README, MIT, `https://www.npmjs.com/package/vietnam-qr-pay` | Open-source encoder and decoder. |
| V | `https://viblo.asia/p/tao-ma-qrcode-chuyen-tien-ngan-hang-7ymJXnd5Vkq` | Cites NAPAS v1.0. |
| R | `https://api.vietqr.vn/llms-full.txt` | A NAPAS partner's API samples. |

## Tag table

Fields are `ID + 2-digit length + value`. Lengths count characters. `00` is first, `63` is last, and other root tags may appear in any order (N §5.1).

| Tag | Meaning | Confirmed value | Source |
| --- | --- | --- | --- |
| `00` | Payload format indicator | `01`. Mandatory. | N §5.2.1, H §4.1 |
| `01` | Point of initiation | `11` static (one QR, many transactions). `12` dynamic (one QR, one transaction). Mandatory for QR IBFT, optional in base EMVCo. The spec ties it to reuse, not to whether an amount is present. | N §5.2.2, Table 3, H §4.1 |
| `38` | Merchant account information | NAPAS uses ID 38 for all its QR services. | N §5.2.3.2 |
| `38.00` | GUID | `A000000727`, always. | N Table 8 |
| `38.01` | Beneficiary organization | `00` = 6-character BIN (for example `970403`). `01` = account number, `ans`, up to 19 characters. | N Table 8, §5.2.3.2.2 |
| `38.02` | Service code | `QRIBFTTA` = transfer to account. `QRIBFTTC` = transfer to card. Missing = `QRPUSH` (merchant payment). | N §5.2.3.2.3 |
| `52` | MCC | Optional for QR IBFT. Esta omits it. | N Table 3 |
| `53` | Currency | `704`. Mandatory. | N §5.2.5 |
| `54` | Amount | Digits with an optional single `.`. Not zero. Up to 13 characters. VND has exponent 0, so the value is integer đồng (`50000` and `50000.` are valid; `50 000` is not). Esta emits plain digits. | N §5.2.6, H Table 4.4 |
| `58` | Country | `VN`. Mandatory. | N §5.2.10 |
| `59`, `60` | Merchant name, city | Optional for QR IBFT. Esta omits both. The bank app shows the holder's name from its own lookup. | N Table 3 |
| `62` | Additional data | Whole template up to 99 characters. `01` bill number, up to 25. `08` purpose, `ans`, up to 25. | N §5.2.14, Tables 6 and 12, H Table 4.5 |
| `63` | CRC | ISO/IEC 13239, polynomial `1021`, initial `FFFF`, which is CRC-16/CCITT-FALSE (check value `29B1` for `123456789`). Covers every byte before the CRC value, `6304` included. 4 hex characters, zero-padded (H example `6304007B`). | N §5.2.15, H §4.1 |

The encoder accepts printable ASCII (`0x20` to `0x7E`) for `ans` fields.

## Corrections to DOMAIN-VN §10

1. **Tag 01.** "`12` when an amount is present" is Esta's rule, not the spec's. The spec defines `12` as single-transaction. Each Esta invoice QR is single-use with one amount and one memo, so `12` is right. The rule is now labelled `[app rule]`. R emits `11` with an amount, so the decoder accepts either value.
2. **Memo length.** The 25-character limit on `62.08` is the spec, not a recommendation, and tag `62` caps at 99. `ESTA {memo_code}` is 13. The encoder rejects a purpose over 25 characters. The decoder accepts longer ones because one R sample carries 31.
3. **Tag 54.** Add the 13-character cap and the not-zero rule. NAPAS 247 caps one transfer below 500,000,000 VND (P). Proposed `[app rule]` for LSE-5: at 500,000,000 or more, issue the QR without tag `54` and show the amount with a note to split the transfer.
4. **Order and optional tags.** Root tags after `00` may come in any order. Tags `52`, `59`, and `60` are optional for transfers, and Esta omits them.
5. **CRC format.** 4 uppercase hex characters, zero-padded. A widely copied gist (`gist.github.com/tvd12/a03f4d2b8eb92f27229d1bfd659fba28`) formats with `"x"`, which breaks any payload whose CRC is below `0x1000`. The test `zero-pads a CRC below 0x1000` guards this.

`docs/spec/DOMAIN-VN.md` §10 carries these corrections and sources on this branch. §9 also gained the known-codes matching rule (see "Memo design").

## Test vectors

`test/vectors.ts` holds each vector with its source. The decoder accepts these, and `encodeVietQr` reproduces each one byte for byte:

| ID | Source | Covers |
| --- | --- | --- |
| `napas-6.3.3-dynamic-account` | N §6.3.3 | `12`, amount 180000, bill number, lowercase purpose |
| `vietnam-qr-pay-static` | Q | `11`, no amount |
| `vietnam-qr-pay-dynamic` | Q | `12`, amount, purpose |
| `vietnam-qr-pay-edited` | Q | `12`, amount 999999 |
| `viblo-tpbank-alias` | V | Alphabetic alias account `mynamebvh` |
| `vietqr-vn-virtual-account` | R | Virtual account with a bill number |

The decoder also accepts the NAPAS card examples N §6.3.2 and §6.3.4. The encoder emits only `QRIBFTTA`, so it does not reproduce them.

The decoder rejects:

- **N §6.3.1 as printed.** The CRC `F4E5` matches the printed bytes, but `38.01.01` declares length 12 for the 13-character account `0011012345678`. The well-formed payload ends `6304 9E6F`, which the encoder produces. The §6.3.4 one-line string is also wrong: it prints `010211` and drops tags `54` and `62`, while its field table matches CRC `A203`.
- **R `SampleTransactionDescription`.** The CRC does not match, and `62.08` declares 31 characters for a 28-character value.

`test/independent.test.ts` runs `vietnam-qr-pay` as an independent implementation. It parses Esta's invoice payload to the same fields, and its builder produces the same bytes.

```
pnpm test
ℹ tests 27
ℹ pass 27
ℹ fail 0
```

Removing the CRC padding fails `zero-pads a CRC below 0x1000`. Forcing tag `01` to `11` fails 5 encode tests. `pnpm typecheck` passes with `strict` and `exactOptionalPropertyTypes`.

## PNG round trip

`pnpm roundtrip` encodes a synthetic invoice and renders it with `qrcode` (error correction M). It then reads the PNG with `pngjs`, scans it with `jsQR`, and decodes the result. The invoice is account `0123456789` at BIN `970436`, holder NGUYEN THI DEMO, 15,000,000 đồng, memo `ESTA 7K2QX9MP`. No API received account data.

```
payload   00020101021238540010A00000072701240006970436011001234567890208QRIBFTTA53037045408150000005802VN62170813ESTA 7K2QX9MP6304BB90
length    124 characters, QR version 5
png       out/roundtrip.png, 360 x 360, 2992 bytes
scan      equals payload: true
decoded   dynamic, 970436, 0123456789, QRIBFTTA, 704, VN, 15000000, "ESTA 7K2QX9MP"
```

Full output is in `out/roundtrip.json`. Scanning with two banking apps stays the Phase 3 gate (LSE-5).

## NAPAS BIN list

**Official source.** NAPAS runs `vietqr.net`. The page calls `GET https://vietqr.net/portal-service/v1/info/banks` with an anonymous bearer token from `GET /portal-service/api/data/generate`. It decrypts the CryptoJS AES response with the local date `YYYYMMDD` followed by the token; the key derivation is in the site's own JavaScript. `napas.com.vn` shows members only as logos, and NAPAS documents no public API.

**Mirror.** `GET https://api.vietqr.io/v2/banks` is from VietQR.io (Casso). It needs no key and returns `bin`, `code`, `shortName`, `name`, `swift_code`, and transfer flags. The repository `vietqr-io/vietqr-api` is Apache-2.0, but its README documents only `/v1/banks` and states no data terms.

**Comparison** (`pnpm bins`, output in `out/bins-compare.json`):

- NAPAS has 74 entries, VietQR.io has 65, and 64 BINs are in both. All BINs are 6 digits.
- All 64 shared BINs agree. Names and codes differ, and VietQR.io is behind:
  - `970403`: "Sài Gòn Thương Tín" (`STB`) versus NAPAS "Sài Gòn Tài Lộc" (`SACOMBANK`). Shareholders approved this rename on 2026-04-22.
  - `970444`: CBBank versus NAPAS Vietcombank Neo (`VCBNeo`).
  - `970406`: VietQR.io code `Vikki` versus the NAPAS DongA code `DOB`.
  - `970426`, `971011`, and `971133` differ in wording only.
- Only VietQR.io lists `971025` (MoMo). Only NAPAS lists 10 BINs, mostly foreign branches (ESUN, BOCHK, BSP, BIDC, TNEX, ICBC, MVAS, CUBHCM, BNP HCM, BNP HN). NAPAS flags 9 of the 10 `isTransfer: 0`.
- NAPAS has `isTransfer` 1 on 46 entries and 0 on 28, including `970408` GPBank, `970421` VRB, and `458761` HSBC. The flag's meaning is a guess: probably "the portal can generate a transfer QR".

**Snapshots** (`data/SNAPSHOTS.json`, 2026-10-06T16:15:57Z):

| File | Entries | sha256 |
| --- | --- | --- |
| `data/bank-bins.napas-vietqr-net.json` | 74 | `ef2c3816d5fa8efc59df40f5a782aaefc751f81949238402f684447b1fe35104` |
| `data/bank-bins.vietqr-io.json` | 65 | `d814bc37c832dca4f697de393112837a1c80ae5307d9e42a9a11e5b8a9f7277d` |

NAPAS fields are `id`, `name` (full Vietnamese name), `code`, `bin`, `isTransfer`, and `filePath`. There is no display short name.

**Terms.** The NAPAS site terms (`https://www.napas.com.vn/dieu-khoan-su-dung`) reserve copyright (II.1). They bar copying and redistribution without permission (II.3) and bar robots and spiders (V.8). They allow personal or internal non-commercial use with the source cited (IV.1). Esta is a private family app in a private repository. `scripts/bins.ts` is a one-off spike fetch, not a production fetcher. It needs `scripts/globalsign-gcc-r46-ov-tls-ca-2025.pem` because `vietqr.net` omits its intermediate certificate. The file comes from the AIA URL in the leaf certificate.

## Memo design

`ESTA {memo_code}` is 13 characters. That fits the 25-character `62.08` limit and leaves 86 of the 99 characters in tag `62`. It survives encode, render, scan, and decode unchanged.

The §9 normalization finds the code in every bank-mangled form tested, such as `MBVCB.1234567.ESTA7K2QX9MP.CT TU ...`, `esta-7k2qx9mp`, and a memo followed by more text. One gap needs a fix. With spaces removed, `ESTA` appears inside words, so `FIESTA12345678` yields the false code `12345678` under a plain regex. `src/memo.ts` checks every `ESTA` occurrence and keeps a candidate only if it is an issued household code. LSE-8 should match the same way. The test also covers two memos in one line and a truncated code.

Not verified: bank apps prefill the description from `62.08`, but the payer can edit it, so the LSE-8 `suggested` path stays necessary.

## Decisions

1. **Keep the §10 payload shape.** Esta emits tags `00`, `01`, `38` (`00`, `01.00`, `01.01`, `02 = QRIBFTTA`), `53`, `54`, `58`, `62.08`, and `63`, in that order. Tag `01` is `12` with an amount and `11` without.
2. **Strict encoder, tolerant decoder.** The encoder throws `RangeError` on input outside the spec, because its input is Esta's own typed data. The decoder parses external data and returns a result. It accepts any root order, either `01` value, lowercase CRC hex, and purposes over 25 characters.
3. **No account name in the payload.** Tag `59` is optional for transfers.
4. **Seed BINs from NAPAS.** Seed `bank_bins` from the NAPAS list (`bin`, `name`, `code`), cite the source and fetch date, and refresh by hand. Display short names need a small curated map labelled `[app rule]`. VietQR.io has short names but is stale, and adopting it means adding a new external data source, which Ryan must approve.
5. **500,000,000 VND cap.** Needs a product call at LSE-5. The proposal is correction 3.

## Reproduce

```
cd spikes/s4-vietqr
pnpm install
pnpm test
pnpm typecheck
pnpm roundtrip
pnpm bins
```
