# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read `docs/plan/trail/standing-orders.md` (every 2026-10-17 update; 11:25 and 11:55 are the newest), `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, and `docs/plan/STATUS.md`. Briefs for every owner and lane of this session are in `~/.claude/orchestrate/esta/briefs/`; the root's checklist is `~/.claude/orchestrate/esta/todo.md`.

## Where the run is (paused 2026-10-17 about 23:55 +07 at the operator's request)

Paused cleanly: no agents, CI runs, servers or watchers are running; only `esta-1` is up. Slots 2, 3 and 5 are free.

Merged 2026-10-17 (22): #57 P3-05, #60, #59 P3-02, #64, #52 P1-04, #58 P3-06, #67 P2-01, #73, #74, #75, #69, #72 P1-09, #77, #81, #84, #87, #86, #89, #80 P1-06, #90, #93, #92 P1-05. Phase 1 is at 5 of 9.

Open, with the next step for each:

- #95 P1-07 (Pháp lý tab: parcels, structures, certificates; migration 20261007201900; closes #18) at f7f4bc4. Opus data audit PASS with three lows: (a) existence oracle in `private.check_certificate_parties` (a BEFORE trigger answers 23503 vs 42501 before RLS; fix: return `new` early when `not private.is_member(new.household_id,'member')`); (b) `verified_by` and `verified_at` are member-writable (stamp server-side; P2 adds composite FKs for document_id and extraction_id); (c) per-table viewer and household-freeze pgTAP gaps. The Sonnet live lane was stopped unfinished at the pause; rerun it from `~/.claude/orchestrate/esta/briefs/lane-pr95-live.md` (it also measures the trunk detail-route baseline the owner skipped). Root's plan: one fix-forward with (a) and (b) plus any live finding, scoped review, full CI, merge.
- After P1-07, one at a time: P1-10, P1-08, P1-03. Write each brief from `briefs/p1-07.md` the way p1-05.md and p1-07.md were derived.
- #61 P5-11 parked; P5-03 rebuilds the guard over rendered text (standing orders 16:00).
- #82 diagnosed (supautils 3.2.0 in the local image pinned by CLI 2.90.0; PostgREST is not exposed); operator chose no CLI upgrade yet. P6-07 must confirm the cloud image is 17.6.1.155 or later and that `private.local_stack` is empty on production.
- Open issue to pick up when a slot is free: #94 (hover contrast on primary buttons).

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
