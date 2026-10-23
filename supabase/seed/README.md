# Seed ids

Seed rows use fixed ids so tests, screenshots and lanes can name them. Each id is `extensions.uuid_generate_v5(extensions.uuid_ns_url(), <key>)`, where the key is a string in one of these shapes.

| Row | Key | Example |
| --- | --- | --- |
| Household | `seed:household:<household>` | `seed:household:lane-3` |
| `auth.users` row | `seed:user:<person>-<household>` | `seed:user:ryan-lane-3` |
| `household_members` row | `seed:member:<person>-<household>` | `seed:member:me-demo` |
| Owner party | `seed:party:<person>-<household>` | `seed:party:me-lane-10` |
| Bank party `Ngân hàng Demo` | `seed:party:bank-<household>` | `seed:party:bank-lane-2` |
| Certificate | `seed:certificate:<household>:<property>` | `seed:certificate:demo:bao-loc` |
| Parcel | `seed:parcel:<household>:<property>:<n>` | `seed:parcel:lane-1:bao-loc:1` |
| Structure | `seed:structure:<household>:<property>:<n>` | `seed:structure:lane-5:q7:1` |
| Ownership share | `seed:ownership:<household>:<property>:<person>` | `seed:ownership:lane-1:thu-duc:ryan` |
| Owner tax input | `seed:owner-tax-input:<person>-<household>:<year>` | `seed:owner-tax-input:me-lane-1:2026` (one row per owner for 2026, at 0) |

`<household>` is `demo` for slot 0's household `Gia đình Demo`, and `lane-<n>` for the lane households `Gia đình Demo <n>`, where n runs from 1 to the `--households` value: 10 by default, at most 99, and 0 for `Gia đình Demo` alone. `<person>` is `me` or `ryan`.

Emails follow the same split. In `Gia đình Demo` they are `me@demo.esta.test` and `ryan@demo.esta.test`. In lane n they are `me.lane<n>@demo.esta.test` and `ryan.lane<n>@demo.esta.test`.

Every seeded account signs in either with a code from the slot's Inbucket mailbox or with the password `Esta.Demo.2026` (`DEMO_PASSWORD` in `generator/households.ts`). The password exists only in local seeds: production runs no seed, and the `.esta.test` addresses receive no real mail.

To get an id in SQL, run `select extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'seed:household:lane-3')`.

Keep these shapes when the seed generator replaces `bootstrap.sql`, so ids stay stable across resets and PRs.

# Reference data

Admin units, the legacy address mapping, land use codes, bank BINs and tax rules ship in the migration `supabase/migrations/20261007006100_reference_data.sql`, because production runs no seed. Nothing in the app, the seed or the migrations calls the network.

**Approval: pending.** Ryan has not yet approved the NSO admin units source, the license reading below or the NAPAS BIN snapshot. `docs/plan/STATUS.md` tracks this under "Waiting for Ryan".

## Pipeline

1. `scripts/reference/fetch.sh` downloads the NSO files into `scripts/reference/data/` and checks them against `scripts/reference/data/SHA256SUMS`. `fetch.sh --verify` checks the committed files with no network. `fetch.sh --update` rewrites the sums after a deliberate refresh.
2. `node scripts/reference/build-csvs.ts` checks each source against its pinned SHA-256, then writes `admin_units.csv`, `admin_unit_legacy_map.csv` and `napas_bins.csv` here.
3. `node scripts/reference/build-migration.ts` writes the data migration from every file in this directory, sorted, and writes their SHA-256 to `SHA256SUMS`. A rerun produces a byte-identical migration.

`pnpm reference:build` runs steps 2 and 3. Never edit the migration by hand. `build-migration.ts` writes `20261007006100_reference_data.sql` only when it is missing and otherwise leaves the applied file alone. `land_use_codes.csv` holds the current table (post-S5, DOMAIN-VN §3). After changing it, run `node scripts/reference/build-migration.ts --land-use-migration <timestamp>_<name>.sql` to emit a new upsert migration; it refuses to overwrite an existing file.

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

# Seed generator

`supabase/seed/generator/` writes the seed as SQL. `pnpm db:reset` runs it before `supabase db reset` and writes the file into the slot, at `supabase/.slots/<slot>/supabase/generated/seed.sql`, which `[db.seed] sql_paths` names. Each slot gets its own file, so stacks that reset at the same time with different flags never share one.

| Command | Seed |
| --- | --- |
| `pnpm db:reset` | Variant `full`, `Gia đình Demo` plus lane households 1 to 10, as of `2026-10-07T09:00:00+07:00` |
| `pnpm db:reset:northstar` | Variant `northstar`: the same without `Dãy trọ Dĩ An` (SPEC §9.3) |
| `pnpm db:reset --households 3 --as-of <iso> --variant full` | Any mix of the generator flags |
| `tsx supabase/seed/generator/index.ts [flags]` | Prints the SQL without touching a database |
| `tsx supabase/seed/generator/ids.ts <key>` | Prints the id of a seed key |
| `pnpm db:checksum` | One md5 per public table over every column except `created_at` and `updated_at`, skipping `audit_log`, plus `auth.users` and `auth.identities` over the columns the seed writes (`SEEDED_AUTH_COLUMNS` in `scripts/db-checksum.ts`) |
| `pnpm db:seed:check` | Resets twice, compares the checksums and exits 1 on any difference (FND-7) |

Every row the generator writes gets `created_at` and `updated_at` from `--as-of` (invoices and their lines, which the database writes, get the reset's own time), and the seed runs with `esta.actor` set to `system:seed`, so its audit rows read `system` and `seed`. Random draws come from `rngFor(scope)`, a fixed stream per scope string; ESLint bans `Math.random`, `Date.now`, `Date()` and `new Date()` without arguments, `performance.now`, and the random functions of `crypto` in the generator.

Keys added by the generator:

| Row | Key | Example |
| --- | --- | --- |
| `household_settings` row | `seed:household-settings:<household>` | `seed:household-settings:lane-3` |
| `notification_preferences` row | `seed:notification-preference:<person>-<household>:<channel>` | `seed:notification-preference:me-demo:inapp` |
| `auth.identities` row | `seed:identity:<person>-<household>` | `seed:identity:ryan-lane-2` |
| Property | `seed:property:<household>:<property>` | `seed:property:lane-3:di-an` |
| Unit other than `whole` | `seed:unit:<household>:<property>:<n>` | `seed:unit:lane-1:di-an:8` |
| `whole` unit | `esta:unit:whole:<property id>`, the key `private.whole_unit_id` uses | `esta:unit:whole:` followed by the id of `seed:property:demo:q7` |
| Utility account | `seed:utility-account:<household>:<property>:<kind>` | `seed:utility-account:demo:di-an:water` |
| Tenant party | `seed:party:tenant-<household>:<property>:<n>` | `seed:party:tenant-demo:di-an:5` |
| Lease | `seed:lease:<household>:<property>:<n>` | `seed:lease:lane-2:di-an:5` |
| Invoice | `seed:invoice:<household>:<property>:<n>:<period start>` | `seed:invoice:demo:di-an:5:2026-09-25` |
| Invoice line | `seed:invoice-line:<household>:<property>:<n>:<period start>:<line>` | `seed:invoice-line:demo:di-an:5:2026-09-25:1` |
| Vendor party | `seed:party:vendor-<household>:<vendor>` | `seed:party:vendor-demo:tho-sua` |
| Expense | `seed:expense:<household>:<property>:<yyyy-mm>:<n>`, `<n>` counting the property's expenses in that month | `seed:expense:lane-1:q7:2026-08:1` |
| Valuation | `seed:valuation:<household>:<property>` | `seed:valuation:lane-3:bao-loc` |
| Deposit entry | `seed:deposit-entry:<household>:<property>:<n>:<kind>` | `seed:deposit-entry:lane-7:di-an:7:received` |
| Receiving bank account | `seed:bank-account:<household>` | `seed:bank-account:lane-2` |

`<property>` is a SPEC §9.3 seed key: `q7`, `thu-duc`, `di-an`, `q1`, `bien-hoa`, `long-an` or `bao-loc`. A property's `code` is that key in uppercase without hyphens, such as `DIAN`.

## Acquisition

Every seeded property except `long-an` carries `acquired_on`, `acquisition_kind` and, for a purchase, `acquisition_price_vnd` in integer đồng: `q7`, `thu-duc`, `di-an` and `bien-hoa` were bought, `q1` was inherited and `bao-loc` was a gift, so neither has a price. `long-an` has none, so the completeness check in P1-03 flags its missing acquisition.

## Units and utility accounts

Inserting a property makes its `whole` unit `Toàn bộ` (migration `20261007202000_units.sql`), and a unit of another kind replaces it. The `units` emitter is an upsert (`publicTable(..., { upsert: true })`, rendered as `on conflict (id) do update`), so the `whole` units of `q7`, `thu-duc` and `bien-hoa` take their list rents of 15.000.000, 9.000.000 and 12.000.000 VND onto the rows the trigger made. `di-an` gets `Phòng 1` to `Phòng 8` (21.400.000 VND in all, `Phòng 8` available from 2026-08-01), `q1` one `shop` at 30.000.000, and `long-an` and `bao-loc` one `lot` each with no rent. `q7`, `thu-duc`, `di-an` and `bien-hoa` get one electricity and one water account at property level; `q1` has none, because its tenant holds them.

## Leases and invoices

`leasing.ts` seeds the SPEC §9.3 leases, `<n>` being the unit's position on its property: `q7` quarterly from 2025-01-01 with the tenant company withholding tax, `thu-duc` monthly to 2026-11-01, Dĩ An Phòng 1 to 6 monthly from the 25th, Phòng 7 to 2026-09-15, `q1` annual from 2026-03-01 at 2.500.000 VND a month (P4-04 tuned it so Mẹ's projected 2026 revenue sits in the SPEC §9.3 band, at 482.658.469 VND as of 2026-10-07), and `bien-hoa` to 2026-07-29. Rent before Esta counts as paid through each lease's `paid_through_date`. The database writes the invoices: after the tables, `billingSql` runs `end_expired_leases` and `run_invoicing` for every night from 2025-10-01 to 2026-10-07, as the daily cron does, so the seed holds exactly what nightly billing writes, and Phòng 7 and `bien-hoa` end when their end dates pass. One step stands in for meter entry until P3-14: on 2026-10-03 it issues Dĩ An's October drafts through `private.issue_invoice`, the path meter entry will take, because September's readings were complete that day (SPEC §9.3). So the invoices are the six Dĩ An invoices due 2026-10-25 issued on 2026-10-03, Phòng 5's unpaid invoice due 2026-09-25, a draft for Thủ Đức's last day, 2026-11-01, and every earlier one. They are that day's state whatever `--as-of` says. A seed-only trigger gives each invoice and line its seed id and a memo code drawn from its key, and the invoice numbers are the ones the numbering trigger gives in billing order. Every issued invoice due before 2026-10-07 other than Phòng 5's is paid in full; payment dates, the cash share and Phòng 2's second transfer are drawn from `md5` of `payment:<property>:<unit>:<period start>`, so two resets write the same rows. `deposit_entries` holds one `received` row on each lease's first day for its `deposit_vnd`, and a `refunded` row on 2026-08-05 for `bien-hoa`, so Phòng 7's ended lease is the one ended lease still holding its deposit (P3-18). `lease_amendments` holds one rent change, `q7` to 16,000,000 VND from 2027-01-01, after every billed period, and `documents.lease_id` files the Thủ Đức contract under its lease (P3-08).

## Expenses

`bank-accounts.ts` gives every household one default receiving account for VietQR (LSE-5): the synthetic Vietcombank account `0123456789` named `NGUYEN THI DEMO` from core's `ESTA_INVOICE` test vector, held by Mẹ's owner party. It is not a real account.

`expenses.ts` seeds twelve months of expenses, October 2025 to September 2026, the same in every household (SPEC §9.3): repairs, upkeep and the fire insurance on `q7`, the monthly management fee of 1.200.000 VND on `thu-duc`, repairs on `di-an`, the broker and notary fees of the `q1` lease, a clean-out of `bien-hoa`, and the 2026 land tax on `bao-loc`. `long-an` has none, so its Thu chi tab shows the empty year. Four vendor parties (`Thợ sửa nhà Demo`, `Thợ điện nước Demo`, `Ban quản lý Chung cư Demo Bình Thọ` and `Môi giới Demo Quận 1`) are the payees.

Nhà phố Q7's `repair` expenses paid in 2026 total **8.650.000 VND** (3.200.000 on 2026-02-20, 950.000 on 2026-05-14 and 4.500.000 on 2026-08-22). AGENT.md §7.4 question 7 and P4-02's lane 7 read this figure; `generator.test.ts` fails when the seed and this line disagree.

## Valuations

`valuations.ts` gives every property one valuation, the same in every household (SPEC §9.3, FIN-5): `q7` 14.500.000.000 VND by broker quote on 2026-06-15 with a source link, `thu-duc` 4.200.000.000 from comparables on 2026-05-20, `di-an` 6.800.000.000 as the family's estimate on 2026-03-10, `q1` 7.200.000.000 by broker quote on 2026-07-01, `bien-hoa` 7.500.000.000 from the state price table on 2026-02-01, `long-an` 1.850.000.000 as the family's estimate on 2025-11-15, and `bao-loc` 3.200.000.000 from the state price table on 2026-04-20. Home's portfolio figure is **45.250.000.000 VND** (`45,25 tỷ`) in the `full` variant and 38.450.000.000 without `di-an` in `northstar`, dated from 15/11/2025. `q1`'s 30.000.000 a month on 7.200.000.000 is a gross yield of exactly 5%.

## Cover photos and bulk properties

Each seeded property except `bien-hoa` gets `cover_photo_path` `<household id>/<property id>/<file>`, where the file is one of the four AVIF covers in `supabase/seed/photos/` (`scripts/seed-covers.sh` rebuilds them from `source/`) (`ATTRIBUTION.md` there names their sources). `bien-hoa` keeps none, so every household shows the fallback tile. After `pnpm db:reset` and `pnpm db:start`, `scripts/db.ts` runs `scripts/seed-photos.ts`, which uploads each file with the service role to the private `property-photos` bucket at its path with `x-upsert`, and prints `seed-photos: 66 objects in property-photos` for the default 11 households. A rerun uploads the same bytes to the same paths. It uploads only paths named after a seed photo; a cover uploaded through the app, such as one an e2e run left in a volume that a plain `db:start` keeps, has a uuid name and no seed file, so seed-photos neither uploads it nor sweeps its object. `pnpm db:checksum` hashes public tables only, so object timestamps never affect FND-7.

`tsx scripts/seed-bulk-properties.ts --household <n> --count <count>` adds `Tài sản Demo 0001` and onward, without photos, to lane household n for list performance tests. Their ids come from `seed:bulk-property:lane-<n>:<0001>`, and a rerun adds nothing new.

To seed a new table, add an emitter with `publicTable('<table>', (ctx) => rows)` in a module beside the others, give every row an id from `seedId(<key>)`, add the key shape to the table above, and insert the emitter into `EMITTERS` in `index.ts` after the tables it references. `SeedRow<'<table>'>` checks each row against the generated types in `packages/db`, including misspelled columns, so run `pnpm db:types` after the migration. A JavaScript array becomes a Postgres array and an object becomes jsonb, so pass a jsonb array as its JSON text. Rows must be the same in every household, so key random streams by what they draw, never by household. Rows that hang off a property iterate `ctx.properties`, which already leaves out the variant's omitted properties (`variants.ts`).

## Local stack marker

The seed also inserts the single row of `private.local_stack`. `private.audit_now()`, the default for `audit_log.at`, reads the `test_clock` row only while that row exists, so FND-9's frozen clock reaches audit times only on a seeded database. The database cannot see `ESTA_ENV`, and Postgres lets only a superuser set a custom database setting, so the marker is a row: no role but `postgres` can read or write the table, and PostgREST does not expose the `private` schema. Production never runs this seed (P6-07 seeds only `esta-preview`), so `esta-prod` never has the row, and a stray `test_clock` row there leaves audit times on the wall clock.
