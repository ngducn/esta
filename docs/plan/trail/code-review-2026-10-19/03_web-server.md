# 03 Web server: outsider review

Scope: `apps/web/src` at snapshot 5d19277. Covered `server/**`, every `actions.ts` and `route.ts` under `app/`, `proxy.ts`, the Supabase client setup, env and Clock wiring, the cron routes, and the non-UI modules in `lib/`. Read in full: the rental, legal, lease and payment actions, the member, Supabase, Clock, env and cron modules, the proxy, and the property list, detail, rental, legal, lease and collection loaders. Sampled: the document and extraction actions, the wizard, and the rental tab page. Not examined: the sign-in, sign-up, onboarding and forgot-password actions, `server/maps/**`, `server/address/suggest.ts`, `server/assistant.ts`, `server/documents/{list,detail,vault,search}.ts`, and `lib/capture`/`lib/upload` beyond their sizes. I did not run typecheck, lint or tests. Every finding below comes from reading code.

## Verdict

The security posture is better than most apps this size. Authorization rests on RLS and on definer functions that check membership themselves. Every action takes `unknown` and parses it with zod. Every read parses its rows. The Clock and env wiring are small and honest. The weakness is structural. The server layer has two write architectures and has not chosen between them. Leases and payments follow one model: a single RPC, one transaction, and a registry that maps `ESTA_*` refusals to reasons. That is the right model, and those files are short and easy to trust. Rental, legal, extraction acceptance and the unit reorder follow the other model. They run multi-step writes from the session client, with app-side compensations, sequential loops, and comments that argue a retry "converges" in place of a transaction. Around both models sits boilerplate that was copied, not shared: 25 bespoke result types, 8 local `z.uuid()` declarations, 12 Postgres error-code literals in 7 files, four separate sentinel-to-reason maps, and three copies of the delete-then-restore-by-reinsert pattern. A few pieces of domain logic sit in pages and actions when they belong in `packages/core`. No file is near 1,000 lines. The largest non-test server file has 242 lines, so the debt is about shape, not size.

## Ratings

- **Readability: 7/10.** Files are small (largest non-test 242 lines; 40 of 4,397 lines exceed 150 characters) and the comments explain why. But server actions live under five different naming and placement conventions, and every file defines its own result vocabulary, so a reader re-learns the contract in each one.
- **Quality: 6/10.** Auth and boundary parsing are sound. But four write paths are non-atomic app-side orchestrations, one reader function writes to the database without saying so, and the rental and legal actions have no server-side test. Component tests mock them, and only the stack-bound e2e suite runs them.
- **Performance: 7/10.** `Promise.all` is used consistently, storage signing is batched, and React `cache` dedupes per request. But the property tabs serialize the detail load before the tab load. The header pills cost a collection RPC and a two-step lease read on every tab. The proxy reads the property row a second time. One loader reads every amendment in the household. Reordering issues N sequential UPDATEs. All of this is fine at one family's scale, and none of it is free.

## Findings, ranked

### 1. Two write architectures coexist, and the weaker one carries the legal and extraction writes (structural)

Measured. The lease and payment actions are thin adapters over one transactional RPC each. `server/actions/payments.ts:56-75` calls `record_payment` once and maps `ESTA_*` messages through `REFUSALS` (lines 31-36). `server/actions/leases.ts:185-240` does the same for amend, terminate and renew through `CHANGE_REFUSALS` (lines 143-162). The SQL side guards membership itself: `amend_lease` starts with `private.member_lease(p_lease_id)` in `supabase/migrations/20261007306700_lease_changes.sql`, and `preview_activation` and `undo_payment` filter on `private.is_member`.

The other half of the write surface orchestrates in TypeScript:

- `server/extraction/actions.ts:108-177` (`saveExtractionReview`) runs about seven dependent round trips. It upserts the manual extraction (144-156), then runs each plan step sequentially (157-159). Those steps write certificates, parcels and parties. It then updates `documents.ocr_text` (160-163), flips the extraction status (164-171) and closes agent items (173). A failure after step 2 leaves legal rows written and the extraction still pending. The doc comment (100-107) argues that a retry converges. That holds only if Mẹ retries.
- `server/extraction/actions.ts:72-80`. `reviewedDocument` sounds like a read, but it also runs `update documents set property_id` (line 78). If the save fails later, the document has silently moved to a property.
- `app/(app)/properties/[id]/legal/actions.ts:151-174`. `savingWithParties` inserts parties, runs the save, and deletes the parties again if the save fails. The rollback's own error is ignored (lines 165-171). If the process dies between the two steps, the parties stay orphaned.
- `app/(app)/properties/[id]/rental/actions.ts:92-103`. `reorderUnits` issues one UPDATE per changed row in a `for` loop. In a 20-room rooming house, "sort by room number" can mean up to 20 sequential round trips (inferred from the loop), and a mid-loop failure leaves a half-applied order. `nextSortOrder` (42-45) loads every unit and account to compute `max+1`, so two concurrent adds can collide.

Why it matters: the next engineer has to reason about partial states that the lease code made impossible. The extraction path is the most important one, because it writes legal rows from an AI read. The remedy is the code-judo move in the last section. Move each of these flows into one definer function, the way leases already work. The extraction plan is already a pure data structure produced by `PLANNERS` in core, so `accept_extraction(p_extraction_id, p_plan jsonb)` can apply it in one transaction. Reorder becomes `reorder_units(p_property_id, p_ids uuid[])`. The legal save with quick-added parties becomes one function that inserts both. All of `savingWithParties`, `runStep`, the reorder loop and the hidden write in `reviewedDocument` disappear.

### 2. The action layer has no shared kit, so every file reinvents parse, error mapping and result shape (missed simplification)

Measured with `rg`:

- 25 exported result or state types across the action files (`RentalWrite`, `LegalWrite`, `OwnershipWrite`, `LeaseWrite`, `TenantWrite`, `ActivationResult`, `LeaseChange<T>`, `RecordPaymentResult`, `PropertyWrite`, `WizardStart`, `UnitDelete`, `AccountDelete`, `LegalDelete`, and more). Two unrelated types share the name `UploadTicket` (`app/(app)/properties/actions.ts:22` and `server/documents/actions.ts:45`). Core already exports `Result<T, Reason>` (`packages/core/src/result.ts`), but only two server files import it.
- Failure shapes vary within a single file. `server/actions/leases.ts` returns `{reason}` (21, 37), `{reasons: []}` (67), `{value, reason}` (166) and bare `null` (`previewActivation`, 92-103). The rental actions return `{ok:false}` with an optional `hasLeases?: true` flag (116).
- 8 files declare their own `const uuid|id = z.uuid()`. 5 sites repeat the idiom `x === null ? { success: true as const, data: null } : uuid.safeParse(x)`.
- 12 Postgres SQLSTATE literals sit in 7 files, sometimes as named constants and sometimes inline (`'23503'` appears at `leases.ts:56` and `rental/actions.ts:199`). Each file classifies them differently. Rental treats `22P02` as invalid. Legal treats `22023` as invalid. Leases treats only `23503`/`23514` as invalid.
- Four separate maps from sentinel message to reason: `rental/actions.ts:24-28` and `:127`, `leases.ts:105-108` and `:143-170`, and `payments.ts:31-36`.
- Viewer refusals are inconsistent. The extraction, document and wizard actions check `member.role === 'viewer'` and answer `'forbidden'`, `false`, or `'invalid'` (`server/properties/wizard.ts:129` returns `'invalid'` for a viewer). The rental, legal, lease and payment actions do not check at all, so RLS refuses the write and the user sees `'failed'`.
- The `code_taken` lookup and its result variant are duplicated between `app/(app)/properties/actions.ts:18,63-67` and `server/properties/wizard.ts:43,63-67`.

Remedy. Add one `server/actions/kit.ts` that exports `idSchema`, `optionalIdSchema` and `dbRefusal(error, sentinels)`. `dbRefusal` maps SQLSTATE to `invalid | duplicate | failed` once and then consults a per-feature sentinel table. Use core's `Result<T, Reason>` for every action. Move the `ESTA_*` sentinel strings to a core module so SQL tests and TypeScript name the same set. This deletes about 40 lines of local constants and helpers and gives the UI one failure contract to render.

### 3. Delete and undo are implemented three times by round-tripping whole rows through the client (missed simplification)

Measured. `deleteUnit`/`restoreUnit` (`rental/actions.ts:118-155`), `deleteAccount`/`restoreAccount` (175-203) and `deleteLegalItem`/`restoreLegalItem` (`legal/actions.ts:74-134`) share one shape. Each one reads the dependent ids, hard-deletes the row with `.select(COLUMNS)`, sends the full row to the browser, parses it back through its own `deleted*Schema`, upserts it under its own id, and relinks the dependents in a loop. That makes three schemas, three `Deleted*` types typed as `{id} & Record<string, unknown>`, and an `as unknown as` cast (`legal/actions.ts:95`). Meanwhile properties and documents use the house soft-delete recipe (`private.enable_soft_delete`), where undo is a single update (`server/documents/actions.ts:155-175`).

SPEC §5 does not mark units or legal items as soft delete, so this design is allowed. It is still the expensive way to get an undo. Inferred remedy, which needs one decision from the owner: either extend soft delete to these three tables, or add one `restore_deleted(p_table, p_row_id)` definer function that rebuilds the row from the `audit_log` delete diff the trigger already writes (SPEC §5.7). Either option deletes the three client-carried schemas and the relink loops.

### 4. Domain logic sits in pages and actions instead of `packages/core` (wrong layer)

Measured:

- `app/(app)/properties/[id]/rental/page.tsx:26-48`. `unitLeases` composes `currentLease`, `leaseTerms`, `currentMonthlyRent` and `unitLeaseMark` with an open-invoice filter to decide each unit's current lease, rent and payment mark. Lines 66-70 compute total listed rent and the declared-versus-actual room mismatch. These are business rules, and they are untestable in a page.
- `server/properties/list.ts:30-33`. `leaseFacts` (leased unit count and rent in effect) is pure, yet it lives in the web server, and `detail.ts` imports it from there.
- The rule that a sensitive document keeps no read text appears twice: `server/documents/actions.ts:233` (`ocr_text: null` on a category change) and `server/extraction/actions.ts:88-93` (`searchText`). A rule with two homes will drift. It belongs in core, or better in a CHECK or trigger on `documents`.
- `server/actions/leases.ts:134-138` derives "the latest issued month" from the RPC result inline.

Remedy. Move `unitLeases`, `leaseFacts` and the rent total into `@esta/core/lease` or `@esta/core/properties` with unit tests. Make the sensitivity rule a single core predicate, and enforce it in SQL.

### 5. Property tabs serialize their loads and over-fetch for the header pills (performance)

Measured from code. The latency effect is inferred.

- `app/(app)/properties/[id]/rental/page.tsx:52-63` awaits `loadPropertyDetail(id)` before it starts `loadPropertyRental` and `loadPropertyLeases`, only to call `notFound()`. Both loaders are scoped by RLS and wrapped in `cache`, so they could start in parallel.
- `server/properties/detail.ts:28-34`. Every tab's detail load waits for member and clock first. It then runs four reads to draw the header: the `property_list_rows` row, a second read of `properties` for `kind_details` alone (lines 30-31, the same entity twice), the `collection_candidates` RPC, and `loadHoldingLeases`.
- `server/leases/load.ts:133-144`. `loadHoldingLeases` is a two-step waterfall, and its second query reads every `lease_amendments` row in the household with no lease filter, then filters in JavaScript (140-143). `loadPropertyLeases` (96-108) uses `.in('lease_id', ids)` for the same job, so the canonical form already exists one function up.
- `proxy.ts:44-50,71`. Every document request under `/properties/<id>` runs its own `property_list_rows` lookup to return a real 404, and then the page reads the same row again.

Counting sequential round trips on a full load of the rental tab gives about seven (inferred). They are proxy claims, the proxy property check, page claims, the member row, the detail fan-out, the lease waterfall, and the tab fan-out. Remedy: start the tab loaders alongside the detail load. Add `kind_details` to `property_list_rows`. Filter the amendments by lease id, or embed them in the lease select. Consider letting the proxy check also prime the page's data.

### 6. The legal table helper lies to the type checker (boundary and types)

Measured. `server/properties/legal.ts:57-59` returns `supabase.from(kind as 'parcels')` for all three tables. The cast spreads to its callers: `parseValue(...) as LegalInsert` (`legal/actions.ts:36-39`), `.select(LEGAL_KINDS[...].columns as string)` (line 91), `row: data as unknown as DeletedLegalItem['row']` (line 95), and `(data as unknown[])` (`legal.ts:68`). The comment justifies this by compiler cost. In practice, every legal write is typed against the `parcels` table, so renaming a certificate column would compile cleanly and fail at runtime. Remedy: a three-arm `switch` on `kind` with each table typed, or one `save_legal_item(p_kind, p_value jsonb)` definer function. The latter also absorbs finding 1.

### 7. Server actions have no home (modularity)

Measured. 21 files carry `'use server'`, spread across `app/**/actions.ts` (8), sibling files such as `app/(app)/properties/location-actions.ts`, `app/home-actions.ts` and `app/language-actions.ts`, `server/actions/*.ts` (2), and feature folders under `server/` (`documents/actions.ts`, `documents/search.ts`, `documents/status.ts`, `extraction/actions.ts`, `maps/actions.ts`, `properties/wizard.ts`). There are also 11 local `revalidateX()` helpers with hand-picked targets (26 `revalidatePath` calls). Legal writes revalidate only `/properties/{id}/legal` (`legal/actions.ts:29-31`), even though `property_completeness_facts` reads parcels and ownership shares. Every route is dynamic and Next 16 sets no `staleTimes`, so this is near-harmless today (inferred). It still shows that no model ties tables to pages. Remedy: choose one convention, either `server/<feature>/actions.ts` or `app/<route>/actions.ts`, and keep a small `revalidateProperty(id, scope)` beside the action kit.

### Lower-order notes

- `server/properties/list.ts:58-59,80` and `rental.ts:21,28` hand-roll `z.string().refine(isIsoDate)` and then cast with `as IsoDate`, while core exports `isoDateSchema`, which brands the value. `isoDateSchema` lives in `@esta/core/schemas/legal`, which is the wrong module for a date primitive. `.catch(null)` and `.catch(0)` on view rows (list.ts:58-59) silently paper over a view contract that should simply hold.
- `server/clock.ts` exposes `getClock` (cached) and `readRequestClock` (uncached, documented "for route handlers"). Yet five server actions and loaders call `readRequestClock` (`documents/actions.ts:126,170`, `documents/search.ts:31`, `documents/status.ts:26`, `properties/actions.ts:111`). Either the doc comment or the call sites are wrong.
- `server/cron/invoices.ts:16-21` invoices households sequentially and throws on the first failure, so one household's error starves the rest. This is harmless with one household today. It becomes a real defect if a second household is added.
- `server/documents/actions.ts:125-127` ignores the `enqueue_extract_document` error on purpose, as its comment says. That is acceptable, but nothing records the failure for the operator.

## What is genuinely good

Authorization is layered correctly. RLS is the guard. App code uses only the session client. The service role is confined to `server/cron/supabase.ts`, which sends `x-esta-actor`, and the lease and payment functions check membership in SQL. The cron secret is compared with `timingSafeEqual` (`server/cron/auth.ts:6-8`), and `/api/test/clock` is gated twice (`route.ts:11-14`). Session cookies are hardened to `httpOnly` with a 30-day lifetime (`server/supabase/session.ts:10-15`). `readClock` takes its row reader as a parameter, so it is testable without a database (`server/clock.ts:23-35`). Env is parsed once by zod. Retries are designed in: client-chosen ids, `ignoreDuplicates` upserts and idempotency keys on payments. The integration tests (`leases.integration.test.ts`, `payments.integration.test.ts`, `extraction/actions.test.ts`) run against a real Supabase client instead of mocking query chains. The lease and payment actions are the template the rest of the layer should copy.

## Measurements and commands

- `find server -type f | xargs wc -l | sort -n`. 54 non-test files. Largest non-test file `server/documents/actions.ts` (242 lines), then `server/actions/leases.ts` (240). Route and action files under `app/` total 1,021 lines, the largest being `app/(app)/properties/actions.ts` (235).
- Line widths over all non-test `.ts` in `server/` and `app/` (excluding `dev/`). 4,397 lines, 40 over 150 characters, 1 over 200 (`server/properties/list.ts:36`, 258).
- `rg -l "^'use server'"`. 21 files.
- `rg -c "revalidatePath\("`. 26 calls in 12 files.
- `rg -o "^export type (\w+)" | rg "(Write|Result|Delete|Ticket|Change|State)$"`. 25 types. `rg -n "@esta/core/result" server app` returns 2 server files plus 1 dev file.
- `rg -n "^const (uuid|id) = z\.uuid\(\)"`. 8 files. The nullable-id idiom appears at 5 sites. `rg -n "'2[0-9A-Z]{4}'"` finds 12 SQLSTATE literals in 7 files.
- `rg -c "createSessionClient\(\)"`. 93 calls. `requireMember()` has 58 calls. `throw new Error(\`... failed: ${...}\`)` appears 46 times.
- `rg -n "role (===|!==) 'viewer'"`. 25 app-side role checks, 7 of them inside server actions.
- Tests. `saveUnit`, `restoreUnit`, `moveUnitAction` and `restoreLegalItem` appear only in component tests that `vi.mock` the action module (`components/rental/unit-list.test.tsx:12`, `components/legal/legal-item-actions.test.tsx:13`). `addRooms`, `saveLegalItem` and `saveOwnershipShares` have no test file. All of them are covered only by stack-bound e2e specs.
- SQL guard check. I read the migrations with `awk` to confirm that `amend_lease` calls `private.member_lease` and that `preview_activation` and `undo_payment` filter on `private.is_member`. I ran no SQL.

## Biggest code-judo move

Make every multi-row write one definer RPC, as the lease and payment actions already do, and give the action layer one kit with `idSchema`, `dbRefusal` and core's `Result`. This deletes `savingWithParties`, the reorder loop, `runStep` sequencing, the hidden write in `reviewedDocument`, the per-file SQLSTATE tables and roughly 20 result types. It also turns four sets of partial-failure states into transactions.
