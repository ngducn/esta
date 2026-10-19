# Esta code-quality review, 2026-10-19: summary

Five outsider reviewers (Opus), one per subsystem, read a frozen snapshot of `main` at 5d19277 under the thermo-nuclear standard. They worked read-only, measured with counts and line references, and sampled where the code was large; each detail file names what it did not examine. The root reproduced the area-parser finding by running the three parsers.

## Verdict

The code is correct where it matters most and is getting harder to change. The money and security paths are strong: every one of 116 SQL functions pins `search_path`, every public definer function checks membership or is service-role only, money is exact integer VND, core has zero `any` and zero non-null assertions, and about a thousand pgTAP assertions test behavior rather than schema. The weakness is structural drift. Forty-odd PRs were each built by a different owner and reviewed for what the diff breaks, never for what the codebase becomes, and the result is the same rule written two, three or four times, two write architectures side by side, and a convention per file for results, uploads, toasts and test helpers. None of this hurts Mẹ today. All of it raises the cost of every later change, and two places already disagree on what she sees.

## Ratings (out of 10)

| Subsystem | Readability | Quality | Performance | Detail |
| --- | --- | --- | --- | --- |
| Database (migrations, pgTAP, seed) | 6 | 7 | 7 | 01_database.md |
| Core domain package | 7 | 6.5 | 8 | 02_core.md |
| Web server (actions, loaders, proxy) | 7 | 6 | 7 | 03_web-server.md |
| Web UI (components, pages) | 6 | 6 | 7 | 04_web-ui.md |
| Agent, scripts, e2e, lint rules | 7 | 6 | 6 | 05_agent-scripts-tests.md |
| Overall | 6.5 | 6.5 | 7 | |

Performance is fine at one family's scale everywhere; the reviewers found waste, not bottlenecks.

## Findings, ranked

**1. The same rule lives in several places, and some copies already disagree.** The billing planner exists in SQL (`20261007306700_lease_changes.sql:102-209`, `leases.sql:295-318`) and in TypeScript (`generateSchedule`, `planInvoices`); payment status, allocation, completeness, the lease state machine and the ID check also have SQL twins. The TypeScript planner handles meter readings and the SQL one does not (`invoicing.ts:47-58`), and the seed writes its invoices with the TypeScript planner (`seed/generator/leasing.ts:166-171`), so demo data can show issue dates real billing never produces. Parity is checked by a sampled integration test whose window never reaches an escalation step. Elsewhere: three area parsers (`certificate_v1.ts:20-27`, `extraction/area-check.ts:3-9`, `properties/area.ts:6-29`) read "1,255 m²" as 1255 on the review screen and refuse it on the legal tab (root-verified); the extraction request is assembled four times, so the private-fixture accuracy numbers measure the spike prompt rather than the one the worker ships (`jobs/extract-document.ts:79-98` vs `scripts/extraction-eval.ts:152-230`); the upload pipeline exists twice with different retry rules (`step-photo.tsx:30-170`, `upload-sheet.tsx:25-195`); enums such as `TaxPayer` and the billing-cycle set are declared twice in core. Remedy: one owner per rule. For money, make SQL the single planner and expose it through a guarded `lease_schedule` RPC that the timeline, tax and seed read; delete the TypeScript twins and the parity harness (01, 02). For the rest, one parser, one `extractRequest`, one `useDocumentUpload` hook.

**2. Two write architectures coexist, and the app-side one is not atomic.** Leases, payments and lease changes write through one definer RPC per action. Extraction acceptance runs about seven sequential writes with no transaction (`server/extraction/actions.ts:108-177`), and a lookup named `reviewedDocument` also updates the document (lines 72-80). The legal tab compensates for a failed save by deleting parties afterwards (`legal/actions.ts:151-174`); room reordering runs N sequential updates (`rental/actions.ts:92-103`); delete-then-undo is built three times by shipping the whole row to the client and re-inserting it. Remedy: every multi-row write becomes one definer RPC, and one shared action kit (`idSchema`, `dbRefusal(error, sentinels)`, core's `Result`) replaces 25 bespoke result types, 12 scattered SQLSTATE literals and four sentinel maps (03). This is the same layer the connector design needs (`docs/spec/CONNECTOR.md` §3.1), so it pays twice.

**3. No shared kits, so each file invents its own convention.** 19 UI files hand-roll `startTransition(async …)` 21 times while a correct `useWrite` helper sits private with two callers (`archive-button.tsx:13-24`); the toast provider is mounted 8 times, nested on the rental tab; 17 translation islands hand-pick message subsets that the type checker cannot verify, so a missing namespace shows raw keys at runtime; two ways to open a lazy sheet, one missing `aria-expanded` (04). In e2e, 25 specs define their own axe helper and 22 build the slot environment at import while shared versions sit unused in `e2e/helpers/wizard.ts`; two viewport projects run every spec twice while 9 of 16 specs skip by project name (05).

**4. The schema cannot be read in one place.** `property_list_rows` is written out in full five times and `issue_invoices` three times across migrations; 786 lines are superseded definitions. The money-table lockdown is built by creating 92 policies and dropping 33, plus revokes, column grants and `current_user` branches, one of them unreachable (`lease_changes.sql:65-69`). Two invariants ("one invoice per stretch", no overlapping leases) are enforced by hand-written checks instead of constraints (01). Remedy: `btree_gist` exclusion constraints for both, and, because no production database exists yet, squash the migrations into one baseline before the first deploy.

**5. Small correctness and robustness defects.** The agent never checks `ToolRejection`, so live mode sends database errors to the model and replay swallows them, and a failed extraction reports the wrong cause (`apps/agent/src/tools/server.ts:53-58`, `sdk/session.ts:93`). An unknown job kind is retried four times; a job whose lock was lost still logs done (`runner.ts:58, 131-133`). `leases.escalation` checks only `kind`, so a bad `every_months` fails activation with a raw Postgres error (`leases.sql:21-23`). Lease renewal policy and unit-lease derivation sit in page files instead of core.

**6. Performance waste worth a later pass.** About seven sequential round trips per property tab, the detail load reading the same property twice, `loadHoldingLeases` reading every amendment in the household and filtering in JavaScript (03); RLS policies calling a function per row and an unindexable `ilike` on a computed view column (01); an idle agent worker making 2 to 3 database round trips a second (05).

## What is genuinely good

Strict types and boundary parsing with zod; branded money and dates; Intl objects built once; fast-check reference tests in core (1,505 tests in 2.5 s); definer-function discipline and behavioral pgTAP; small files with comments that explain why; careful lazy loading, virtualization and server rendering on the heavy screens; the custom lint rules that keep every string translated.

## Why it drifted

The verification process scoped every review lane to "what the diff breaks", deliberately, to keep rounds short. That caught every correctness regression this run but never looked at the codebase as a whole, and owners rarely saw each other's work in flight. The standing orders already plan a heavy audit and cleanup round at a phase boundary; this review is its input.

## Proposed remediation sequence

1. Now, as tracked issues and small PRs: the area parsers, the agent error boundary and job retries, the escalation check, and the extraction request built four times (so the eval measures the shipped prompt).
2. Before Phase 5 (the connector needs it anyway): the shared action kit and operations layer, and every multi-row write as one definer RPC, starting with extraction acceptance.
3. At the Phase 3 boundary: SQL as the single billing planner with the TypeScript twins deleted; exclusion constraints; `useDocumentUpload`; one toast provider; a typed translation island; e2e helper consolidation.
4. Before the first deploy (Phase 6): squash migrations into a baseline.
