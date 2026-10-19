# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read `docs/plan/trail/standing-orders.md` (the 2026-10-19 updates, newest first: 18:00, 16:45, 14:10, 08:45, 00:20), `verification-tiers.md`, `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, `ARCHITECTURE.md` (merged with #187), and `docs/plan/STATUS.md`. Briefs are in `~/.claude/orchestrate/esta/briefs/`; the root's checklist is `~/.claude/orchestrate/esta/todo.md` (newest section at the bottom).

## Where the run is (written 2026-10-19 19:00 +07, before Ryan restarted the Mac)

Main is 331ef3a. Plan progress: 41 of 73 plan PRs merged (Phases 0, 1 and 2 complete; Phase 3 9/18; Phase 4 1/6; Phases 5 and 6 not started), plus three cleanup-round PRs today. Estimate given to Ryan: code-complete around 26 to 29 October at two usage windows a day, plus his gates.

**The restart wiped /tmp.** Every worktree under /tmp/owner-*/wt and every lane evidence folder is gone. First run `git worktree prune` in the main repo. Recreate a worktree per branch with `git worktree add /tmp/owner-<x>/wt origin/<branch>` (or `-b` for new work). The build script moved to `~/.claude/orchestrate/esta/bin/build.mjs` (the briefs already point there). The #181 and #177 lane evidence is in `~/.claude/orchestrate/esta/saved/evidence-2026-10-19.tgz`; the outsider reviewer brief is `saved/thermo-BRIEF.md`. After the restart Docker may bring old stacks back: check `docker ps` and stop slot 3 and 5 stacks before any run.

Merged since the 17:50 handoff:
- #205 one extraction request, real failure cause (closes #183 #185), bebb0e5.
- #201 one area and length parser (closes #182 #199 #200), adf01d5.
- #187 the code-quality gate: `pnpm quality` in `pnpm check`, ratcheted `quality/baseline.json`, `ARCHITECTURE.md`. Merged at 331ef3a after the root rebased it, lowered the baseline (counts fell with #201 and #205) and fixed one semantic conflict (the decimal-parser rule pointed at `parseAreaInput`, which #201 removed; now `parseMeasureInput`). CI 5/5 before the rebase; `pnpm check` green after (2,572 tests). From now on every PR runs the gate; falls need `pnpm quality --update`, raises need `--allow-raise "<reason>"`.

**Ryan's words since the morning (each recorded in standing orders):**
- 14:10: "ill trust your judgement on this phase so go ahead and go full autonomous". The root merges Phase 3 and 4 PRs on a clean verdict and green CI; human gates stay his.
- On the assistant: "Both, connector first"; "Acts as you after chat OK"; "Move-in first, then ongoing"; approach 1. Design is `docs/spec/CONNECTOR.md`, folded into the Phase 5 re-cut.
- 16:4x: "i don't want this particular incident to occur again ... include this into our own CI" and "6.5 for quality ... is unacceptable". Quality gate (now merged), health lane every round, cleanup round now.
- 17:39: "i just manual reset ... use until 80%".
- 17:5x: "is there a way we can speed this up?" Lighter evidence and lanes (18:00 update).
- 18:5x: "wrap up im restarting my mac a bit its getting hot".
- Pending his go: one live run of the extraction eval on the private fixtures (#205 has merged, so it is ready).

Open, with the next step for each:

- **#177 expenses (P4-02), head d2b3711, fix-forward 1 code-ready.** All seven health items done: one `save_expense` definer function writes payee, receipt document and expense in one transaction (red first); `MAX_AMOUNT_VND` in core replaces `MAX_LIST_RENT_VND` with a `too_large` field message; one `useDocumentUpload`; one helper each for useOnline, amount prefill, soft delete, document row, test stack client; one ToastHost and ExpenseHost in the frame; expense sheet 551 to 362 lines. Checks green on the owner's side (check, db:test 1381, seed:check, 11 e2e specs, Lighthouse flat). Filed #207 [low]. Next: rebase onto 331ef3a and run `pnpm quality` (it was not on main when the owner worked; expect a fall, or a raise to justify), then round 2: health lane plus an LLM lane on the SQL money path (`save_expense`), then CI, merge.
- **#181 deposits (P3-18), head a9276ca, fix-forward 1 code written, not yet verified on a stack.** All five health items are pushed as commits c49aa0e (shared e2e helpers and one integration sign-in), 2cd71ff (RecordDepositRefusal, kinds from core), 5f5528e (HeldDepositTotal component), 069fa6d (one issued-and-owing rule: core `openInvoicesOldestFirst` on the collections board and rental tab), a9276ca (too_large past 1.000.000.000.000 ₫). Next: a fresh owner on slot 3 rebases onto main, runs `pnpm check` (gate), `ESTA_SLOT=3 pnpm db:test`, the touched specs (deposits, lease-detail, collections, properties-list), then round 2 per the 18:00 rule (repro scripts from the saved tarball), CI, merge.
- **#195 single billing planner, PR #209, head c41e43f, code written, nothing run on a stack yet.** `public.lease_schedule` and `private.issue_invoice` in migration 20261007401900; option D in the seed (real nightly billing 2025-10-01 to 2026-10-07, the six Dĩ An drafts issued on 2026-10-03 through the shared issue path); TypeScript planner and parity harness deleted; lease page, rental tab, property list, tax attribution and /dev/core read the database's periods; `pnpm check` green. Not run: the 28-assertion lease_schedule pgTAP, the seed SQL, seed:check, integration and e2e, the snapshot diff, `pnpm db:types` (the type was added by hand). The owner's scripts and trail are in https://github.com/ngducn/esta/pull/209#issuecomment-6266655384. Next: a fresh owner on slot 5 runs db:reset (time it), db:types, db:test, db:seed:check, web integration tests, the lease-detail, leases, collections, record-payment and dev-core specs through heavy.sh, the main-versus-head snapshot diff, and Lighthouse 3 runs per side on /properties and the Dĩ An property page; then a rigorous round (LLM, health), CI, merge.
- **Queue, in order:** #188 action kit and #193 action hook (after #177 and #181 land; P3-11 waits for them so new actions do not need a ratchet raise); then P3-11 VietQR bills; #208 per-household test clock (parallel e2e); #210 gate follow-ups; #184 extraction acceptance as one RPC; #189, #190, #191, #192, #194, #196, #198, #207; #197 migration squash before the first deploy; rerun the outsider review at the end (target 8.5+, brief in `saved/thermo-BRIEF.md`).
- **#61** stays parked (P5-11). **#149** (land use term ranges) still needs its own PR before real certificates are entered.

## Rules added this session (read before acting)

- **Quality gate on every PR** (`pnpm quality`, inside `pnpm check`). The second PR to land after a fall runs `pnpm quality --update`. A rebase can break the gate's registry semantically, as #201 did to #187: run `pnpm check` after every root rebase.
- **Codebase-health lane every round, every tier** (`briefs/lane-health.md`, Sonnet, no stack): a second way to do something that has a home, a rule written twice, logic in the wrong layer, a multi-row write outside one transaction, or a file over the size limit blocks. Owners self-review with the thermo-nuclear standard (owner-brief step 5).
- **Evidence budget (18:00):** owners: two to four screenshots, no videos, Lighthouse only for loading-path changes (three runs per side), only touched specs. Live lanes probe the risk; build trunk only when needed. Round 2 after a small fix-forward with repro scripts: rerun the scripts plus CI. CI after a rebase with no file overlap and an identical range-diff: check and db jobs only.
- **Landing grant (14:10):** root merges Phase 3 and 4 on a clean verdict at the exact head plus green CI (`gh pr merge --squash --match-head-commit`). "Base branch was modified" right after a push is GitHub racing; retry after a few seconds.
- **Slots:** only 3 and 5 besides esta-1; owners and lanes take fixed slots; never 2 or 4.
- **Keep owner trails in the branch.** Owners kept `decisions.tsv` and range-diffs under /tmp and lost them in the restart. New briefs should put the owner's trail rows in the PR body or a commit, not only in /tmp.
- **Classifier:** the auto-mode classifier once blocked ci-when-calm.sh; Ryan approved running CI and was asked to add `Bash(~/.claude/orchestrate/esta/bin/ci-when-calm.sh:*)` himself.

## How CI runs now

`until bin/slot-free.sh <n>; do sleep 30; done; bin/ci-when-calm.sh <worktree> <pr> <slot>` in the background, log in /tmp/root-ci/ (recreate the folder after the restart). Before each merge: `git merge-tree`, file overlap with main's new commits, range-diff after a root rebase, `pnpm check` after the rebase, push with lease.

## Budget

`bin/usage-pct.sh` read 42.0% at 18:52 in Ryan's manual-reset window (17:39 to 22:39 +07, `~/.claude/orchestrate/esta/usage-window.json`). Stop spawning at 72%, wrap up owners at 78%, nothing past 80%. After 22:39 the window file no longer applies and the meter falls back to ccusage blocks; trust Ryan's /usage over it. Never spawn into the last 20 minutes of a block.

## Gotchas learned this run

- `slot-free.sh` reported slot 5 free twice while a stack was still up (the #209 owner saw it). Confirm with `docker ps` before starting a stack; fixing the script is a small root task.
- A Mac restart wipes /tmp: worktrees, lane evidence, owner trails and CI logs. Push before a restart; prune worktrees after.
- ccusage cannot see a manual reset or Anthropic's real block boundary; trust Ryan's /usage and write a window file when he resets.
- The agents that wrote today's PRs never saw each other's work; the health lane is what catches duplicates.
- `next dev` fails on @swc/helpers in fresh worktrees (#127); use production builds. Kong sometimes 502s on db:reset (#88); stop and start the stack.
- Background agents can report "completed" while children run; TaskStop them after their final report.
