# Resume notes for the Esta v1 run

Paused 2026-10-16 about 00:35 +07 at about 45% of one 5-hour block, the pause line under the operator's 50% cap for that run. Resume with `skills/poteto-mode/playbooks/session-pickup.md`. Read `docs/plan/trail/standing-orders.md` first, especially its "Update 2026-10-15 23:40 +07" section, then `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, and `docs/plan/STATUS.md`.

## Where the run is

- 2026-10-17 05:20 +07 the session limit stopped every agent mid-run. Nothing pushed was lost; the root saved unpushed work as `wip:` commits at 09:25.
- main is at the latest docs commit; Phase 0 complete, P1-01 merged.
- Open PRs and branches, with the next step for each:
  - #52 P1-04 at eb62881: round 1 verdict done (ISSUES). Next: a fresh Opus fix-forward owner from `~/.claude/orchestrate/esta/briefs/p1-04-ff.md`, then a scoped review and local CI at load under 5.
  - #57 P3-05 VietQR at 89e8e50: code-ready, owner's live /dev/core check and local CI not done, verifier died. Next: Opus verify-and-audit lane (money), then local CI on a free slot.
  - #59 P3-02 lease schedule at c73e035: code-ready, verifier died. Next: Opus verify-and-audit lane (interrogate list), then local CI.
  - #58 P3-06 statement matching at b4eee5c (wip): owner died mid-build. Next: fresh Opus owner to finish from the branch and its trail.
  - `esta/p5-11-number-guard` at 43f64ca (wip, no PR): fresh Opus owner to finish and open the PR.
  - `esta/p2-01-extraction-spike` at c9e8cba (wip, no PR): fresh Opus owner to finish (live calls allowed for the spike).
  - #60 Phase 2 re-cut at 2210e72: verifier died. Next: Opus or Sonnet verifier, then merge.
- Owner trails for the dead agents are in `~/.claude/orchestrate/esta/trails/<agent>/decisions.tsv`.

## Model policy (operator, 2026-10-17: "check weekly usage and fable usage, please think ahead until reset and utilize the best tokens you can until reset of this week, please speed this up a bit")

- Superseded 2026-10-17 09:25: no Fable. Owners on Opus, verifiers on Sonnet, audits on Opus.
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
