# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read the 2026-10-30 retro rules in standing-orders.md first. Read:
- `docs/plan/trail/standing-orders.md` (newest at the bottom: 2026-10-30 retro, 2026-10-27 merge-and-stop);
- `docs/plan/redesign-2026-11.md` (the redesign plan, RD-1 to RD-6);
- `verification-tiers.md`, `owner-brief.md`, `lane-brief.md`;
- the tail of `decisions.tsv`;
- `ARCHITECTURE.md`, `docs/spec/AGENT.md` (§5.6 thread, §6.3 guard, §6.4 fact sources) and `docs/plan/STATUS.md`.

Briefs are in `~/.claude/orchestrate/esta/briefs/`. The root's todo is `~/.claude/orchestrate/esta/todo.md`. Media is in `~/.claude/orchestrate/esta/media/<PR code>/`. The redesign's design system copy is in `~/.claude/orchestrate/esta/design/2026-11/`.

## Where the run is (written 2026-11-01 21:45 +07)

Ryan restarted the run with two asks on 2026-11-01: "https://claude.ai/artifact/8USdYGBumJc9AuaMsQfZKg --> i redesigned Esta, please implement the UI revamp" and "also check current progress, please help continue the work".

**Since the last handoff:**
- #358 (P5-16a) and #360 (P5-16c) merged on 2026-10-30.
- The redesign is planned in `docs/plan/redesign-2026-11.md` (b2def8a7): six slices, RD-1 to RD-6, with its defaults listed under "Decisions taken as defaults".
- #365's fix round 1 had never pushed. The previous owner stopped after merging main locally (840b881e in `/tmp/owner-data-trust-a/wt`). A fresh owner took it over.

## Open items (state at 12:50 2026-11-06 +07)

- **Ryan 2026-11-06:** "merge them and finish the project"; "push it through the last bit"; rated codebase review (https://claude.ai/artifact/4V3kWhP76ha26WqyMGzHso); "i want the code quality so high and pristine that follow up AI agents can pickup the practice"; "everything you find as issue, be sure to codify it in some way, and make sure every subsequent implementation efforts carry this quality forward"; "yeah" to the quality pass finishing before the first production deploy.
- **Codify rule live:** CLAUDE.md "Codify every finding", owner-brief step 3a and 7, verification-tiers review checklist, standing orders 2026-11-06. Every PR body has `## Codified`. Root merges only with `~/.claude/orchestrate/esta/bin/merge.sh <pr> <full sha>` (refuses wrong head, ci not green at that head, or no Codified section). Review briefs start from briefs/_template-review.md. Lows go in one `[low]` issue per PR naming each check.
- **Quality plan:** docs/plan/quality-2026-11.md: targets, finding ledger (review findings, the 8 defect classes, all 167 open issues by class), Q-01 to Q-20 in waves. Wave 0b: 28 open issues the ledger found are real money, legal, data or security defects; retitling them `[pre-deploy]` was blocked by permissions and waits on Ryan.
- **Merged today (this stretch):** #438 security bump (714aa773), #434 P5-10a (55d15b9c), #444 Q-01 quality gates (low #445).
- **#446 Q-16 defect-class checks:** review CLEAN at 67aaa82b; conflicted after #444; root merged main as 56e40942 (check script keeps migration-order and classes:check). Tiny reader running (briefs/pr446-merge-reader.md). Next: on CLEAN plus green ci, `merge.sh 446 <head>`; then add to owner-brief one sentence each for why classes 4 (waits for Q-08) and 8 (no mechanical check) stay prose. Lows #447.
- **#439 P5-15b what-if:** fix round 1 at 926f9f63, ci green. B1 now refuses a monthly rate instead of converting. Sonnet lane plus reader running (briefs/pr439-lane.md, slot 14), reverting each fix to prove its test. Next: on CLEAN merge via merge.sh; file one `[low]` issue for L2 (English units), L3 (seed numbers in follow-ups), L4 (typed values for portfolio, collections, tax), L11 (prose label) with the audit's checks; Ryan ruled "Yes, convert it": round 2 converts a monthly rate (x12) with its own Cách tính line.
- **P5-10b live run, last:** brief ready (briefs/p5-10b.md, slot 3). Spawn after #439 merges; check the week first. It must default `--mode` to replay, exit 1 on required FAIL or not-run rows, wire T5 to T7, measure first-sentence times.
- **x3 wave (Ryan 2026-11-06 13:15, "at least x3 the throughput ... spawn parallel agents and really rigorously complete the job"):** owners running from briefs q-19a (slot 7), q-19b (slot 9), q-20a (slot 14), q-19c (slot 3), q-17 (no slot), deps (no slot), all reading briefs/_common-quality-owner.md. Guard raised to stop spawns at 96%, pause owners at 98%. Tripwire cleared. Q-02 formatter runs last, when no PR is open. Next waves: Q-03/04/05 writes onto ops, Q-06 errors, Q-07 components, Q-08 access, Q-09/10, Q-11 to Q-14 infra, Q-15 docs, Q-18 layout, Q-20 rest.
- **Rulings today (Ryan may overrule):** preview gets its own Supabase project; restore drill local, cloud restore #428; ESTA_E2E_SERVER=build; denied WebSearch never stores input; search-guard terms; negative half rounds away from zero; "ngày 7 tháng 10 năm 2026" is one date; standard review for #438, #434, #446 (no product code).
- **Not ours:** pid 56207 is Ryan's slot 5 worker in /private/tmp/ryan-test; leave it.
- **Go-live list (Ryan's):** Dependabot alerts on, main protection, release order, worker clone, cron visibility, SMTP required, offsite backup, #428.
- **Tripwire set** 2026-11-05 22:57; clear with `rm /tmp/ci-local/one-at-a-time` when the flake is understood.

## Waiting for Ryan (defaults apply)

1. Thread per person (default) or one shared family thread.
2. One email per brief and per urgent note, per PLT-4 (default). The planner recommends one combined email a morning instead.
3. D9 wording stays (the thread counts as the in-app inbox).
4. #351: should a newer note about the same thing replace the older one in Cần xử lý? Kept as built for now.
5. P5-13 chips come from open notes of any day, an [app rule].
6. Redesign questions with defaults: keep Inter Display on /sign-in despite ~150 ms LCP; logo twice on desktop sign-in (#379); "Cần chú ý" = rent overdue or due today on any property (alternatives: Tổng quan's list, or the design set with expiring contracts and overdue tax); Tài sản chip rows stay open on desktop (or fold behind "Bộ lọc").
7. The redesign defaults in `docs/plan/redesign-2026-11.md`: Esta blue, role-name codemod, Thoáng/Gọn, wordmark, icon-and-word status, the new shell. Ryan can overrule any in a sentence.

Ruled 2026-11-02: Thu tiền "Đã thu" counts payments toward this month's rent, as Tổng quan does (Ryan: "Yes, match Tổng quan").

## Rules added this session

- **Lean rules, 2026-11-02** (Ryan: "Yes, apply all"). Owners and fix rounds on Sonnet for every tier; Opus only for the rigorous audit. Owners read narrowly (no poteto-mode, playbooks or standing orders), prove with `pnpm check`, touched specs and two to four screenshots, wait for CI once and stop at code-ready. Rigorous review is the Opus audit plus a Sonnet live lane; one fix round, a second only for wrong money. Briefs follow `~/.claude/orchestrate/esta/briefs/_template-owner.md` and name the existing home of every figure. Root posts status only at verdicts, merges and blocks. Full text: standing orders 2026-11-02, verification-tiers.md.

- Briefs say "Spawn no subagents, except the comment-sicko that /no-comments runs". Three owners skipped or hand-ran /no-comments because the blanket ban covered the skill's own subagent.

- The root merges on a clean independent verdict plus green ci at the exact head. Call `gh pr merge` directly. At most 2 reviewed PRs wait above main.
- Prototype first, live checks for each assistant slice, and Mẹ's session before more assistant features. Repeat findings become checks (owner-brief "Known defect classes"). The redesign's prototype is Ryan's artifact.
- Fix rounds are capped at 2. A language-rule change needs live English and Vietnamese probes that name real seed records.
- No force-push. Restack with commit-tree merge commits plus a patch-id check. When a 3-way merge conflicts on adjacent edits, apply the PR's own diff (`git diff prev head | git apply --cached` on a temp index) instead.
- The number rule beats a false reject: compounds such as `hai bên` and `ba mẹ` stay number words, and Trợ lý rewords.
- Each member reads only her own conversations and their audit rows. The operator does not either.

## Budget

Week at 78% at 12:50 on 2026-11-06, resets 2026-11-07 11:00 +07. Guard for "finish the project": stop spawns at 90%, pause owners at 95%. Read the plan limits with the session usage tool, which matches /usage; `usage-pct.sh` under-reads. On a 429, resume the owner with SendMessage after the reset.

## Gotchas

- zsh reads `$var:r` in a refspec as a modifier. Use `${var}:` or literal SHAs.
- A PR with a merge conflict gets no `pull_request` CI run. When "no checks" appears, look at `mergeStateStatus`.
- Owners in git-excluded worktrees keep their `decisions.tsv` rows locally. The root merges those rows into main.
- Slot 6 is Ryan's and slot 4 is never used. Ryan had his slot 5 test app and slot 6 stack stopped on 2026-11-01 (data kept in docker volumes).
- e2e runs on ESTA_FROZEN_NOW=2026-11-01T10:00+07:00 (playwright.config.ts) unless the shell sets it. A local dev server started before #376 keeps the real date until restarted.
- Artifact brand SVGs are uploads: read them one at a time with `path` set to the asset id; `paths` refuses ids.
