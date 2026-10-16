# Resume notes for the Esta v1 run

Paused 2026-10-16 about 00:35 +07 at about 45% of one 5-hour block, the pause line under the operator's 50% cap for that run. Resume with `skills/poteto-mode/playbooks/session-pickup.md`. Read `docs/plan/trail/standing-orders.md` first, especially its "Update 2026-10-15 23:40 +07" section, then `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, and `docs/plan/STATUS.md`.

## Where the run is

- Paused 2026-10-17 about 01:10 +07 at 73.7% of the block that started 2026-10-16T16:00Z, over the operator's 70% cap (standing orders, 2026-10-16 10:30). The overshoot came from a long Opus owner and verifier lanes between two usage checks; check usage at every drain, not only at spawn time.
- Phase 0 is complete: P0-01 to P0-16 merged (P0-13 removed). `main` is at `d8bfb41` plus this pause commit.
- Phase 1: P1-01 merged (`47d79f3`, Maps link parsing behind SSRF guards). P1-04 (properties list with cover photos, Seq 02) was in build on slot 5 and got a stop order: its branch `esta/p1-04-properties-list` holds the pushed work and a final `wip(p1-04)` commit; read its owner's final report in the trail and `/tmp/owner-p1-04/`.
- Merged this run: #43, #44, #42 (P0-15), #47, #50 (P1-01), #48 (P0-16). The system design and release estimate wait for the operator's decisions: https://claude.ai/artifact/9Bufn7L33HmJueDyXVvqGB.

## Next, in order

1. Resume P1-04 with a fresh Opus owner from its branch (consolidated scope: the owner brief in this conversation's decisions row, the stopped owner's report, `docs/plan/trail/standing-orders.md`). Then its verifier (Sonnet) and Opus data audit (storage policies, signed URLs, seed service role).
2. Then Phase 1 in Seq order: P1-09, P1-06, P1-05, P1-07, P1-10, P1-08, P1-03 (Phase 1 exit). P2-01 depends on P1-09.
3. Issues to fold in where they fit: #49 (photo ignore scope, tab inset), #51 (eslint tests time out under load; add a machine-wide lock to ci-local), #54 (trim paths in the agent tool policy before P2-03).

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
