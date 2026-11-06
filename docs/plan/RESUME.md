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

## Open items (state at 10:47 2026-11-06 +07)

- **Ryan 2026-11-06:** "merge them and finish the project"; "when done have a deploy plan for me"; "can we paralellize? push it through the last bit"; "can you do a thermo review and audit and rate the codebase in infrastructure, code quality and overall quality". P6-07 cloud steps and the Mom test are his.
- **Merged today:** #415, #416, #421, #424, #419, #422 (6adc837b), #427 P6-06 runbook (562c1938, Ryan: "push it through"), #430 P5-09 email notice (2dc9a4ee, low #435).
- **Deploy options page:** https://claude.ai/artifact/LPwsLJvYWMRqa2xtjDT3DW.
- **#429 P5-14 web quotes:** fix round 1 running (briefs/p5-14-ff1.md, slot 8, wt /tmp/owner-p5-14/wt). It pushed 3cc4e186 with e2e documents-extract rule 5 red (DOC-5 denied Read); owner told to redact only WebSearch denials. Then a scoped reader, merge.
- **#432 P5-15a calc core:** fix round 1 running (briefs/p5-15a-ff1.md, wt /tmp/owner-p5-15a/wt; audit /tmp/review-432/audit.md B1-B6). Then reader, merge.
- **#433 P6-07a lane-otp:** fix round 1 running (briefs/p6-07a-ff1.md, slot 14 wt /tmp/owner-p6-07a/wt). Then reader, merge.
- **P5-10a north-star 7/9 + live-run harness:** owner running (briefs/p5-10a.md, slot 3); told #430 merged.
- **Codebase review for Ryan:** Opus thermo code review (briefs/codebase-thermo.md -> /tmp/review-codebase/code-quality.md) and Opus infra audit (briefs/codebase-infra.md -> /tmp/review-codebase/infrastructure.md) running; root publishes one rated report as an artifact.
- **Then:** P5-15b wiring (calculate tool, Cách tính, T5/T6 recordings, re-key) after #429 and #432; P5-10b live run last (live calls on Ryan's subscription; check the week).
- **Rulings today (Ryan may overrule):** preview gets its own Supabase project; restore drill local, cloud restore #428; ESTA_E2E_SERVER=build replaces ESTA_E2E_BUILD; denied searches never store input; search-guard terms (person names 2+ tokens any order, streets with or without type word, labels except type+place, no orgs); negative half rounding uses the core helper else half away from zero.
- **Not ours:** pid 56207 is Ryan's slot 5 worker in /private/tmp/ryan-test; leave it.
- **Lows open from today:** #420, #423, #425, #426, #431, #435.
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

Week at 77% at 10:47 on 2026-11-06, resets 2026-11-07 11:00 +07. Guard for "finish the project": stop spawns at 90%, pause owners at 95%.

Week at 71% on 2026-11-06 04:20 +07 (65% at 22:30 the night before), resets 2026-11-07 11:00 +07. Tonight cost about 6% for 13 merges. This run was paused from 2026-11-02, when the week stood near 18%, so most of that is other work. Ryan said "ok im back, lets continue" and was told the figure.

Week at 18% at 02:50 on 2026-11-02 (17% at 00:57) (9% at 23:25 the night before). The root pauses new spawns at 30% of the week and tells Ryan; running agents finish.


No cap stated for 2026-11-01; the last explicit one was 50% of a 5-hour window, so spawning stops at 30% and owners pause at 38%. Read the plan limits with the session usage tool, which matches /usage; `usage-pct.sh` under-reads. At 23:25 on 2026-11-01 the week stood at 9%. On a 429, resume the owner with SendMessage after the reset.

## Gotchas

- zsh reads `$var:r` in a refspec as a modifier. Use `${var}:` or literal SHAs.
- A PR with a merge conflict gets no `pull_request` CI run. When "no checks" appears, look at `mergeStateStatus`.
- Owners in git-excluded worktrees keep their `decisions.tsv` rows locally. The root merges those rows into main.
- Slot 6 is Ryan's and slot 4 is never used. Ryan had his slot 5 test app and slot 6 stack stopped on 2026-11-01 (data kept in docker volumes).
- e2e runs on ESTA_FROZEN_NOW=2026-11-01T10:00+07:00 (playwright.config.ts) unless the shell sets it. A local dev server started before #376 keeps the real date until restarted.
- Artifact brand SVGs are uploads: read them one at a time with `path` set to the asset id; `paths` refuses ids.
