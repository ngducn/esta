# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read `docs/plan/trail/standing-orders.md` (the 2026-10-19 updates, newest first: 18:00, 16:45, 14:10, 08:45, 00:20), `verification-tiers.md`, `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, `ARCHITECTURE.md` once #187 merges, and `docs/plan/STATUS.md`. Briefs are in `~/.claude/orchestrate/esta/briefs/`; the root's checklist is `~/.claude/orchestrate/esta/todo.md` (newest section at the bottom).

## Where the run is (written 2026-10-19 17:50 +07)

Main is 530b377. Plan progress: 41 of 73 plan PRs merged (Phases 0, 1 and 2 complete; Phase 3 9/18; Phase 4 1/6; Phases 5 and 6 not started). Estimate given to Ryan: code-complete around 26 to 29 October at two usage windows a day, plus his gates.

Merged today after the morning: #169 rulings (a0cf408), #164 wizard and Phase 2 exit (3288046), #172 lease detail with amend, terminate and renew (538d79c), #170 room order (5d19277).

**Ryan's words since the morning (each recorded in standing orders):**
- 14:10: "ill trust your judgement on this phase so go ahead and go full autonomous". The root merges Phase 3 and 4 PRs, review-gated ones included, on a clean verdict and green CI; human gates stay his.
- On the assistant: "Both, connector first"; "Acts as you after chat OK"; "Move-in first, then ongoing"; approach 1. Design is `docs/spec/CONNECTOR.md` (257fdaf), folded into the Phase 5 re-cut.
- 16:4x, after the outsider code review rated readability and quality 6.5: "i don't want this particular incident to occur again ... include this into our own CI" and "6.5 for quality ... is unacceptable". Quality gate, a codebase-health lane in every round, and the cleanup round now (16:45 update).
- 17:39: "i just manual reset ... monitor usage at 2% now, use until 80%".
- 17:5x: "is there a way we can speed this up?" Lighter evidence and lanes (18:00 update).
- Pending his go: one live run of the extraction eval on the private fixtures after #205 merges (the old numbers measured the spike prompt).

Open, with the next step for each:

- **#187 quality gate, head 5ec9af0 (fix-forward 1 running, Opus, no stack, briefs/pr187-ff1.md).** Round 1 lane found the ratchet sound but bypassable (aliased useTransition starters, multi-line imports, third duplicate exports, result shapes, upload primitives, test-path classification, false positives, baseline key deletion, ARCHITECTURE.md template contradictions). Next: scoped round 2 (rerun the lane's scratch bypasses from /tmp/swarm-pr187-ev/), CI, merge. The second of #187 and #205 to land runs `pnpm quality --update`.
- **#201 one area and length parser, closes #182 #199 #200, head adf01d5.** Round 1 S+H found the English editor regression; fix-forward done; round 2 scoped PASS. Next: the short Sonnet live lane (running, waits for slot 3), then CI on slot 3, then merge.
- **#205 one extraction request, real failure cause, closes #183 #185, head bebb0e5.** Round 1 PASS; the small fix-forward (infrastructure error text no longer reaches the model; stale s5 doc line) is done, red then green, 21 replay hashes identical. Next: the root reruns /tmp/swarm-pr205-ev/tests on bebb0e5, then CI, then merge.
- **#177 expenses (P4-02), now 1910893 after the rebase (fix-forward 1 running, Opus, slot 5, briefs/pr177-ff1.md).** Behavior lanes passed; the health lane failed it (non-atomic vendor+expense, ceiling in SQL only, third upload flow, copies of useOnline, amount text and soft delete, tenth toast provider, finance branch in the shared frame, 551-line sheet). Next: round 2 (scoped; LLM lane because SQL money paths changed), CI, merge.
- **#181 deposits (P3-18), head ccb60d3 (fix-forward 1 running, Opus, slot 3 after the #201 live lane, briefs/pr181-ff1.md).** Both behavior lanes passed; fix-forward carries health items only (shared e2e helpers, one issued-and-owing rule, HeldDepositTotal component, names, too_large via the existing core ceiling). Next: round 2 per the 18:00 rule, CI, merge.
- **#195 single billing planner (owner running, Opus, code first, slot 5 after #177, briefs/single-planner-195.md).** Root decision: the database is the single planner.
- **Queue, in order:** #188 action kit and #193 action hook (after #177 and #181 land; P3-11 waits for them so new actions do not need a ratchet raise); then P3-11 VietQR bills; #208 per-household test clock (parallel e2e); #184 extraction acceptance as one RPC (after #201); #189, #190 (advanced by #177), #191, #192, #194, #196, #198; #197 migration squash before the first deploy; rerun the outsider review at the end (target 8.5+).
- **#61** stays parked (P5-11). **#149** (land use term ranges) still needs its own PR before real certificates are entered.

## Rules added this session (read before acting)

- **Codebase-health lane every round, every tier** (`briefs/lane-health.md`, Sonnet, no stack): a second way to do something that has a home, a rule written twice, logic in the wrong layer, a multi-row write outside one transaction, or a file over the size limit blocks. Owners self-review with the thermo-nuclear standard (owner-brief step 5).
- **Evidence budget (18:00):** owners: two to four screenshots, no videos, Lighthouse only for loading-path changes (three runs per side), only touched specs. Live lanes probe the risk; build trunk only when needed. Round 2 after a small fix-forward with repro scripts: rerun the scripts plus CI. CI after a rebase with no file overlap and an identical range-diff: check and db jobs only.
- **Landing grant (14:10):** root merges Phase 3 and 4 on a clean verdict at the exact head plus green CI (`gh pr merge --squash --match-head-commit`).
- **Slots:** only 3 and 5 besides esta-1; owners and lanes take fixed slots; never 2 or 4.
- **Classifier:** the auto-mode classifier blocked editing permission settings and once blocked ci-when-calm.sh; Ryan approved running CI; he has been asked to add `Bash(~/.claude/orchestrate/esta/bin/ci-when-calm.sh:*)` himself.

## How CI runs now

`until bin/slot-free.sh <n>; do sleep 30; done; bin/ci-when-calm.sh <worktree> <pr> <slot>` in the background, log in /tmp/root-ci/. Before each merge: `git merge-tree`, file overlap with main's new commits, range-diff after a root rebase, push with lease.

## Budget

`bin/usage-pct.sh` now reads `~/.claude/orchestrate/esta/usage-window.json` (Ryan's manual reset at 17:39, window to 22:39 +07) and reported 8.6% at 17:48. Cap for this window: stop spawning at 72%, wrap up owners at 78%, nothing past 80%. A background `wait-usage.sh 72` wakes the root. The real block resets at the time a 429 names, not on ccusage's hour; never spawn into the last 20 minutes of a block.

## Gotchas learned this run

- ccusage cannot see a manual reset or Anthropic's real block boundary; trust Ryan's /usage and write a window file when he resets.
- The agents that wrote today's PRs never saw each other's work; the health lane is what catches duplicates.
- `next dev` fails on @swc/helpers in fresh worktrees (#127); use production builds. Kong sometimes 502s on db:reset (#88); stop and start the stack.
- Background agents can report "completed" while children run; TaskStop them after their final report.
