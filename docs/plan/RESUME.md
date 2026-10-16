# Resume notes for the Esta v1 run

Paused 2026-10-16 about 00:35 +07 at about 45% of one 5-hour block, the pause line under the operator's 50% cap for that run. Resume with `skills/poteto-mode/playbooks/session-pickup.md`. Read `docs/plan/trail/standing-orders.md` first, especially its "Update 2026-10-15 23:40 +07" section, then `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, and `docs/plan/STATUS.md`.

## Where the run is

- 2026-10-16 run done: P0-14 merged (`064303c`) and the design refresh merged (`15a37e9`, PR #39). `main` holds P0-01 to P0-14 plus the redesign. P0-13 is removed by the re-slice.
- The new look: DESIGN-BRIEF §5 and §8 and DESIGN.md describe it; the approved canvas is https://claude.ai/artifact/5WMgbh8EwS9T3eiY1SkM3c and its sources are in `docs/design/redesign-2026-10/`; shipped screenshots are in `docs/design/redesign-2026-10/shipped/`; photo sources are in the ATTRIBUTION.md beside the photos. UX reasoning is `docs/plan/trail/ux-daily-use.md`.
- The app runs on slot 2 from the `main` checkout for the operator to try (http://localhost:3200, codes at http://localhost:54524). Stop it with `ESTA_SLOT=2 .claude/skills/verify/scripts/cleanup.sh`.

## Next, in order

1. #40 first: make `tools/ci-local.sh` run in a fresh worktree at the PR head. PR #39's local CI passed `check` in a dirty worktree while a fresh checkout failed.
2. P0-15 (agent worker skeleton, held for interrogate; its section was rewritten by the re-slice) and P0-16 (Phase 0 exit; issues #25, #30, #35, #37, #38).
3. Issue #36 before any Phase 1 owner starts; the operator decides S6 order and whether the landing grant extends to Phase 1. P1-04 (properties list) is the first slice that makes Tài sản real and should carry cover photos.
4. Design polish in #41.

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
