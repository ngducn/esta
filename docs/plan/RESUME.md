# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read `docs/plan/trail/standing-orders.md` (every 2026-10-17 update; 11:25 and 11:55 are the newest), `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, and `docs/plan/STATUS.md`. Briefs for every owner and lane of this session are in `~/.claude/orchestrate/esta/briefs/`; the root's checklist is `~/.claude/orchestrate/esta/todo.md`.

## Where the run is (2026-10-17, about 20:05 +07)

Merged 2026-10-17 (18): #57 P3-05, #60 Phase 2 re-cut, #59 P3-02, #64, #52 P1-04, #58 P3-06, #67 P2-01, #73, #74, #75, #69 (#56), #72 P1-09, #77 (#55), #81 (#76), #84 (#78, #79, map half of #83), #87 (#68), #86 (#85), #89. Phase 1 is at 3 of 9 (P1-01, P1-04, P1-09).

Open, with the next step for each:

- #80 P1-06 property detail: reviews PASS (Opus audit after the audit-clock fix, Sonnet live). A rebase owner is resolving conflicts with #81, #84 and #87, renumbering its migration to 20261007201600 and adding the 404 half of #83. Then full CI, merge, and P1-05 (brief to write from briefs/p1-06.md; it must revoke INSERT on properties.location and boundary per the #84 audit).
- Polish PR for #41 and #49: owner running on slot 5.
- #61 P5-11: parked; P5-03 rebuilds the guard over rendered text (standing orders 16:00).
- Open issues to watch: #82 (local Postgres segfault on a denied anon call; blocks P6-07), #88 (Kong keeps the old Storage IP after a reset; the CI retry should stop and start the stack), #70-class P2-03 notes.

Phase 1 after P1-06, one at a time: P1-05, P1-07, P1-10, P1-08, P1-03 (its speed gate is now met over HTTP/2).

## How CI runs now

- The root runs `~/.claude/orchestrate/esta/bin/ci-when-calm.sh <worktree> <pr> <slot> [jobs]`. It waits for its own lock and a load under 5 (1 minute) and 6 (5 minutes), then calls `tools/ci-local.sh`, which since #64 also takes `/tmp/ci-local/lock` and caps vitest workers at 3.
- Before each merge, compare the PR's changed files with what `main` changed since its base. When they overlap (it was `packages/core/package.json` and the lockfile every time today), rebase, check `git range-diff`, push with lease, and run CI at the rebased head.
- Since #73, ci-local retries a `db reset` 502 once (it does not always cure it, #88). Since #86, the e2e job retries a failed test once and lists flaky tests, and Storage is emptied before each seed.
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
