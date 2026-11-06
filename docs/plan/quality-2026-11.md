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
- **Q-16 The known defect classes become checks.** The eight classes in `owner-brief.md` were prose that owners read and reviewers re-found. Each gets the check named in the ledger below: a property test over every compound in the number guard, a lint rule that every Tailwind class exists in the tokens or Tailwind's defaults, a pgTAP helper that proves a private row is hidden everywhere it is copied, an integration helper that runs two writes at once, a clock-edge helper. `owner-brief.md` then names each check instead of describing the class.

**Wave 0b. Correctness before deploy.** The issue ledger below found 28 open issues that are money, legal-fact, data or security defects, though most were filed as `[low]`. Retitling them `[pre-deploy]` waits on Ryan (the edit was blocked by permissions). Each is fixed with a red test and its check, inside the Q PR whose files it touches (#184 in Q-05, #189 in Q-03 and Q-04, #145 and #250 in Q-13) or in these:
- **Q-17 Parser corpus.** One adversarial case table per parser in packages/core plus property tests (#149, #163, #232, #260 and the other parser issues in class C6).
- **Q-18 Layout sweep.** The layout-class issues, with the check the ledger names.
- **Q-19 Database invariants.** Constraints and definer functions for overlapping leases and double invoices (#198), partial lease-plan batches (#241), import undo and double-post (#255, #266), the approval verdict (#331), the expense property and date rules (#211), the property-kind edit (#397), with pgTAP for each.
- **Q-20 Deploy preflight.** Probes for the go-live issues (#20, #82, #122, #153, #167, #215, #220, #223, #428, #431) that a script runs against the preview project before the first production deploy.

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

Ryan, 2026-11-06, answering whether the pass finishes before the first production deploy: "yeah". Q-01 starts on 2026-11-06 beside P5-15b, because it touches only the quality scripts; Q-16 follows it. Q-02 runs once P5-15b and the live run have merged and nothing else is open. Waves 1 to 6 follow, most of them after the weekly reset on 2026-11-07 11:00 +07. The pass finishes before the first production deploy, because the squash and the soft-delete migrations are cheapest before real data exists.

Review follows `verification-tiers.md`: Q-03, Q-04, Q-05, Q-06, Q-13 and Q-14 touch the database or every write, so each gets the Opus audit and a live lane.

## Codify every finding

Ryan, 2026-11-06: "everything you find as issue, be sure to codify it in some way, and make sure every subsequent implementation efforts carry this quality forward".

A finding is closed only when a check would catch it next time. The check is, in order of preference: a type that makes the defect unrepresentable, a lint rule in `eslint-rules/`, a `pnpm quality` metric with its home, a pgTAP or unit test or harness helper, or a CI step. When no mechanical check can catch a class, the ledger says why and the review checklist in `verification-tiers.md` names it. CLAUDE.md ("Codify every finding") and `owner-brief.md` carry the rule to every owner; each PR body has a `Codified` section, and root's merge script refuses a PR without one.

## Finding ledger, codebase review 2026-11-06

| Finding | Check that holds it | PR |
| --- | --- | --- |
| Half the server actions write to Supabase outside an op | `direct-write` metric, then a hard lint rule at 0 | Q-01, Q-05 |
| An op's refusal renamed 3 to 4 times; `createTenant` picks its error by a zod path string | `action-failure-mapping` metric at 0; new `refusal-rename` metric (an object literal mapping refusal kinds to other names); `webAction` returns the kind | Q-06 |
| Three undo models; deleted rows sent to the client as `Record<string, unknown>` | lint rule against `Record<string, unknown>` in a server action's parameters; pgTAP: every table with an undo action calls `enable_soft_delete` | Q-03, Q-04 |
| 22 components over 120 lines | `long-function` metric at 0 | Q-01, Q-07 |
| 54 literal role checks; the proxy's route table untested | `literal-role-check` metric at 0; the routes test reads the proxy's table | Q-01, Q-08 |
| Legal path casts every table to `parcels` | new `table-name-cast` metric (`.from(x as '...')`) at 0; typed per-table ops | Q-04 |
| Two database fakes that behave differently | new `test-db-fake` metric (a hand-built query builder outside packages/ops/src/test/fake-db.ts) at 0 | Q-09 |
| Certificate-address comparison written twice, the copies disagree | lint rule: address equality outside packages/core/src/address | Q-10 |
| PostgREST page size defined four times | new `postgrest-page-literal` metric (a numeric literal in `.range(`) outside ops/kit.ts | Q-10 |
| Eleven hand-written radio groups | new `hand-rolled-radio-group` metric, home the shared component | Q-07 |
| Allocation preview shares no vectors with `record_payment` | allocation CSV; a unit test that every vector CSV is read by both a TypeScript test and a pgTAP file | Q-09 |
| `DataTable` used only by /dev; dead code goes unnoticed | `knip` in `pnpm check` for unused files and exports | Q-10 |
| Household export lives in packages/db, which should hold types | import-boundary lint: packages/db imports nothing from the other workspaces and exports types and generated code only | Q-10 |
| No formatter; 266 lines over 200 characters | Prettier `format:check` in CI | Q-02 |
| Four file-name styles | `file-name-case` metric at 0 | Q-01 |
| `data-testid` queries outnumber role and label queries 1,961 to 789 | new `testid-query` metric, ratcheted down | Q-09 |
| Migrations merged with versions below main's newest | migration-order rule in `pnpm check` | Q-01 |
| The pgTAP coverage gate passes a table named only in a comment | coverage gate strips comments first | Q-01 |
| Vercel deploys main before `db push` | `vercel.json` turns off production deploys from git; DEPLOY.md release section | Q-13 |
| The production worker runs from the dev folder | the worker's production start refuses a dirty tree or a HEAD that is not a release tag | Q-13 |
| A failed nightly cron leaves no trace | `cronHandler` writes a `cron_runs` row; a test that a throwing job writes a failed row | Q-13 |
| CI tests the PR head; main unprotected | CI checks out the merge ref; branch protection is Ryan's click (needs an admin token, so no check can read it from CI) | Q-11 |
| Email notices silently off in production | `check:env` and `assertStartAllowed` require SMTP for the production worker, with a test | Q-13 |
| The only backup sits on one disk | the backup job writes an operator item when the offsite copy is missing or older than two days | Q-13 |
| `ci-local.sh` skips checks CI runs | both call `tools/ci/jobs/*.sh`; a test that every `ci.yml` job step calls one | Q-11 |
| Tests pass only on retry | Playwright `retries: 0` in CI after #208's root cause | Q-12 |
| 131 e2e tests skipped by viewport gating | `e2e-report` prints the skip count; new `viewport-skip` metric ratcheted | Q-12 |
| A 15 MB macOS binary committed without a digest check | digest check like the Linux copy's | Q-11 |
| heavy.sh and lock.sh live outside the repo | moved into `tools/` | Q-11 |
| 33 functions redefined across migrations | squash (#197). No ongoing check: redefining a function is how a migration changes it | Q-14 |
| Two critical Next.js advisories | `pnpm audit --prod --audit-level high` in CI and Dependabot (#438); alerts on is Ryan's click | done |

## Known defect classes as checks (Q-16)

| Class | Check | Fully mechanical |
| --- | --- | --- |
| 1. A private row with a public copy | pgTAP helper `tests.hidden_everywhere(table, row, reader)` that also reads `audit_log` and known copies; `db:test` fails when a table with a creator-only or operator-only policy has no test calling it | yes |
| 2. Count, then write | integration helper `twoAtOnce(fn)`; `db:test` flags a definer function that counts and inserts without `pg_advisory_xact_lock` | partly: the SQL flag is a ratchet, the helper needs a caller |
| 3. Clock edges | helper `clockEdges()` yielding 23:59 and 00:01 +07, Sunday to Monday and month end, used by every keyed-by-period test | partly: review checks the helper is used |
| 4. Hidden pages | the access table (Q-08) generates a test that every guarded route answers 404 with the not-found body for a member without access | yes |
| 5. The number guard | property test over every compound in `words.ts` that a real number word beside it is still rejected | yes |
| 6. Copied fixtures | `copied-fixtures` metric (exists) | yes |
| 7. A class with no token | lint rule: every Tailwind class in a `className` exists in `tokens.css` or Tailwind's defaults | yes |
| 8. A figure with two definitions | no general check: only a reader knows two figures mean the same thing. The review checklist names it, and a test compares the figure with SQL ground truth | no |

## Issue ledger, 2026-11-06 (167 open issues)

Source: gh issue list, titles and first paragraphs; about 30 bodies read in full. A bundled `[low]` issue holds many items; it sits in its dominant class, so closing it means checking each item against that class's check and the neighbouring classes.

### 1. Not low (flagged; each also appears once below)

- #20: sign-in shares one GoTrue per-IP rate limit, so users can lock each other out in production
- #82: Postgres segfaults when anon calls a function without EXECUTE; rule out before deploy
- #122: security tests (link expiry, no double register) are skipped in CI, so a regression stays green
- #145: same stop-on-error in the nightly invoice job (money, latent)
- #149: land use term as a dash range saves the start date as the end (wrong legal fact)
- #153: raw sign-up endpoint reveals whether an email has an account (security, default accept)
- #163: term after 'han' saves the issue date as the term end (wrong legal fact)
- #167: document previews could be cached by a shared CDN until no-store and GET-only are added (exposure)
- #184: accepting a certificate reading can leave it half saved (data integrity)
- #189: room reorder, legal item with owners and undo write several rows without a transaction
- #198: overlapping leases and double invoices not prevented by the database (money)
- #211: expense can file a receipt under another property; future paid date accepted by the database
- #215: public demo password would sign anyone into the cloud preview (security)
- #220: connector sign-out does not revoke the server session; Keychain write can truncate (security)
- #223: decision: full ID kept in connector change history (privacy, D11)
- #226: after about 1,000 bills the newest unpaid rent disappears from the rental tab (money)
- #232: a full national ID can be saved whole via two spellings (breaks SPEC D11)
- #241: lease plan batch can land partly; shown bills are not rechecked at OK (money)
- #250: one household's billing error stops billing for the rest (money)
- #255: imported payment cannot be undone; commit-time rule duplicated (money)
- #260: a first transfer read as the header goes missing (money)
- #266: statement import double-post races and a retry that opens the wrong import (money)
- #331: approve_proposal trusts a caller-supplied validity verdict before rent changes ship (money, security)
- #356: blank certificate shows valid, accepted review rewrites the address, meter outlier saves silently
- #367: expired land-use term still shows the green valid pill (wrong legal fact)
- #397: editing property kind may drop land details (possible data loss)
- #428: no restore path for the nightly backup if the cloud project is lost (data loss)
- #431: launchd job may point the assistant at the wrong database; no sign-in email sender (go-live blockers)

### 2. Classes

| Class | Issues | Check | Type | Q PR |
|---|---|---|---|---|
| C1 A multi-row write or check-then-act done as separate calls (no single transaction, races) | #175, #184, #189, #266 (4) | new lint rule `direct-write` hard (Q-01 ratchet to 0 after Q-05) plus pgTAP concurrency pattern: each multi-row flow is one definer function, tested with two sessions via a harness helper `tests.race(sql_a, sql_b)` | new | Q-05 (ext. Q-03/Q-04 for the flows they own) |
| C2 A cron or batch loop where one household's error stops the rest | #145, #250 (2) | unit-test pattern + helper `forEachHousehold(fn)` in apps/web/src/server/cron (catches per household, logs id, returns non-200 summary); new metric `bare-household-loop` flags `for ... of households` in cron routes outside that helper | new | Q-13 |
| C3 A rule or constant written twice (core vs SQL, core vs web, web vs web) | #196, #212, #236, #237, #243, #255, #268, #271, #282, #307, #320 (11) | existing `duplicate-core-export` and `duplicated-lines` cannot see TS vs SQL copies; add parity tests: shared CSV vectors replayed by pgTAP and vitest (rule text, account-name rule, job limits, watch vs Home checks, void rules); new metric `sql-ts-constant-pair` is not feasible so require a vector file per paired rule | partial | Q-09 (vectors) and Q-10 (move to one home) |
| C4 A copied e2e helper or a test that shares state and flakes (axe mid-fade, shared member, shared clock, retry not re-runnable) | #118, #119, #157, #168, #194, #208, #235, #264, #276, #298, #337, #371 (12) | metrics `e2e-axe-in-spec`, `e2e-slot-env-in-spec`, `e2e-viewport-in-spec`, `e2e-sideways-scroll-in-spec` exist but only cover four helpers; they slipped because they were added after the specs and the helpers live in wizard.ts (#194 moves them). Extend with `e2e-pr-video-in-spec` and `e2e-seed-lookup-in-spec`, add `retries: 0`, and a fixture that gives each spec its own member | existing-failed | Q-01 (new e2e metrics), Q-12 (retries 0, clock) |
| C5 A client island, toast or upload flow built by hand again | #115, #190, #191, #192 (4) | existing metrics `toast-provider-mount`, `intl-subset-by-hand`, `upload-pipeline`, `hand-rolled-lazy-sheet` are pending on these very issues (home.pending); they will hold once the shared component lands | existing-failed | Q-07 / Q-10 |
| C6 A parser or guard that misreads a rare spelling (dates, numbers, ids, CSV, search text, phones, language) | #149, #151, #163, #204, #230, #232, #247, #260, #262, #313, #314, #325, #357, #359, #362, #364, #407, #425, #436, #437 (20) | one adversarial corpus per parser in packages/core (table-driven file `*.cases.ts`) plus fast-check property tests (round trip, never saves the start date as the end, never leaves 9+ digit runs); lint rule `single-parser-home` is already covered by `decimal-parser-outside-parse` | new | new Q PR Q-17 (parser corpus and properties) |
| C7 A layout or text-size defect at 390 px or 130% text (overlap, pinned footer, wrap, tab bar) | #135, #138, #154, #180, #222, #296, #328, #369, #382, #385, #390, #391, #394, #396 (14) | one e2e helper `assertLayoutSound(page)` run by a generic spec over every route and every sheet in vi and en at 130%: no horizontal overflow, no overlapping buttons, primary action visible; extends `noSidewaysScroll`; the 130% check must enter sheets (#264) | new | new Q PR Q-18 (layout sweep) |
| C8 A styling token or class that the theme does not define, or ad hoc style | #372, #379, #380 (3) | new lint rule `esta/no-unknown-class` reading cn-tables.ts and tokens.css, failing on a Tailwind class the theme does not produce; extend `pnpm design:detect` for same-colour hover | new | Q-01 |
| C9 A failure shown with the wrong or no message (network blamed, default English error screen, silent undo failure) | #126, #137, #156, #174, #301 (5) | `action-failure-mapping` and `hand-rolled-action-call` metrics push to `refusals.<kind>`; add a routes test that every route segment has error.tsx and a lint rule that every `restore` handler shows the shared notice | partial | Q-06 |
| C10 A database invariant held only in TypeScript or by hand-written checks (future date, cross-property link, overlap, caller-supplied verdict, limits, row caps) | #198, #211, #214, #241, #265, #331, #333 (7) | pgTAP invariant pattern: each table test lists its CHECK/exclusion constraints and tries the forbidden write as service role; review checklist line `if TS refuses it, the database refuses it` | new | new Q PR Q-19 (database invariants) |
| C11 Security hardening or production readiness gap (rate limits, headers, enumeration, demo password, sign-out, backups, restore, runbook) | #20, #153, #167, #215, #220, #228, #229, #233, #406, #413, #418, #420, #431, #435 (14) | no mechanical check can prove production config; add a `pnpm deploy:preflight` list in DEPLOY.md (new Q PR) with scripted probes where possible (headers values, demo password absent, SMTP set, plist env); everything else stays in the go-live checklist | none | Q-13 (ops) and new Q PR Q-20 (deploy preflight probes) |
| C12 Local Postgres or Docker stack instability | #82, #128, #131 (3) | pgTAP test that calls each private function as anon and authenticated and expects permission denied (segfault shows as test crash); `db:start` guard script that says run db:reset | new | Q-11 |
| C13 CI plumbing, cache, tooling and gate gaps | #122, #225, #274, #310 (4) | CI step: fail the job when a DB-backed test skips while the stack is up (vitest project `integration`); retry pulls; verify:tier rule for eslint config and role RPCs; Q-01 closes gate blind spots (#210) | new | Q-11 (and Q-01 for #210, #114) |
| C14 Undo missing or divergent (deposit entries, imported payments, change history) | #202, #223, #398 (3) | single undo model: soft delete and restore by id (lint on `Record<string, unknown>` snapshots, pgTAP restore test); #223 is a decision | partial | Q-03 / Q-04 |
| C15 Saved or shown record can be wrong with no warning (blank certificate valid, ended term valid, address rewrite, name matching, valuations, tax inputs, reports) | #121, #146, #284, #285, #287, #290, #356, #363, #367, #370, #397, #426 (12) | completeness registry (data, not conditionals) with a test that every status pill derives from it; zod `.refine` forbids blank identifying fields; pgTAP: soft-deleted or archived parents hide children (helper in enable_soft_delete test); the rest needs review | partial | Q-04 |
| C16 One figure with two definitions or labels, or a label copied between screens | #240, #245, #252, #257, #267 (5) | one selector per figure in packages/core (`collected`, `owed`), and a test that fails when two screens render the same label with different selectors; `duplicate-core-export` for copies | new | Q-10 |
| C17 Ambient time (today, retry after midnight, household created before 07:00, future year, bad month) | #133, #279, #355, #417 (4) | new lint rule `esta/no-ambient-time` (bans `new Date()`, `Date.now()`, `now()` outside Clock and the test clock) plus a pgTAP grep that business SQL has no `now()`/`current_date`; routes test for bad `?month=`/`?year=` params via zod search-param schema | new | Q-01 |
| C18 A list read without a page or limit (1,000 row cap, 50 note cap, whole history re-read) | #226, #272, #316 (3) | new metric `unbounded-list-read` (supabase `.from().select()` without `.range`/`.limit`/`.eq` on key in server loaders), one page-size constant (Q-10) | new | Q-01 (metric) and Q-10 (constant) |
| C19 Assistant behaviour gap (watch rules, news scan, runs, limits, guard messages, answers) | #308, #317, #326, #327, #338, #343, #346, #351, #361, #408, #411, #414 (12) | AGENT.md §7 golden cases in replay mode: each leftover becomes one golden case or pgTAP case; budget and limit values in one registry | partial | Q-09 |
| C20 A product decision or feature request, not a defect | #139, #155, #160, #162, #171, #173, #176, #178, #203, #206, #249, #263, #349, #378, #412, #423 (16) | no mechanical check: these are product choices or polish; keep them in the backlog with the decision recorded; UX regressions are covered by Q-18 where layout, and review checklist `does the screen keep what Mẹ typed` for #155 and #160/#162 | none | review checklist (docs/spec/DESIGN-BRIEF §9) and Q-10 batch |
| C21 Rule: React effect returns a value or the page jumps after refresh | #159 (1) | lint rule `esta/no-effect-return-value` (arrow body expression in `useEffect` that is a call) | new | Q-01 |

Type: existing-failed = an existing metric or rule covers it and the issue still got through; partial = an existing check covers part; new = needs a new check; none = no mechanical check (reason in the check column).

### 3. One-offs

| Issue | Fix | Q PR |
|---|---|---|
| #114 | Add eslint config and role-RPC paths to verify:tier's rigorous list | Q-11 |
| #197 | Squash migrations to one baseline (already planned) | Q-14 |
| #210 | Fetch origin/main in local CI before comparing; close the listed gate edges | Q-01 |
| #219 | Make db:reset remove templates no longer in supabase/templates | Q-11 |
| #293 | Derive the household count in the demo facts test from the seed generator | Q-09 |
| #297 | Accept split PR ids (`p6-01a`) in the verify skill script regex | Q-15 |
| #366 | Add the three missing assertions and replace the loose fallback | Q-09 |
| #428 | Write the restore loader for a new cloud project; add to DEPLOY.md and a round-trip test | Q-13 |

### 4. Counts

- Classes: 21; one-offs: 8
- Covered by an existing check that failed to catch them: 16 issues in 2 classes
- Partly covered, check needs extending: 43 issues in 5 classes
- Needing a new check: 70 issues in 12 classes
- No mechanical check (checklist or backlog): 30 issues in 2 classes
