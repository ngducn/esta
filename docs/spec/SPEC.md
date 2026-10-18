# Esta v1 product spec

Esta is a private web app for a Vietnamese family to run its real estate: record every house and parcel properly, keep the paperwork in one safe place, collect rent without a notebook, and have an AI assistant watch the portfolio and the market every morning.

v1 is built for one household (Ryan and his mother). The data model is multi-household from day one so the same codebase can later serve other families.

## 0. How to read this kit

| File | Owns | Read when |
| --- | --- | --- |
| `CLAUDE.md` | Repo conventions, commands, definition of done, guardrails | Always, first |
| `docs/spec/SPEC.md` (this file) | What to build, data shape, acceptance checks, phases | Planning and every PR |
| `docs/spec/DOMAIN-VN.md` | Vietnamese legal, tax, address, certificate and payment facts | Any code touching certificates, addresses, money, tax, QR, people names |
| `docs/spec/DESIGN-BRIEF.md` | Audience, visual direction, screens, design QA | Any UI work. Feeds `/impeccable init` |
| `docs/spec/AGENT.md` | AI worker runtime, tools, jobs, prompts, evals | Any agent or extraction work |
| `PRODUCT.md`, `DESIGN.md` (repo root) | Written by Impeccable from the brief. Durable design context | Any UI work |

Precedence when files disagree: SPEC for scope and behavior, DOMAIN-VN for facts, DESIGN-BRIEF for look and feel, AGENT for agent behavior. Record every contradiction you find in the plan's risks appendix and resolve it in the spec file in the same PR, instead of silently picking one.

Facts in DOMAIN-VN are tagged `[verified]`, `[verify]` or `[app rule]`. DOMAIN-VN §0 says how `[verify]` facts are confirmed without stopping the run.

## 1. Product

### 1.1 The problem today

The family's portfolio is spread across provinces: townhouses, an apartment, a rooming house (dãy trọ), commercial space, garden and agricultural land. Certificates (sổ đỏ, sổ hồng) sit in a drawer. Leases are paper or Zalo messages. Rent is tracked in a notebook and bank app screenshots. Nobody can answer "who hasn't paid this month", "which lease ends next", "how much did we earn from this property this year", or "are we near the rental tax threshold" without an afternoon of digging. Market news that matters (a new ring road, a land price table change, a tax rule) is noticed late or never.

### 1.2 North-star scenario

This story is the end-to-end acceptance test for v1 (`pnpm e2e:northstar`). It runs on the `northstar` seed variant (§9.3: the demo household without Dãy trọ Dĩ An). Steps 1 to 6 run with the test clock at 2026-10-07 09:00 Asia/Ho_Chi_Minh. The test then advances the test clock (FND-9) to 2026-10-08 07:05, lets the worker backfill that day's scheduled jobs, and runs steps 7 to 9. Agent jobs run in `replay` mode in CI (AGENT.md §8); the Phase 5 exit adds one local `live` run. The bank statement for step 5 is generated at test time from a committed template, filling in the memo codes and amounts of the invoices created in step 4.

1. Mẹ signs in on her phone with a 6-digit email code.
2. She adds "Dãy trọ Dĩ An" by photographing its sổ hồng (synthetic fixture). The assistant fills parcel number, map sheet, area, land use purpose and the address printed on the certificate. She corrects one field and saves. The property shows the certificate address (Bình Dương, pre-2025) next to the current address (TP. Hồ Chí Minh, two-tier).
3. She adds 8 rooms and 6 active monthly leases with deposits, each started months ago and marked "đã thu đến hết 30/09/2026". One lease ends on 2026-11-07.
4. October invoices (period 01/10 to 31/10, due 01/10/2026) exist and are issued for all 6 leases. Each shows a VietQR code and a shareable receipt image.
5. Ryan imports the October bank statement fixture. Three payments match by memo code and post when he commits the import. One is suggested by name and amount and he confirms it. Mẹ records one cash payment. One room stays unpaid.
6. The collections board for October shows that room overdue 6 days. She copies the polite Vietnamese reminder drafted for Zalo.
7. On 2026-10-08 the morning brief lists the unpaid room (overdue 7 days), the lease ending in 30 days, and one market item with a source link.
8. Her tax card shows year-to-date rental revenue against the 500 million VND threshold with an estimate of tax due.
9. Ryan asks the assistant "Tháng này thu được bao nhiêu từ Dĩ An?" and gets the exact amount with a link to the ledger.

### 1.3 Users

| User | Context | Needs | Design consequence |
| --- | --- | --- | --- |
| Ryan (admin, operator) | 27, engineer, desktop and phone, reads English and Vietnamese | Full control, bulk operations, imports, reports, agent configuration and diagnostics | Keyboard shortcuts, compact density option, power filters, operator-only diagnostics |
| Mẹ (admin) | Owner of most properties, phone-first, Vietnamese, not technical | See what needs doing today, record payments, find a document fast, trust the numbers | Vietnamese by default, large type and targets, no jargon, no icon-only actions, undo everywhere |
| Viewer (later) | A relative or accountant | Read a subset | Role exists in v1 with read-only access; no dedicated screens |

## 2. Jobs to be done

1. Record a property completely, with the least typing, and know what is still missing.
2. Keep every document findable in under 10 seconds, safely.
3. Know, at any moment, who owes what, since when, and send a reminder.
4. Record payments fast, including bank transfers in bulk.
5. Know income, expenses and tax position per property and per owner.
6. Be told every morning what needs attention, without opening every screen.
7. Hear about market and legal changes that affect specific properties, with sources.
8. Ask questions about the portfolio in plain Vietnamese and get exact answers.

## 3. Locked decisions

These are defaults chosen so the build never blocks on them. Change them here before kickoff, not mid-run.

| # | Decision | Default | Why |
| --- | --- | --- | --- |
| D1 | Platform | Responsive web app, installable PWA. No native app in v1 | One codebase; Mẹ installs it to her home screen |
| D2 | Frontend | Next.js (latest stable, App Router), React, TypeScript strict, Tailwind CSS, shadcn/ui primitives restyled to the brief | Mainstream, well supported by the installed skills |
| D3 | Backend | Supabase: Postgres with PostGIS, Auth, Storage, Realtime, Row Level Security | Auth, files and realtime without a custom server |
| D4 | Hosting | Web on Vercel, functions in the Singapore region. Supabase cloud project in Singapore. Local Supabase via CLI and Docker for dev and tests. Cloud setup happens with Ryan at the Phase 6 gate | Lowest latency to Vietnam on mainstream hosts |
| D5 | AI runtime | A worker process (`apps/agent`) on a machine Ryan controls, using the Claude Agent SDK authenticated with Ryan's Claude subscription. Switchable to an Anthropic API key by env var | See AGENT.md §2 |
| D6 | Language | Vietnamese default UI, English toggle. Every string through i18n | Mẹ first |
| D7 | Money | Integer VND (`bigint`), never floats. Rates in basis points | Exactness |
| D8 | Auth | Email one-time code (6 digits), 30-day sessions. Google sign-in built behind `ESTA_GOOGLE_AUTH`, enabled at the Phase 6 gate once Ryan creates the OAuth client | Codes work better than magic links on phones; Google needs an external account step |
| D9 | Notifications | In-app inbox (P0). Email (P1) through an SMTP transport that targets the local Inbucket mailbox in dev; the production sender is configured at the Phase 6 gate. Web push and Telegram P2. Zalo integration out of scope; use copy-and-open-Zalo | Zalo Official Account messaging needs a verified business account |
| D10 | Maps | MapLibre GL with OpenFreeMap vector tiles, lazy-loaded. Manual pin, polygon drawing, and paste-a-Google-Maps-link | No API keys or billing; Vietnamese geocoding is unreliable anyway |
| D11 | Personal ID numbers | Never stored as structured fields. Store ID card scans as sensitive documents and only the last 4 digits as text | Data minimization under the 2026 personal data law |
| D12 | Repo | pnpm workspaces monorepo: `apps/web`, `apps/agent`, `packages/core`, `packages/db` | Domain logic shared by web and agent |
| D13 | Phone testing in dev | `pnpm dev:lan` serves the web app and local Supabase over HTTPS on the local network only, using locally trusted certificates (mkcert or equivalent) and a local reverse proxy. Never a public tunnel: local Supabase uses well-known default keys | Camera capture, PWA install and gates need HTTPS on a real phone |

## 4. Scope

Priority: P0 must ship in v1. P1 should ship in v1. P2 is designed for but may slip; list any slipped item in `docs/plan/STATUS.md`.

| Module | P0 | P1 | P2 |
| --- | --- | --- | --- |
| Foundation (FND) | Email-code auth, households, roles, member invites by email, RLS, i18n, formatting and parsing, design system, admin units data, seed data, frozen clock | Audit log UI, Google sign-in (flagged) | Viewer-specific screens |
| Properties (PRP) | Properties, parcels, structures, units, ownership, certificates, utility accounts, addresses, map pin, completeness | Add-property wizard with extraction, polygon drawing, Google Maps link | Photo timeline |
| Documents (DOC) | Upload, camera capture, categories, vault, signed access, sensitive handling, search | Extraction review, expiry tracking, multi-page scan to PDF | Share link with expiry |
| Leasing and rent (LSE) | Tenants, leases, amendments, schedules, invoices, payments, allocation, deposits, collections board | VietQR, receipts, statement import and matching, meters and utilities, reminders | Bank webhook integration |
| Money (FIN) | Expenses, property ledger | Tax position, reports, exports, valuations | Lunar calendar display |
| Agent (AGT) | Worker, job queue, document extraction, portfolio watch, morning brief in-app, inbox | Research scan, weekly review, proposals with approval, Ask chat | Editable research topics |
| Platform (PLT) | Settings, data export | Email notifications (brief and action items), nightly backup | Web push, Telegram |

### 4.1 Non-goals for v1

Tenant-facing portal or tenant logins. Billing or onboarding other families. Satellite change detection. Automated valuation model. Scraping listing sites. Zalo Official Account or ZNS messaging. E-signatures. Direct bank API integration (P2 webhook only). Native mobile apps. Double-entry accounting. Buy and sell transaction workflows. Legal or tax advice of any kind; every tax figure is labelled an estimate.

## 5. Domain model

Name the data shape before writing code. These tables live in Supabase Postgres. Every table except reference data has `id uuid`, `household_id uuid not null`, `created_at`, `updated_at`, `created_by`, and soft delete `deleted_at` where noted. Business dates are `date`. Moments are `timestamptz`. Money is `bigint` VND. Areas are `numeric(12,2)` square meters. Percentages are integer basis points. Business SQL never calls `now()` or `current_date`; date-dependent functions take `p_as_of date` (CLAUDE.md, frozen clock).

### 5.1 Tenancy, people and settings

- `households` (name, locale default `vi`, timezone default `Asia/Ho_Chi_Minh`). Deleting a household is an operator action through the service role. No user session can delete one, admins included.
- `household_members` (user_id nullable until claimed, invited_email, role `admin | member | viewer`, is_operator boolean, display_name, locale, density `comfortable | compact`, text_scale `100 | 115 | 130`). An admin adds a member by email; the row is claimed when that email first signs in. `is_operator` marks Ryan: operator-audience items and diagnostics are visible only to operators. `[app rule]` Only an operator of the household, or the service role, grants or revokes `is_operator`. A household keeps at least one claimed admin: a user session cannot delete, demote or unclaim the last one. `[app rule]` A user session never sets or changes `user_id`, and never changes `invited_email` once the row is claimed. Claiming happens only through the service role or a security definer claim function (P0-09).
- `household_settings`: one row per household with jsonb `agent` (daily caps per job kind, research budget, schedule overrides) and `invoicing` (auto-issue on, receipt header text).
- `notification_preferences`: member_id, channel (`inapp | email | push`), kinds (array of agent item kinds and severities), daily_cap. Written only by the member who owns the row or a household admin. A viewer may write its own rows: own notification preferences are the one exception to viewer read-only, joined in P0-14 by its own display settings.
- `parties`: any person or organization the household deals with. Fields: kind `individual | organization`, full_name, short_name, phone, zalo_phone, email, id_last4, tax_code (organizations), address_text, notes, tags (`owner`, `tenant`, `caretaker`, `broker`, `contractor`, `bank`, `other`). Family members who own property are parties with the `owner` tag and an optional link to a `household_members` row.

### 5.2 Reference data

- `admin_units`: current two-tier units. code, name, kind (`province | city | ward | commune | special_zone`), parent_code, effective_from. Source and license recorded in `supabase/seed/README.md`.
- `admin_unit_legacy_map`: pre-July-2025 province, district and commune names and codes mapped to current codes.
- `land_use_codes`: code, name_vi, name_en, group. Seed in DOMAIN-VN §3.
- `bank_bins`: NAPAS BIN, bank short name, full name. Source recorded.
- `test_clock`: at most one row (frozen_now). Read by the `Clock` only when `ESTA_ENV` is not `production` (FND-9).
- `tax_rules`: versioned rule sets. kind `vn_rental_individual`, effective_from, effective_to, params jsonb, source_citation, note. Read only by `packages/core/tax`.

### 5.3 Property

- `properties`: nickname (e.g. "Nhà Q7"), code (short, unique per household, used in invoice numbers), kind, kind_details (jsonb validated per kind, see below), use_mode, legal_status, current_address (jsonb: house_no, street, commune_code, province_code, line), certificate_address_text, location (PostGIS point), boundary (PostGIS polygon, optional), cover_photo_path (the object `<household_id>/<id>/<name>` in the private `property-photos` bucket, held by a check to the row's own household and id; a card-size image about 640 px wide, so an upload is resized before it is stored; shown through signed URLs from the member's session), acquired_on, acquisition_kind (`purchase | inheritance | gift | allocation | other`), acquisition_price_vnd, notes. Soft delete.
  - kind: `townhouse | apartment | villa | rooming_house | commercial_space | warehouse | residential_land | agricultural_land | mixed | other`.
  - kind_details by kind: apartment {building_name, block, floor, unit_no, management_fee_vnd}; rooming_house {room_count}; land kinds {frontage_m, road_width_m}; others {}.
  - use_mode: `rental | owner_occupied | family_use | own_business | held | under_renovation`.
  - legal_status: `certified | certificate_pending | paper_only | shared_certificate | in_dispute | unknown`.
  - Occupancy is derived from units and active leases, never stored.
- `parcels` (thửa đất): property_id, certificate_id, parcel_no, map_sheet_no, area_m2, use_form (`private | shared`), purposes (jsonb array of {land_use_code, area_m2, term: `long_term` or an end date}), origin_text.
- `structures` (tài sản gắn liền với đất): property_id, certificate_id, kind, footprint_m2, floor_area_m2, floors, structure_text, completed_year, ownership_term.
- `certificates` (GCN): property_id, form (DOMAIN-VN §2), serial_no, book_entry_no, issued_on, issued_by, holder_party_ids, status (`valid | mortgaged | replaced | lost`), mortgage (jsonb: bank party, amount, registered_on, released_on), annotations (jsonb list), document_id, extraction_id, verified_by, verified_at.
- `ownership_shares`: property_id, party_id, share_bp, named_on_certificate boolean, since. Invariant: shares of a property sum to 10000 bp or the property shows an ownership warning.
- `utility_accounts`: property_id, unit_id (nullable), kind (`electricity | water | internet | other`), provider, customer_code, holder_name, note.
- `units`: property_id, label ("Phòng 2", "Tầng trệt", "Toàn bộ"), kind (`whole | room | floor | shop | lot`), area_m2, list_rent_vnd, available_from (date the unit could first be let; vacancy for never-leased units counts from here), sort_order. A property with no subdivision has one `whole` unit, created automatically.
- `valuations`: property_id, as_of, value_vnd, method (`owner_estimate | broker_quote | state_price_reference | comparables`), source_url, note. Always displayed as an estimate with its date and method.

### 5.4 Leasing and money

- `leases`: unit_id, tenant_party_id, start_date, end_date (nullable for open-ended), rent_vnd, billing_cycle_months (`1 | 3 | 6 | 12`), period_anchor (`lease_start | calendar_month`), first_period_proration (`none | by_days`), due_offset_days (default 0: due at period start), deposit_vnd, escalation (jsonb: kind `none | percent | fixed`, value, every_months, rounding_vnd default 100000), utilities_mode (`tenant_direct | metered_by_owner | included`), tax_payer (`owner | tenant_withholds`), declaring_party_id (nullable; overrides ownership-share attribution for tax), notice_days, paid_through_date (set at activation for leases that started before being entered; no invoices are generated for periods ending on or before it), status, terminated_on, termination_reason, renewal_of_lease_id, notes.
  - State machine: `draft → active` on activation (requires start_date, rent, tenant). `active → ended` when the as-of date passes end_date (cron). `active → terminated` by user with date and reason. `ended | terminated` are final; renewal creates a new lease linked by renewal_of_lease_id. "Expiring" is derived (end within 60 days), never stored.
- `lease_amendments`: lease_id, effective_period_start, changes (jsonb: rent_vnd, billing_cycle_months, recurring charges), reason. Money terms of an active lease change only through an amendment that applies from a future period start.
- `lease_recurring_charges`: lease_id, label, amount_vnd, cycle_months.
- `meters`: unit_id, kind (`electricity | water`), pricing (jsonb: flat price per unit or tier table), serial, active.
- `meter_readings`: meter_id, reading_month (first day of the consumption month), reading, read_on, photo_document_id. Consumption is derived from consecutive readings; a replacement is recorded as a new meter.
- `invoices`: lease_id, period_start, period_end, due_date, number (`{property_code}-{YYYYMM}-{seq}`), memo_code (8 chars, uppercase ASCII, unique per household), status (`draft | issued | void`), issued_at, voided_reason. The collections month of an invoice is the month of its due_date. Payment status (`unpaid | partial | paid | overpaid`) is derived from allocations.
  - Lifecycle: generation creates `draft` invoices for the period containing the as-of date and every period starting within the next 35 days, skipping periods that end on or before `paid_through_date`. A draft issues as soon as the as-of date is on or after its trigger date: the period start for most leases; for `metered_by_owner` leases, the earlier of the day the previous month's readings for every meter of the unit are complete and the due date. Generation and issuance run in the daily cron, on lease activation, and after meter entry. Only issued invoices show a VietQR or count as due. Issued invoices are never edited; corrections and late utility readings become an `adjustment` line on the next invoice.
- `invoice_lines`: invoice_id, kind (`rent | electricity | water | recurring_charge | adjustment | other`), description, quantity, unit_price_vnd, amount_vnd.
- `payments`: payer_party_id, amount_vnd, received_on, method (`cash | bank_transfer | deposit | other`), bank_account_id, bank_ref, memo, source (`manual | statement_import | webhook | deposit_application`), statement_row_id.
- `payment_allocations`: payment_id, invoice_id, amount_vnd. Invariants: sum of a payment's allocations ≤ payment amount; allocations are positive; unallocated remainder shows as tenant credit.
- `deposit_entries`: lease_id, kind (`received | applied | deduction | refunded`), amount_vnd, on_date, note, payment_id. Applying a deposit to an invoice creates a `payments` row with method `deposit` and its allocation, linked here. Held deposit is derived.
- `bank_accounts` (receiving accounts for VietQR): bank_bin, account_no, account_name (ASCII uppercase), owner_party_id, is_default.
- `statement_imports` and `statement_rows`: file metadata, column mapping preset, status (`parsed | committed`), parsed rows (date, amount, description, bank_ref), match status (`memo_match | suggested | unmatched | ignored | posted`), matched invoice_id, created payment_id.
- `expenses`: property_id, category (`repair | maintenance | land_tax | rental_tax | utility | management_fee | insurance | broker_fee | legal | other`), amount_vnd, paid_on, vendor_party_id, document_id, note.
- `owner_tax_inputs`: party_id, year, other_business_revenue_vnd, notes.

### 5.5 Documents and tasks

- `documents`: property_id, lease_id, party_id (any may be null), category (`certificate | sale_contract | lease_contract | tax_receipt | building_permit | drawing | utility_bill | id_card | handover | photo | invoice_receipt | insurance | other`), title, storage_path, mime, size_bytes, page_count, sha256, sensitivity (`normal | sensitive`), expires_on, ocr_text, search_vector, tags. `ocr_text` has one writer: accepting a review copies the extraction's optional `full_text` (from `utility_bill_v1`, and `lease_v1` from P3-19) under the user's session, reduced to the last four digits of any ID and judged by `national_id_indexes`, when the document is `normal`. A sensitive document keeps `ocr_text` null, and a CHECK refuses a full national ID in it (D11). `search_vector` is generated from the unaccented title, tags and `ocr_text`, and `search_documents(p_query)` matches each query word as a prefix (DOC-3).
- `document_extractions`: document_id, schema_name, schema_version, status (`queued | running | needs_review | accepted | rejected | failed`), result jsonb, field_confidence jsonb, model, job_id, reviewed_by, reviewed_at, accepted_fields jsonb. A document's extraction status shown in the UI is that of its latest extraction (view `document_status`); the agent never writes `documents`.
- `document_access_log`: document_id, user_id, action (`view | download | share`), at.
- `tasks`: property_id, lease_id, title, due_on, status (`open | done | dismissed`), assignee_member_id, source (`user | agent_proposal`), agent_item_id.

### 5.6 Agent

Owned by AGENT.md §10, listed here so migrations are planned together: `agent_jobs`, `agent_runs`, `agent_items`, `research_topics`, `research_items`, `conversations`, `messages`, `worker_heartbeats`, `notifications`.

### 5.7 Audit

`audit_log`: household_id, table_name, row_id, action (`insert | update | delete`), actor_kind (`user | agent | system`), actor_id, diff jsonb, at. Written by triggers on every business and agent table. The trigger copies `household_id` from the audited row (the row's own `id` for `households`), so members read their household's history through `is_member(household_id, 'viewer')`. Rows of the operator-only agent tables (`agent_jobs`, `agent_runs`) also need `is_operator(household_id)`, because their diffs carry the same diagnostics. The diff maps each changed column to `{old, new}`. Triggers take the actor from `auth.uid()` for user sessions, and a user session never takes an actor from a header. For service-role requests through the Supabase API, the worker and cron clients send an `x-esta-actor` header (`agent:{worker_id}` or `system:{name}`, such as `system:cron`); the trigger reads it from PostgREST's `request.headers` setting and trusts it only when the request role is `service_role`. A service-role write without the header, or with a value of another shape, fails. Direct database connections (seed, backup, scripts) set `esta.actor` with `set_config` instead; without it the actor is `system` with the database session user. Nobody writes `audit_log` directly: insert, update, delete and truncate are revoked from `anon`, `authenticated` and `service_role`, and the security definer trigger is the only writer.

## 6. Feature specs and acceptance checks

Each check is a predicate a test or a live lane can prove. IDs are referenced by the plan.

### 6.1 Foundation (FND)

- FND-1 Sign-in by email code. Check: a new email receives a code in the local Inbucket mailbox, signs in, and lands on onboarding to create a household; an email invited by an admin lands directly in that household with the invited role.
- FND-2 Household and roles. Check: pgTAP suite proves a member of household A cannot select, insert, update or delete any row of household B in every table, including storage objects; a viewer cannot write anything except its own notification preferences (and, from P0-14, its own display settings); only operators see operator-audience items.
- FND-3 i18n. Check: lint fails on any user-facing string literal in JSX outside message files; vi and en message files have identical keys.
- FND-4 Formatting and parsing core in `packages/core`. Check: unit tests with every example in DOMAIN-VN §9 and DESIGN-BRIEF §7 (`parseVndInput`).
- FND-5 Design system: tokens, fonts, base components restyled per DESIGN-BRIEF. Check: `pnpm glyphs:check` proves every code point of the glyph test string exists in each font file at each weight used; a contrast script proves every token pair used for text meets 4.5:1 and every status shape meets 3:1 against its background; `/dev/components` shows every component in every state, light and dark.
- FND-6 Admin units imported with legacy mapping. Check: 34 province-level units; the commune-level count equals 3,321 or the plan records the official source for a different number; the five lookups in DOMAIN-VN §4 resolve to the expected provinces.
- FND-7 Deterministic seed generator. Ids are UUIDv5 derived from stable seed keys (e.g. `seed:lease:thu-duc`), timestamps come from the frozen clock, and randomness uses a fixed RNG seed. Each phase extends the generator with its tables. Check: `pnpm db:reset` twice produces identical checksums over all business columns (excluding `created_at`, `updated_at`) for the tables that exist in that phase.
- FND-8 Text scale and density settings applied app-wide. Check: at text_scale 130, no text overflows or truncates without an affordance on Home, Properties list, Property detail, Collections and Documents at 390 px width.
- FND-9 Test clock. Outside production, the shared `Clock` reads the `test_clock` table if it has a row, else `ESTA_FROZEN_NOW`, else system time. Tests set and advance it through `pnpm clock:set <iso>` or a web route that exists only when `ESTA_ENV` is not `production`. Web, cron routes and the worker read it per request or per job, so it can move without restarts; SQL receives the as-of date as a parameter. Web and worker refuse to start when `ESTA_ENV=production` and a frozen clock is configured; a local production build (`NODE_ENV=production`, `ESTA_ENV=test`) is allowed. Check: an integration test sets the clock, observes it in the Home header, a cron route and a worker job, advances it one day, and observes the change without restarting anything.

### 6.2 Properties (PRP)

- PRP-1 Create, edit, archive a property with kind-aware forms (land shows parcels, apartments show building and unit number, rooming houses show rooms). Check: e2e for each kind.
- PRP-2 Parcels, structures and certificates editable on the Legal tab. Multiple parcels per property. Check: a property with two parcels sums land area correctly.
- PRP-3 Ownership shares with named-on-certificate flag. Check: shares not summing to 100% save with a persistent warning and lower completeness.
- PRP-4 Addresses: current address picked from admin units (province then ward or commune) plus a street line; certificate address stored verbatim; legacy lookup suggests the current unit from an old address. Check: typing "Dĩ An, Bình Dương" suggests the correct current ward under TP. Hồ Chí Minh.
- PRP-5 Map: list has a map view; property has pin and optional polygon; paste a Google Maps URL (long or short) to set the pin. Short links are resolved server-side only for `maps.app.goo.gl` and `goo.gl/maps`, following at most 5 redirects, only to `google.com` or `www.google.com` paths under `/maps`, never to private or link-local IPs, with a 3 s timeout. The resolver fetches only https URLs on the two short hosts, with no port and no userinfo, and makes at most 5 fetches. It follows a `Location` on a short host and stops at the first `Location` on `google.com` or `www.google.com` under `/maps`, which it parses without fetching. Every other `Location` is refused. Every DNS answer is vetted and the socket connects only to a vetted address (S6 result, DOMAIN-VN §9). Check: unit tests for the patterns in DOMAIN-VN §9 and for each SSRF refusal.
- PRP-6 Completeness registry in `packages/core/completeness`: weighted checks per property kind (certificate document, parcel identifiers, area, owners summing to 100%, current address, pin, acquisition, photos, active lease document when rented, utility accounts). Each failing check links to the exact field. Check: registry unit tests; the property header shows the score and the next three missing items.
- PRP-7 Add-property wizard (P1): step 1 upload or photograph the certificate (or skip); step 2 review extracted fields beside the image, available as soon as extraction finishes while the user continues; step 3 owners; step 4 use (add units and leases now or later); finish with the completeness checklist. Check: north-star step 2.
- PRP-8 Properties list: filters by owner, province (current or legacy name), kind, use mode, legal status; sort by name, rent, completeness; list and map views; accent-insensitive search. Check: e2e.

### 6.3 Documents (DOC)

- DOC-1 Upload from file picker, drag and drop, and mobile camera. Files go from the browser straight to Storage with a signed upload URL issued by a server action after an RLS check, never through a server function body. Images and PDFs up to 25 MB. SHA-256 dedupe warns on duplicates. Check: e2e upload of a 20 MB fixture at 390 px with camera input simulated.
- DOC-2 Multi-page capture combines photos into one PDF in the browser before upload (P1). Check: three images produce a 3-page PDF in order.
- DOC-3 Vault views by property, category and expiring soon; full-text search over title, tags and OCR text, accent-insensitive. Check: "hop dong" finds "Hợp đồng thuê"; "bao loc so" finds "Sổ hồng Bảo Lộc".
- DOC-4 Private bucket; access only through signed URLs created server-side after an RLS check, TTL `ESTA_SIGNED_URL_TTL_SECONDS` (default 300); every view and download logged. Check: with TTL 2, the URL fails after 3 s; an access log row exists for each open.
- DOC-5 Sensitive documents (ID cards and certificates by default) show blurred thumbnails until tapped and reach the agent only through the extraction job that targets them. Check: e2e plus a tool-layer unit test.
- DOC-6 Extraction (P1): uploading a certificate, lease or utility bill queues `extract_document`; the review screen shows the image beside fields with low-confidence fields marked; accepting writes business tables under the user's session and marks the extraction `accepted`. Check: north-star step 2; accuracy target in AGENT.md §7.
- DOC-7 Expiry tracking: documents with expires_on feed watch rule W5. Check: AGENT.md §7 golden set.

### 6.4 Leasing and rent (LSE)

- LSE-1 Tenants are parties with the tenant tag; quick-add from the lease form with name and phone only.
- LSE-2 Lease create, activate (asking "Đã thu tiền đến hết ngày" to set paid_through_date), amend (money terms from a future period start), terminate with reason, renew. Check: state machine tests cover every transition and reject illegal ones; amendment tests prove past invoices never change.
- LSE-3 Schedule generation in `packages/core/schedule`: a pure function from lease terms, amendments and an as-of date to periods with amounts, handling cycles of 1, 3, 6, 12 months, both anchors, proration, escalation with rounding, paid_through_date, and end dates mid-cycle. Generation and issuance follow §5.4 and insert idempotently (unique lease_id plus period_start). Check: activating a lease on 2026-10-07 with paid_through_date 2026-09-30 and a calendar-month anchor immediately yields an issued October invoice due 2026-10-01; fast-check property tests prove no gaps or overlaps, totals equal rent × months adjusted for proration, escalation and amendments, and regeneration is a no-op.
- LSE-4 Utilities: monthly meter entry per rooming house (all rooms on one screen, numeric keypad, previous reading shown, warning above 3× the 6-month median). Consumption of month M is billed on the invoice whose period starts in month M+1; readings entered after that invoice is issued become an adjustment on the following invoice. Check: unit and e2e.
- LSE-5 Invoices: auto-issue per §5.4, manual issue, void with reason, print or share. Each issued invoice has a VietQR (P1) from `packages/core/vietqr` for the default receiving account, amount outstanding, memo `ESTA {memo_code}`. Check: round-trip test decodes payload fields and CRC; two banking apps scan it at the Phase 3 gate.
- LSE-6 Receipts (P1): A5 "Biên nhận tiền thuê" PDF and a PNG sized for Zalo, Vietnamese fonts embedded. Check: text extracted from the PDF contains the tenant name with correct diacritics.
- LSE-7 Payments: record manually (amount defaults to outstanding; cash or transfer), allocate oldest-due first with manual override, partial and over-payments, deposit application. Check: allocation property tests; payment status derivation tests.
- LSE-8 Statement import (P1): upload CSV or XLSX, map columns once per bank (saved preset), parse amounts and dates (DOMAIN-VN §9). Rows whose normalized description contains a household memo code are `memo_match`; rows matching the outstanding amount of exactly one issued invoice of a tenant whose name appears in the description within ±10 days are `suggested`; the rest are `unmatched`. Committing the import posts every `memo_match` row as a payment; `suggested` rows post only when confirmed individually or by bulk selection. Re-importing the same file posts nothing new. Check: three bank-format fixtures with golden match results; idempotency test.
- LSE-9 Deposits: received, applied, deducted, refunded; held balance on the lease and in the portfolio liability total. Check: unit tests.
- LSE-10 Collections board for a chosen month: issued invoices due in that month, plus every earlier issued invoice still unpaid, carried into Overdue with a "từ tháng 9" marker. Groups Not due, Due today, Overdue (with days), Paid. Row actions Record payment, Show QR, Copy reminder, Open Zalo. Check: north-star steps 5 and 6; on the `full` seed the October board shows Dĩ An Phòng 5 in Overdue (12 days).
- LSE-11 Reminder drafts: template-based (polite register, tenant name, amount, period, QR image link), optionally rewritten by the assistant. Copy to clipboard and open `https://zalo.me/{phone}` with the phone in local format (DOMAIN-VN §9). Check: e2e asserts the copied text.

### 6.5 Money (FIN)

- FIN-1 Expenses per property with receipt document; quick-add from the property page and from a receipt photo.
- FIN-2 Property ledger: income (allocations by received date) and expenses by month; net operating income; export.
- FIN-3 Tax position per owner per year (P1): revenue attributed by lease period (pro-rated by days), split by ownership share unless declaring_party_id is set, plus `owner_tax_inputs`, against the active `tax_rules` row. Shows accrued-to-date revenue and projected full-year revenue (accrued plus the contracted remainder of active leases to 31 December); threshold progress, remaining to threshold and the estimates use the projected figure. Also shows estimated owner-paid VAT and PIT, withheld leases separately, and a fixed disclaimer with the rule's source. Check: unit tests reproduce every worked example in DOMAIN-VN §5 exactly.
- FIN-4 Reports (P1): rent roll, monthly collections, property P&L, owner annual summary, occupancy and vacancy days, portfolio summary with estimated values and gross yield. XLSX and PDF export. Check: report income for a period equals the sum of allocations in that period; exported XLSX totals equal screen totals.
- FIN-5 Valuations (P1): estimates with method and source; latest per property with age; gross yield uses the latest estimate and says so.

### 6.6 Agent (AGT)

Full behavior in AGENT.md. Acceptance summary:

- AGT-1 Worker runs jobs from `agent_jobs` with idempotent effects and retries; heartbeat shown in the app; jobs queue while offline. Check: kill the worker mid-job, restart, and the job's effects exist exactly once.
- AGT-2 Document extraction meets the accuracy target and writes only agent-owned tables.
- AGT-3 Portfolio watch produces exactly the golden fact set in AGENT.md §7 for the full seed at 2026-10-07.
- AGT-4 Morning brief in Vietnamese in the in-app inbox at 07:00 Asia/Ho_Chi_Minh (P0); email delivery via PLT-4 (P1). Every number passes the guard.
- AGT-5 Research scan (P1) produces items with resolvable citations tied to specific properties or provinces, or the explicit empty item.
- AGT-6 Proposals (P1) require approval; approval executes under the approving user's session; audit shows the user as actor.
- AGT-7 Ask (P1) answers the 10 golden questions in AGENT.md §7 with numbers equal to SQL ground truth: in `replay` mode in CI, and once in `live` mode locally at the Phase 5 exit.
- AGT-8 Weekly review (P1) every Sunday 08:00.

### 6.7 Platform (PLT)

- PLT-1 Settings: household, members and invites, receiving bank accounts, notification preferences, research topics (read-only list in v1), agent status and last runs (operators), language, text scale, density.
- PLT-2 Data export: one action produces a ZIP with every table as JSON and CSV plus all files, delivered as a signed link. Check: re-import into an empty local database reproduces row counts.
- PLT-3 Nightly backup job (P1) writes the same export to `ESTA_BACKUP_DIR` on the worker machine and keeps 30 days.
- PLT-4 Email notifications (P1) for the morning brief and every `action` item, honoring notification preferences and daily caps. Dev transport is SMTP to Inbucket. Check: the brief email for 2026-10-07 arrives in Inbucket and renders Vietnamese correctly.

## 7. Cross-cutting requirements

### 7.1 Security and privacy

- RLS on every table. Policies use a single `private.is_member(household_id, min_role)` SQL function; `private.enable_household_rls` and `private.enable_audit` attach the standard policies and the audit trigger to a new table. A row never moves to another household, and `created_by` comes from the session user, never from the client. pgTAP tests for every table (`pnpm db:test`).
- The browser never sees the service role key. Server actions use the user's session client. The service role key is allowed only in `apps/agent`, `scripts/`, and `apps/web/src/server/cron/**` (server-only modules behind `CRON_SECRET`); a lint rule enforces this allowlist.
- Storage: private bucket, path `{household_id}/{document_id}/{filename}`, storage policies mirror table RLS.
- Agent and model output is rendered as sanitized Markdown: no raw HTML; links only `https:` and `esta://`.
- Personal data minimization per DOMAIN-VN §8.
- Real family data never enters the repository. `fixtures-private/` and `.env*` are gitignored. Seed data is synthetic.
- Security headers and a CSP allowing only the app origin, Supabase, the tile host and fonts.

### 7.2 Performance budgets

Measured with Lighthouse mobile emulation on a production build with the full seed.

- Home and Collections: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.05.
- Initial JS per route ≤ 200 KB gzipped. MapLibre and chart code load only on routes and tabs that show them.
- The map view (`/properties?view=map`, opened from the list's `Bản đồ` toggle) is exempt from the 200 KB, 2.5 s LCP and 200 ms TBT lines above, because D10's MapLibre alone is about 283 KB gzipped. It has its own budget instead: map-view script ≤ 300 KB gzipped, TBT ≤ 500 ms, and every seeded pin visible within 8 s on Lighthouse mobile. The list view stays the default and keeps the general budgets (operator, 2026-10-17).
- Lists of up to 1,000 rows stay interactive (virtualize above 100 rows).
- A 10 MB upload on a throttled 10 Mbps connection shows progress and completes; thumbnails are generated client-side.

### 7.3 Accessibility

WCAG 2.2 AA. axe reports zero serious or critical issues on every route. All actions reachable by keyboard. Touch targets ≥ 44 × 44 px. Status never conveyed by color alone. Base body text 16 px, adjustable via text scale.

### 7.4 Reliability

Every write path that can be retried is idempotent: invoice generation, statement import, job execution, extraction acceptance, approval execution. Optimistic UI only where the action has undo.

## 8. Architecture

```text
esta/
  CLAUDE.md  PRODUCT.md  DESIGN.md
  docs/spec/  docs/plan/
  apps/web/          Next.js app (UI, server actions, route handlers, src/server/cron)
  apps/agent/        Claude Agent SDK worker (jobs, schedules, tools)
  packages/core/     Pure domain logic: money, format, parse, schedule, allocation, matching,
                     tax, completeness, watch, vietqr, address, proposals, zod schemas
  packages/db/       Generated Supabase types and typed query helpers
  supabase/          migrations/, seed/, tests/ (pgTAP), config.toml
  fixtures/          Synthetic documents, bank statements, agent replay recordings (committed)
  fixtures-private/  Real documents for local measurement only (gitignored)
  e2e/               Playwright specs, including the north-star scenario
```

```text
Phone / desktop browser
   │  HTTPS
Vercel (Next.js, sin1) ── Supabase (Postgres + Storage + Auth + Realtime, Singapore)
   │  Vercel Cron                      ▲
   └─ invoices, lease status,          │ service role, outbound only
      keep-alive                       │
Ryan's machine: apps/agent worker ── Claude Agent SDK ── Claude (Ryan's subscription)
                                   └─ WebSearch / WebFetch for research
```

The worker has no inbound port. It polls `agent_jobs` and writes results back. The web app enqueues jobs and renders results via Realtime. Deterministic daily work runs on Vercel Cron (locally, the same routes are called by `pnpm cron:run`): invoice generation and auto-issue (00:30 Asia/Ho_Chi_Minh), lease status transitions, and a lightweight query that keeps the Supabase project active.

Environment variables (names are part of the contract; `.env.example` lists them all):

| Var | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | Public |
| `SUPABASE_URL` | agent, scripts | Same project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | agent, scripts, web cron routes only | Lint allowlist (§7.1) |
| `SUPABASE_DB_URL` | agent backup, scripts | |
| `CRON_SECRET` | web | Authorizes cron routes |
| `ESTA_AUTH_MODE` | agent | `subscription` (default) or `api_key` |
| `CLAUDE_CODE_OAUTH_TOKEN` | agent | From `claude setup-token`; used when mode is `subscription` |
| `ANTHROPIC_API_KEY` | agent | Used when mode is `api_key` |
| `ESTA_MODEL_ROUTINE`, `ESTA_MODEL_DEEP` | agent | Model ids from config, never hardcoded |
| `ESTA_AGENT_MODE` | agent | `live` (default) or `replay` (recorded responses, CI and north-star) |
| `ESTA_AGENT_HOME` | agent | Working root for job temp dirs and per-conversation session dirs |
| `ESTA_REPLAY_DIR` | agent | Replay recordings root; default `fixtures/agent-replay` |
| `ESTA_BACKUP_DIR` | agent | Nightly backup target |
| `EMAIL_TRANSPORT`, `SMTP_URL`, `ESTA_EMAIL_FROM` | web, agent | `smtp` to Inbucket in dev; production sender set at the Phase 6 gate |
| `ESTA_SIGNED_URL_TTL_SECONDS` | web | Default 300 |
| `ESTA_GOOGLE_AUTH` | web | `off` until the Phase 6 gate |
| `ESTA_ENV` | all | `development` (default), `test`, `preview`, `production`. Test-only routes and frozen clocks are disabled in `production` |
| `ESTA_FROZEN_NOW` | all | Initial test clock (FND-9); refused when `ESTA_ENV=production` |
| `ESTA_TIMEZONE` | all | Default `Asia/Ho_Chi_Minh` |

## 9. Quality gates and verification

### 9.1 Definition of done for any PR

`pnpm check`, `pnpm db:test` and the touched e2e flows pass. For UI: `pnpm design:detect` reports zero findings on touched files (an accepted exception is recorded with `npx impeccable ignores` and a reason in the PR); axe clean on touched routes; screenshots at 390 × 844 and 1440 × 900 in Vietnamese, light and dark, driven through the `verify` skill; an `/impeccable critique` of the touched surface with every high-severity point fixed. For agent work: the relevant golden tests in AGENT.md §7 pass in replay mode.

### 9.2 Test layers

Unit (Vitest) for `packages/core`, with property-based tests (fast-check) for schedule, allocation, matching and tax. Database (pgTAP) for RLS and constraints. Integration for server actions and cron routes against local Supabase. E2E (Playwright) for user flows including the north-star scenario. Agent golden tests in replay mode with the frozen clock; live tests are tagged and excluded from CI.

### 9.3 Seed data

Deterministic generator per FND-7. Variants: `full` (default, everything below) and `northstar` (the same household without Dãy trọ Dĩ An, its leases, invoices and documents). Household "Gia đình Demo" with owner parties Nguyễn Thị Demo (Mẹ, operator off) and Trần Minh Demo (Ryan, operator on). "Today" is 2026-10-07.

| Property (seed key) | Kind, use mode | Province now (certificate era) | Units and leases |
| --- | --- | --- | --- |
| Nhà phố Q7 (`q7`) | townhouse, rental | TP. Hồ Chí Minh | 1 whole. Lease quarterly from 2025-01-01, tenant company withholds tax, paid through 2026-12-31. Insurance document expiring 2026-10-30 |
| Căn hộ Thủ Đức (`thu-duc`) | apartment, rental | TP. Hồ Chí Minh (Thủ Đức city era) | 1 whole. Monthly lease ending 2026-11-01, paid through 2026-10-31 |
| Dãy trọ Dĩ An (`di-an`) | rooming_house, rental | TP. Hồ Chí Minh (Bình Dương era) | 8 rooms with electricity and water meters, readings for September entered on 2026-10-03. Phòng 1 to 6 active monthly leases anchored on the 25th; Phòng 5 has the invoice due 2026-09-25 unpaid. Phòng 7 lease ended 2026-09-15 with its deposit still held. Phòng 8 never leased, available_from 2026-08-01. One tenant pays each month in two partial transfers that sum to the full amount |
| Mặt bằng Quận 1 (`q1`) | commercial_space, rental | TP. Hồ Chí Minh | 1 shop. Annual lease prepaid from 2026-03-01 |
| Kho Biên Hòa (`bien-hoa`) | warehouse, rental | Đồng Nai | 1 whole. Last lease ended 2026-07-29 |
| Đất vườn Long An (`long-an`) | agricultural_land, held | Tây Ninh per dataset (Long An era) | 1 lot. Completeness deliberately below 60% |
| Đất Bảo Lộc (`bao-loc`) | residential_land, held | Lâm Đồng | 1 lot. Certificate mortgaged to a seeded bank party |

Also, unless stated above: every lease ends at least 6 months after 2026-10-07; every issued invoice due before 2026-10-07 other than Phòng 5's (due 2026-09-25) is fully paid; Dĩ An invoices due 2026-10-25 are issued (readings complete on 2026-10-03) and unpaid, which is correct because they are not yet due; meter readings carry `read_on` 2026-10-03 and `reading_month` 2026-09-01; every ended lease other than Phòng 7's has its deposit fully refunded or deducted (Kho Biên Hòa's was refunded on 2026-08-05); no document other than the `q7` insurance expires before 2026-12-31; no extraction is waiting for review; every property other than `long-an` has completeness of at least 60%. Twelve months of invoices and payments with realistic irregularity and no tenant short-paying two past-due invoices in a row; expenses including repairs on `q7`; valuations for every property; synthetic documents for every certificate form in DOMAIN-VN §2; three bank statement fixtures with different column layouts. Rents are tuned so Mẹ's projected 2026 attributed revenue (FIN-3) as of 2026-10-07 is between 400,000,000 and 499,999,999 VND and Ryan's is below 400,000,000. Ownership: Mẹ owns `q7`, `di-an`, `q1`, `bao-loc` outright; `thu-duc` and `bien-hoa` are 50/50; Ryan owns `long-an`.

### 9.4 Live scenario seeds for verification lanes

Starting points for each phase's live lanes, at 390 px and 1440 px:

1. Mẹ finds which rooms in Dĩ An are overdue and copies a reminder.
2. Record a cash payment from the collections board in at most 3 taps after the row opens, using the prefilled amount.
3. Add a property by certificate photo and accept the extraction.
4. Find the Bảo Lộc certificate by typing "bao loc so".
5. Enter monthly meter readings for all 8 rooms and see the next drafts update.
6. Import a bank statement, commit, then confirm suggestions in bulk.
7. Renew the Thủ Đức lease with a 5% increase.
8. Open Mẹ's tax card and read threshold progress.
9. Read the morning brief and approve one proposal.
10. Switch to English, text scale 130%, dark mode, and repeat scenario 1.

## 10. Delivery phases

Each phase ends with an exit predicate on its phase-final PR. Review gates are where Ryan looks at screenshots and a short video before merge.

| Phase | Builds | Exit predicate | Review gate |
| --- | --- | --- | --- |
| 0 Foundations | Monorepo, CI, Supabase local, `pnpm dev:lan`, auth and invites, households, RLS harness, frozen clock, i18n, formatting and parsing core, design tokens and fonts, `/dev/glyphs`, `/dev/components`, admin units import, seed generator (households, parties, properties), agent worker skeleton | FND-1 to FND-7 and FND-9 pass for existing tables; spikes S1 to S4 and S7 resolved with evidence; the worker completes a `ping` job that calls `household_info` on subscription auth | Yes: tokens, glyph page, components page, S1 evidence |
| 1 Portfolio | PRP-1 to PRP-6, PRP-8; spike S6 first | All checks except PRP-7; RLS tests for new tables; Lighthouse budgets on Properties | Yes |
| 2 Documents | DOC-1 to DOC-7, extraction job and review UI, PRP-7; spike S5 first | Extraction accuracy target met on synthetic fixtures; north-star steps 1 and 2 pass | Yes |
| 3 Rent | LSE-1 to LSE-11, Vercel Cron routes | Property tests green; FND-8 passes on its five screens; north-star steps 3 to 6 pass; VietQR scanned by two bank apps at the gate; Mom test passes (§10.1) | Yes, plus Mom test |
| 4 Money | FIN-1 to FIN-5; seed generator complete | Tax worked examples exact; report invariants hold; full-seed checksum stable (FND-7); north-star step 8 passes | Yes |
| 5 Agent | AGT-1 to AGT-8, PLT-4 | Golden watch set exact; Ask golden questions exact in replay and in one local live run; brief email renders in Inbucket; approval audit correct; north-star steps 7 and 9 pass | Yes |
| 6 Polish and ship | `/impeccable` critique, harden, onboard and polish on every surface; empty states; PLT-1 to PLT-3; budgets; deploy runbook (`docs/plan/DEPLOY.md`) | Full north-star passes on a local production build against local Supabase; budgets met; zero detector findings; deploy runbook dry-run complete; Mom test repeated on the final build | Yes. Cloud setup, Google OAuth, production email, preview and production deploy happen with Ryan at this gate |

### 10.1 Mom test (human gate after Phase 3, repeated in Phase 6)

Ryan hands his phone (via `pnpm dev:lan`) to Mẹ with seeded data and watches without helping. Pass when she completes each task in under two minutes: record a cash payment for Phòng 3; find who is overdue; copy the reminder for that tenant; find the Bảo Lộc certificate photo. Ryan records failures in `docs/plan/mom-test.md`; each failure becomes a fix before the next phase merges.

## 11. Spikes

| ID | When | Question | Done when |
| --- | --- | --- | --- |
| S1 | Before plan | Does the Claude Agent SDK run in `apps/agent` on Ryan's subscription token, with an in-process MCP tool, isolated settings, denied tools, and Read on a temp-dir image? | A script prints the tool result and the auth mode. If it fails, the same test passes with `claude -p --output-format stream-json` as a subprocess, and AGENT.md §2.2 records the fallback |
| S2 | Before plan | Which UI and figure fonts cover Vietnamese fully at all weights and have tabular figures? | Coverage script output plus screenshots of two candidate pairings; choice recorded in DESIGN.md |
| S3 | Before plan | Which dataset gives post-July-2025 admin units with codes and a legacy mapping, under a usable license? | Dataset chosen with source and license; Ryan approves it at plan review |
| S4 | Before plan | VietQR payload correctness and the NAPAS BIN list source | Encoder and decoder round-trip on test vectors; source recorded |
| S5 | First PR of Phase 2 | Certificate extraction quality | Accuracy measured on synthetic fixtures of each certificate form; private fixtures measured locally if present, numbers only recorded |
| S6 | First PR of Phase 1 | Google Maps link parsing including short links | Parser and SSRF guards pass PRP-5 tests |
| S7 | Before plan | Receipt PDF and PNG with Vietnamese fonts within Vercel function limits | Local generation passes the LSE-6 check; bundle analysis shows the function under Vercel's documented size limit |

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| Usage limits hit mid-build | Pause safely and resume from `docs/plan/RESUME.md`; cheaper model for verification workers |
| Worker machine asleep or offline | Jobs queue; heartbeat banner; always-on options in AGENT.md §2.4 |
| Subscription terms for SDK use change | Switch `ESTA_AUTH_MODE`; worker logs auth mode |
| Extraction errors on handwritten annotations or worn certificates | Review is mandatory before any extracted value reaches business tables |
| Tax and land rules change | Rules are versioned data; estimates carry a disclaimer and the rule's source |
| Supabase free tier pauses or storage cap | Cron keep-alive; the deploy runbook states when to move to a paid plan |
| Vietnamese text breaks layout | FND-5 glyph checks; `/impeccable harden`; text-scale tests |
| Scope creep during the run | P2 items slip first and are listed in STATUS.md |
