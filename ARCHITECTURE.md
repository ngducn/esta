# Architecture: one home per concern

This file names the one place each recurring concern lives. Before you write a parser, a result type, an upload step, a toast, a translation subset or a test helper, find its section here and use the home it names. Where the home does not exist yet, the section names the cleanup issue that creates it. Until that issue lands, copy the closest existing pattern the section points to and do not add a third variant.

`pnpm quality` enforces part of this file. It counts copied code, oversized files and the smells listed in each section, and fails `pnpm check` when a count rises above `quality/baseline.json`.

## The quality baseline

`pnpm quality` reads every source file under `apps`, `packages`, `e2e`, `scripts`, `eslint-rules` and `supabase/seed`, except generated files, fixtures, migrations and message files. Each metric in `scripts/quality/metrics.ts` has an id, the paths it applies to, a message, the home to use instead and a link to its section in this file.

- When a metric rises, the check fails and lists the occurrences in the files whose count went up, with the home to use instead.
- When a metric falls, the check also fails until you run `pnpm quality --update`, so the baseline keeps every gain.
- `pnpm quality --update` rewrites the baseline only when nothing rose. To raise a metric, run `pnpm quality --update --allow-raise "<reason>"`. The reason goes into the `raises` list in `quality/baseline.json`, and the root countersigns it in review, as it does for a performance budget.
- `files-over-1000-lines` has a cap of zero. No flag raises it.

To add a smell, add one entry to `METRICS` with a precise pattern and a section here, then run `pnpm quality --update`. A pattern that matches correct code teaches people to ignore the check, so prefer an exact call, import or type shape over a loose word.

## Duplicated code

`pnpm quality` runs jscpd 5 over the source files and counts every block of 50 or more tokens that appears twice (`clones`) and the lines inside those blocks (`duplicated-lines`). An edit of up to five lines inside a copied block keeps it one clone. The token threshold is jscpd's default. It registers the duplicates the 2026-10-19 review measured: the two upload flows, the legal and rental item actions, and the e2e setup copied between specs.

**Home.** Extract the shared part once, in the home the matching section below names, and call it from both places. A test that needs the same setup as another test imports a shared helper.

## File size

No source file passes 1,000 lines (`files-over-1000-lines`, cap zero). The count of files over 400 lines (`files-over-400-lines`) only goes down. To bring a file under the limit, split it by concern, not into numbered parts.

## Parsing money, decimals, areas and dates

All parsing of what Mẹ types or what the assistant reads lives in `packages/core/src/parse` and `packages/core/src/date`, as pure functions that return core's `Result`.

- **Money.** `parseVndInput` in `packages/core/src/parse/vnd-input.ts` reads VND as Mẹ types it (`1.200.000`, `3tr5`). `Vnd` in `packages/core/src/money/vnd.ts` is the branded integer. Formatting lives in `packages/core/src/format`.
- **Decimals.** `parseDecimal` in `packages/core/src/parse/decimal.ts` is a money parser. Đồng have no minor unit, so it reads `1.255` and `1,255` as 1255. Never use it for a quantity with a fractional part (`decimal-parser-outside-parse`).
- **Areas.** Three area parsers disagree today: the review screen reads "1,255 m²" as 1255, and the legal tab refuses it. Issue #182 replaces them with one zod-free parser in `packages/core/src/parse` with the Vietnamese decimal-comma rule (DOMAIN-VN). Until it lands, use `parseAreaInput` in `packages/core/src/properties/area.ts` for typed input.
- **Dates.** `IsoDate` and `isIsoDate` live in `packages/core/src/date/iso-date.ts`, and `parseDateInput` in `packages/core/src/parse/date-input.ts`. In a zod schema, use `isoDateSchema`, which also brands the value, instead of `z.string().refine(isIsoDate)` (`hand-rolled-iso-date-schema`). `isoDateSchema` lives in `packages/core/src/schemas/legal.ts` today, and issue #196 moves it and the calendar helpers into `packages/core/src/date`.

## Results

A function that can fail in an expected way returns `Result<T, Reason>` from `packages/core/src/result.ts`. Do not spell out another `{ ok: true … } | { ok: false … }` union (`ad-hoc-result-type`). Issue #196 widens `Result` to carry a structured error, so the five core siblings (`Parsed`, `PlanResult`, `TlvResult`, `DecodeResult`, `DepositLedgerResult`) fold into it. Issue #188 moves the server actions onto it.

## Server action kit

A server action takes `unknown`, parses it with zod, writes through the session client, and maps a database refusal to a reason the screen can show. The lease and payment actions (`apps/web/src/server/actions/leases.ts`, `apps/web/src/server/actions/payments.ts`) are the template.

**Home.** `apps/web/src/server/actions/kit.ts`, with `idSchema`, `optionalIdSchema` and `dbRefusal(error, sentinels)`. It does not exist yet. Issue #188 creates it and moves the `ESTA_*` sentinel strings into one core module. Until then, do not declare another `const id = z.uuid()` (`local-id-schema`) or compare another SQLSTATE literal such as `'23505'` (`sqlstate-literal`).

## Multi-row writes

A user action that writes more than one row runs as one `security definer` function in SQL, in one transaction, and checks membership itself. `record_payment` in `supabase/migrations/20261007305000_record_payment.sql` and `amend_lease` in `supabase/migrations/20261007306700_lease_changes.sql` are the template. Never orchestrate several writes from TypeScript with compensating deletes or a loop of updates.

Four flows still break this rule. Issue #184 moves extraction acceptance into one function. Issue #189 moves the room reorder, the legal save with quick-added owners, and delete-and-undo.

## Rules in SQL and rules in TypeScript

A rule that decides what gets written lives in SQL, because SQL is the writer: billing periods, invoice issue, payment allocation, payment status, lease transitions and the national-ID check. A rule that only shapes what a screen shows lives in `packages/core`. When both sides need a rule, one side is the source and the other reads it.

- The billing planner exists twice today (`private.lease_periods` and `generateSchedule`), and the copies drift. Issue #195 makes SQL the single planner behind a guarded `lease_schedule` function.
- When a TypeScript twin must stay, prove parity with golden vectors that pgTAP replays, as `supabase/tests/fixtures/payment_status.csv` does.
- An invariant over rows belongs in a constraint, not in a check inside one function. Issue #198 adds exclusion constraints for overlapping leases and invoices.
- Issue #197 squashes the migrations into one baseline before the first deploy, so each function has one current body.

## Document upload

Bytes go from the browser to Storage with a signed upload URL, never through a server function body (CLAUDE.md). `apps/web/src/lib/upload/prepare.ts` prepares a file and sends it (`sendPrepared`), and `createDocumentUpload` in `apps/web/src/server/documents/actions.ts` signs the upload.

**Home.** One `useDocumentUpload({ finish })` hook in `apps/web/src/components/documents/`. It does not exist yet. Issue #190 creates it from the two copies in `components/property-wizard/step-photo.tsx` and `components/documents/upload-sheet.tsx`. Until then, do not call `sendPrepared` from a third component (`upload-pipeline`).

## Calling a server action from the UI

A client component calls a server action inside a transition, maps a thrown call to a failure, and shows one error line.

**Home.** One shared action hook. It does not exist yet. `useWrite` in `apps/web/src/components/properties/archive-button.tsx` is the pattern, and issue #193 promotes it to `apps/web/src/components/use-action.ts` with a `FormAlert` for the error line. Until then, do not add another `startTransition(async …)` (`hand-rolled-action-call`) or `.catch(() => ({ ok: false … }))` (`action-failure-mapping`) to a component.

## Sheets and dialogs

`useDeferredDialog` in `apps/web/src/components/use-deferred-dialog.ts` opens a lazy sheet or dialog. It keeps the popup mounted so the exit motion runs, preloads on hover and focus, and sets `aria-haspopup` and `aria-expanded`. Do not mount a sheet only while it is open (`hand-rolled-lazy-sheet`).

**Home.** One form-sheet shell that owns the title, the error, and the cancel and submit row. It does not exist yet. Issue #193 creates it. Until then, do not copy the footer row markup into another sheet (`sheet-footer-markup`).

## Toasts

`UndoToastProvider` in `apps/web/src/components/undo-toast.tsx` renders the undo toast and its live region.

**Home.** One mount in `apps/web/src/app/(app)/layout.tsx`, with its labels passed from the server. Eight places mount their own today, two of them on the rental tab. Issue #191 moves the mount into the layout. Do not add another mount (`toast-provider-mount`).

## Translation islands

Server components translate with `getTranslations` and pass strings to client components as props (CLAUDE.md, Translations). A client island that truly needs `useTranslations` gets only its namespaces through a provider.

**Home.** One typed island component that takes the island's namespace list and calls `getMessages()` itself, so a missing namespace is a type error. It does not exist yet. Issue #192 creates it to replace `PropertyIntl`, `propertyIslandIntl` and the hand-built subsets. Until then, use `propertyIslandIntl` in `apps/web/src/server/properties/island-messages.ts`, and do not call `getMessages()` in another page (`intl-subset-by-hand`).

## One declaration per concept in core

Each enum, schema, date helper and type in `packages/core` is declared once, in the module that owns the concept. Other modules import it. An auto-import cannot pick the wrong copy of a name that exists once (`duplicate-core-export`). Issue #196 removes the current copies: `TaxPayer`, the certificate schemas, `daysInMonth` and `OwnershipShare`.

## Types at boundaries

Parse external data with zod at the boundary and trust internal types after it. `as unknown as` switches the type checker off (`double-cast`). Parse the value, narrow it with a type guard, or fix the type that forced the cast.

## Lint exceptions

Fix the code instead of disabling a rule inline. When an exception is right, put it in `eslint.config.mjs` with a reason, where review sees it (CLAUDE.md, Translations). The count of inline `eslint-disable` comments (`inline-eslint-disable`) only goes down.

## E2E helpers

Shared e2e plumbing lives in `e2e/helpers/`: `PHONE`, `DESKTOP`, `seriousAxeViolations`, `noSidewaysScroll` and `serviceGet` in `e2e/helpers/wizard.ts`, and `signIn` in `e2e/helpers/inbucket.ts`. A spec imports them. It does not import `AxeBuilder` (`e2e-axe-in-spec`), call `slotEnv` (`e2e-slot-env-in-spec`), declare `PHONE` or `DESKTOP` (`e2e-viewport-in-spec`) or write a `scrollWidth <=` check (`e2e-sideways-scroll-in-spec`).

**Home.** One `e2e/fixtures.ts` built on Playwright's `test.extend`, with the slot environment parsed once. It does not exist yet. Issue #194 creates it and moves the helpers out of `wizard.ts`.

## The extraction request

The worker, the recorder, the golden test and the accuracy eval must send the same extraction request, because every replay recording hashes it (AGENT.md §8). Today four places assemble it, and the eval already sends a different prompt.

**Home.** One `extractRequest` exported from `apps/agent/src/jobs/extract-document.ts`. It does not exist yet. Issue #185 creates it. Issue #183 gives the agent one tool-error boundary, so a database failure stops the job instead of reaching the model.
