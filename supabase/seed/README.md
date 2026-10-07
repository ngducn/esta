# Seed ids

Seed rows use fixed ids so tests, screenshots and lanes can name them. Each id is `extensions.uuid_generate_v5(extensions.uuid_ns_url(), <key>)`, where the key is a string in one of these shapes.

| Row | Key | Example |
| --- | --- | --- |
| Household | `seed:household:<household>` | `seed:household:lane-3` |
| `auth.users` row | `seed:user:<person>-<household>` | `seed:user:ryan-lane-3` |
| `household_members` row | `seed:member:<person>-<household>` | `seed:member:me-demo` |
| Owner party | `seed:party:<person>-<household>` | `seed:party:me-lane-10` |

`<household>` is `demo` for slot 0's household `Gia đình Demo`, and `lane-<n>` for the lane households `Gia đình Demo <n>`, where n is 1 to 10. `<person>` is `me` or `ryan`.

Emails follow the same split. In `Gia đình Demo` they are `me@demo.esta.test` and `ryan@demo.esta.test`. In lane n they are `me.lane<n>@demo.esta.test` and `ryan.lane<n>@demo.esta.test`.

To get an id in SQL, run `select extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'seed:household:lane-3')`.

Keep these shapes when the seed generator replaces `bootstrap.sql`, so ids stay stable across resets and PRs.

# Reference data

Admin units, the legacy address mapping, land use codes, bank BINs and tax rules ship in the migration `supabase/migrations/20261007006100_reference_data.sql`, because production runs no seed. Nothing in the app, the seed or the migrations calls the network.

**Approval: pending.** Ryan has not yet approved the NSO admin units source, the license reading below or the NAPAS BIN snapshot. `docs/plan/STATUS.md` tracks this under "Waiting for Ryan".

## Pipeline

1. `scripts/reference/fetch.sh` downloads the NSO files into `scripts/reference/data/` and checks them against `scripts/reference/data/SHA256SUMS`. `fetch.sh --verify` checks the committed files with no network. `fetch.sh --update` rewrites the sums after a deliberate refresh.
2. `node scripts/reference/build-csvs.ts` checks each source against its pinned SHA-256, then writes `admin_units.csv`, `admin_unit_legacy_map.csv` and `napas_bins.csv` here.
3. `node scripts/reference/build-migration.ts` writes the data migration from every file in this directory, sorted, and writes their SHA-256 to `SHA256SUMS`. A rerun produces a byte-identical migration.

`pnpm reference:build` runs steps 2 and 3. Never edit the migration by hand. After a refresh, write a new migration that changes the data instead of editing an applied one.

## Sources

| File | Source | Fetched | SHA-256 | License basis |
| --- | --- | --- | --- | --- |
| `nso_tinh.xml` | NSO catalog SOAP `https://danhmuchanhchinh.nso.gov.vn/DMDVHC.asmx`, `DanhMucTinh`, `DenNgay` 06/10/2026 | 2026-10-06 | `f3fb4b3d5d04c6d7f8776ce756bcafed9340913d6cad36471a75aa8827a1202b` | Public legal document (below) |
| `nso_phuong_xa.xml` | Same service, `DanhMucPhuongXa`, `DenNgay` 06/10/2026 | 2026-10-06 | `0ff480b1febabf7d3ea2e2dede4af923fc79427a1c967043d541ce0dc4925013` | Public legal document (below) |
| `nso_bang_chuyen_doi.xlsx` | NSO conversion table `https://danhmuchanhchinh.nso.gov.vn/TAPTIN/BangChuyendoiĐVHCmoi_cu_final.xlsx`, `Last-Modified` 23 October 2025 | 2026-10-06 | `213966723785859dedd7c88965d6f12f8c3c508c91796e003804cf60a1054fc2` | Public legal document (below) |
| `napas_bins.json` | NAPAS VietQR portal `https://vietqr.net/portal-service/v1/info/banks`, 74 banks | 2026-10-06T16:15:57Z | `ef2c3816d5fa8efc59df40f5a782aaefc751f81949238402f684447b1fe35104` | NAPAS terms (below) |

Spikes S3 (`spike/s3-admin-units`, 1945c64) and S4 (`spike/s4-vietqr`, a7c9e76) fetched these files. Two NSO fetches on 6 October 2026 gave identical hashes.

**Admin units license basis.** The NSO site publishes no terms of use or copyright notice. The current catalog is the list promulgated by Decision 19/2025/QĐ-TTg. Article 15 of the Law on Intellectual Property excludes legal normative documents, administrative documents and their official translations from copyright protection (summary: <https://thuvienphapluat.vn/hoi-dap-phap-luat/doi-tuong-khong-thuoc-pham-vi-bao-ho-quyen-tac-gia-21491.html>). Bundling the codes and names in a private app is therefore low risk. This is the S3 owner's reading, not a lawyer's.

**NAPAS snapshot terms.** The portal has no public API. Its terms allow personal, non-commercial use with the source cited and bar automated collection. A person refreshes `napas_bins.json` by hand, and nothing in the app or the scripts fetches it.

## Derived and curated files

| File | Rows | Kind | Notes |
| --- | --- | --- | --- |
| `admin_units.csv` | 3,355 | Derived | 34 province-level (25 provinces, 9 cities) and 3,321 commune-level (709 wards, 2,599 communes, 13 special zones). `kind` comes from the catalog's `LoaiHinh`, so the 2026 city upgrades of Đồng Nai, Quảng Ninh and Bắc Ninh show. `effective_from` is 2025-07-01, the reform date. |
| `admin_unit_legacy_map.csv` | 10,572 | Derived | 10,571 table links plus one curated link. 969 links are `partial`. |
| `legacy_curated.csv` | 4 | Curated `[app rule]` | Each row cites its source. `add` appends a link the table lacks: Phường 2 of Tân An, merged into Phường 1 on 1 December 2024. `recode` corrects a table row printed with another commune's code: Xã Đặng Xá (00556, printed 00553), Xã Mỹ Hưng (01651, printed 01615), Xã Phú Thịnh (02482, printed 02485). |
| `napas_bins.csv` | 74 | Derived | `bin`, `name`, `code` from the NAPAS snapshot, with whitespace collapsed. |
| `bank_short_names.csv` | 37 | Curated `[app rule]` | Display short names for common banks. BINs absent here get no short name. |
| `land_use_codes.csv` | 12 | Curated | DOMAIN-VN §3. The codes and their `land_group` (the Land Law's three groups) stay `[verify]` until spike S5. |
| `tax_rules.json` | 1 | Curated | DOMAIN-VN §5. The note records that the PIT effective date is `[verify]`. |

`build-csvs.ts` applies these cleanups to the NSO table, from spike S3:

- The old province of each old district is the one most of its rows name. Two rows name the wrong province.
- The old province's name is the spelling most rows use.
- Names have their whitespace collapsed. The catalog has 40 names with stray spaces or newlines.
- A merge note containing "một phần" or "phần còn lại" is `partial`; every other note is `whole`.
- The build fails when a link targets a unit missing from the catalog, when a current unit has no link, or when the table's header changes.
