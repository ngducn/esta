# Quality pass, 2026-11

Ryan, 2026-11-06: "i want the code quality so high and pristine that follow up AI agents can pickup the practice and basically effortlessly maintain high quality".

The codebase review of 2026-11-06 (main 2dc9a4ee, reports in `/tmp/review-codebase/`) scored code quality 7 and infrastructure 6.5. This plan names what a 10 means in numbers, how each number is held, and the PRs that get there.

## What a 10 means here

An agent that has never seen Esta copies the file nearest to its task, follows the error a check prints, and skims prose. So a 10 has three properties:

1. **One way to do each thing.** Every file an agent might copy shows the right pattern, because the second pattern is deleted, not deprecated.
2. **The wrong way fails a check.** Each rule below is a lint rule, a `pnpm quality` metric held at zero, or a test. Its failure message names the one home to use instead. Prose in CLAUDE.md or ARCHITECTURE.md only points at the check.
3. **The right way is the short way.** A scaffold or a one-line helper makes the correct shape cheaper to write than the wrong one.

## Targets

Counts are from the 2026-11-06 review unless marked. "Held by" is what fails CI when the count rises.

| Area | Measure | Today | Target | Held by |
| --- | --- | --- | --- | --- |
| Writes | Server-action files that write to Supabase outside an op | 16 of 32 | 0 | lint rule (Q-01 ratchet, then hard rule after Q-05) |
| Errors | Ad-hoc result types | 44 | 0 | `ad-hoc-result-type` metric |
| Errors | Layers that rename an op's refusal | 3 to 4 | 1 (screen reads `refusals.<kind>`) | `action-failure-mapping` metric |
| Undo | Undo models | 3 | 1 (soft delete, restore by id) | lint on `Record<string, unknown>` snapshots, pgTAP |
| Size | Functions over 150 lines | 23 over 120 | 0 | new `long-function` metric |
| Size | Lines over 200 characters | 266 | 0 | formatter check in CI |
| Naming | File-name styles | 4 | 1 (kebab-case, Next.js files exempt) | new `file-name-case` metric |
| Types | `as unknown as` in product code | 7 | 0 | `double-cast` metric |
| Access | Literal role checks in apps/web | 54 | 0 (one access table) | new `literal-role-check` metric, routes test covers the proxy |
| Copies | Duplicated product lines | 267 | under 50 | `duplicated-lines` metric |
| Copies | Open issues about one rule written twice | 19 (open-issue search) | 0 | closed by Q-10 |
| Tests | Database fakes | 2 | 1 | delete the agent's emulated builder |
| Tests | Money rules without shared vectors | allocation | 0 | CSV vectors replayed by pgTAP |
| Tests | Mutation score on core money, allocation and tax | not measured | floor set at first run, then ratcheted | CI job |
| CI | Main runs that passed a test only on retry | 3 of last 6 | 0, retries off | Playwright `retries: 0` |
| CI | What CI tests | the PR head | the merge result, main protected | branch protection (Ryan's click) |
| DB | Functions defined more than once across migrations | 33 | 0 | squash (#197) before the first production push |
| DB | Migrations that sort below main's newest | 2 merged so far | 0 | `pnpm check` rule |
| Ops | Failed nightly crons that leave a trace | none | every run writes a row Ryan sees | `cron_runs` table and status line |

Not a target, on purpose: unit tests for every component (e2e already drives every screen), mutation testing outside core, and a 10 in deploy and operations before a real deploy has run a few releases.

## PRs

Ordered so each wave makes the next one cheaper. Each PR deletes the pattern it replaces in the same PR (migrate callers, then delete).

**Wave 0. The lever.** Makes the targets mechanical before any refactor.
- **Q-01 Quality gates.** Adds `long-function`, `direct-write`, `literal-role-check` and `file-name-case` to `scripts/quality/metrics.ts` at today's counts, each with its one home. Adds the migration-order rule to `pnpm check`. Makes the pgTAP coverage gate match table names in SQL, not in comments. ARCHITECTURE.md lists each metric's target.
- **Q-02 Formatter.** Prettier config, one reformat commit, `format:check` in CI. Runs when no other PR is open, because it touches every file.

**Wave 1. One write pattern and one undo model.** The riskiest flows move onto ops; each multi-row flow becomes one definer function.
- **Q-03 Rental tab.** Units and utility accounts write through ops, soft delete, restore by id. Deletes the snapshot types and re-link loops.
- **Q-04 Legal tab.** Parcels, certificates and structures through typed per-table ops, soft delete, restore by id. Deletes the `as 'parcels'` cast path.
- **Q-05 Extraction acceptance.** One definer function and one op (#184). The `direct-write` metric reaches 0 and becomes a hard lint rule.

**Wave 2. One error contract.**
- **Q-06 Refusal kinds end to end.** A `webAction(op, revalidate)` helper. Screens read the op's refusal kind and look up `refusals.<kind>` in vi and en. Deletes the per-action result types and label maps.

**Wave 3. Readable components.**
- **Q-07 Component splits.** `ReviewPanel` becomes one component per mode, typed by a discriminated union. `ExpenseSheet`, `LeaseForm`, `StepPhoto` and `RecordPaymentSheet` move their state into a hook or reducer. One shared radio group replaces eleven. `long-function` reaches 0.

**Wave 4. One access table, one fake, shared vectors.**
- **Q-08 Access table.** `member.can` computed once in `getCurrentMember`; the proxy and the layouts read one table; the routes test covers the proxy. `literal-role-check` reaches 0.
- **Q-09 Tests.** Agent tests move onto the fetch-level fake and the emulated builder is deleted. Allocation gets CSV vectors replayed by pgTAP. A mutation-testing job on core money, allocation and tax, with a floor.
- **Q-10 Rule copies.** The address comparison lives once in core. The household export moves to ops. One page-size constant. DataTable deleted. The open "rule written twice" issues and the `[low]` backlog closed in one batch.

**Wave 5. Infrastructure for go-live.**
- **Q-11 CI on the merge result.** CI checks out the merge ref. `tools/ci-local.sh` and CI call the same job scripts. heavy.sh and lock.sh move into `tools/`. Branch protection itself is Ryan's click.
- **Q-12 Flaky clock tests (#208).** Root cause, then `retries: 0`.
- **Q-13 Operations.** A `cron_runs` row per run and a stale or failed line beside the worker status; `check:env` requires SMTP for the production worker; a release section in DEPLOY.md (db push, then promote) and a script that updates the worker's own clone at a tag; an offsite copy of the backup folder.
- **Q-14 Migration squash (#197).** One baseline migration, before the first production `db push`.

**Wave 6. Docs an agent reads.**
- **Q-15 Agent-facing docs and scaffolds.** Every rule in CLAUDE.md and ARCHITECTURE.md that a check now holds shrinks to a one-line pointer to the check. Each concern names one canonical file to copy. `pnpm new:table` writes the migration, RLS calls and pgTAP file from the recipe; `pnpm new:op` writes an op, its action line and its test.

## Order and budget

Q-01 starts on 2026-11-06 beside P5-15b, because it touches only the quality scripts. Q-02 runs once P5-15b and the live run have merged and nothing else is open. Waves 1 to 6 follow, most of them after the weekly reset on 2026-11-07 11:00 +07. Root's default is that the pass finishes before the first production deploy, because the squash and the soft-delete migrations are cheapest before real data exists. Ryan can say "deploy first".

Review follows `verification-tiers.md`: Q-03, Q-04, Q-05, Q-06, Q-13 and Q-14 touch the database or every write, so each gets the Opus audit and a live lane.
