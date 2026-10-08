# Resume notes for the Esta v1 run

Paused 2026-10-08 about 07:30 +07 under the operator's usage cap for that session (30% of one 5-hour block, tracked with `ccusage`; see the trail row "budget"). Resume with `skills/poteto-mode/playbooks/session-pickup.md`. Read `docs/plan/trail/standing-orders.md` (including its 08:40 update), `owner-brief.md`, `lane-brief.md` and the tail of `decisions.tsv` first.

## Where the stack is

- `main` holds P0-01 to P0-11 (tip `c3353f2` plus this trail commit).
- P0-12 (base components) is PR #29, base `main`, branch `esta/p0-12-base-components`, head `f40e556`. It is waiting for the operator's review and merge click. Local CI is green on all five jobs at that head. Three verification rounds ran (`/tmp/swarm-p0-12/worker-{1,2,3}/`). All ten live lanes pass, and the toast's live region exists before the first toast. Two fix-forwards were used, which is the maximum.
  - The one open item is the operator's waiver call: `/dev/components` LCP has a median of 2767 ms against the 2.5 s budget. JS is 176 KB transferred, under 200 KB, and `/` is flat against trunk. The owner measured a floor of about 2.53 s for a three-component page and about 0.2 s from the serif font, filed as #31 for P0-14. The root recommends accepting it for this dev-only page. If the operator refuses, the next session splits the catalogue or shrinks the serif subset as a new round.
  - Decisions in the PR body for the operator: the native date picker (`showPicker`, no calendar dependency), the sheet shadow token in `globals.css`, `cn()` reading generated token tables (`pnpm tokens:build` now writes `apps/web/src/lib/cn-tables.ts`), test files exempt from `esta/no-jsx-literals`, and dialogs, the sheet and the toast loading on first use.
  - Review media: `~/.claude/orchestrate/esta/media/P0-12/P0-12-review.mp4` (51.8 s, four viewport and theme segments, `3tr5` and undo) and 11 `P0-12-review-*.png` screenshots.
  - Not run: `/impeccable critique`. `bundle.spec.ts` counts the 39 KB `noModule` polyfill that modern browsers skip, so its byte count for a route reads about 39 KB higher than Lighthouse's.
  - Owner worktree: `.claude/worktrees/agent-ad05b1a4586edfa13`, with its own `decisions.tsv` there.
- Next PRs in order: P0-13 (domain composites, on P0-12), P0-14 (app shell; issues #23, #28, #31), P0-15 (agent worker skeleton, spike S1, held for interrogate), P0-16 (Phase 0 exit; issues #11, #25, #30).

## Budget

- Finishing P0-12 took about 13% of a 5-hour block: one Opus owner, two Opus fix-forwards and four Sonnet lanes. A full PR such as P0-13 should be planned at 15 to 25%.
- Usage check: `python3` over `ccusage blocks --active --json --offline`. 100% means the block of 2026-10-06T22:00Z, which hit the limit at $121.11 and 379.9M tokens. Take the larger of the cost ratio and the token ratio.

## How to work now

- GitHub Actions is disabled for the repo. CI is `tools/ci-local.sh <worktree> <pr> <slot>`.
- Every new PR targets `main` once its parent is on `main`. The operator merges only PRs whose base is `main`.
- Round 1 per PR is one owner, then one Sonnet lane covering the live lanes and perf, then an audit lane only for security, money and data PRs (Opus). Later rounds are one Sonnet lane. Owners do not babysit CI.
- A fresh worktree may need a `node_modules/@swc/helpers` symlink before `next dev` works (#30).

## Rules learned during the run

- Migration versions `20261007<phase><two-digit PR><seq>00`, increasing in stack order.
- Docker has 8 GB shared with the `ekh-*` project; about 1 GB per Supabase stack; never touch `ekh-*`. A stack named `esta-1` was already running at this session's start and was left alone.
- Stop processes by recorded PID only, never `pkill` by pattern.
- Isolated gstack browse per lane via `BROWSE_STATE_FILE` and `BROWSE_PORT`.
- After a `supabase/config.toml` or `supabase/templates` change, or when switching a slot between checkouts, do a full `db:stop` then `db:start`.
- Temporary files go under `/tmp/owner-<pr>/` or `/tmp/swarm-<pr>/`, not a shared scratchpad.

## Waiting for Ryan

See `docs/plan/STATUS.md` on `main`.
