# Resume notes for the Esta v1 run

Paused 2026-10-16 about 00:35 +07 at about 45% of one 5-hour block, the pause line under the operator's 50% cap for that run. Resume with `skills/poteto-mode/playbooks/session-pickup.md`. Read `docs/plan/trail/standing-orders.md` first, especially its "Update 2026-10-15 23:40 +07" section, then `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, and `docs/plan/STATUS.md`.

## Where the run is

- Paused 2026-10-17 about 01:10 +07 at 73.7% of the block that started 2026-10-16T16:00Z, over the operator's 70% cap (standing orders, 2026-10-16 10:30). The overshoot came from a long Opus owner and verifier lanes between two usage checks; check usage at every drain, not only at spawn time.
- Phase 0 is complete: P0-01 to P0-16 merged (P0-13 removed). `main` is at `d8bfb41` plus this pause commit.
- Phase 1: P1-01 merged (`47d79f3`, Maps link parsing behind SSRF guards). P1-04 (properties list with cover photos, Seq 02) was in build on slot 5 and got a stop order: its branch `esta/p1-04-properties-list` holds the pushed work and a final `wip(p1-04)` commit; read its owner's final report in the trail and `/tmp/owner-p1-04/`.
- Merged this run: #43, #44, #42 (P0-15), #47, #50 (P1-01), #48 (P0-16). The system design and release estimate wait for the operator's decisions: https://claude.ai/artifact/9Bufn7L33HmJueDyXVvqGB.

## Next, in order

1. P1-04 (PR #52): if it is not merged yet, finish its verdict. Open items at handoff: the live verifier's report, local CI green at a load average under 5, and the LCP call (head 3390 ms against trunk 2573 ms; the page's own floor is 2.8 to 3.0 s from shell causes now tracked in #56, so the root's default is to accept the miss for P1-04 and fix the floor in #56 before P3-16). Low audit findings for a follow-up: search scans every household instead of filtering by household first, archived properties keep signable photos, one pgTAP update/delete scoping test cannot fail alone, and Lighthouse JSON holds signed URLs.
2. Phase 1 on two parallel UI tracks (dependencies are real code dependencies, not only Seq): P1-09 and P1-06 together after P1-04; then P1-05, P1-07 and P1-08, two at a time; then P1-10; then P1-03 (Phase 1 exit). Stop the operator's slot 2 app while two stacks build.
3. A pure-core track with no Supabase stack, in parallel with step 2: P3-05 (VietQR encode and decode from spike S4's vectors) and P3-02 (lease schedule core). Both are risk-first exceptions to vertical slicing and sit directly under their Phase 3 UI slices; P3-02 is on the interrogate list and gets an Opus audit.
4. Issues to fold in where they fit: #49, #51 (add a machine-wide lock to ci-local), #54 (trim agent tool paths before P2-03), #55, #56; and move pr-media.sh from ~/.claude/orchestrate/esta/bin into tools/.

## Model policy (operator, 2026-10-17: "check weekly usage and fable usage, please think ahead until reset and utilize the best tokens you can until reset of this week, please speed this up a bit")

- Owners on Fable (`model: "fable"`), which had no use this week; verifiers on Sonnet; audits on Opus.
- Measure Fable's cost per PR on the first two owners with ccusage. If a Fable owner moves a block more than 25 points, return owners to Opus.
- The plan's weekly limit and reset time are not visible locally; ask the operator for the numbers from /usage and plan the week's remaining runs from them.

## Gotchas learned this run

- Run at most two Supabase stacks besides `esta-1` on the 8 GB Docker; a fourth stack goes unhealthy. Stop the operator's slot 2 app while agents build, and relaunch it at pause.
- Local CI e2e fails on 30 s timeouts when the load average is above about 8; run it when `sysctl -n vm.loadavg` shows under 5 (#51). The background wait-then-run pattern in this conversation's last CI rerun works.
- Never use slot 4 (port 4317 collides with `ekh-phoenix`).
- The permission classifier denies closing GitHub issues; creating issues and commenting works.

## Budget

- This run spent about 45% of a block. Two Opus owners that spawned their own subagents (the planner fanned out section writers; the P0-14 owner ran Lighthouse and review lanes) burned about 25 points an hour. Brief owners with "spawn no subagents" unless the brief names them, and give writers a timebox.
- One full UI PR with a verifier and an audit lane cost about 20 to 25%. A docs re-plan cost about 10%. A small lint PR with a verifier cost about 5%.
- Usage check: `python3` over `ccusage blocks --active --json --offline`. 100% means the block of 2026-10-06T22:00Z, which hit the limit at $121.11 and 379.9M tokens. Take the larger of the cost ratio and the token ratio.

## Gotchas learned this run

- The permission classifier denies closing GitHub issues, and denied reading a `pnpm check` log and rerunning `pnpm check` for its exit code on `main`. Creating issues and commenting on PRs worked.
- `ls` is aliased to `eza`, where `-t` takes a field name; `ls -t /tmp` lists the current directory. Use `/bin/ls` for time sorts.
- Two local Supabase stacks starting at once can fail `db reset` with a Supabase CLI "Error status 502" while containers restart; rerun once.
- The `main` checkout's `node_modules` goes stale after a merge that adds dependencies; run `pnpm install --frozen-lockfile` there before `pnpm check`.
- Old agent worktrees were removed; their HEADs are pinned at `refs/archive/*` and their untracked trails are in `~/.claude/orchestrate/esta/trails/`.
- Earlier gotchas still hold: migration versions now follow inventory `Seq` (owner-brief.md); Docker has 8 GB shared with `ekh-*`; stop processes by PID only; a fresh worktree may need the `@swc/helpers` symlink (#30).
