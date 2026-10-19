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

| | Lean | Standard | Rigorous |
| --- | --- | --- | --- |
| Typical PR | Docs, tooling, test-only changes, copy, styling, refactors with no behavior change, small fixes outside the triggers | A new screen or feature slice outside the triggers | Anything a trigger names |
| Owner proof | `pnpm check` and the touched tests | Plus the plan's Playwright rules and verify-skill screenshots: 390x844 and 1440x900, Vietnamese, light and dark | Plus screenshots of every state, the error and empty states included, and a recorded video of the main flow from start to finish, published in the PR body |
| Independent review | One Sonnet review lane, no Supabase stack | One Sonnet live lane that drives the change in a browser | A Sonnet live lane, an Opus adversarial audit lane, a regression lane that runs the same flow on `main`, and a second-opinion audit from a different model on the riskiest part (money math, a policy, a migration) |
| Perf | None | Lighthouse when the plan's perf box names the route | Lighthouse plus the plan's query and bench budgets, each on a quiet machine through `bin/heavy.sh` |
| Fix rounds | One | One | Up to two, the playbook ceiling |
| Merge | Root merges on a clean verdict | Root merges on a clean verdict | Root merges on a clean verdict. Ryan gets a short plain-language summary with the video link. Items on his interrogate list still wait for his click |

The video is a Playwright recording (`video: 'on'`) of the PR's main flow at 390x844. It is converted to a GIF when `ffmpeg` is available so it plays inline on GitHub, and it is published with `bin/pr-media.sh`.

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
| P5-06 | Approve or dismiss proposals and execute approvals | Rigorous | The assistant acts for the family |
| P5-07 | Ask the assistant questions | Standard | Read-only answers, guarded by P5-03 |
| P5-08 | Weekly review, caps and diagnostics | Standard | Operator tooling |
| P5-09 | Email the morning brief | Rigorous | Real email |
| P5-10 | Live run and north-star steps 7 and 9 | Rigorous | Whole flow |
| P6-01 | Settings for household, members, bank accounts and the assistant | Rigorous | Roles and bank accounts |
| P6-02 | Export all data and nightly backup | Rigorous | Data loss |
| P6-03 | First-run onboarding and empty states | Standard | Screens |
| P6-04 | Polish every surface to zero detector findings | Lean | Styling |
| P6-05 | Security headers, CSP and performance budgets | Rigorous | Security boundary |
| P6-06 | Deploy runbook and the full north-star on a production build | Rigorous | Whole flow |
| P6-07 | Cloud project and deploy with Ryan | Rigorous | Production, with Ryan |

Cleanup rounds of `[low]` issues are lean unless one of the issues hits a trigger.

## Codebase-health lane, every tier (2026-10-19 16:45)

Every round, lean included, adds one codebase-health lane: Sonnet, no stack, reading the diff against the thermo-nuclear standard and `ARCHITECTURE.md`. It blocks a diff that adds a second way to do something that has a home, duplicates a rule, puts logic in the wrong layer, writes several rows outside one transaction, or pushes a file over the size limit. It does not report debt the diff did not add. The quality ratchet in `pnpm check` is its deterministic floor.
