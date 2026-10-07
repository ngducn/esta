# Vietnam domain reference for Esta

Facts the code depends on. Tags: `[verified]` was checked against sources in October 2026. `[verify]` is background knowledge that must be confirmed in the spike that touches it before it drives user-facing logic. `[app rule]` is a product decision, not a legal fact.

Rules that change by law (tax rates, thresholds, land codes, admin units) live in data tables, never in code constants. This file seeds those tables and their tests.

## 0. Confirming `[verify]` facts without stopping the run

Each `[verify]` fact is confirmed in the spike or phase listed, against an official or reputable source (government portals, thuvienphapluat.vn, luatvietnam.vn, NAPAS, the dataset itself). Record the source next to the fact in this file in the same PR.

| Facts | Confirmed in |
| --- | --- |
| Certificate forms and eras (§2), land use codes (§3) | S5, first PR of Phase 2 |
| Province mapping of legacy addresses (§4), commune count | S3, before the plan |
| VietQR fields and memo length (§10) | S4, before the plan |
| Zalo link phone format (§9) | Phase 3, LSE-11 |
| Rental customs and electricity resale rule (§7) | Phase 3 |
| Lunar dates (§11) | Phase 4, when the P2 item is attempted |
| Tax interplay, co-owner attribution, PIT effective date (§5) | Not confirmable by a source alone |

When a fact cannot be confirmed from a source (the last row, or anything needing an accountant or lawyer), do not stop. Ship the `[app rule]` behavior, label it "Ước tính" or "Giả định" in the UI with the rule's note, and list it in `docs/plan/STATUS.md` under "Needs professional confirmation".

## 1. Glossary

| Vietnamese | English | Identifier |
| --- | --- | --- |
| Sổ đỏ / sổ hồng / Giấy chứng nhận (GCN) | Land use right certificate | `certificate` |
| Thửa đất số | Parcel number | `parcel_no` |
| Tờ bản đồ số | Cadastral map sheet number | `map_sheet_no` |
| Diện tích | Area (m²) | `area_m2` |
| Hình thức sử dụng (riêng / chung) | Form of use (private / shared) | `use_form` |
| Mục đích sử dụng | Land use purpose | `land_use_code` |
| Thời hạn sử dụng (lâu dài / đến ngày) | Term of use (long-term / until) | `term` |
| Nguồn gốc sử dụng | Origin of use right | `origin_text` |
| Tài sản gắn liền với đất | Assets attached to land (house, works) | `structure` |
| Diện tích xây dựng / diện tích sàn | Footprint / floor area | `footprint_m2` / `floor_area_m2` |
| Số phát hành / số vào sổ cấp GCN | Serial number / register entry number | `serial_no` / `book_entry_no` |
| Những thay đổi sau khi cấp | Changes after issuance (annotations) | `annotations` |
| Thế chấp | Mortgage | `mortgage` |
| Đứng tên | Named on the certificate | `named_on_certificate` |
| Giấy tay | Handwritten paper transfer (no certificate) | `paper_only` |
| Chủ nhà / người cho thuê | Landlord | owner party |
| Người thuê / bên thuê | Tenant | tenant party |
| Hợp đồng thuê | Lease contract | `lease` |
| Tiền cọc | Security deposit | `deposit` |
| Kỳ thanh toán | Billing period | `period` |
| Tiền điện / tiền nước | Electricity / water charges | invoice line kinds |
| Chỉ số công tơ / đồng hồ | Meter reading | `meter_reading` |
| Dãy trọ / phòng trọ | Rooming house / room | `rooming_house` / `room` |
| Mặt bằng | Commercial space | `commercial_space` |
| Biên nhận / phiếu thu | Receipt | `receipt` |
| Doanh thu | Revenue | |
| Thuế GTGT / thuế TNCN | VAT / personal income tax | |
| Bảng giá đất | State land price table | `state_price_reference` |
| Tỉnh / thành phố | Province / centrally run city | `province`, `city` |
| Phường / xã / đặc khu | Ward / commune / special zone | `ward`, `commune`, `special_zone` |
| Căn cước (CCCD) | National ID card | stored as document only |

## 2. Certificates

Certificate forms the app must recognize. `form` values match `certificates.form`.

| `form` | What it is | Era |
| --- | --- | --- |
| `so_do_pre2009` | "Giấy chứng nhận quyền sử dụng đất", red cover, land only | Before 2009 `[verify]` |
| `so_hong_pre2009` | "Giấy chứng nhận quyền sở hữu nhà ở và quyền sử dụng đất ở", pink, urban housing | Before 2009 `[verify]` |
| `gcn_2009_2024` | Unified "Giấy chứng nhận quyền sử dụng đất, quyền sở hữu nhà ở và tài sản khác gắn liền với đất", pink, multi-page | 2009 to mid-2024 `[verify]` |
| `gcn_2024` | "Giấy chứng nhận quyền sử dụng đất, quyền sở hữu tài sản gắn liền với đất" under the 2024 Land Law, carries a QR code | From 1 Aug 2024 `[verify]` (Circular 10/2024/TT-BTNMT) |
| `paper_only` | No certificate; handwritten or notarized paper only | Any |

Older certificates remain valid and are not required to be reissued `[verify]`. The app treats every form as first-class.

### 2.1 Extraction schema

Fields the extraction job returns (schema `certificate_v1`). Every field carries a confidence in [0, 1] and the page it came from.

- `form`: one of the values above.
- `holders[]`: full_name, birth_year, id_last4 (never the full number, see §8), address_text, relation (e.g. "vợ chồng").
- `parcels[]`: parcel_no, map_sheet_no, address_text, area_m2, use_form, purposes[] (land_use_code, area_m2, term), origin_text.
- `structures[]`: kind, footprint_m2, floor_area_m2, floors, structure_text, completed_year, ownership_term.
- `serial_no`, `book_entry_no`, `issued_on`, `issued_by`.
- `annotations[]`: date, text, kind guess (`mortgage | mortgage_release | transfer | change_of_area | other`).
- `has_qr`: boolean.
- `notes_text`: the "Ghi chú" section verbatim.

Rules `[app rule]`: numbers keep Vietnamese decimal commas converted to dots internally ("125,5 m²" → 125.5). Handwritten annotations get confidence ≤ 0.6 unless they are printed stamps. If two areas disagree (parcel vs. purposes sum), keep both and flag.

## 3. Land use purpose codes

Seed for `land_use_codes`. Common codes seen on existing certificates. `[verify]` against the current land classification rules; unknown codes from extraction are kept as free text and shown with a "mã chưa có trong danh mục" hint.

| Code | Vietnamese | English |
| --- | --- | --- |
| ODT | Đất ở tại đô thị | Urban residential |
| ONT | Đất ở tại nông thôn | Rural residential |
| CLN | Đất trồng cây lâu năm | Perennial crop land |
| BHK | Đất bằng trồng cây hằng năm khác | Other annual crop land |
| LUC | Đất chuyên trồng lúa nước | Specialized wet rice land |
| LUK | Đất trồng lúa nước còn lại | Other wet rice land |
| NTS | Đất nuôi trồng thủy sản | Aquaculture land |
| RSX | Đất rừng sản xuất | Production forest land |
| NKH | Đất nông nghiệp khác | Other agricultural land |
| TMD | Đất thương mại, dịch vụ | Commercial and service land |
| SKC | Đất cơ sở sản xuất phi nông nghiệp | Non-agricultural production land |
| CSD | Đất bằng chưa sử dụng | Unused flat land |

## 4. Administrative units after the 2025 reform

`[verified]`

- From 1 July 2025 Vietnam runs a two-tier local government: province level and commune level. The district tier (quận, huyện, thị xã, thành phố thuộc tỉnh) is abolished.
- Province-level units went from 63 to 34: 28 provinces and 6 centrally run cities. Resolution 202/2025/QH15 (12 June 2025) merged the provinces; Law 72/2025/QH15 organizes local government.
- Since then three provinces became centrally run cities without code or boundary changes: Đồng Nai (30/2026/QH16, from 30 April 2026), Quảng Ninh (36/2026/QH16, from 1 September 2026) and Bắc Ninh (39/2026/QH16, from 20 September 2026). As of 6 October 2026 the 34 are 25 provinces and 9 cities. Source: NSO `DMDVHC.asmx` `DanhMucTinh` at 06/10/2026 (spike S3).
- Commune-level units were merged as well: 3,321 units, the count in Decision 19/2025/QĐ-TTg and unchanged since. As of 6 October 2026: 709 phường, 2,599 xã, 13 đặc khu. `[verified]` Source: NSO `DMDVHC.asmx` `DanhMucPhuongXa` at 06/10/2026 (spike S3, `spikes/s3-admin-units/REPORT.md` on branch `spike/s3-admin-units`).
- TP. Hồ Chí Minh now includes former Bình Dương and Bà Rịa–Vũng Tàu.
- Addresses now read house number, street, ward or commune, province. People, agents and older documents will keep using old names for years.

Consequences for the app:

1. Store the certificate address verbatim (`certificate_address_text`). Never rewrite it.
2. Store the current address structurally (`commune_code`, `province_code`) plus a street line.
3. Search must match old names: "Dĩ An", "Bình Dương", "Quận 7" all find the right properties through `admin_unit_legacy_map`.
4. Show both addresses on the property header when they differ, labelled "Theo sổ" and "Hiện nay".

Legacy lookup test cases for FND-6. The expected province is the check; the expected ward or commune comes from the NSO conversion table (`danhmuchanhchinh.nso.gov.vn/TAPTIN/BangChuyendoiĐVHCmoi_cu_final.xlsx`, spike S3) and is frozen in the test.

| Old address | Expected current province | Expected current ward or commune |
| --- | --- | --- |
| Phường Dĩ An, Thành phố Dĩ An, Tỉnh Bình Dương | TP. Hồ Chí Minh (79) `[verified]` | Phường Dĩ An (25942) |
| Phường 1, Thành phố Vũng Tàu, Tỉnh Bà Rịa–Vũng Tàu | TP. Hồ Chí Minh (79) `[verified]` | Phường Vũng Tàu (26506) |
| Phường 2, Thành phố Tân An, Tỉnh Long An | Tây Ninh (80) `[verified]` | Phường Long An (27694), through one pre-reform hop: Phường 2 (27688) merged into Phường 1 (27694) on 1 December 2024 |
| Phường Tân Phong, Thành phố Biên Hòa, Tỉnh Đồng Nai | TP. Đồng Nai (75) `[verified]` | Phường Tân Triều (26188) |
| Phường 1, Thành phố Bảo Lộc, Tỉnh Lâm Đồng | Lâm Đồng (68) `[verified]` | Phường 1 Bảo Lộc (24823) |

Sources: NSO conversion table and NSO `DMDVHC.asmx` (current units at 06/10/2026; Phường 2 Tân An present at 30/11/2024 and absent at 01/12/2024). The Phường 2 merger is in the Standing Committee resolution of 24 October 2024 on Long An's commune units, effective 1 December 2024 (<https://daibieunhandan.vn/print/10350856.html>). The conversion table omits it, so the import adds it as a curated row in `supabase/seed/reference/legacy_curated.csv`, next to three rows whose old commune code the table misprints. Cross-checked against `tranngocminhhieu/vietnamadminunits` @ `7fac8c4`, which agrees on all five.

## 5. Rental income tax for individuals, 2026

`[verified]` unless marked.

- From 2026, an individual or household business whose annual revenue is 500,000,000 VND or less pays neither VAT nor PIT on that revenue. Legal basis cited by sources: PIT Law 109/2025/QH15, the amended VAT law, Decree 68/2026/NĐ-CP.
- The 500M threshold is assessed on the person's total business revenue across all activities, not per property.
- Above the threshold, rental VAT is 5% of total rental revenue (the 500M is not subtracted).
- Above the threshold, rental PIT is 5% of revenue in excess of 500M.
- Revenue from multi-year advance payments is attributed to each year it covers. 900M received for 24 months is 450M per year.
- Declarations are made where each leased property is located.
- Sources disagree on whether the PIT part applies from 1 Jan 2026 or 1 Jul 2026 `[verify]`. The `tax_rules` row carries `effective_from` and a note; the UI shows the note.
- How the 500M deduction splits when the person also has other business revenue, or across several leases, depends on the declaration choice `[verify]`. Sources mention the person may choose which leases the 500M is deducted against.
- How co-owned property revenue is attributed between co-owners `[verify]`.

`tax_rules` seed row:

```json
{
  "kind": "vn_rental_individual",
  "effective_from": "2026-01-01",
  "params": {
    "threshold_vnd": 500000000,
    "threshold_scope": "all_business_revenue_of_person",
    "vat_rate_bp": 500,
    "vat_base": "total_rental_revenue_when_over_threshold",
    "pit_rate_bp": 500,
    "pit_base": "revenue_above_threshold"
  },
  "source_citation": "Luật Thuế TNCN 109/2025/QH15; Luật sửa đổi Luật Thuế GTGT; Nghị định 68/2026/NĐ-CP"
}
```

App behavior `[app rule]`:

- Revenue is attributed by period (accrual by lease period, pro-rated by days), not by cash received.
- Threshold progress and the estimates use projected full-year revenue: accrued to date plus the contracted remainder of active leases to 31 December. The card also shows accrued-to-date revenue. The worked examples below are full-year figures.
- Revenue of a co-owned property is split by ownership share unless the lease names a declaring party.
- Leases with `tax_payer = tenant_withholds` count toward the owner's revenue total but are excluded from "estimated tax you pay" and labelled "Bên thuê nộp thay".
- When `owner_tax_inputs.other_business_revenue_vnd > 0`, the threshold uses the total, the PIT estimate applies the 500M deduction to rental revenue first, and the card shows a "hỏi kế toán về cách trừ 500 triệu" note.
- Every tax figure is labelled "Ước tính, không phải tư vấn thuế" with the rule's source.

Worked examples. FIN-3 unit tests reproduce these exactly.

| # | Inputs | Rental revenue for the year | VAT | PIT |
| --- | --- | --- | --- | --- |
| E1 | One owner, no other business, 360M rent | 360,000,000 | 0 | 0 |
| E2 | One owner, 600M rent | 600,000,000 | 30,000,000 | 5,000,000 |
| E3 | One owner, 900M rent | 900,000,000 | 45,000,000 | 20,000,000 |
| E4 | 900M paid in Jan 2026 for 24 months from 1 Jan 2026 | 450,000,000 in 2026 | 0 | 0 |
| E5 | 800M/year property owned 50/50 by two people, no other business | 400,000,000 each | 0 each | 0 each |
| E6 | 700M rent of which 200M from a lease with `tenant_withholds` | 700,000,000 total, 500,000,000 self-declared | 25,000,000 owner-paid | 0 owner-paid; card shows the 200M withheld lease separately |
| E7 | 450M rent plus 100M other business revenue | 450,000,000 (threshold total 550,000,000) | 22,500,000 | 0, with the "hỏi kế toán" note |

E6 and E7 reasoning `[app rule]`, pending `[verify]`: the threshold test uses the person's total revenue. Owner-paid VAT is 5% of self-declared rental revenue once the total is over the threshold. Owner-paid PIT is 5% of self-declared rental revenue above 500M, because the deduction is applied to rental revenue first. Withheld leases are shown, not estimated. If a tax advisor confirms a different treatment, change the rule params and these rows together in one PR.

## 6. State land price tables

`[verified]`

- Under Article 159 of the 2024 Land Law, provinces issue land price tables applied from 1 January 2026 and adjust them annually.
- Resolution 254/2025/QH15 and Decree 49/2026/NĐ-CP govern how tables are amended during 2026.
- Tables serve state calculations (land use fees, land taxes, compensation). They are not market value.

App: state prices are stored as `valuations` with `method = state_price_reference`, the year, and the source document. The research job watches for table changes in provinces where the household owns land.

## 7. Rental customs

Practice, not law. Defaults in forms follow these.

- Deposits are usually 1 to 3 months of rent; rooms often 1 month.
- Rooms and apartments are billed monthly. Whole houses and commercial space often bill quarterly, every 6 months, or annually in advance.
- Rent is paid at the start of the period, commonly within the first 5 days.
- Rooming houses: the landlord reads electricity and water meters monthly and bills consumption in arrears with a flat per-unit price. Rules limit what landlords may charge renters for electricity `[verify]`; the app stores what the owner charges and shows a neutral note linking to current rules.
- Tết matters. Tenants often move out around Tết; vacancies cluster in the first quarter; owners collect before the holiday. The agent uses this as a seasonal signal.
- Residential leases do not require notarization unless the parties want it `[verify]`.
- Rooming house tenants must be registered for temporary residence `[verify]`. P2 suggestion: a per-lease `residence_registered` checkbox.

## 8. Personal data

`[verified]` The Personal Data Protection Law 91/2025/QH15 took effect on 1 January 2026. Decree 330/2026/NĐ-CP sets administrative penalties from 19 August 2026. Principles include purpose limitation, minimization, security, and deletion on request.

App consequences `[app rule]`:

- No structured national ID numbers anywhere (decision D11). ID card images are `sensitive` documents. Text keeps the last 4 digits only.
- Tenant data is used only to manage the lease. Export and delete exist per party.
- Sensitive documents are blurred until tapped, every access is logged, and they reach the AI only through the extraction job that targets them.
- Whether household-only use is exempt from parts of the law is unknown `[verify]`; build to the stricter reading.

## 9. Formatting and parsing conventions

Implemented in `packages/core/format` and `packages/core/parse`. FND-4 tests use these exact examples (vi locale; NBSP shown as `␣`).

| Input | Function | Output |
| --- | --- | --- |
| 15000000 | `formatVnd` | `15.000.000␣₫` (whatever `Intl.NumberFormat('vi-VN', {style:'currency', currency:'VND'})` emits) |
| 3200000000 | `formatVndCompact` | `3,2 tỷ` |
| 1250000000 | `formatVndCompact` | `1,25 tỷ` |
| 1000000000 | `formatVndCompact` | `1 tỷ` |
| 999999999 | `formatVndCompact` | `1 tỷ` (pick the unit after rounding) |
| 15000000 | `formatVndCompact` | `15 tr` |
| 15500000 | `formatVndCompact` | `15,5 tr` |
| 850000 | `formatVndCompact` | `850 nghìn` |
| 125.5 | `formatArea` | `125,5 m²` |
| 2026-10-07 | `formatDate` | `07/10/2026` |
| 2026-10-07 | `formatDateLong` | `Thứ Tư, 07/10/2026` |
| due 2026-09-25, today 2026-10-07 | `formatRelativeDue` | `quá hạn 12 ngày` |
| `0903123456`, `+84903123456`, `84903123456` | `normalizePhone` | `+84903123456` |
| `+84903123456` | `formatPhone` | `0903 123 456` |
| `+84903123456` | `phoneForZaloLink` | `0903123456` (local format for `https://zalo.me/{phone}`) `[verify]` |

English compact forms: `3.2B ₫`, `15.5M ₫`, `850K ₫`. tỷ keeps up to 2 decimals, tr up to 1, trailing zeros trimmed.

Names: Vietnamese names are family name, middle, given name ("Nguyễn Thị Hường"). Sort by given name, then middle, then family, using `vi` collation. `sortKeyVietnameseName("Nguyễn Thị Hường")` sorts before `"Trần Văn Khoa"` (H before K).

Search: accent-insensitive and case-insensitive via Postgres `unaccent` and `lower`, with đ/Đ mapped to d. Tests: "di an" finds "Dĩ An"; "hop dong" finds "Hợp đồng"; "DUONG" finds "Đường"; "bao loc so" finds a certificate document titled "Sổ hồng Bảo Lộc".

Bank statements (fixtures for three layouts):

- Amounts appear as `1.500.000`, `1,500,000`, `1500000.00`, with `+`/`-` signs, or in separate credit and debit columns. Parse to integer VND; reject fractional đồng.
- Dates appear as `dd/MM/yyyy`, `dd/MM/yyyy HH:mm:ss`, or `yyyy-MM-dd`.
- Descriptions are usually uppercase ASCII without diacritics. Banks prepend and append their own references and sometimes delete spaces, so the memo `ESTA 7K2QX9MP` may arrive as `MBVCB.1234567.ESTA7K2QX9MP.CT TU 0903...`. Match by normalizing (uppercase, strip non-alphanumerics) and searching for `ESTA` followed by the 8-character code.

Google Maps links (PRP-5). Prefer the place coordinates over the viewport center.

| Pattern | Coordinates from |
| --- | --- |
| `.../maps/place/...!3d10.7769!4d106.7009...` | `!3d` lat, `!4d` lng |
| `.../maps/place/.../@10.7769,106.7009,17z` | `@lat,lng` when no `!3d!4d` |
| `https://www.google.com/maps?q=10.7769,106.7009` | `q` |
| `https://maps.google.com/?ll=10.7769,106.7009` | `ll` |
| `https://maps.app.goo.gl/<id>` and `https://goo.gl/maps/<id>` | Resolve redirect server-side (3 s timeout), then parse |

Warn when the point falls outside Vietnam's rough bounds (lat 8 to 24, lng 102 to 110).

## 10. VietQR payload

`[verify]` against the NAPAS VietQR specification during spike S4, then lock with test vectors. VietQR follows the EMVCo merchant-presented QR format.

| Tag | Meaning | Value |
| --- | --- | --- |
| 00 | Payload format indicator | `01` |
| 01 | Point of initiation | `12` when an amount is present, `11` otherwise |
| 38 | Merchant account information | sub-tag 00 GUID `A000000727`; sub-tag 01 beneficiary organization (sub-tag 00 bank BIN, sub-tag 01 account number); sub-tag 02 service code `QRIBFTTA` (transfer to account) |
| 53 | Currency | `704` |
| 54 | Amount | Integer đồng |
| 58 | Country | `VN` |
| 62 | Additional data | sub-tag 08 purpose: `ESTA {memo_code}` |
| 63 | CRC | CRC-16/CCITT-FALSE over the whole payload including `6304` |

Each field is `tag + 2-digit length + value`. The memo stays ASCII uppercase and short (≤ 25 characters recommended `[verify]`). Bank BINs come from the NAPAS list, seeded into `bank_bins` with its source.

## 11. Lunar calendar (P2)

Display the lunar date next to due dates and in the home header. Use an implementation of the Vietnamese lunar calendar computed at UTC+7 (the Hồ Ngọc Đức algorithm family), which sometimes differs from the Chinese calendar. Test vectors `[verify]`: Tết Nguyên Đán 2026 falls on 17/02/2026; 2027 on 06/02/2027.
