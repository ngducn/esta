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

## Open items (state at 09:45 2026-11-06 +07)

- **Ryan 2026-11-06:** "merge them and finish the project" and "when done have a deploy plan for me, list me some options to deploy". This lifted the hold for Mẹ's session; P6-07 (cloud) stays his.
- **Merged today:** #415, #416, #421, #424, #419 (a19e5305), #422 (6adc837b, carries main's tenant route fix).
- **Deploy options page** published for Ryan: https://claude.ai/artifact/LPwsLJvYWMRqa2xtjDT3DW (recommends A as locked, Supabase Pro once real documents go in, Resend or Brevo free). Source: /tmp/deploy-plan/research.md. Scratch file: the session scratchpad esta-deploy/index.html.
- **#427 P6-06 deploy runbook**, head 1f28f34d, merge-ready: Opus audit B1-B7 and lane fixed in one round, scoped reader CLEAN, ci green. Held for Ryan's click (the root told him it would wait; its plan has an operator gate) and asked in chat: merge now or after the Mom test. Lows #431 (L4 plist login shell and L9 Supabase sender matter before going live). Ryan decision #428: no cloud restore tool yet.
- **#429 P5-14 web quotes**, head 53ab8393, ci green: Opus audit (briefs/pr429-audit.md, report /tmp/review-429/audit.md) and Sonnet lane (briefs/pr429-lane.md, slot 9) running. Then one fix round, a reader, merge. Then the P5-15 owner (plan 5059-5132, migration 20261007630000).
- **#430 P5-09 email notice**, head a9a0e2a6, ci green: Opus audit (briefs/pr430-audit.md, /tmp/review-430/audit.md) and lane (briefs/pr430-lane.md, slot 7) running. The owner added a sign-in return-link cookie beyond the plan; open redirect is the audit's first check. Then one fix round, reader, merge. Then P5-10 (plan 5192-5264): its live run spends Ryan's subscription; check the week first. P5-10 also flips north-star steps 7 and 9 on the production build.
- **Rulings today (Ryan may overrule):** preview gets its own Supabase project (plan P6-07 step 1 already says so); restore drill local, cloud restore is #428; `ESTA_E2E_BUILD` replaced by the existing `ESTA_E2E_SERVER=build`; plus the 04:20 rulings (tenant export share, sweep clock, archiving never changes money).
- **Lows open from today:** #420, #423, #425, #426, #431.
- **Tripwire set** 2026-11-05 22:57: completeness rule 5 failed once beside other specs and passed alone. Clear with `rm /tmp/ci-local/one-at-a-time` when the flake is understood.
- **#386 merged** 2026-11-02: pushes to main that touch only the notes files skip CI.

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

Week at 75% at 09:45 on 2026-11-06, resets 2026-11-07 11:00 +07. Guard for "finish the project": stop spawns at 90%, pause owners at 95%.

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
