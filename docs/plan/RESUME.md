# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read `docs/plan/trail/standing-orders.md` (every 2026-10-17 update; 11:25 and 11:55 are the newest), `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, and `docs/plan/STATUS.md`. Briefs for every owner and lane of this session are in `~/.claude/orchestrate/esta/briefs/`; the root's checklist is `~/.claude/orchestrate/esta/todo.md`.

## Where the run is (2026-10-17, about 12:45 +07)

Merged this session: #57 P3-05 VietQR (`6f420f2`), #60 Phase 2 re-cut (`aae66e9`), #59 P3-02 lease schedule (`9476d68`), #64 lint-test flake and CI lock (`f1579b7`), #52 P1-04 properties list (`8cbd2ed`, LCP miss accepted by the operator and gated at P1-03), #58 P3-06 statement matching (`0923f94`), #67 P2-01 extraction spike (`671d744`), #73 CI cleanup closing #65, #66 and #71 (`70641ef`).

Open, with the next step for each:

- #69 shell LCP (closes #56) at `b188d1a`: code-ready. Next: one Sonnet lane with a Lighthouse re-measure at load under 5 (Tài sản, Home, Thu tiền, head against trunk), local CI, merge. Then a fresh owner for #68 (cover photo bytes). #56 and #68 must both close before P1-03 merges.
- #72 P1-09 map at `cf07c3d`: owner stopped at the pause. Next: a fresh Opus owner from the branch and its trail (`~/.claude/orchestrate/esta/trails/p1-09-decisions.tsv`) runs `e2e/properties-map.spec.ts`, `pnpm check`, design and axe, screenshots, Lighthouse and the PR body; `next dev` fails on `@swc/helpers` in /tmp worktrees, so use `/tmp/owner-p1-09/build.mjs` and `scripts/web.ts start`. Then one Sonnet live lane, local CI, merge, then P1-06.
- #61 P5-11 number guard at `a8d00d8`: parked after both granted rounds; the root recommends a redesign over rendered plain text (PR #61 comment). The operator decides: here or inside P5-03.

Phase 1 after P1-09, one at a time because each depends on the last: P1-06, P1-05, P1-07, P1-10, P1-08, P1-03.

## How CI runs now

- The root runs `~/.claude/orchestrate/esta/bin/ci-when-calm.sh <worktree> <pr> <slot> [jobs]`. It waits for its own lock and a load under 5 (1 minute) and 6 (5 minutes), then calls `tools/ci-local.sh`, which since #64 also takes `/tmp/ci-local/lock` and caps vitest workers at 3.
- Before each merge, compare the PR's changed files with what `main` changed since its base. When they overlap (it was `packages/core/package.json` and the lockfile every time today), rebase, check `git range-diff`, push with lease, and run CI at the rebased head.
- Since #73, ci-local retries a `db reset` 502 once on its own.

## Budget

- `~/.claude/orchestrate/esta/bin/usage-pct.sh` was rescaled at 11:55 to the operator's /usage reading (65% real when the old scale read 78.8%). Stop spawning at 80%, pause at 86%, per block.
- This block (02:00Z to 07:00Z) reached 80% at about 12:30 +07 with up to seven agents running. Opus owners cost about 6 to 10 points each per hour; scoped review lanes 2 to 4.

## Gotchas learned this run

- At most two Supabase stacks besides `esta-1`. CI counts as one while it runs; hold queued CI when two owners hold stacks.
- A bash script edited in place keeps running its old text if it was already started.
- Owners' `next dev` 500s on a missing `@swc/helpers` in fresh worktrees (#30 class); production builds work for screenshots.
- Never slot 4. The permission classifier denies closing issues and any command naming `fixtures-private`.
- Issues waiting for the operator to close: #3, #4, #8, #9, #10, #11, #16, #31, and #36 after its one open question.
