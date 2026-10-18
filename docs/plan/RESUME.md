# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read `docs/plan/trail/standing-orders.md` (every 2026-10-17 update; 11:25 and 11:55 are the newest), `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, and `docs/plan/STATUS.md`. Briefs for every owner and lane of this session are in `~/.claude/orchestrate/esta/briefs/`; the root's checklist is `~/.claude/orchestrate/esta/todo.md`.

## Where the run is (updated 2026-10-18 09:55 +07, run still active)

**Phase 1 is complete** (#107 merged as b09d79d; `pnpm phase:check 1` passes all 9 rows).

Merged since the 2026-10-17 pause: #99 P3-03 allocation, #102, #101, #95 P1-07, #100 P1-10, #108, #105 P1-08, #104, #106, #103 P4-01 tax (operator grant), #110, #107 P1-03, #112 cleanup, #113 `pnpm verify:tier`.

Open, with the next step for each:

- **#117 P2-02 documents (rigorous tier).** Three lanes ran at 4aeeac1: the Opus audit, the Sonnet second opinion and the Sonnet live lane with perf. Fix-forward 1 (an Opus owner, slot 5) is in progress. It covers the property-detail spec's four-tab expectation, a composite FK on certificates.document_id, immutable stored files, stamped access-log columns, the missing actions and EXIF tests, 4:3 thumbnails, Xem gated on hydration, the STATUS iPhone line, and a video that ends on the opened document. Next: a scoped round 2, then CI, then merge, then P2-03.
- **#120 (closes #116): CI e2e on a production build.** A Sonnet review and CI are running. Merge when both are clean; it cuts e2e from about 7 to 4 minutes and removes most flakes.
- **Issues open:** `[low]` #111 (closed by #112), #114, #115, #118, #119 and #121, plus #20 and #82 for P6-07.

## Rules added on 2026-10-18 (read before acting)

- CLAUDE.md "Execution priority (80/20)" and "Writing issues and PRs". Memory has `execution-80-20` and `plain-language-issues-prs`.
- `docs/plan/trail/verification-tiers.md`: lean, standard and rigorous, with a planned tier for every remaining PR. Set each brief's tier as the higher of the planned tier and `pnpm verify:tier`.
- Standing orders 05:15, 05:45 and 06:00. The operator granted tax merges and issue closing. The heavy audit round waits for the Phase 3 boundary by default.
- The coordinator does conflict-free rebases itself. It makes no commits to main that touch files of a PR in CI.
- Heavy jobs go through `bin/heavy.sh`. `bin/lock.sh` clears a lock whose owner process died. `bin/ci-watch.sh` labels each CI line with its PR. The coordinator wakes only on run endings and failures.

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
