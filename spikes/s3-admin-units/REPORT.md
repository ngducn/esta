# Spike S3: admin units dataset

Question (SPEC §11 S3). Which dataset gives Vietnam's post-1-July-2025 two-tier admin units with official codes and a mapping from pre-reform names and codes, under a license that allows bundling in the app's seed data?

Answer. Use the National Statistics Office (NSO) itself for both halves. Its SOAP catalog gives the current 34 province-level and 3,321 commune-level units with official codes. Its published conversion table maps every pre-reform commune to its current commune by code, with a whole or partial merge flag. Both are government publications with no terms of use, and Vietnamese law excludes administrative documents from copyright. Ryan approves this at plan review.

This spike is throwaway. FND-6 does the real import.

## Reproduce

    spikes/s3-admin-units/fetch.sh            # downloads, then checks SHA256SUMS
    uv run -q --with openpyxl python -I spikes/s3-admin-units/s3.py

`fetch.sh --update` rewrites `data/SHA256SUMS` after a deliberate refresh. `DEN_NGAY` pins the catalog date (default `06/10/2026`). Two fetches on 6 October 2026 produced identical hashes.

## Candidates

| Candidate | Current units and codes | Legacy mapping | License | Freshness | Format |
| --- | --- | --- | --- | --- | --- |
| NSO catalog, `danhmuchanhchinh.nso.gov.vn/DMDVHC.asmx` (`DanhMucTinh`, `DanhMucPhuongXa`) | 34 and 3,321, official codes from Decision 19/2025/QĐ-TTg | None (snapshot by date only) | Government data, no terms on the site | Live. Reflects the 2026 changes | SOAP XML, any `DenNgay` date |
| NSO conversion table, `danhmuchanhchinh.nso.gov.vn/TAPTIN/BangChuyendoiĐVHCmoi_cu_final.xlsx` | New commune name and code | Commune to commune, 10,571 rows, with old district and old province names and codes, and a free-text merge note | Same | `Last-Modified` 23 October 2025. Mapping as of 1 July 2025 | XLSX, one merged and one unmerged sheet |
| `thanglequoc/vietnamese-provinces-database` v5.2.0 (`8b78ba5`, 22 September 2026) | 34 and 3,321, scraped from the same NSO SOAP. Codes identical to NSO for all 3,355 units | None | MIT | Tracks every decree through 388/NQ-UBTVQH16 | SQL for four databases, JSON, Mongo, Redis, Elasticsearch, GeoJSON, postal codes |
| `tranngocminhhieu/vietnamadminunits` (`7fac8c4`, 8 October 2025) | 34 and 3,321 | Commune to commune, 10,597 pairs, built from `sapnhap.bando.com.vn` and the GSO list | MIT | Frozen October 2025. No 2026 kind changes | CSV, JSON, SQLite, Python |
| `sunshine-tech/VietnamProvinces` (the library behind `provinces.open-api.vn`) | 34 and 3,321 from NSO | Ships the NSO conversion table as CSV and a legacy search API | GPL-3.0-or-later | Active (20 September 2026) | Python, JSON |
| `provinces.open-api.vn` v2 | Same data as above | Same | Hosted API, not bundled | Not fetched | HTTP API. A runtime dependency, so ruled out for seed data |
| `daohoangson/dvhcvn` | Three tiers | Not inspected | GPL-3.0 | Active | JSON |
| `quangtam/vietnam-address-database` | 34 and 3,321 | About 10,977 mapping rules per its description | No license file, so not bundleable | Last push 15 July 2025 | JSON |
| `trng28/address-converter` | Old to new converter | Yes | Apache-2.0 | 0 stars, unvetted | Python |
| Resolution 202/2025/QH15 and the June 2025 Standing Committee commune resolutions | Names only, no codes | The legal source of every merge | Legal text | Fixed | PDF and web text. The NSO table is their codified form |

Every open-source candidate derives its codes from the NSO. Going to the NSO directly removes a license question and a lag.

## Decision

Current units come from the NSO SOAP catalog at a pinned date. Legacy mapping comes from the NSO conversion table. The join key is the 5-digit commune code: conversion-table `Mã Xã mới` equals catalog `MaPhuongXa`. The province of a current commune comes from the catalog's `MaTinh`, never from the table.

The join is complete in both directions. Every target code in the table exists in the current catalog, and every current commune has at least one legacy row.

Two cleanups are needed at import.

1. Trust the old district code, not the old province column. Two rows name the wrong old province. Phường 4 of Thành phố Tân An says Tiền Giang (82) instead of Long An (80). Xã Tiên Hải of Hà Tiên says An Giang (89) instead of Kiên Giang (91). The import derives each old district's province by majority vote over its rows.
2. Collapse whitespace in names. The NSO catalog has leading, trailing, double and newline whitespace in 40 names, such as `Phường \nHoàn Kiếm`.

Known gaps in the table, measured against the NSO catalog snapshot at 30/06/2025 and the vietnamadminunits pairs:

- Two old communes carry the wrong code. Xã Mỹ Hưng (Cao Bằng) appears under 01615, which is Xã Hồng Quang's code. Xã Đặng Xá (Hà Nội) appears under 00553, which is Xã Cổ Bi's code. As a result Mỹ Hưng (01651) and Phú Thịnh (02482, Tuyên Quang) have no row of their own. vietnamadminunits maps them to Xã Phục Hòa and Xã Thái Bình.
- 37 old communes have a different target set in the two sources. In all 37, one set is a subset of the other, so the disagreement is about which partial targets to list, not about the main successor.
- 102 old names differ from the catalog's spelling of the same code. Most are i/y or s/x variants such as Quý and Quí, or Sà Phìn and Xà Phìn.
- Units dissolved before 1 July 2025 are mostly absent. Phường 2 of Tân An merged into Phường 1 on 1 December 2024 and has no row. The NSO catalog lists it (code 27688) at 30/11/2024 and not at 01/12/2024. The Long An 2023-2025 resolution text at <https://daibieunhandan.vn/print/10350856.html> says "Nhập toàn bộ ... của Phường 2 vào Phường 1".

The import keeps the table as the base and adds a small curated set of rows with a `source` column for these cases. Overall agreement between the two independent sources is 10,561 of NSO's 10,565 commune pairs.

The open-source datasets stay out of the seed. thanglequoc is the fallback if the NSO SOAP endpoint goes away, since it is MIT and code-identical. Its names use the other tone-mark convention (oà instead of òa) in 195 names, and a straight apostrophe where NSO uses a curly one in 7 names. Accent-insensitive matching covers both.

## Counts

Output of `s3.py` against the pinned data:

    province-level: 34 {'city': 9, 'province': 25}
    commune-level: 3321 {'ward': 709, 'commune': 2599, 'special_zone': 13}
    legacy links: 10571 {'whole': 9602, 'partial': 969}
    distinct old communes: 10033
    district-only links (island districts): 6
    rows whose old-province column disagrees with their old district (corrected): 2
    link targets missing from current list: []
    current units with no legacy link: []
    old communes split across >1 new unit: 441 max fan-out: 5
    current name collisions within a province (accent-insensitive): ['van lang|19', 'cam giang|31', 'dong tien|38', 'son ha|51', 'ba to|51', 'loc thanh|75', 'thanh an|79', 'tan thanh|80', 'my tho|82', 'tan thanh|82']

The commune-level count is 3,321, matching Decision 19/2025/QĐ-TTg. The mix has moved since 1 July 2025 because some communes became wards, such as the 12 Bắc Ninh communes under 388/NQ-UBTVQH16.

The province-level count is 34, but now 25 provinces and 9 cities. Three provinces became centrally run cities in 2026 with the same codes. Đồng Nai changed under 30/2026/QH16 from 30 April 2026, Quảng Ninh under 36/2026/QH16 from 1 September 2026, and Bắc Ninh under 39/2026/QH16 from 20 September 2026. The catalog reports the type, and the thanglequoc release notes give the resolutions. The `admin_units.kind` of a province-level unit is therefore not fixed, and the seed must take it from the catalog.

The six district-only links are island districts that had no communes: Bạch Long Vĩ, Cồn Cỏ, Hoàng Sa, Lý Sơn, Côn Đảo, and the Kim Sơn coastal area. Each maps an old district to a special zone or commune, with no old commune code.

## The five FND-6 lookups

Freeze these in the FND-6 test.

| Old address | Current province | Current ward or commune | How it resolves |
| --- | --- | --- | --- |
| Phường Dĩ An, Thành phố Dĩ An, Tỉnh Bình Dương | Thành phố Hồ Chí Minh (79) | Phường Dĩ An (25942) | Table row, whole |
| Phường 1, Thành phố Vũng Tàu, Tỉnh Bà Rịa–Vũng Tàu | Thành phố Hồ Chí Minh (79) | Phường Vũng Tàu (26506) | Table row, whole |
| Phường 2, Thành phố Tân An, Tỉnh Long An | Tỉnh Tây Ninh (80) | Phường Long An (27694) | Not in the table. Phường 2 (27688) merged into Phường 1 (27694) on 1 December 2024, and Phường 1 became Phường Long An. Needs the curated row. Without it, the district fallback returns Phường Long An (27694), Phường Tân An (27712) and Phường Khánh Hậu (27715), all in Tây Ninh |
| Phường Tân Phong, Thành phố Biên Hòa, Tỉnh Đồng Nai | Thành phố Đồng Nai (75) | Phường Tân Triều (26188) | Table row, whole. vietnamadminunits agrees |
| Phường 1, Thành phố Bảo Lộc, Tỉnh Lâm Đồng | Tỉnh Lâm Đồng (68) | Phường 1 Bảo Lộc (24823) | Table row, whole |

PRP-4 typing "Dĩ An, Bình Dương" is ambiguous, because Dĩ An was both a city and a ward. As a ward it resolves to Phường Dĩ An (25942). As the old city it resolves to three wards: Phường Dĩ An (25942), Phường Tân Đông Hiệp (25945) and Phường Đông Hòa (25951), all in TP. Hồ Chí Minh. The suggestion should list Phường Dĩ An first, since it matches at both levels, and offer the other two. "di an, binh duong" typed without accents gives the same result.

"Quận 7, TP. Hồ Chí Minh" is a district, so it resolves to the four wards it fed:

    Phường Tân Kiểng (27472)      -> Phường Tân Hưng (27475)  whole
    Phường Tân Hưng (27475)       -> Phường Tân Hưng (27475)  whole
    Phường Tân Quy (27481)        -> Phường Tân Hưng (27475)  whole
    Phường Tân Phong (27490)      -> Phường Tân Hưng (27475)  whole
    Phường Tân Thuận Đông (27466) -> Phường Tân Thuận (27478) whole
    Phường Tân Thuận Tây (27469)  -> Phường Tân Thuận (27478) whole
    Phường Bình Thuận (27478)     -> Phường Tân Thuận (27478) whole
    Phường Phú Thuận (27484)      -> Phường Phú Thuận (27484) whole
    Phường Phú Mỹ (27493)         -> Phường Phú Thuận (27484) partial
    Phường Tân Phú (27487)        -> Phường Tân Mỹ (27487)    whole
    Phường Phú Mỹ (27493)         -> Phường Tân Mỹ (27487)    partial

## Split wards

The table has one row per (old commune, new commune) pair. An old commune split across several new ones appears in several rows, each marked "Nhập một phần" (partial). 441 old communes split this way, with a maximum fan-out of 5. Phường Điện Biên (Hà Nội, 00019) split into Ba Đình, Hoàn Kiếm, Ô Chợ Dừa and Văn Miếu - Quốc Tử Giám. In Quận 7, Phường Phú Mỹ split into Phú Thuận and Tân Mỹ.

The merge note is free text with about 25 spellings, including typos such as "Nhâp một phần" and stray spaces and newlines. The spike folds them into `whole` and `partial`. Any note containing "một phần" or "Phần còn lại" is partial. Everything else is whole, including "Nhập toàn bộ", "Giữ nguyên", "Đổi tên", "Đổi loại hình" and the island "Sắp xếp toàn bộ" notes.

Consequence for PRP-4. When an old ward maps to more than one current unit, the app cannot choose from the name alone, because the split follows streets and boundaries. The suggestion lists every candidate and the user picks one. The certificate address stays verbatim either way (DOMAIN-VN §4 rule 1).

Proposed `admin_unit_legacy_map` shape for FND-6, one row per pair:

    old_province_code, old_province_name, old_district_code, old_district_name,
    old_commune_code (null for island districts), old_commune_name (null likewise),
    new_commune_code -> admin_units.code, merge_kind ('whole' | 'partial'),
    source ('nso_bang_chuyen_doi_2025' | a curated citation)

A district-level lookup such as "Quận 7" is a query over this table by `old_district_code`, not separate rows.

## Accent-insensitive matching

The spike normalizes both sides before comparing. Each item below was needed by a real row or lookup in this data.

- Map đ and Đ to d, decompose to NFD, and drop combining marks. "di an" matches "Dĩ An".
- Stripping marks also absorbs the two tone-mark placements, òa and oà, and the composed versus decomposed Unicode forms.
- Map the curly apostrophe ’ to '. NSO writes "Xã Ea H’Leo" and thanglequoc writes "Xã Ea H'Leo".
- Treat en dash, em dash and hyphen alike. The spec writes "Bà Rịa–Vũng Tàu" and the NSO writes "Bà Rịa - Vũng Tàu".
- Expand "TP." to "thành phố", then strip one leading unit prefix: tỉnh, thành phố, quận, huyện, thị xã, thị trấn, phường, xã or đặc khu.
- Scope numeric names by their parent. "Phường 1" exists in many old districts, so it resolves only within its old district.
- Never key on name alone, even within a province. Ten pairs of current units share an accent-insensitive name inside one province, such as two "Tân Thành" in province 82. Key on code and show the kind.
- Consider i/y and s/x tolerance for old names. 102 old names differ between the table and the catalog on spellings such as Quý and Quí. The spike does not implement this.

Postgres `unaccent` plus `lower`, with an explicit đ to d step, as DOMAIN-VN §9 already specifies, covers the first three items. The prefix and dash rules belong in the `packages/core` address parser.

## DOMAIN-VN §4 rows now confirmed

This branch updates DOMAIN-VN §4 in place with the sources below.

| Fact | Status | Source |
| --- | --- | --- |
| Commune-level count 3,321 | `[verified]`. 709 phường, 2,599 xã and 13 đặc khu at 06/10/2026 | NSO `DMDVHC.asmx` `DanhMucPhuongXa`. Decision 19/2025/QĐ-TTg |
| 34 province-level units | `[verified]`. Now 25 provinces and 9 cities | NSO `DMDVHC.asmx` `DanhMucTinh`. Resolutions 30/2026/QH16, 36/2026/QH16 and 39/2026/QH16 |
| Phường 2, TP. Tân An, Long An is now in Tây Ninh | `[verified]` | NSO catalog at 30/11/2024 and 01/12/2024, NSO conversion table row for Phường 1 (27694), and <https://daibieunhandan.vn/print/10350856.html> |
| Phường Tân Phong, TP. Biên Hòa is now in Đồng Nai | `[verified]`. Đồng Nai is now Thành phố Đồng Nai | NSO conversion table and catalog |
| Phường 1, TP. Bảo Lộc is now in Lâm Đồng | `[verified]` | NSO conversion table and catalog |
| Dĩ An and Vũng Tàu rows | Already `[verified]`. Wards now filled in | NSO conversion table |

## License

The NSO site publishes no terms of use or copyright notice. I checked the home page and the files above. The current catalog is the list promulgated by Decision 19/2025/QĐ-TTg, a legal normative document. Article 15 of the Law on Intellectual Property excludes legal normative documents, administrative documents and their official translations from copyright protection. A summary is at <https://thuvienphapluat.vn/hoi-dap-phap-luat/doi-tuong-khong-thuoc-pham-vi-bao-ho-quyen-tac-gia-21491.html>. Bundling the codes and names in a private app's seed data is therefore low risk. That conclusion is my reading, not a lawyer's.

`supabase/seed/README.md` should record the two NSO URLs, the `DenNgay` used, the download date, the SHA-256 of each file and this license basis.

## For Ryan to approve

1. The NSO catalog plus the NSO conversion table as the admin units source. This is the external data source approved at plan review, and the spike wires it into nothing.
2. The license basis above, which is "public legal document" rather than an explicit license.
3. A curated `[app rule]` list of legacy rows, each with a cited source, for pre-reform merges the table omits (Phường 2 of Tân An) and the two code typos (Mỹ Hưng, Phú Thịnh). Without it, FND-6 case 3 resolves the province but offers three wards.
4. The DOMAIN-VN §4 edits, which record the 2026 city upgrades (25 provinces and 9 cities) next to the original 28 and 6.
5. The size of the bundled seed. The raw files are 1.1 MB (XLSX) and 0.97 MB (XML), committed here under `data/`. The FND-6 seed would be a derived CSV of about 3,355 units and 10,571 legacy rows.

## Files

- `fetch.sh` downloads the three NSO files and the vietnamadminunits cross-check CSV at a pinned commit, then verifies `data/SHA256SUMS`. The CSV is gitignored.
- `s3.py` loads the data and prints the counts, the lookups and the cross-check.
- `data/` holds the NSO files as downloaded on 6 October 2026.
