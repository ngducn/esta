# Verification tiers

Ryan asked for this on 2026-10-18: "spin up more rigorous checker like more verification lanes and screenshots and videos for crucial pieces and flows of the software, but not every one of them, so we are easier and more lean most of the time, but we are also rigorous and very careful where it matters".

Every PR gets one tier. The coordinator sets it when it writes the owner's brief, using the triggers below and `pnpm verify:tier`, and states it in the first line of the PR body. A PR can move up a tier, never down. A finding during review that hits a trigger moves the PR up.

`pnpm verify:tier` denies by default. Every file under `supabase/migrations/` is rigorous, whatever its text. Any file under `packages/core` or `apps/agent` that no lighter rule names is rigorous, and so is any file under `apps/agent` that is a prompt. A file that no rule names anywhere else is standard. Lean is an explicit list: documentation, `tools/`, test-only changes, and a `package.json` change that only adds script entries. It reads paths with `git diff -z`, so a space or a quote in a path does not hide a folder rule, and it reads the files themselves rather than the diff, so a diff driver cannot hide added text. When a file cannot be read it decides by path alone and never counts it as lean. Its rules sit in one list in `scripts/verify-tier.ts`. It cannot see intent, such as a phase exit or the assistant acting for the family, so the coordinator raises the tier by hand when the question below says so. `pnpm verify:tier --declared <tier>` fails when the tier written in the PR is lower than the computed one.

## The question that decides

Ask: **if this PR has a bug that slips through, could Mẹ lose money, lose data, see wrong money or legal facts without noticing, or could someone outside the household see the family's data?** If yes, the PR is **rigorous**. If it adds or changes something Mẹ uses, it is **standard**. Otherwise it is **lean**.

## Triggers for rigorous

Any one of these makes a PR rigorous:

- **Money.** It computes, stores or shows amounts that feed invoices, payments, deposits, the ledger, receipts, VietQR codes or tax.
- **Security boundary.** It changes sign-in, invites, roles, RLS policies, storage policies, `security definer` functions or service-role code (cron, the agent worker).
- **Data loss.** It deletes, archives, restores, imports or exports data, or it migrates existing rows.
- **The assistant acting for the family.** It writes records on the household's behalf, such as accepting extracted fields or executing approved proposals, or it shows money figures in assistant prose.
- **Legal facts.** It records certificates, ownership or lease terms that Mẹ relies on.
- **Whole flows.** It is a phase exit, it covers north-star steps, or it is the Mom test.
- **Production.** It deploys, or it sets up backups.

## What each tier runs

Since 2026-11-02 (Ryan: "i think for now we can loosen a bit to prioritise dev speed and token saving", then "Yes, apply all"), every tier runs leaner. The measurements behind it are in `decisions.tsv` at 2026-11-02: Opus owners and fix rounds were 61% of agent tokens, and about a fifth of an owner's cost was its cache expiring while it waited for CI, a lock or a reply.

| | Lean | Standard | Rigorous |
| --- | --- | --- | --- |
| Typical PR | Docs, tooling, test-only changes, copy, styling, refactors with no behavior change, small fixes outside the triggers | A new screen or feature slice outside the triggers | Anything a trigger names |
| Owner and fix-round model | Sonnet | Sonnet | Sonnet |
| Owner proof | `pnpm check` and the touched tests | Plus two to four screenshots at 390x844 and 1440x900, Vietnamese | Plus a red-then-green test for every money, security or data rule the PR adds or moves. No video and no full screenshot matrix; the live lane covers the states |
| Independent review | One Sonnet reader of the diff, no stack | One Sonnet live lane that drives the change in a browser | An Opus audit and a Sonnet live lane |
| Perf | None | Lighthouse only when the PR changes a route's loading path (images, fonts, the JavaScript bundle) | Same as standard |
| Fix rounds | One | One | One. A second only when money is still wrong after the first |
| Merge | Root merges on a clean verdict | Root merges on a clean verdict | Root merges on a clean verdict and posts Ryan a short plain-language summary on the PR. Nothing waits for his click (standing orders 2026-10-30) |

Each reviewer also covers codebase health: a second way to do something that has a home, a duplicated rule, logic in the wrong layer, several rows written outside one transaction, a file over the size limit. There is no separate codebase-health lane.

Every finding is codified (Ryan, 2026-11-06; CLAUDE.md "Codify every finding"). Each blocking finding and each low names the check that would have caught it: a type, an `esta/*` lint rule, a `pnpm quality` metric, a test or helper, or a CI step, or says why no mechanical check can. The fix round adds that check with the fix. The scoped reader confirms the check fails with the fix reverted and passes with it. Root merges only when the PR body's `## Codified` section lists every fixed finding with its check.

Review checklist for classes no mechanical check catches (a reviewer reads for each one the diff touches):
1. A figure with two definitions: a screen's total and the same total elsewhere come from one home, and a test compares it with an independent figure.
2. Clock edges, until `clockEdges()` (Q-16) is used by every period-keyed test.
3. Count, then write, until `twoAtOnce` (Q-16) covers the write.
4. A denylist where an allowlist belongs: a fix that refuses the bad spellings it was shown (monthly rates, #439) instead of accepting only the good ones. Ask for a property test that random neighbours of the input never pass; `esta/no-self-sourced-property` fails a property that draws its inputs from a production list, so read any exemption in `eslint.config.mjs` for its reason.
5. A merge of main into a branch: compare the merge result with main's side (`git diff <merge>^2 <merge>`) and read every removed line. A gate that stops running looks exactly like green (#448 dropped `classes:check` and `check:migration-order` this way). `scripts/package-scripts.test.ts` catches a lost `scripts/check-*.ts` gate or entry point; it cannot catch a dropped line elsewhere.
6. A writer of money with no way back: every function that posts a payment from a file or a batch has an undo that removes the payment, its allocations and the link to its source in the same transaction, and a pgTAP test that proves the bill owes again.
6. A rule only TypeScript holds: if TS refuses it, the database refuses it. A form, action or parser that rejects a future date, a link to another property's row or a value outside a range is matched by a trigger or constraint, and the table's pgTAP file tries the forbidden write directly (expenses, #211). The converse holds too: a rule the database adds must not refuse an edit TypeScript lets through. A trigger that branches on `tg_op` is tested through every write path, including `insert ... on conflict do update`, which fires BEFORE INSERT first, so an edit of an existing row is tried through the function's upsert as well as a direct update (expenses, #449).
7. Every number in a trail doc (a time, a count, a cost, a quoted answer) cites a committed file that holds it; a figure read off a console and kept nowhere is not stated.
8. A guard context that restates a count: `cả hai` at a sentence start or after `nhưng`, `vì`, `nếu`, `khi`, `để` passes before a verb whether or not the two were named earlier ("Nhưng cả hai đều chưa vượt ngưỡng." passes; with `chủ sở hữu` after it, it is rejected). No check can see whether the sentence before names them, so read a change to `passesInPhrases` for what it lets through when the count is unnamed (P5-10d).

## Planned tiers for the remaining PRs

Phase 1 closes with P1-03, which is rigorous because it is a phase exit. Phase 2 to Phase 6:

| PR | What it does | Tier | Why |
| --- | --- | --- | --- |
| P2-02 | Upload documents to a property and open them through signed links | Rigorous | Storage policies and sensitive documents |
| P2-03 | The assistant reads certificates and utility bills and queues them for review | Rigorous | Service-role worker writing data |
| P2-07 | Review extracted fields beside the document and accept them | Rigorous | The assistant writes legal facts |
| P2-05 | Documents vault with search, sensitive blur and expiring soon | Standard | A screen; blur reuses P2-02's access rules |
| P2-06 | Capture multi-page documents into one PDF in the browser | Standard | A browser-only feature |
| P2-08 | Add a property from a certificate photo, north-star steps 1 and 2 | Rigorous | Whole flow |
| P3-07 | Tenants, leases and the first invoice | Rigorous | Money and lease terms |
| P3-09 | Collections board for a month | Rigorous | Shows payment state |
| P3-10 | Record payments in three taps | Rigorous | Money |
| P3-04 | Issue invoices and end leases from the daily cron | Rigorous | Money and service-role cron |
| P3-08 | Lease detail, amend, terminate and renew | Rigorous | Money schedule and lease terms |
| P3-18 | Deposits: receive, apply, deduct and refund | Rigorous | Money |
| P3-11 | Invoices with VietQR, print and share | Rigorous | Money a bank app reads |
| P3-12 | A5 receipts as PDF and a Zalo-sized picture | Rigorous | Shows money as a receipt |
| P3-13 | Polite reminders that open Zalo with the tenant's phone | Standard | Mẹ sends the message herself |
| P3-19 | Prefill a lease from a photo of the contract | Rigorous | The assistant writes lease terms |
| P3-14 | Monthly meter readings for every room | Rigorous | Readings become invoice charges |
| P3-15 | Import bank statements and confirm matches | Rigorous | Money and import |
| P3-16 | Home with today's list and this month's collection | Standard | A screen over checked data |
| P3-17 | Phase 3 exit, north-star steps 3 to 6 and the Mom test | Rigorous | Whole flow |
| P4-02 | Expenses with receipts | Rigorous | Feeds the ledger and tax |
| P4-03 | Property ledger by month and export | Rigorous | Money and export |
| P4-06 | Valuations and the portfolio figure on Home | Standard | Estimates Mẹ enters herself |
| P4-04 | Each owner's tax card against the 500 million threshold | Rigorous | Tax |
| P4-05 | Reports with XLSX and PDF export, Phase 4 exit | Rigorous | Export and phase exit |
| P5-02 | Watch rules W1 to W11 | Standard | Pure rules with a golden fact set; the assistant only suggests |
| P5-03 | Morning check and the Trợ lý inbox | Rigorous | First assistant prose with money figures |
| P5-04 | Morning brief in the inbox and on Home | Standard | Prose guarded by P5-03 |
| P5-05 | Market and legal news under Thị trường | Standard | Read-only research |
| P5-06a | Approve or dismiss an assistant's suggested task | Rigorous | The assistant acts for the family |
| P5-06b | Confirm a reminder draft, a renewal, a rent change or a data issue | Rigorous | The assistant changes leases and money terms |
| P5-07 | Ask the assistant questions | Standard | Read-only answers, guarded by P5-03 |
| P5-08 | Weekly review, caps and diagnostics | Standard | Operator tooling |
| P5-12 | One Trợ lý thread for notes and her questions | Rigorous | Replaces two surfaces and adds a definer function that picks whose conversation a message joins |
| P5-12b | Pinned items and `Sao chép`, only if P5-12 passes 800 lines | Standard | A screen over P5-12's data |
| P5-13 | Reply to a note, ask about a property, suggested replies | Standard | Topics are checked in SQL; answers guarded as before |
| P5-14 | Web lookups with quoted figures in the thread | Rigorous | Web search runs beside family data |
| P5-15 | Her own numbers and `calculate` | Rigorous | Money arithmetic |
| P5-16 | Pre-live lows | Rigorous | It edits `checkNote`, the number guard every assistant figure passes (#313, #314) |
| P5-09 | Email a link to each new note | Rigorous | Real email |
| P5-10 | Live run and north-star steps 7 and 9 | Rigorous | Whole flow |
| P6-01 | Settings for household, members, bank accounts and the assistant | Rigorous | Roles and bank accounts |
| P6-02 | Export all data and nightly backup | Rigorous | Data loss |
| P6-03 | First-run onboarding and empty states | Standard | Screens |
| P6-04 | Polish every surface to zero detector findings | Lean | Styling |
| P6-05 | Security headers, CSP and performance budgets | Rigorous | Security boundary |
| P6-06 | Deploy runbook and the full north-star on a production build | Rigorous | Whole flow |
| P6-07 | Cloud project and deploy with Ryan | Rigorous | Production, with Ryan |

Cleanup rounds of `[low]` issues are lean unless one of the issues hits a trigger.

## CI, every tier (2026-10-19 23:30)

Every tier needs the `ci` check on GitHub Actions green at the exact head before a merge. It runs the full suite, so owners run only the specs their change touches. When Actions is down, `tools/ci-local.sh` on this machine is the fallback, and its `local-ci/*` statuses count instead.

## Codebase-health lane (retired 2026-11-02)

Folded into each tier's reviewer, as the table says. The quality ratchet in `pnpm check` stays its deterministic floor.
