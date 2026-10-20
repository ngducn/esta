# Vietnam domain reference for Esta

Facts the code depends on. Tags: `[verified]` was checked against sources in October 2026. `[verify]` is background knowledge that must be confirmed in the spike that touches it before it drives user-facing logic. `[app rule]` is a product decision, not a legal fact.

Rules that change by law (tax rates, thresholds, land codes, admin units) live in data tables, never in code constants. This file seeds those tables and their tests.

## 0. Confirming `[verify]` facts without stopping the run

Each `[verify]` fact is confirmed in the spike or phase listed, against an official or reputable source (government portals, thuvienphapluat.vn, luatvietnam.vn, NAPAS, the dataset itself). Record the source next to the fact in this file in the same PR.

| Facts | Confirmed in |
| --- | --- |
| Certificate forms and eras (§2), land use codes (§3) | S5, first PR of Phase 2 |
| Province mapping of legacy addresses (§4), commune count | S3, before the plan |
| VietQR fields and memo length (§10) | S4, before the plan (done 2026-10-06, branch `spike/s4-vietqr` at `a7c9e76`) |
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
| Thông báo tiền thuê | Rent notice (a bill's page before anything is received) | `receipt` of kind `notice` |
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
| `so_do_pre2009` | "Giấy chứng nhận quyền sử dụng đất", red cover, land only | Before 10 Dec 2009 `[verified]`<sup>1</sup> |
| `so_hong_pre2009` | "Giấy chứng nhận quyền sở hữu nhà ở và quyền sử dụng đất ở", pink, urban housing | Before 10 Dec 2009 `[verified]`<sup>1</sup> |
| `gcn_2009_2024` | Unified "Giấy chứng nhận quyền sử dụng đất, quyền sở hữu nhà ở và tài sản khác gắn liền với đất", one sheet of four pages, pink drum pattern, serial of 2 letters and 6 digits | 10 Dec 2009 to 31 Jul 2024 `[verified]`<sup>1</sup> |
| `gcn_2024` | "Giấy chứng nhận quyền sử dụng đất, quyền sở hữu tài sản gắn liền với đất" under the 2024 Land Law, carries a 2 × 2 cm QR code at the top right of page 1 | From 1 Aug 2024 `[verified]`<sup>2</sup> (Circular 10/2024/TT-BTNMT) |
| `paper_only` | No certificate; handwritten or notarized paper only | Any |

Older certificates remain valid and are not required to be reissued `[verified]`<sup>3</sup>. The app treats every form as first-class.

Sources, fetched 2026-10-17 in spike S5:

1. Circular 17/2009/TT-BTNMT, Article 3 (the unified form) and its effective date of 10 Dec 2009, which ends the two separate pre-2009 forms: https://caselaw.vn/van-ban-phap-luat/269521-thong-tu-17-2009-tt-btnmt-ve-giay-chung-nhan-quyen-su-dung-dat-quyen-so-huu-nha-o-va-tai-san-khac-gan-lien-voi-dat-do-bo-tai-nguyen-va-moi-truong-ban-hanh
2. Circular 10/2024/TT-BTNMT, effective 1 Aug 2024, QR code size and position: https://lsvn.vn/quy-dinh-chinh-thuc-ve-ma-qr-tren-gcnqsdd-tu-01-8-2024-1723246241-a146084.html
3. Land Law 2024, Article 256(3): certificates issued before 1 Aug 2024 "vẫn có giá trị pháp lý và không phải cấp đổi": https://hethongphapluat.com/phap-luat/hoi-dap-phap-luat-chinh-sach-phap-luat/so-do-so-hong-cu-co-con-gia-tri-su-ve-viec-doi-so-theo-luat-dat-dai-2024.html

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

Rules `[app rule]`: numbers keep Vietnamese decimal commas converted to dots internally ("125,5 m²" → 125.5); areas follow the §9 rule. Handwritten annotations get confidence ≤ 0.6 unless they are printed stamps. If two areas disagree (parcel vs. purposes sum), keep both and flag.

## 3. Land use purpose codes

Seed for `land_use_codes`. Common codes seen on existing certificates, checked `[verified]` against Circular 08/2024/TT-BTNMT, Annex II section A, as luatvietnam.vn<sup>4</sup> and hethongphapluat.com<sup>5</sup> list it (fetched 2026-10-17 in spike S5; migration `20261007201000_land_use_codes_s5.sql`). Unknown codes from extraction are kept as free text and shown with a "mã chưa có trong danh mục" hint.

| Code | Vietnamese | English |
| --- | --- | --- |
| ODT | Đất ở tại đô thị | Urban residential |
| ONT | Đất ở tại nông thôn | Rural residential |
| CLN | Đất trồng cây lâu năm | Perennial crop land |
| HNK | Đất trồng cây hằng năm khác | Other annual crop land |
| BHK | Đất bằng trồng cây hằng năm khác | Other annual crop land, flat terrain (pre-2024 code) `[app rule]` |
| LUC | Đất chuyên trồng lúa | Specialized rice land |
| LUK | Đất trồng lúa còn lại | Other rice land |
| NTS | Đất nuôi trồng thủy sản | Aquaculture land |
| RSX | Đất rừng sản xuất | Production forest land |
| NKH | Đất nông nghiệp khác | Other agricultural land |
| TMD | Đất thương mại, dịch vụ | Commercial and service land |
| SKC | Đất cơ sở sản xuất phi nông nghiệp | Non-agricultural production land |
| CSD | Đất chưa sử dụng | Unused land `[app rule]` |
| BCS | Đất bằng chưa sử dụng | Unused flat land |

S5 changes from the P0-06 seed: LUC and LUK drop "nước", HNK and BCS are added, and CSD is the whole unused group, so the flat unused land P0-06 called CSD is BCS. Two rows stay as `[app rule]`, listed in `docs/plan/STATUS.md` under "Needs professional confirmation". BHK left the 2024 list, but certificates issued under older lists carry it and stay valid (§2, source 3), so the app keeps it. CSD is kept as a code because both sources list it, as "Nhóm đất chưa sử dụng (Ký hiệu chung: CSD)" in source 5, but neither confirms it as a certificate-level code.

4. https://luatvietnam.vn/dat-dai-nha-o/ky-hieu-cac-loai-dat-567-24866-article.html
5. https://hethongphapluat.com/phap-luat/huong-dan/bang-tra-cuu-ky-hieu-cac-loai-dat-moi-nhat-bi-kip-doc-hieu-so-do-va-ban-do-dia-chinh-theo-luat-dat-dai-2024.html

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
- Rounding. VAT and PIT are the rule's rate in basis points times the base, rounded half up to a whole đồng. Pro-rating a period by days and splitting a lease by ownership share both use the largest remainder method, with ties going to the earlier day segment or the earlier share, so the parts always sum exactly to the whole. A period is split first at each 1 January it crosses, and only then is each year's share split at the as-of date into accrued and contracted, so a year's total never depends on the as-of date. Shares that sum below 10000 bp leave the rest unattributed; shares above 10000 bp split in proportion.
- Taxable rental revenue is rent plus the lease's recurring charges. Metered electricity and water billed through to tenants are excluded, and the card shows "Giả định: Không tính tiền điện, nước thu theo công tơ".

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
- Rooming houses: the landlord reads electricity and water meters monthly and bills consumption in arrears with a flat per-unit price. Rules limit what landlords may charge renters for electricity `[verify]`; the app stores what the owner charges and shows a neutral note. Not yet confirmed (2026-10-20, P3-14): a search names Thông tư 60/2025/TT-BCT, Điều 12 khoản 5 (người thuê nhà để ở), but no source page could be opened from the session, so the meter screen labels its note `Giả định` and `docs/plan/STATUS.md` lists it.

Meter billing `[app rule]`, from P3-14 (LSE-4). A reading is a whole number of kWh or m³ for the month it closes, never below the reading before it, and a month's use is at most 100.000, so its line fits a bill at the highest price a meter takes (9.999.999 ₫) and a reading typed with extra digits is refused when saved. A month's use is its reading less the one before it, and the bill whose period starts the next month charges it at the meter's flat price, on a line that names the month and both readings, such as `Tiền điện tháng 10/2026: 120 kWh (2.847 → 2.967)`. The first reading of a meter has no use. A month's use belongs to the lease chain (a lease and its renewals: one tenant's stay) that holds the room on the month's last day, and that tenant pays the whole month: a new tenant who moves in mid-month pays that month's whole use, never a month that ended before their lease began, and a vacant month belongs to no one. A month a bill already charged stays with that bill's chain, even when the bill is voided later and the room let again. The month goes on the chain's first bill that is not void and starts after it, whichever lease of the chain issued it, so a renewal's first bill carries the last month of the lease it renews. It is charged once in all: a second bill starting in the same month, a quarter's bill, or another lease of the room never charges it again, and the database holds one live electricity or water line per meter and month, where a voided bill's lines are no longer live. When no bill of the chain is left to carry it (the last month of a lease that is not renewed, or a reading entered after the chain's last bill went out), the use is billed to no one; the meter screen says so after saving, so Mẹ can renew the lease, collect it herself or deduct it from the deposit. A metered bill issues the day every active meter of its room has the month's reading, or on its due date if that comes first. A reading entered or changed after its bill went out, or the use on a voided bill, becomes an adjustment line on the chain's next bill, such as `Điều chỉnh tiền điện tháng 10/2026: +10 kWh`. Mẹ is warned, never stopped, when a month's use is above three times the median of up to six months before it.
- Tết matters. Tenants often move out around Tết; vacancies cluster in the first quarter; owners collect before the holiday. The agent uses this as a seasonal signal.
- Residential leases do not require notarization or certification unless the parties want it: Luật Nhà ở 2023, Điều 164 khoản 2, for "thuê, mượn, ở nhờ, ủy quyền quản lý nhà ở" (checked 2026-10-18, <https://thuvienphapluat.vn/chinh-sach-phap-luat-moi/vn/ho-tro-phap-luat/tu-van-phap-luat/71831/theo-luat-nha-o-2023-thi-hop-dong-cho-thue-nha-o-co-phai-cong-chung-chung-thuc-hay-khong>). The lease form asks for neither.
- A tenant who lives at a rented place outside the commune of their permanent residence for 30 days or more must register temporary residence, within 30 days of moving in: Luật Cư trú 2020 (68/2020/QH14), Điều 27. The duty is the tenant's, and the landlord may register for them (checked 2026-10-18, <https://luatvietnam.vn/hanh-chinh/nguoi-thue-hay-cho-thue-phai-di-dang-ky-tam-tru-570-25585-article.html>). P2 suggestion: a per-lease `residence_registered` checkbox.

Lease form defaults by unit, `LEASE_DEFAULTS` in `packages/core/src/lease/defaults.ts` (`[app rule]`, from the customs above). Rent starts at the unit's list rent and the deposit at that rent times the deposit months. Every default bills on day 0 of the period (`due_offset_days` 0), prorates a part-month first period by days, has the owner file tax and asks 30 days' notice.

| Unit | Billed every | Deposit | Periods follow | Utilities |
| --- | --- | --- | --- | --- |
| Room | 1 month | 1 month | The lease start day, as rooming houses bill from move-in | Metered by the owner |
| Apartment (the whole unit of an apartment) | 1 month | 2 months | Calendar months | Tenant pays directly |
| Whole house or other whole property | 3 months | 2 months | Calendar months | Tenant pays directly |
| Shop | 3 months | 2 months | Calendar months | Tenant pays directly |
| Floor | 1 month | 2 months | Calendar months | Metered by the owner |
| Lot | 12 months | 3 months | Calendar months | Tenant pays directly |

A wrong bill `[app rule]`, from P3-20 (LSE-5). Mẹ voids an issued bill with a reason; it keeps its number and shows `Đã hủy` with no QR, and its period is never billed again, so a correct charge for that period goes on another bill as an adjustment. A bill any payment settled cannot be voided, because a payment is undone only within its saved toast; the money would otherwise sit on a void bill. A draft is never voided, since nobody has seen it; `Phát hành` issues it early instead, on that day.

## 8. Personal data

`[verified]` The Personal Data Protection Law 91/2025/QH15 took effect on 1 January 2026. Decree 330/2026/NĐ-CP sets administrative penalties from 19 August 2026. Principles include purpose limitation, minimization, security, and deletion on request.

App consequences `[app rule]`:

- No structured national ID numbers anywhere (decision D11). ID card images are `sensitive` documents. What the assistant reads keeps the last 4 digits only; text a person types is saved as typed (D11, amended 2026-10-19).
- Tenant data is used only to manage the lease. Export and delete exist per party.
- Sensitive documents show clear like every other (DOC-5, amended 2026-10-19), every access is logged, and they reach the AI only through the extraction job that targets them.
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
| `125,5 m²`, `350.5` | `parseMeasureInput` | 125.5, 350.5 |
| `1.250,75`, `1 250,75` | `parseMeasureInput` | 1250.75 |
| `1.250`, `1 250` | `parseMeasureInput` | 1250 |
| `1,255`, `4,500` | `parseMeasureInput` | refused as too precise |
| `12 5`, `1,5 5` | `parseMeasureInput` | refused as invalid |
| 350.5 | `measureInputText` | `350,5` |
| 2026-10-07 | `formatDate` | `07/10/2026` |
| 2026-10-07 | `formatDateLong` | `Thứ Tư, 07/10/2026` |
| due 2026-09-25, today 2026-10-07 | `formatRelativeDue` | `quá hạn 12 ngày` |
| `0903123456`, `+84903123456`, `84903123456` | `normalizePhone` | `+84903123456` |
| `+84903123456` | `formatPhone` | `0903 123 456` |
| `+84903123456` | `phoneForZaloLink` | `0903123456` (local format for `https://zalo.me/{phone}`) `Giả định` |

The Zalo link `Giả định` (LSE-11, checked 2026-10-20). Zalo's own documentation does not describe `https://zalo.me/{phone}`: searches of zalo.me, help.zalo.me and developers.zalo.me found no help or developer page for it. Search reports a Zalo Support reply giving the local form `zalo.me/0123456789` in a developers.zalo.me community thread (<https://developers.zalo.me/community/detail/14fef113cd5624087d47>), but the session could not open developers.zalo.me to read it, and that is a forum answer, not documentation. So `zaloChatUrl` uses the local form, the reminder sheet labels `Mở Zalo` `Giả định` and tells Mẹ to check the tenant's name before sending, and `docs/plan/STATUS.md` asks Ryan to confirm it on a phone.

English compact forms: `3.2B ₫`, `15.5M ₫`, `850K ₫`. tỷ keeps up to 2 decimals, tr up to 1, trailing zeros trimmed.

Amounts in words `[app rule]` (`vndInWords`, receipts and the VietQR split note). Spelled as a receipt prints it, starting with a capital and ending with `đồng`:

| Amount | Words |
| --- | --- |
| 0 | `Không đồng` |
| 15000000 | `Mười lăm triệu đồng` |
| 3500000 | `Ba triệu năm trăm nghìn đồng` |
| 21000000 | `Hai mươi mốt triệu đồng` |
| 1005000 | `Một triệu không trăm lẻ năm nghìn đồng` |
| 1200000000000 | `Một nghìn hai trăm tỷ đồng` |

- `nghìn`, never `ngàn`; `tỷ`, never `tỉ`.
- `lẻ` for a zero tens digit after a hundreds digit (`một trăm lẻ năm`), never `linh` (Ryan decided 2026-10-20). Esta picks one so a receipt and its QR note never differ.
- After a tens word, 1 is `mốt` and 5 is `lăm` (`hai mươi mốt`, `mười lăm`); 4 stays `bốn`, never `tư`.
- A group after a higher one keeps its `không trăm` (`một triệu không trăm lẻ năm nghìn`).
- Thousands of tỷ share one `tỷ`: 1.200.000.000.000 is `một nghìn hai trăm tỷ`, and 1.000.000.000.000 `một nghìn tỷ`.
- A receipt prints in Vietnamese whatever the screen's language, because the tenant reads it. While nothing is received on the bill it is a `Thông báo tiền thuê` without the received row, and a `Biên nhận tiền thuê` once any money is in (SPEC LSE-6, Ryan decided 2026-10-20).

Areas and lengths `[app rule]`. Every screen and the assistant read a typed or printed area or length with `parseMeasureInput`, in both languages:

- The comma is the decimal mark. A dot that is not followed by groups of three digits is also a decimal mark, so `350.5` is 350.5.
- A dot, a space or a no-break space before groups of three digits is thousands grouping, with the same mark throughout. Any other space makes the text invalid, so `12 5` is never 125.
- At most two decimals, because the area columns keep hundredths. `1,255` is refused as too precise, never read as 1255. The review screen shows such a reading for Mẹ to correct.
- An area may end in `m²`, `m2` or `m`, and a length in `m`.
- The value is greater than 0. An area is at most 9.999.999.999,99 m², the `numeric(12,2)` column, and an area the assistant reads is at most 100.000.000 m², so a national ID number cannot pass as one (SPEC D11). A frontage or road width is under 10.000 m (`kindDetailsSchema`).
- Every editor pre-fills an area or length with `measureInputText`: the decimal comma and no grouping, such as `350,5` or `1250`. The text reads back as the same number in both languages.

Reminders `[app rule]` (LSE-11, `REMINDER_TEMPLATES` in `packages/core/src/reminder/templates.ts`). A reminder is Vietnamese whatever the screen's language, because the tenant reads it, one sentence a line, with no exclamation mark. It names the place as the receipt does, the period as `25/09/2026 – 24/10/2026`, what is still owed with `formatVnd` and the due date with `formatDate`; an overdue one says `đã quá hạn 12 ngày`. It links the bill's QR picture when the household has a receiving account. Forms of address: a person is greeted by given name, `Chào anh/chị Hường.`, and Mẹ may pick `anh`, `chị`, `cô` or `chú` instead, which the whole message then uses; a business is greeted by its full name, `Kính gửi Công ty TNHH Demo Phát Đạt.`, and called `Quý khách`. No sentence opens on the pronoun, so no form needs a capital.

Names: Vietnamese names are family name, middle, given name ("Nguyễn Thị Hường"). Sort by given name, then middle, then family, using `vi` collation. `sortKeyVietnameseName("Nguyễn Thị Hường")` sorts before `"Trần Văn Khoa"` (H before K).

Search: accent-insensitive and case-insensitive via Postgres `unaccent` and `lower`, with đ/Đ mapped to d. Tests: "di an" finds "Dĩ An"; "hop dong" finds "Hợp đồng"; "DUONG" finds "Đường"; "bao loc so" finds a certificate document titled "Sổ hồng Bảo Lộc".

Bank statements (fixtures for three layouts):

- Amounts appear as `1.500.000`, `1,500,000`, `1500000.00`, with `+`/`-` signs, or in separate credit and debit columns. Parse to integer VND; reject fractional đồng.
- Dates appear as `dd/MM/yyyy`, `dd/MM/yyyy HH:mm:ss`, or `yyyy-MM-dd`.
- Descriptions are usually uppercase ASCII without diacritics. Banks prepend and append their own references and sometimes delete spaces, so the memo `ESTA 7K2QX9MP` may arrive as `MBVCB.1234567.ESTA7K2QX9MP.CT TU 0903...`. Match by normalizing (uppercase, strip non-alphanumerics) and searching for `ESTA` followed by the 8-character code. Check every `ESTA` occurrence and accept a candidate only if it is one of the household's issued memo codes: with spaces removed, `ESTA` also appears inside words such as `FIESTA`. `[verified]` Source: spike S4, `spikes/s4-vietqr/src/memo.ts` and its tests on branch `spike/s4-vietqr` at `a7c9e76`.
- `[app rule]` A transfer recorded by hand is never posted again from a statement (decided 2026-10-20, P3-15). A memo match or a suggestion is held as `Có thể trùng`, and never posts by itself, when its bill's lease has a payment recorded by hand as `Chuyển khoản` that no statement line holds yet, of the line's amount, received from 2 days before to 10 days after the line's date, whichever of the lease's bills it settled (the record sheet settles the oldest bill first). Mẹ records a transfer on or after the day it lands, and 2 days cover a weekend's booking, so last month's hand transfer of the same rent, recorded a week or more before this month's line, does not hold it. A person either presses `Đã ghi tay`, which links the line to the hand payment chosen from that list and adds no money (the only one is chosen already), or ticks the line to post it as a second transfer. A payment a line holds is never offered to another line, and a cash payment never holds a line. Not caught, so posted as a new payment: a hand payment recorded as the sum of two transfers, or dated more than 2 days before the bank's date or more than 10 days after it. A memo match on a voided bill, or on one that owes nothing, waits for a person too. The database decides this (`private.statement_line_state` and `private.statement_line_candidates`) for the preview and the commit alike.
- `[app rule]` Column mapping (decided 2026-10-20, P3-21). A statement whose header is none of the three layouts opens a column mapping instead of being refused. A person picks the header row within the first 20 lines, under any account lines the bank prints, then the date, description and optional bank reference columns, and the amount as one signed column or as money in and money out. The first five lines show as decoded before the preview, and columns that read no line are refused. The lines go through the same decoder and the same amount and date rules, so their fingerprints equal those of the same transfers read by detection. Each receiving account keeps the columns of its latest import with at least one line posted (`Ghi sổ`, or linked by `Đã ghi tay`); columns picked for an import that posted nothing are never applied without asking. A later file from that account is read under them without asking when every chosen column carries the same heading, compared as `foldHeader` folds it, anywhere in the first 20 lines; otherwise the mapping opens with the unchanged columns picked. Lines are numbered from the header row.
- `[app rule]` A line an earlier import holds is not stored again (decided 2026-10-20, P3-21), so reading a statement under other columns records nothing twice. It is known when the household holds its fingerprint, or when a line of the same bank account has the same amount and a date within 3 days (a value date read in place of a transaction date) and, if both lines carry a bank reference, the same reference, or otherwise the same description after normalizing. Lines with different references are different transfers whatever their descriptions. Each stored line answers for one new line, an equal reference first, so the nth identical line of a file is known only while the account holds n of them. Rent repeats about 30 days apart, so the window never merges two months. The cost: two separate transfers of one amount and description, without references, within 3 days and in different statements, count as one; the second shows as already imported and is recorded by hand, so a bill stays visibly owing, never recorded twice. Core's `knownLines` decides this, fed with the household's stored lines.

Google Maps links (PRP-5). Prefer the place coordinates over the viewport center.

| Pattern | Coordinates from |
| --- | --- |
| `.../maps/place/...!3d10.7769!4d106.7009...` | `!3d` lat, `!4d` lng |
| `.../maps/place/.../@10.7769,106.7009,17z` | `@lat,lng` when no `!3d!4d` |
| `https://www.google.com/maps?q=10.7769,106.7009` | `q` |
| `https://maps.google.com/?ll=10.7769,106.7009` | `ll` |
| `https://maps.app.goo.gl/<id>` and `https://goo.gl/maps/<id>` | Resolve redirect server-side (3 s timeout), then parse |

Warn when the point falls outside Vietnam's rough bounds (lat 8 to 24, lng 102 to 110).

The parser also accepts `google.com`, `maps.google.com` and the `google.com.vn` forms, and finds the link inside a pasted share message such as `Ben Thanh Market\nhttps://maps.app.goo.gl/<id>`.

Short link hop chains, captured 2026-10-16 (spike S6, P1-01) from the Google Maps web Share dialog, followed without cookies. Both links are public landmarks.

| Link | Hop 1 | Result |
| --- | --- | --- |
| Named place (Chợ Bến Thành), `https://maps.app.goo.gl/5EGXC5WSBATiA4av8` | `302` to `https://www.google.com/maps/place/Ben+Thanh+Market/@10.7725168,106.6980208,17z/data=...!3d10.7725168!4d106.6980208...?entry=tts&g_ep=...&skid=...` | Parses as `place` |
| Dropped pin (Hồ Hoàn Kiếm, 21.0285, 105.8522), `https://maps.app.goo.gl/9dudihPmscBQ6Rp87` | `302` to `https://www.google.com/maps/place/21°01'42.6"N+105°51'07.9"E/@21.0285,105.8522,17z/data=...!3d21.0285!4d105.8522?entry=tts&...` | Parses as `place` |
| `goo.gl/maps/<id>` | Google Maps no longer issues these links, so no fresh one exists. An unknown id answers `404` with no `Location` | `no_redirect` |

Each short link redirects once, straight to `www.google.com/maps/place/`, with an empty body and no cookie. The mobile app's `?g_st=ic` suffix is carried onto the target and changes nothing else. The resolver follows a `Location` only on `maps.app.goo.gl` or `goo.gl/maps`, at most 5 fetches in all, and stops without fetching at the first `Location` on `google.com` or `www.google.com` under `/maps`.

## 10. VietQR payload

`[verified]` in spike S4 on 2026-10-06 against NAPAS, *Technical Specifications on NAPAS QR Switching* v1.5.2 (`QR_Format_T&C_v1.5.2_EN_102022.pdf`, from `https://vietqr.net/portal-service/download/documents/QR_Format_T&C_v1.5.2_EN_102022.pdf`, cited below as N), and locked with test vectors in `spikes/s4-vietqr` on branch `spike/s4-vietqr` at `a7c9e76`. VietQR follows the EMVCo merchant-presented QR format.

| Tag | Meaning | Value | Source |
| --- | --- | --- | --- |
| 00 | Payload format indicator | `01`. Always the first tag. | N §5.1, §5.2.1 |
| 01 | Point of initiation | `11` static (one QR, many transactions), `12` dynamic (one QR, one transaction). Mandatory for transfers. `[app rule]` Esta emits `12` when an amount is present and `11` otherwise. | N §5.2.2, Table 3 |
| 38 | Merchant account information | sub-tag 00 GUID `A000000727`; sub-tag 01 beneficiary organization (sub-tag 00 bank BIN, 6 digits; sub-tag 01 account number, up to 19 characters); sub-tag 02 service code `QRIBFTTA` (transfer to account; `QRIBFTTC` is transfer to card) | N §5.2.3.2, Table 8 |
| 53 | Currency | `704` | N §5.2.5 |
| 54 | Amount | Integer đồng as plain digits, not zero, up to 13 characters | N §5.2.6 |
| 58 | Country | `VN` | N §5.2.10 |
| 62 | Additional data | sub-tag 08 purpose: `ESTA {memo_code}`. Sub-tag 08 holds at most 25 characters; the whole tag 62 holds at most 99. | N §5.2.14, Tables 6 and 12 |
| 63 | CRC | CRC-16/CCITT-FALSE (ISO/IEC 13239, polynomial `1021`, initial `FFFF`) over the whole payload including `6304`, written as 4 uppercase hex characters, zero-padded. Always the last tag. | N §5.2.15 |

Each field is `tag + 2-digit length + value`. Root tags between `00` and `63` may appear in any order, so a decoder must not depend on order (N §5.1). Tags 52 (MCC), 59 (merchant name) and 60 (city) are optional for transfers and Esta omits them; the payer's bank shows the account holder's name from its own lookup. The memo stays ASCII uppercase; `ESTA {memo_code}` is 13 characters, inside the 25-character limit.

NAPAS 247 caps one transfer below 500,000,000 VND (`https://napas.com.vn/dich-vu-chuyen-tien-nhanh-napas-247-ngan-hang`). `[app rule]` for LSE-5, pending Ryan (listed in `docs/plan/STATUS.md`): when the amount is 500,000,000 or more, issue the QR without tag 54 and show the amount with a note to split the transfer.

Bank BINs come from the NAPAS list on `vietqr.net` (`/portal-service/v1/info/banks`), seeded into `bank_bins` with its source and fetch date. The snapshot, its sha256, and a comparison with the `api.vietqr.io/v2/banks` mirror are in `spikes/s4-vietqr/data`.

## 11. Lunar calendar (P2)

Display the lunar date next to due dates and in the home header. Use an implementation of the Vietnamese lunar calendar computed at UTC+7 (the Hồ Ngọc Đức algorithm family), which sometimes differs from the Chinese calendar. Test vectors `[verify]`: Tết Nguyên Đán 2026 falls on 17/02/2026; 2027 on 06/02/2027.
