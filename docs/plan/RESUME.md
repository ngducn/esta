# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read the 2026-10-30 retro rules in standing-orders.md first. Read:
- `docs/plan/trail/standing-orders.md` (newest at the bottom: 2026-10-30 retro, 2026-10-27 merge-and-stop);
- `docs/plan/redesign-2026-11.md` (the redesign plan, RD-1 to RD-6);
- `verification-tiers.md`, `owner-brief.md`, `lane-brief.md`;
- the tail of `decisions.tsv`;
- `ARCHITECTURE.md`, `docs/spec/AGENT.md` (§5.6 thread, §6.3 guard, §6.4 fact sources) and `docs/plan/STATUS.md`.

Briefs are in `~/.claude/orchestrate/esta/briefs/`. The root's todo is `~/.claude/orchestrate/esta/todo.md`. Media is in `~/.claude/orchestrate/esta/media/<PR code>/`. The redesign's design system copy is in `~/.claude/orchestrate/esta/design/2026-11/`.

## Where the run is (written 2026-11-01 21:45 +07; open items refreshed 2026-11-06 15:45)

Ryan restarted the run with two asks on 2026-11-01: "https://claude.ai/artifact/8USdYGBumJc9AuaMsQfZKg --> i redesigned Esta, please implement the UI revamp" and "also check current progress, please help continue the work".

**Since the last handoff:**
- #358 (P5-16a) and #360 (P5-16c) merged on 2026-10-30.
- The redesign is planned in `docs/plan/redesign-2026-11.md` (b2def8a7): six slices, RD-1 to RD-6, with its defaults listed under "Decisions taken as defaults".
- #365's fix round 1 had never pushed. The previous owner stopped after merging main locally (840b881e in `/tmp/owner-data-trust-a/wt`). A fresh owner took it over.

## Open items (state at 15:45 2026-11-06 +07)

- **Ryan 2026-11-06:** "merge them and finish the project"; "push it through the last bit"; "i want the code quality so high and pristine that follow up AI agents can pickup the practice"; "everything you find as issue, be sure to codify it in some way"; "yeah" to finishing the quality pass before the first production deploy; "Yes, convert it" (monthly rate to yearly); "we need to at least x3 the throughput to go through the usage before tmr reset, so spawn parallel agents and really rigorously complete the job". Guard: stop spawns at 96% of the week, pause owners at 98%; week resets 2026-11-07 11:00 +07.
- **Codify rule live:** CLAUDE.md "Codify every finding", owner-brief steps 3a, 6 and 7, verification-tiers checklist, standing orders 2026-11-06. Merge only with `~/.claude/orchestrate/esta/bin/merge.sh <pr> <full sha>`. Agents wait for CI with `~/.claude/orchestrate/esta/bin/wait-ci.sh [--after-rerun] <pr> <sha>` in the foreground (exit 3 = run again). On every hand-back whose notification says "waiting on its own background work", TaskStop the agent.
- **Merged today:** #438, #434, #444 Q-01, #446 Q-16, #439 P5-15b (low #457), #448 deps (low #463). Lows also filed: #459, #461 (connector folder test red on main, connector integration not in CI).
- **#449 Q-19c (expenses, ended term, kind notice):** lane CLEAN; Opus audit B1 (upsert fires BEFORE INSERT) and B2 (sentinels showed network error) fixed at 230dccae, ci green, PR body Codified updated by root. Scoped reader running on slot 3 (briefs/pr449-ff1-reader.md). Next: merge.sh 449 230dccae4544cdbeb88e87619932114ad24d6efd on CLEAN; file a low for ESTA_FROZEN_NOW TS-only fallback, get_property raw 'valid' for an ended certificate, sticky nav over the Kho radio at 390. Migration 641000: merge after #453 (638000) and #455 (639000) or renumber.
- **#450 Q-17 parser corpus:** Opus audit ISSUES (joiner lists for term range and national ID, issue date saved as term end, four untested wiring changes). Fix round running (briefs/q-17-ff1.md, no slot; it files the 17-low issue). Next: scoped reader, then a lane on a free slot (PDF preview with the pdf.js legacy build at 390, bank CSV with quoted separators), merge. Then Q-17b owner with a slot: SQL `holds_national_id` parity through NATIONAL_ID_VECTORS, #204 (refuse grouped lengths), #364 (leading Vietnamese imperative decides the language), #151, #425.
- **#451 Q-20a security:** Opus audit running on slot 14 (briefs/pr451-audit.md). Overlaps #456 on scripts/web-integration.ts and lanes.ts; second to land re-merges.
- **#453 Q-19a leases and invoices:** Opus audit running on slot 7 (briefs/pr453-audit.md). Open question for Ryan if main lets Mẹ re-bill a voided period: the new exclusion constraint would stop that (blocking) — audit decides.
- **#455 Q-19b statement import undo:** Opus audit running on slot 9 (briefs/pr455-audit.md).
- **#456 Q-11 CI on merge ref, job scripts, tools/heavy.sh:** Sonnet review running (briefs/pr456-review.md). After merge, switch briefs from ~/.claude/orchestrate/esta/bin/heavy.sh to tools/heavy.sh.
- **#460 Q-09a one fake, Stryker floor 92:** Sonnet review running (briefs/pr460-review.md). Lockfile conflicts with main after #448; owner of a fix round re-merges.
- **Q-16b (no PR yet):** owner running (briefs/q-16b.md): `esta/no-self-sourced-property` lint, owner-brief class 9, unit-list.test.tsx timeout root cause, typed.ts property counterexample "nam෇a" (seed -1581416164) with a Unicode word boundary.
- **P5-10b Phase 5 live run:** owner running on slot 8 (briefs/p5-10b.md). Pre-deploy: one live smoke on merged main, since #448 moved the agent SDK to 0.3.317 after the live run started.
- **Queue when slots free:** #450 lane; #453 lane (back-to-back leases, void and re-bill, approve a lease plan); Q-17b; Q-12 flaky clock tests (#208, retries 0); Q-09b allocation CSV vectors in pgTAP + C19 golden cases; C12 (#82, #128, #131). Later waves: Q-03/04/05, Q-06 (after #449 and #455 merge; they touch actions), Q-07, Q-08, Q-10, Q-13, Q-14 squash, Q-18, rest of Q-20, Q-15 docs, Q-02 formatter last.
- **Slots:** usable 3, 7, 8, 9, 14; never 1, 2, 4, 5, 6. pid 56207 is Ryan's slot 5 worker; leave it. Tripwire cleared for throughput; set `/tmp/ci-local/one-at-a-time` again on a beside-only failure.

## Waiting for Ryan (defaults apply)

1. Thread per person (default) or one shared family thread.
2. One email per brief and per urgent note, per PLT-4 (default). The planner recommends one combined email a morning instead.
3. D9 wording stays (the thread counts as the in-app inbox).
4. #351: should a newer note about the same thing replace the older one in Cần xử lý? Kept as built for now.
5. P5-13 chips come from open notes of any day, an [app rule].
6. Redesign questions with defaults: keep Inter Display on /sign-in despite ~150 ms LCP; logo twice on desktop sign-in (#379); "Cần chú ý" = rent overdue or due today on any property (alternatives: Tổng quan's list, or the design set with expiring contracts and overdue tax); Tài sản chip rows stay open on desktop (or fold behind "Bộ lọc").
7. The redesign defaults in `docs/plan/redesign-2026-11.md`: Esta blue, role-name codemod, Thoáng/Gọn, wordmark, icon-and-word status, the new shell. Ryan can overrule any in a sentence.

8. Retitle the 28 not-low issues in the quality ledger to `[pre-deploy]`? Root's `gh issue edit` is blocked by permissions; default: the ledger table in quality-2026-11.md is the list.
9. A bare percent with no period ("lãi 9%"): today Hỏi asks for the yearly rate. Default stays; Ryan can say "treat a bare percent as yearly".
10. Defaults adopted from the #450 audit for the Q-17b follow-up: #204 refuse a length written with dot or space grouping (ask to retype "4,5"); #364 a leading Vietnamese imperative (Gửi, Nhắc, Xem) decides the reply language and record names do not count.

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
