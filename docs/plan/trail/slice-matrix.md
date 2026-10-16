# Esta v1 slice matrix

This matrix re-cuts the v1 plan into vertical slices with the `vertical-slice-matrix` skill (`~/.claude/skills/vertical-slice-matrix/SKILL.md`), on the operator's instruction of 2026-10-15. Each row is one PR in delivery order. Each column is a family of shared capabilities. Each cell says what that slice adds to the family, and an empty cell means the slice does not touch it. `docs/plan/trail/pr-inventory.md` is the PR list derived from it, and `pnpm plan:coverage` proves that list still covers every SPEC acceptance id, north-star step, phase exit and the Mom test.

The rules the cut follows:

- Each slice ends with something Mẹ or Ryan can do on a real screen, plus a check that proves it.
- The first consumer builds a shared capability at the depth it needs. The second consumer generalizes it. Nothing is built for a later phase.
- A pure function with a hard correctness bar (maps SSRF guards, schedule, allocation, VietQR, matching, tax, watch rules, number guard) may be its own PR, directly before the screen that consumes it, at that screen's scope.
- Slices that exercise an unproven capability go early in their phase.
- SPEC §3 decisions, SPEC §10 phase exits, the Mom test after Phase 3 and the north-star steps stay where SPEC puts them.

## Look across

Every capability that two or more slices need, with the slice that builds it and the slices that deepen it.

| Capability | Kind | Built by | Deepened by |
| --- | --- | --- | --- |
| Seed generator | Harness | P0-07 | Every PR that adds a table |
| `pnpm phase:check` | Harness | P0-16 | P1-03, P2-08, P3-17, P4-05, P5-10, P6-06 |
| `e2e/northstar.spec.ts` | Harness | P2-08 (steps 1, 2) | P3-17 (3 to 6), P4-04 (8), P5-10 (7, 9), P6-06 (all) |
| Trợ lý page | Route | P0-15 (status line, connection check) | P2-03 (new items), P5-03 (Hộp thư), P5-05 (Thị trường), P5-07 (Hỏi) |
| `WorkerStatusLine`, `SafeMarkdown` | Component | P0-15 | P5-03, P5-04 |
| `agent_jobs`, `agent_runs`, worker loop | Table, job | P0-15 (`ping`) | P2-03, P3-19, P5-03 to P5-08, P6-02 |
| `properties` | Table | P0-07 (minimal) | P1-04 (`cover_photo_path`), P1-09 (`boundary`), P1-05 (acquisition, notes) |
| `property-photos` bucket, `CoverPhoto` | Storage, component | P1-04 (private bucket, policies, signed URLs, seed photos) | P1-09 (pin card), P1-06 (detail header), P1-05 (signed upload and replace) |
| `property_list_rows` and the filter registry | View, core | P1-04 (search, four filters, name sort) | P1-10 (owner), P1-08 (rent), P1-03 (completeness) |
| Property detail layout and tab registry | Route | P1-06 (Tổng quan, Hoạt động) | P1-07 (Pháp lý), P1-08 (Cho thuê), P2-02 (Tài liệu), P3-07 (leases), P4-03 (Thu chi) |
| Map component | Component, integration | P1-09 | P1-06 (location card), P3-16 (map strip) |
| `parseMapsUrl`, `resolveShortMapsLink` | Core, integration | P1-01 | P1-09 |
| Address picker with legacy suggestion | Component | P1-05 | P2-08 |
| `parcels`, `structures`, `certificates` | Table | P1-07 | P2-07 (accept), P2-08 |
| `ownership_shares` | Table | P1-10 | P2-08 (owners step), P4-01 (attribution) |
| `units`, `utility_accounts` | Table | P1-08 | P2-07 (utility bill accept), P3-07, P3-14 |
| Completeness registry | Core | P1-03 | P2-02 (document checks), P3-07 (lease document), P2-08 (checklist), P5-02 (W11) |
| `documents`, Storage, signed URLs | Table, integration | P2-02 | P2-03, P2-05, P2-06, P3-19, P4-02 |
| `DocumentTile` | Component | P2-02 | P2-03 (status), P2-05 |
| `agent_items` | Table | P2-03 (review waiting) | P5-03 to P5-08 |
| `extract_document` | Job | P2-03 (certificate, utility bill) | P3-19 (lease contract) |
| Review screen, `ExtractionFieldRow` | Route, component | P2-07 | P2-08, P3-19 |
| Schedule core | Core | P3-02 | P3-07, P3-04, P3-08 (amendments), P4-01 |
| `leases`, `invoices` | Table | P3-07 | P3-09, P3-04, P3-08, P3-11 to P3-15 |
| `InvoiceRow` | Component | P3-07 | P3-08, P3-11 |
| Allocation core | Core | P3-03 | P3-09, P3-10, P3-18 (deposits), P3-15 |
| `payments`, `payment_allocations` | Table | P3-09 | P3-10, P3-18, P3-15, P4-03 |
| Thu tiền board, `CollectionsRow` | Route, component | P3-09 | P3-10 (`Ghi nhận`), P3-11 (`Mã QR`), P3-13 (`Nhắc qua Zalo`), P3-04 |
| VietQR core, `QrSheet` | Core, component | P3-05, P3-11 | P3-12, P3-13 |
| `bank_accounts` | Table | P3-11 (default account, add sheet) | P6-01 (Settings) |
| Invoice cron | Job | P3-04 | P3-14 (metered trigger) |
| Tổng quan (Home) | Route | P3-16 | P4-06 (portfolio figure), P5-04 (brief), P5-06 (tasks) |
| Tax core | Core | P4-01 | P4-04, P5-02 (W7), P5-07 (`tax_position`) |
| `valuations` | Table | P4-06 | P4-05, P5-07 |
| Watch rules, number guard | Core | P5-02, P5-11 | P5-03, P5-04, P5-05, P5-07, P5-08 |
| Daily scheduler | Job | P5-03 | P5-04, P5-05, P5-08, P6-02 |
| Read tools | Tool | P5-05 (`list_properties`) | P5-07 (the rest), P5-08 |
| `notifications`, SMTP | Table, integration | P5-09 | P6-01 |

## Phase 0. Foundations

| Seq | PR | Slice | Schema | Core | Components | Screens | Jobs and integrations | Proof |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 to 12 | P0-01 to P0-12 | Merged foundations | Tenancy, audit, `test_clock`, reference data, minimal `properties` | Clock, money, format, parse, phone, names, search | Base primitives | Sign-in, onboarding, `/dev/core`, `/dev/glyphs`, `/dev/components` | OTP and Inbucket, LAN HTTPS, cron keep-alive | pgTAP harness, verify skill, seed generator |
| 14 | P0-14 | Mẹ moves between sections and sets text size 130% | Member display columns | | Shell nav, tab bar, sidebar, avatar menu | `(app)` layout, section pages, `/settings` display form | | `e2e/shell.spec.ts` |
| 15 | P0-15 | Mẹ sees the assistant is online; Ryan's connection check answers with the household name | `agent_jobs`, `agent_runs`, `worker_heartbeats`, `claim_agent_job` | | `WorkerStatusLine`, `SafeMarkdown` | Trợ lý status line, operator connection check and last runs | Worker loop, heartbeat, retries, `ping`, MCP `household_info`, SDK on subscription auth, replay | `e2e/assistant-status.spec.ts`, live ping |
| 16 | P0-16 | The header, a cron route and the worker follow a clock change without restarts | | | | Header date line | Clock per request, per cron run, per job | `e2e/fnd9-integration.spec.ts`, `pnpm phase:check 0` |

P0-13 is gone. It built ten composites on `/dev/components` for screens that arrive in Phases 2 to 5, which is the "built for later" smell; each composite now lands in the PR of the first screen that renders it. P0-14 depends on P0-12 and keeps its scope. P0-15 loses `/dev/agent`, its only screen, and puts the worker on the Trợ lý page instead. Every member sees the status line, and operators get the connection check that the Phase 0 exit needs. The scheduler skeleton leaves P0-15 because Phase 0 has no scheduled job; it arrives with `portfolio_watch` in P5-03. P0-16 stays the phase-final proof, since SPEC §10 puts the Phase 0 exit on its own predicate.

## Phase 1. Portfolio

| Seq | PR | Slice | Schema | Core | Components | Screens | Jobs and integrations | Proof |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | P1-01 | (pure, spike S6) Maps links parse and short links resolve safely | | `parseMapsUrl` | | | `resolveShortMapsLink` with SSRF guards | Unit tests per pattern and refusal, live short link |
| 02 | P1-04 | Mẹ recognizes each property by its photo and finds Dãy trọ Dĩ An by typing `di an` | `property_list_rows` view, `cover_photo_path`, `property-photos` bucket and policies | Filter and sort registry, photo path | Card with cover photo, filter chips | Tài sản list | Storage signed URLs, seed photo upload | `e2e/properties-list.spec.ts`, pgTAP, Lighthouse |
| 03 | P1-09 | Mẹ pins Đất vườn Long An by pasting a Google Maps link | `properties.boundary` | Polygon checks | Lazy map, pin card, location panel | Map view of Tài sản, pin and polygon editing | MapLibre, OpenFreeMap, `resolveMapsLink` | `e2e/properties-map.spec.ts`, list JS unchanged |
| 04 | P1-06 | Mẹ opens a property and sees its photo, both addresses, its pin and its history | `property_activity` | Activity descriptions | Detail header with photo, tab registry, location card | Property detail Tổng quan, Hoạt động | | `e2e/property-detail.spec.ts` |
| 05 | P1-05 | Mẹ adds, edits and archives a property with the address picker, and Ryan replaces its cover photo | Acquisition columns, notes, `kind_details` check | Property zod schemas | Address picker, kind-aware form, cover photo input | `/properties/new`, edit | Signed upload from the browser | `e2e/property-form.spec.ts` |
| 06 | P1-07 | Mẹ records parcels and the certificate and sees the land area add up | `parcels`, `structures`, `certificates` | | Parcel, certificate forms | Pháp lý tab | | `e2e/property-legal.spec.ts`, pgTAP |
| 07 | P1-10 | Mẹ records owners and is warned when shares do not reach 100% | `ownership_shares`, owner column on the list view | Owner filter | Owners section | Pháp lý owners, list owner filter | | `e2e/property-owners.spec.ts`, pgTAP |
| 08 | P1-08 | Mẹ sees Phòng 1 to 8 with list rents and adds a room | `units` with whole-unit trigger, `utility_accounts`, rent on the list view | Rent sort | Units, utility account forms | Cho thuê tab, list rent column | | `e2e/property-units.spec.ts`, pgTAP |
| 09 | P1-03 | Mẹ sees what is missing on Long An and taps straight to it | | Completeness registry, `scoreProperty` | Score in header, ring on list | Header next three items, completeness sort | | Registry tests, `pnpm phase:check 1`, Lighthouse |

The old Phase 1 opened with the S6 parser and then one schema PR for eight tables before any screen. The schema PR is gone. Every table lands in the PR whose tab or form first reads it. The legal tables come with Pháp lý, ownership with the owners section, units and utility accounts with Cho thuê, and `valuations` in Phase 4 with its first screen. The S6 parser stays first, because SPEC §10 says "spike S6 first" and §11 makes S6 the first PR of Phase 1, and because an unproven column goes early. It no longer ships a `/dev/core` section or a server action. Its consumer is P1-09, two slices later, and the properties list follows it as the first screen, on the minimal `properties` table that P0-07 shipped plus the cover photos that ux-daily-use rule 5 asks for. The legal PR splits in two, because owners are their own outcome and feed the owner filter and, later, tax. Completeness merges its core and its UI and moves last, because it scores data from every earlier slice, and it carries the Phase 1 exit. Detail tabs appear only when their content does, so no slice ships a placeholder tab or column.

## Phase 2. Documents

| Seq | PR | Slice | Schema | Core | Components | Screens | Jobs and integrations | Proof |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | P2-01 | (spike) Extraction accuracy is measured before the phase builds on it | | | | | SDK `Read` on fixtures | Eval report |
| 02 | P2-02 | Mẹ photographs a paper on the property and opens it again | `documents`, `document_access_log`, bucket policies | Document completeness checks | `DocumentTile` with blur | Property Tài liệu tab, upload sheet | Storage signed upload and view | `e2e/documents-upload.spec.ts`, pgTAP |
| 03 | P2-03 | A sổ hồng tile reads `Đang đọc` then `Chờ xem lại` | `document_extractions`, `document_status`, `agent_items` | `certificate_v1`, `utility_bill_v1` | Tile status | Trợ lý new items list | `extract_document`, `save_extraction`, `create_item` | Golden extraction tests in replay |
| 04 | P2-07 | Mẹ fixes one field and accepts, and Pháp lý shows the parcel | | Accept mapping | `ExtractionFieldRow` | Review screen | | `e2e/extraction-review.spec.ts` |
| 05 | P2-05 | Mẹ finds Sổ hồng Bảo Lộc by typing `bao loc so` | `search_vector` | | Vault groups | Tài liệu vault | | `e2e/documents-vault.spec.ts` |
| 06 | P2-06 | Three photos become one 3-page PDF | | | Multi-page capture | Upload sheet | Client-side PDF | `e2e/documents-multipage.spec.ts` |
| 07 | P2-08 | Mẹ adds a property from a certificate photo | | Wizard checklist | Wizard steps | Add property wizard | | North-star steps 1 and 2, `pnpm phase:check 2` |

The storage schema PR (P2-02) and the upload PR (P2-04) merge, because upload is the storage schema's first consumer. Extraction and review move up, right after upload, because extraction is the phase's riskiest capability and the review screen gives its `Chờ xem lại` state somewhere to go. `agent_items` arrive with extraction, whose review-waiting item is their first consumer, shown as a short list on the Trợ lý page. `lease_v1` leaves Phase 2 for new P3-19, because accepting a lease extraction writes `leases`, which do not exist until Phase 3. P2-01 stays a spike with no screen. SPEC §11 orders S5 first, its measured accuracy decides whether P2-03 fills fields or offers manual entry, and its fixtures feed the P2-03 golden tests and the P2-08 e2e. This is the one PR in the plan whose only consumers are fixtures and a report, and the inventory records why.

## Phase 3. Rent

| Seq | PR | Slice | Schema | Core | Components | Screens | Jobs and integrations | Proof |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | P3-02 | (pure) Schedules generate without gaps or overlaps | | Schedule | | | | Property tests |
| 02 | P3-07 | Mẹ activates a lease and sees the October invoice issued | `leases`, `lease_recurring_charges`, `invoices`, `invoice_lines` | Lease completeness check | `InvoiceRow`, lease form | Leases on Cho thuê | Issue on activation | `e2e/lease-create.spec.ts` |
| 03 | P3-03 | (pure) Payments allocate oldest due first | | Allocation, payment status | | | | Property tests |
| 04 | P3-09 | Mẹ sees Phòng 5 overdue 12 days on the October board | `payments`, `payment_allocations` | | `CollectionsRow` | Thu tiền board | | `e2e/collections.spec.ts` |
| 05 | P3-10 | Mẹ records a cash payment in three taps | | | Record payment sheet | `Ghi nhận` row action | | `e2e/record-payment.spec.ts` |
| 06 | P3-04 | November invoices appear on 01/11 with no one in the app | | | | Board after a clock change | Invoice and lease status cron | Cron run twice, idempotent |
| 07 | P3-08 | Mẹ renews the Thủ Đức lease with 5% and past invoices stay | `lease_amendments` | Schedule amendments | Period timeline | Lease detail | | `e2e/lease-detail.spec.ts` |
| 08 | P3-18 | Mẹ applies Phòng 7's deposit and refunds the rest | `deposit_entries` | Deposit ledger | Deposit actions | Lease detail deposits | | `e2e/deposits.spec.ts` |
| 09 | P3-05 | (pure) VietQR payloads round-trip | | VietQR | | | | Round-trip tests |
| 10 | P3-11 | Mẹ shows the QR for Phòng 3 | `bank_accounts` | | `QrSheet`, add-account sheet | Invoice view, `Mã QR` | | `e2e/invoice-qr.spec.ts` |
| 11 | P3-12 | Mẹ shares a receipt image in Zalo | | Amount in words | Receipt | Receipt PDF and PNG | pdf-lib, satori | LSE-6 text check |
| 12 | P3-13 | Mẹ copies the Phòng 5 reminder and Zalo opens | | Reminder template | | `Nhắc qua Zalo` | Zalo link | `e2e/reminder.spec.ts` |
| 13 | P3-19 | A lease contract photo prefills the lease form | | `lease_v1` | Review reuse | Lease from contract | `extract_document` for leases | Golden test, e2e |
| 14 | P3-14 | Ryan enters eight meter readings and drafts update | `meters`, `meter_readings` | Median warning | Meter grid | Meter entry | Metered issuance trigger | `e2e/meters.spec.ts` |
| 15 | P3-06 | (pure) Statement rows match invoices | | Matching | | | | Golden match tests |
| 16 | P3-15 | Ryan imports a statement and confirms the suggestion | `statement_imports`, `statement_rows` | | Import preview | Statement import | CSV and XLSX parsing | `e2e/statement-import.spec.ts` |
| 17 | P3-16 | Mẹ sees today's list and `Đã thu X / Y` | | Today rules | | Tổng quan | | `e2e/home.spec.ts` |
| 18 | P3-17 | Mẹ passes the Mom test | | | | All rent screens at 130% | VietQR bank app scan | North-star steps 3 to 6, Mom test |

The old Phase 3 ran a schema PR and five core PRs before its first screen at P3-07. The schema PR is gone. Each table lands with the screen that first reads or writes it. Each core PR now sits directly before its consumer at that consumer's scope, so schedule amendments move to the lease detail slice and the deposit ledger to its own deposits slice (new P3-18, split from P3-08 and P3-10). Lease activation issues its own first invoice, so the daily cron (P3-04) becomes a later slice whose result shows on the board after a clock change. The board comes before the record payment sheet, because the sheet opens from a board row and the board's paid and overdue groups need allocations to exist. Row actions appear on the board as their slices land, never as dead buttons. Lease contract extraction joins Phase 3 as P3-19, after the lease form it fills. The first user-visible PR is now Seq 02, not Seq 07.

## Phase 4. Money

| Seq | PR | Slice | Schema | Core | Components | Screens | Jobs and integrations | Proof |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | P4-02 | Mẹ saves a repair expense with its receipt photo | `expenses` | | Expense sheet | Property quick-add | Receipt upload | `e2e/expenses.spec.ts` |
| 02 | P4-03 | Mẹ reads Q7's income, expenses and net by month | | Ledger aggregation | | Thu chi tab | CSV and XLSX export | `e2e/ledger.spec.ts` |
| 03 | P4-06 | Mẹ records a valuation and sees the portfolio figure | `valuations` | Gross yield | | Valuations, Home figure | | `e2e/valuations.spec.ts` |
| 04 | P4-01 | (pure) Tax position matches DOMAIN-VN §5 exactly | | Tax | | | | Worked examples |
| 05 | P4-04 | Mẹ reads her threshold progress and estimate | `owner_tax_inputs` | | Tax card | Owner tax card | | North-star step 8 |
| 06 | P4-05 | Ryan exports the rent roll and totals match | | Report invariants | Report tables | Báo cáo | XLSX and PDF export | `pnpm phase:check 4` |

Phase 4 was already mostly vertical. Tax core moves directly before the tax card. Valuations move before reports, because the portfolio summary in reports reads gross yield from them, so the Phase 4 exit moves from P4-06 to P4-05, which is now last. `valuations` arrive here from the deleted P1-02 rather than sitting unused through three phases.

## Phase 5. Agent

| Seq | PR | Slice | Schema | Core | Components | Screens | Jobs and integrations | Proof |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | P5-02 | (pure) Watch rules produce the golden fact set | | Watch registry | | | | Golden set |
| 02 | P5-11 | (pure) Numbers in agent text are checked against tool results | | Number guard | | | Replay canonicalization | Unit and property tests |
| 03 | P5-03 | Mẹ reads that Phòng 5 is overdue in the Trợ lý inbox at 07:00 | | | `AssistantNote` | Hộp thư tab | Daily scheduler, `portfolio_watch` | Replay golden, `e2e/assistant-inbox.spec.ts` |
| 04 | P5-04 | Mẹ reads the morning brief on Home | | | Brief note, offline banner | Home brief | `morning_brief` | Brief golden |
| 05 | P5-05 | Mẹ reads a market item with its source | `research_topics`, `research_items` | | `CitationChip` | Thị trường tab | `research_scan`, web search and fetch | Replay golden |
| 06 | P5-06 | Mẹ approves a proposal and the audit names her | `tasks` | Proposal schemas | `ProposalCard` | Inbox actions, Home tasks | `create_proposal` | `e2e/proposals.spec.ts` |
| 07 | P5-07 | Ryan asks about Dĩ An and gets the exact amount | `conversations`, `messages` | | Chat | Hỏi tab | `ask`, read tools, Realtime | Ten golden questions |
| 08 | P5-08 | Ryan reads the weekly review and usage by kind | | Caps | Diagnostics | Operator diagnostics | `weekly_review`, crash test | Crash test |
| 09 | P5-09 | Mẹ finds the brief in her email | `notifications` | | Preferences section | Cài đặt notifications | SMTP to Inbucket | Inbucket render |
| 10 | P5-10 | The brief and Ask pass live once | | | | | Live run of every job | North-star steps 7 and 9 |

P5-01 built every remaining agent table and every read tool before any job used them. It is gone. Research tables arrive with the research scan, conversations and messages and the read tools with Ask, and `notifications` with email. The number guard splits out of P5-03 as its own pure PR, because it has its own correctness bar and several jobs depend on it. P5-03 becomes the first visible slice of the phase. It brings the daily scheduler (moved from P0-15), `portfolio_watch`, and the Hộp thư tab that shows its items. Two pure PRs still precede it; both are consumed by P5-03 directly.

## Phase 6. Polish and ship

| Seq | PR | Slice | Schema | Core | Components | Screens | Jobs and integrations | Proof |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | P6-01 | Ryan manages members, accounts and notifications in one place | | | Settings sections | Cài đặt | | `e2e/settings.spec.ts` |
| 02 | P6-02 | Ryan downloads all data as one ZIP | | Export shape | | Export action | `backup_export` | Re-import test |
| 03 | P6-03 | A new household knows its first step everywhere | | | Empty states | Every screen | | Screenshots |
| 04 | P6-04 | No clipped text or dead ends anywhere | | | | Every screen | | Detector, axe |
| 05 | P6-05 | Home and Thu tiền load inside budget | | | | | Headers, CSP | Lighthouse |
| 06 | P6-06 | Mẹ passes the Mom test on the final build | | | | | Production build | Full north-star, Mom test |
| 07 | P6-07 | The family uses Esta on the real domain | | | | | Cloud Supabase, Vercel, OAuth, email | Operator checklist |

Phase 6 deepens surfaces that earlier slices built, so its order stays. P6-01 now generalizes the receiving account sheet from P3-11, the notification section from P5-09 and the assistant status from P0-15 rather than building them first. P6-06 now names the Phase 6 exit it always carried. The coverage check found that the old inventory never said so.

## Smells checked

| Smell | Where it was | Status |
| --- | --- | --- |
| A PR whose only consumer is a dev page or fixtures | P0-13, P0-15 (`/dev/agent`), the `/dev/core` sections of P1-01, P1-03, P3-06, P5-02 | Fixed. P2-01 remains, justified above as the SPEC §11 spike |
| Schema-only or core-only PRs before the first screen | P1-02, P3-01 to P3-06, P5-01 to P5-03 | Fixed. At most two pure PRs precede a screen, and only the one that consumes them |
| Built for later | P0-13 composites, P0-15 scheduler, P1-02 `valuations`, P1-06 placeholder tabs, P1-04 rent placeholder, P2-03 `lease_v1`, P5-01 tables and tools | Fixed. Each moves to its first consumer |
| First user-visible change at the fifth PR or later | Phase 3 (Seq 7), Phase 5 (Seq 4) | Fixed. Phase 1 opens at Seq 02 after the S6 spike, Phase 2 at 02, Phase 3 at 02, Phase 4 at 01, Phase 5 at 03 |
| Merged PRs on dev pages | P0-04 `/dev/core`, P0-11 `/dev/glyphs`, P0-12 `/dev/components` | Kept. They are merged, and FND-5 names `/dev/components` as its check |
