# Resume notes for the Esta v1 run

Paused 2026-10-16 about 00:35 +07 at about 45% of one 5-hour block, the pause line under the operator's 50% cap for that run. Resume with `skills/poteto-mode/playbooks/session-pickup.md`. Read `docs/plan/trail/standing-orders.md` first, especially its "Update 2026-10-15 23:40 +07" section, then `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, and `docs/plan/STATUS.md`.

## Where the run is

- Playbook is Autopilot-full. PRs branch off `main`, merge then branch, no stacks. The operator's landing grant covers Phase 0 and the plan docs only; Phase 1 needs the operator's click unless the grant is extended (issue #36).
- `main` is at `d324110` plus this pause commit. P0-01 to P0-12 are merged. P0-13 is removed. The plan is re-sliced: `docs/plan/trail/slice-matrix.md` and `pr-inventory.md` win over the older plan sections, and the new `Seq` column gives delivery order.
- P0-14 (PR #32, branch `esta/p0-14-app-shell`, head `270133b`) is parked. Verdict lanes at `44f65a7` were clean: live verifier PASS, auth audit with no blocking finding. The only later commit changes `e2e/auth.spec.ts`. Local CI e2e failed twice at `270133b`, at load 16 and again at load 4. The failures are two FND-1 invite tests in `auth.spec.ts` that stay on "Tạo gia đình" after create-household. Logs in `/tmp/ci-local/pr-32-270133b/`. Owner trail in `.claude/worktrees/agent-a6fb7c198e3eb518c/decisions.tsv`.

## Next, in order

1. P0-14. A fresh owner reproduces the two invite failures at `270133b` against `main`, finds the cause (the PR moved sign-out and locale into an account menu and dropped the date line from `/sign-in` and `/onboarding`, so check those paths first), fixes it with a red test, reruns local CI once, and a scoped Sonnet lane verifies the fix-forward diff only. Then merge under the grant with `--match-head-commit`.
2. Issue #36. Fix the re-sliced plan before any Phase 1 owner starts: S6 order (operator's call), stale Depends-on lines in Phase 1 Seq 01 to 05, and the other listed gaps. Section drafts from stopped writers may be in `/tmp/owner-replan/`.
3. P0-15 (agent worker skeleton, held for interrogate) and P0-16 (Phase 0 exit; issues #25, #30, #35, #37).

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
