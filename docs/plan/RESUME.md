# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read `docs/plan/trail/standing-orders.md` (every 2026-10-17 update; 11:25 and 11:55 are the newest), `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, and `docs/plan/STATUS.md`. Briefs for every owner and lane of this session are in `~/.claude/orchestrate/esta/briefs/`; the root's checklist is `~/.claude/orchestrate/esta/todo.md`.

## Where the run is (handoff written 2026-10-18 15:10 +07; the operator then stopped the two in-flight agents before either pushed or reported, so rerun both briefs)

**Phase 1 is complete** (#107 merged as b09d79d). Phase 2 and Phase 3 run as two parallel tracks (standing orders 10:55).

Merged since the 2026-10-17 pause (20 PRs): #99 P3-03, #102, #101, #95 P1-07, #100 P1-10, #108, #105 P1-08, #104, #106, #103 P4-01 tax, #110, #107 P1-03, #112, #113 `pnpm verify:tier`, #120 CI e2e on a production build, #117 P2-02 documents.

Open, with the next step for each. Both are rigorous tier, and both have green local CI at their last head.

- **#124 P2-03: the assistant reads certificates and bills (track A).**
  - Head 5cf5982 after fix-forward 1. CI is 5/5 there, after an e2e rerun that followed a root two-stack mistake.
  - Round 2 found the national ID reducer still lets realistic shapes through (SPEC D11):
    - 11 digits after a label;
    - an ID glued to letters after a label;
    - en dash, comma, underscore and zero-width separators.
  - **Fix-forward 2, the last one, was started at 15:05 from `~/.claude/orchestrate/esta/briefs/p2-03-ff2.md`.**
    - If the PR head has moved past 5cf5982, it pushed. Run one scoped Opus check of the D11 shapes, then CI, then merge.
    - If the head is still 5cf5982, the owner was killed. Rerun that brief.
  - A blocking finding that survives fix-forward 2 parks the PR for Ryan.
- **#123 P3-07: tenants, leases, first invoice (track B).**
  - Head 3aeeb5e after fix-forward 1. CI is 5/5 there.
  - The fix bills only the unpaid days of a period and computes invoices in SQL (`activate_lease`). Members cannot write invoices.
  - **Round 2 (Opus) was started at 15:05 from `briefs/lane-pr123-r2.md`**, with evidence in `/tmp/swarm-pr123-ev/r2/`. If that folder has no report, rerun the brief. Clean means merge. A blocking finding gets fix-forward 2 (the last).
- **Next on each track.**
  - Track A: P2-07, review extracted fields and accept them.
  - Track B: P3-09, the collections board.
  - Write each brief from `briefs/p2-03.md` or `briefs/p3-07.md`.
  - The P3-04, P3-08 and P3-14 briefs must extend the SQL issuance in `private.issue_invoices` / `activate_lease`, not a TypeScript runInvoicing (#123).
- **Open issues.**
  - `[low]` for a cleanup round: #114, #115, #118, #119, #121, #125, #126.
  - CI: #122 (database-backed vitest files never run in CI).
  - Local dev: #127 (the document view route breaks under `pnpm dev`) and #128 (Postgres crashes when authenticated calls a private function, #82 class).
  - Deploy: #20 and #82 for P6-07.

## Rules added on 2026-10-18 (read before acting)

- **CLAUDE.md** has "Execution priority (80/20)" and "Writing issues and PRs". Ryan reads on his phone, so write plain language and never use bare plan codes.
- **Verification tiers.** `docs/plan/trail/verification-tiers.md` defines lean, standard and rigorous, with a planned tier for every remaining PR.
  - Take the higher of the planned tier and `pnpm verify:tier`.
  - Rigorous means a live lane, an Opus adversarial audit, a second-opinion audit by a different model on the riskiest part, screenshots of every state and a flow video. It allows up to two fix-forwards.
- **Standing orders** 05:15, 05:45, 06:00 and 10:55.
  - Ryan granted tax merges and issue closing.
  - The heavy audit round waits for the Phase 3 boundary.
  - Budget is up to 95% per block: stop spawning at 90%, pause at 95%.
- **Rebases and commits.** The coordinator does conflict-free rebases itself. It makes no commits to main that touch files of a PR in CI.
- **Tools.**
  - `bin/heavy.sh` takes the machine-wide lock for heavy jobs.
  - `bin/lock.sh` clears a lock whose owner process died.
  - `bin/ci-when-calm.sh` waits for the lock, for fewer than two other stacks besides esta-1, and for load under 8.
  - `bin/ci-watch.sh` labels each CI line with its PR. Monitor only `: end |failure`.
- **e2e and dev server.** CI's e2e runs on a production build. Local `pnpm e2e` defaults to the dev server unless `ESTA_E2E_SERVER=build`. Agents should use `build`, because the dev server has the #127 and @swc/helpers problems.

## How CI runs now

- The root runs `~/.claude/orchestrate/esta/bin/ci-when-calm.sh <worktree> <pr> <slot> [jobs]`. It waits for its own lock and a load under 5 (1 minute) and 6 (5 minutes), then calls `tools/ci-local.sh`, which since #64 also takes `/tmp/ci-local/lock` and caps vitest workers at 3.
- Before each merge, compare the PR's changed files with what `main` changed since its base. When they overlap (it was `packages/core/package.json` and the lockfile every time today), rebase, check `git range-diff`, push with lease, and run CI at the rebased head.
- Since #73, ci-local retries a `db reset` 502 once (it does not always cure it, #88). Since #86, the e2e job retries a failed test once and lists flaky tests, and Storage is emptied before each seed.
- Since #93, a db reset 502 stops and starts the slot stack before its one retry.
- Docker disk was near full on 2026-10-17; the operator approved pruning the build cache only. Agents never prune shared Docker resources (owner and lane briefs).
- Lighthouse budgets are measured over HTTP/2 (standing orders 19:00); scripts/perf/lighthouse.ts defaults to it since #89.

## Budget

- `~/.claude/orchestrate/esta/bin/usage-pct.sh` was rescaled at 11:55 to the operator's /usage reading (65% real when the old scale read 78.8%). Stop spawning at 80%, pause at 86%, per block.
- This block (02:00Z to 07:00Z) reached 80% at about 12:30 +07 with up to seven agents running. Opus owners cost about 6 to 10 points each per hour; scoped review lanes 2 to 4.

## Gotchas learned this run

- At most two Supabase stacks besides `esta-1`. CI counts as one while it runs; hold queued CI when two owners hold stacks.
- A bash script edited in place keeps running its old text if it was already started.
- Owners' `next dev` 500s on a missing `@swc/helpers` in fresh worktrees (#30 class); production builds work for screenshots.
- Never slot 4. The permission classifier denies closing issues and any command naming `fixtures-private`.
- Issues waiting for the operator to close: #3, #4, #8, #9, #10, #11, #16, #31, and #36 after its one open question.
