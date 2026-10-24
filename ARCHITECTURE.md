# Architecture: one home per concern

This file names the one place each recurring concern lives. Before you write a parser, a result type, an upload step, a toast, a translation subset or a test helper, find its section here and use the home it names. Where the home does not exist yet, the section names the cleanup issue that creates it. Until that issue lands, a change that needs the concern adds to its metric, so it records a raise with the issue in the reason (see the next section), and the root countersigns it.

`pnpm quality` enforces part of this file. It counts copied code, oversized files and the smells listed in each section, and fails `pnpm check` when a count rises above `quality/baseline.json`.

## The quality baseline

`pnpm quality` reads every source file under `apps`, `packages`, `e2e`, `scripts`, `eslint-rules` and `supabase/seed`, except generated files, fixtures, migrations and message files. Each metric in `scripts/quality/metrics.ts` has an id, the paths it applies to, a message, the home to use instead and a link to its section in this file. The smells are matched on the TypeScript syntax tree (`scripts/quality/smells.ts`), not on text, so an alias, a renamed variable or a line break does not hide one, and a comment or a string does not count as one. Only real test locations are exempt where a metric skips tests: `*.test.*`, `*.spec.*` and `*.bench.*` files, `__tests__` folders and the `e2e` tree. A product folder named `test` or `helpers` is product code.

- When a metric rises, the check fails and lists the occurrences in the files whose count went up, with the home to use instead.
- When a metric falls, the check also fails until you run `pnpm quality --update`, so the baseline keeps every gain.
- The baseline is checked against the copy committed where your branch forked from `origin/main` (the working copy stands in when there is no `origin`). A count above main's needs an entry in the `raises` list with a reason, whether it came from a hand edit, a deleted key or `--update`. A metric missing from the baseline fails.
- `pnpm quality --update` rewrites the baseline from today's counts, and refuses when a count is above main's. To raise one, run `pnpm quality --update --allow-raise "<reason>"`. The reason goes into the `raises` list in `quality/baseline.json`, and the root countersigns it in review, as it does for a performance budget.
- `files-over-1000-lines` has a cap of zero. No flag raises it.

To add a smell, add one entry to `METRICS` with a finder in `scripts/quality/smells.ts`, a case that it counts and a look-alike that it does not in `scripts/quality/smells.test.ts`, and a section here. Main does not measure a new metric yet, so record its first count with `pnpm quality --update --allow-raise "<new metric>"`. A finder that matches correct code teaches people to ignore the check, so match an exact call, import or type shape, not a loose word. Point "Use instead" only at a helper that exists and is exported, or at the issue that creates the home; a test checks both.

## Duplicated code

`pnpm quality` runs jscpd 5 over the source files and counts every block of 50 or more tokens that appears twice (`clones`) and the lines inside those blocks (`duplicated-lines`). An edit of up to five lines inside a copied block keeps it one clone. The token threshold is jscpd's default. It registers the duplicates the 2026-10-19 review measured: the two upload flows, the legal and rental item actions, and the e2e setup copied between specs.

**Home.** Extract the shared part once, in the home the matching section below names, and call it from both places. A test that needs the same setup as another test imports a shared helper.

## File size

No source file passes 1,000 lines (`files-over-1000-lines`, cap zero). The count of files over 400 lines (`files-over-400-lines`) only goes down. To bring a file under the limit, split it by concern, not into numbered parts.

## Parsing money, decimals, areas and dates

All parsing of what Mẹ types or what the assistant reads lives in `packages/core/src/parse` and `packages/core/src/date`, as pure functions that return core's `Result`.

- **Money.** `parseVndInput` in `packages/core/src/parse/vnd-input.ts` reads VND as Mẹ types it (`1.200.000`, `3tr5`). `Vnd` in `packages/core/src/money/vnd.ts` is the branded integer. Formatting lives in `packages/core/src/format`.
- **Decimals.** `parseDecimal` in `packages/core/src/parse/decimal.ts` is a money parser. Đồng have no minor unit, so it reads `1.255` and `1,255` as 1255. Never use it for a quantity with a fractional part (`decimal-parser-outside-parse` counts every import of it, under any name, outside the money and parse modules).
- **Areas and lengths.** One zod-free parser, `parseMeasureInput` in `packages/core/src/parse/measure.ts`, reads typed areas and lengths with the Vietnamese decimal-comma rule (DOMAIN-VN) and refuses ambiguous input such as "1,255 m²".
- **Dates.** `IsoDate` and `isIsoDate` live in `packages/core/src/date/iso-date.ts`, and `parseDateInput` in `packages/core/src/parse/date-input.ts`. In a zod schema, use `isoDateSchema`, which also brands the value, instead of `z.string().refine(isIsoDate)` (`hand-rolled-iso-date-schema`). `isoDateSchema` lives in `packages/core/src/schemas/legal.ts` today, and issue #196 moves it and the calendar helpers into `packages/core/src/date`.
- **Spreadsheet cells.** `sheetCell` and `SHEET_READ_OPTIONS` in `packages/core/src/parse/sheet.ts` turn what read-excel-file returns into a `SheetCell`, with each number as the text the file stored, so a 20-digit bank reference keeps every digit. The web statement reader passes them to `read-excel-file/browser` and the connector to `read-excel-file/node`; each app keeps only its own import of the reader. Do not map read-excel-file values to cells anywhere else.

## Results

A function that can fail in an expected way returns `Result<T, Reason>` from `packages/core/src/result.ts`. `Reason` defaults to a string and may be a refusal object, as the ops layer's are (`{ kind: 'code_taken', code, takenBy }`). Do not spell out another failure arm, an object type or interface with `ok: false`, whether it sits in a union, a named member or an intersection (`ad-hoc-result-type`). Issue #196 folds the five core siblings (`Parsed`, `PlanResult`, `TlvResult`, `DecodeResult`, `DepositLedgerResult`) into it.

## Server writes: the ops layer

Every write a screen or the connector performs is an op in `packages/ops` (`docs/spec/CONNECTOR.md` §3.1): `input` parses with zod, `plan` reads and returns the change or `unchanged`, `apply` writes that change through the session client or one definer function. A server action builds `OpContext` from the cookie session, calls `runOp(op, ctx, raw)`, revalidates, and maps the result to the type its screen reads. `createProperty` and `updateProperty` in `apps/web/src/app/(app)/properties/actions.ts` are the template. The connector runs the same ops through `planChanges` and `applyPlan`. An op that reads a file on Ryan's computer, such as `documentAttach`, takes `LocalContext`, which adds `LocalFiles` to `OpContext`. Only the connector builds one, so a server action that calls such an op does not compile.

**Home.** `packages/ops`: `idSchema` and `optionalIdSchema` in `src/kit.ts` parse every id, and `dbRefusal(error, sentinels)` in the same file is the only reader of SQLSTATE codes, followed by a per-feature table of `ESTA_*` sentinels. An op's refusals are objects in `Result`'s `reason`. The other server actions move onto ops in one cleanup round after the connector's document slice, which closes issue #188.

Until then, an action outside the ops layer that parses an id adds to `local-id-schema` (a `z.uuid()` bound to its own name or parsed on the spot), and one that reads a database refusal adds to `sqlstate-literal` (a code such as `'23505'` compared with or looked up by an error's `code`). Such a change needs `pnpm quality --update --allow-raise "<why> (until #188)"`, which the root countersigns. A new write is an op instead.

## Shared server reads: packages/ops

`packages/ops` is the one home for server code that the web app and the connector share. A function there takes the member's session client (`Db`) and the household id. It never builds a client, reads a cookie or calls a Next.js API. The web wraps it with `createSessionClient()` and `requireMember()` and adds what needs the Clock or a web-only loader. The connector passes Ryan's session.

- **Properties.** `searchProperties(db, householdId, tokens)` in `packages/ops/src/properties.ts` reads `property_list_rows` with core's `searchTokens` and `preferPhrase`, for the property list and for `find_property`, so both find the same properties. `readPropertyDetail` reads one property for its detail page and for `get_property`. Lease facts and status marks need the Clock's date, so the web loaders add them on top.
- **Property form.** `readPropertyForm` reads the columns the property form edits, for its edit page and for an edit's plan.
- **Clock.** `readClock(db, env)` in `packages/ops/src/clock.ts` reads the test clock row on every call outside production (SPEC FND-9). The web passes a cookieless client, the agent and the connector their own.
- **Membership.** `readMembership(db, userId)` in `packages/ops/src/member.ts` is the one read of the membership Esta opens for a user, the first one they joined. `getCurrentMember` and the connector's operator check both call it.
- **Addresses.** `suggestCurrentUnits` in `packages/ops/src/address.ts` maps an old address to the current ward and province.
- **Documents.** `packages/ops/src/documents.ts` signs a document's three uploads (`signDocumentUploads`), finds the household's documents with the same hash (`documentsWithHash`), and registers the row (`documentRegister`), for the vault's server actions and for `documentAttach`.
- **Tool results.** `packages/ops/src/read.ts` shapes these reads for a model: display strings for amounts and the reason each search candidate matched. The daily assistant's tools reuse it rather than query again.

A read moves here before a second surface uses it. A read that only one surface needs stays with that surface.

## The connector: apps/connector

`apps/connector` is the MCP surface: sign-in, the session store, the operator check on every call, tool definitions that call `packages/ops`, and the adapters to Ryan's computer that no other surface has. `files.ts` keeps every path inside the import folders (`~/Esta-import` and `ESTA_IMPORT_ROOTS`), `spreadsheet.ts` returns xlsx and CSV cells as the file stored them through core's `sheetCell`, and `local-files.ts` implements `LocalFiles`. It holds no query or domain rule of its own: money, dates and CSV rows parse in `packages/core` (`docs/spec/CONNECTOR.md`).

## Multi-row writes

A user action that writes more than one row runs as one `security definer` function in SQL, in one transaction, and checks membership itself. `record_payment` in `supabase/migrations/20261007305000_record_payment.sql` and `amend_lease` in `supabase/migrations/20261007306700_lease_changes.sql` are the template. Never orchestrate several writes from TypeScript with compensating deletes or a loop of updates.

A connector batch is not one user action: it is a sequence of ops, each atomic on its own, and it ends `partial` with what landed (`docs/spec/CONNECTOR.md` §3.4). It converges without a transaction: an apply that dies is taken over after a five-minute lease, and the takeover plans each item again, so what landed plans as unchanged and nothing lands twice. Four flows still break this rule. Issue #184 moves extraction acceptance into one function. Issue #189 moves the room reorder, the legal save with quick-added owners, and delete-and-undo.

## Rules in SQL and rules in TypeScript

A rule that decides what gets written lives in SQL, because SQL is the writer: billing periods, invoice issue, payment allocation, payment status, lease transitions and the national-ID check. A rule that only shapes what a screen shows lives in `packages/core`. When both sides need a rule, one side is the source and the other reads it.

- `private.lease_periods` is the one billing planner. Screens and tax read its periods through `public.lease_schedule`, which checks membership per lease, and the seed bills through `run_invoicing` as the nightly job does. `packages/core/src/lease` keeps only pure readers of those rows, such as `currentMonthlyRent` and `leaseTimeline`.
- When a TypeScript twin must stay, prove parity with golden vectors that pgTAP replays, as `supabase/tests/fixtures/payment_status.csv` does.
- An invariant over rows belongs in a constraint, not in a check inside one function. Issue #198 adds exclusion constraints for overlapping leases and invoices.
- Issue #197 squashes the migrations into one baseline before the first deploy, so each function has one current body.

## Document upload

Bytes go from the device that holds the file to Storage with a signed upload URL, never through a server function body (CLAUDE.md). In the browser, `apps/web/src/lib/upload/` prepares a file and sends it (`sendPrepared`, `uploadWithProgress`), and `createDocumentUpload` in `apps/web/src/server/documents/actions.ts` signs the upload. From Ryan's computer, the connector's `documentAttach` op signs and sends with `signDocumentUploads` and `sendDocumentUpload` in `packages/ops/src/documents.ts`. Both paths PUT with the headers `signedUploadHeaders` gives (`packages/core/src/documents/storage-path.ts`), so Storage keeps their objects alike, register the row with `documentRegister`, and draw previews at the sizes and quality in `DOCUMENT_PREVIEWS` (`packages/core/src/documents/previews.ts`).

**Home.** `useDocumentUpload` in `apps/web/src/components/documents/use-document-upload.ts`, which the upload sheet and the expense receipt use. Issue #190 moves the wizard's photo step (`components/property-wizard/step-photo.tsx`) onto it. `upload-pipeline` counts every use of an upload step outside those two modules, the hook and `packages/ops/src/documents.ts`: `sendPrepared`, `uploadWithProgress`, `createDocumentUpload`, Storage's `createSignedUploadUrl` and `uploadToSignedUrl`, and a `fetch` with `method: 'PUT'`. The cover photo flow (`app/(app)/properties/actions.ts` and `components/properties/cover-photo-input.tsx`) is a third path that counts today. Until #190 lands, a new upload step needs a countersigned `--allow-raise` naming #190.

## Calling a server action from the UI

A client component calls a server action inside a transition, maps a thrown call to a failure, and shows one error line.

**Home.** `useAction` in `apps/web/src/components/use-action.ts` returns `{ pending, run }`. `run(call, settle, failure?)` starts the call in a transition and hands `settle` the action's result, or `failure` (`FAILED`, `{ ok: false, reason: 'failed' }`, unless the screen passes its own) when the call threw. `FormAlert` in `apps/web/src/components/form-alert.tsx` draws the error line, with the overdue diamond, so a screen never writes its own `role="alert"` paragraph for an action's failure. `useBillAction` (`components/invoices/use-bill-action.ts`) is `useAction` plus a refusal and a refresh, for the bill page and the receiving-account sheets. `ItemActions` in `apps/web/src/components/item-actions.tsx` is the one `Sửa` and `Xóa` pair with an undo toast, for the legal items and the utility accounts.

`hand-rolled-action-call` counts each async call through a transition starter, whatever it is named (`startSaving(async …)` from `useTransition`, or React's `startTransition`), in a component or a `.ts` hook. `action-failure-mapping` counts each `.catch` that maps a thrown call to `{ ok: false … }`, however it is typed or wrapped. Use `run` instead. A call that cannot go through it is rare enough to need a countersigned `pnpm quality --update --allow-raise "<why>"`.

## Sheets and dialogs

`useDeferredDialog` in `apps/web/src/components/use-deferred-dialog.tsx` opens a lazy sheet or dialog. It keeps the popup mounted so the exit motion runs, preloads on hover and focus, sets `aria-haspopup` and `aria-expanded`, and counts the openings so each one starts from fresh state. `DeferredPopup` in the same file mounts the lazy popup for it with the `open`, `onOpenChange` and `finalFocus` props every popup takes (`PopupProps`). Do not mount a sheet only while it is open: a `Sheet`, `Dialog` or `AlertDialog` rendered with a bare `open` is one (`hand-rolled-lazy-sheet`).

**Home.** `FormSheet` in `apps/web/src/components/form-sheet.tsx` is a sheet or, with `surface="dialog"`, an alert dialog around a form: the title, the fields, one error line, and the cancel and submit row. It will not close while the write is pending. A sheet with a long, scrolling form keeps its pinned footer, `SheetFooter` in `apps/web/src/components/sheet-footer.tsx`. A custom sheet that cannot use the shell still ends in `FormActions` (`apps/web/src/components/form-actions.tsx`), never its own copy of the row (`sheet-footer-markup`).

## Toasts

`UndoToastProvider` in `apps/web/src/components/undo-toast.tsx` renders the undo toast and its live region.

**Home.** One mount in `apps/web/src/app/(app)/layout.tsx`, with its labels passed from the server. The property frame (`app/(app)/properties/[id]/detail-frame.tsx`) holds one `ToastHost` for every property tab with its labels from the server, and five other places mount their own, so the rental tab still has two. Issue #191 moves the mount into the layout. Until it lands, a new screen that needs the undo toast adds to `toast-provider-mount` and needs a countersigned `--allow-raise` naming #191.

## Translation islands

Server components translate with `getTranslations` and pass strings to client components as props (CLAUDE.md, Translations). A client island that truly needs `useTranslations` gets only its namespaces through a provider.

**Home.** One typed island component that takes the island's namespace list and calls `getMessages()` itself, so a missing namespace is a type error. It does not exist yet. Issue #192 creates it to replace `PropertyIntl`, `propertyIslandIntl` and the hand-built subsets. Until then, use `propertyIslandIntl` in `apps/web/src/server/properties/island-messages.ts`, and do not call `getMessages()` in another page (`intl-subset-by-hand`).

## One declaration per concept in core

Each enum, schema, date helper and type in `packages/core` is declared once, in the module that owns the concept. Other modules import it. An auto-import cannot pick the wrong copy of a name that exists once (`duplicate-core-export`). Issue #196 removes the current copies: `TaxPayer`, the certificate schemas and `OwnershipShare`.

## Types at boundaries

Parse external data with zod at the boundary and trust internal types after it. `as unknown as` switches the type checker off (`double-cast`). Parse the value, narrow it with a type guard, or fix the type that forced the cast.

## Lint exceptions

Fix the code instead of disabling a rule inline. When an exception is right, put it in `eslint.config.mjs` with a reason, where review sees it (CLAUDE.md, Translations). The count of inline `eslint-disable` comments (`inline-eslint-disable`) only goes down.

## Integration lanes

`pnpm test:integration` runs the apps/web `*.integration.test.ts` files in parallel against one seeded stack. Each file signs in and writes only in the lane households it owns in `INTEGRATION_LANES` (`apps/web/src/test/lanes.ts`), and reads its household and member emails from `integrationLane(import.meta.url)`. A second sign-in as the same member voids the first one's code, and a shared household shows one file the other's writes. `apps/web/src/test/lanes.test.ts` fails on an unregistered file, a lane owned twice, or a lane email or household id written into a file.

## E2E helpers

Shared e2e plumbing lives in `e2e/helpers/`: `PHONE`, `DESKTOP`, `recordForPr` (the `ESTA_E2E_VIDEO=1` recording a PR's video comes from), `seriousAxeViolations`, `noSidewaysScroll`, `rest`, `serviceGet`, `servicePatch`, `vnd` and `toast` in `e2e/helpers/wizard.ts`, `memberCall` and `memberRest` (PostgREST as the signed-in member) in `e2e/helpers/auth-api.ts`, the seeded lane ids in `e2e/helpers/seed.ts`, `setClock` in `e2e/helpers/test-clock.ts`, and `signIn` in `e2e/helpers/inbucket.ts`. A spec imports them. It does not import `@axe-core/playwright` (`e2e-axe-in-spec`), call `slotEnv` (`e2e-slot-env-in-spec`), declare `PHONE` or `DESKTOP` or spell out 390 × 844 or 1440 × 900 (`e2e-viewport-in-spec`), or read the page's `scrollWidth` for its own sideways-scroll check (`e2e-sideways-scroll-in-spec`). A check that one element is not clipped is a different check and does not count.

**Home.** One `e2e/fixtures.ts` built on Playwright's `test.extend`, with the slot environment parsed once. It does not exist yet. Issue #194 creates it and moves the helpers out of `wizard.ts`.

## The extraction request

The worker, the recorder, the golden test and the accuracy eval must send the same extraction request, because every replay recording hashes it (AGENT.md §8). Today four places assemble it, and the eval already sends a different prompt.

**Home.** `extractRequest` in `apps/agent/src/jobs/extract-document.ts`, and `withExtractSession` in `apps/agent/src/jobs/extract-session.ts` for a caller outside a job (lands with #205, which closes issues #183 and #185). #205 also gives the agent one tool-error boundary, so a database failure stops the job instead of reaching the model. Until it merges, do not add a fifth place that assembles the request.
