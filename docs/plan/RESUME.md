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

## Open items (updated 2026-11-02 03:10 +07)

- **Merged since 2026-11-01:** #368 (d2016c5a) design foundation; #376 (496542e4) e2e clock pinned to 2026-11-01T10:00+07:00; #374 (2bbf8891) the shell; #375 (a19892e9) sign-in and onboarding brand layer; #383 (32991ea4) axe judges resting colours, one shared helper (closes #373); #381 (9a898a45) Tài sản workbench. Lows open: #372, #377, #378, #379, #380, #382.
- **No agent is running.** Slots 2, 3 and 14 may hold stopped or idle stacks; run slot-free.sh before reuse.
- **Next: RD-3, Thu tiền board and recording a payment** (plan row: data table with phone list, totals, bulk bar; money input with `=` and words; sheet footer states; signed, unknown, zero). It reuses SummaryStrip, FilterTabs and EmptyState from #381 (apps/web/src/components). Money input and payment recording make it rigorous: name the tier before spawning (standing orders rule 6: an Opus owner for rigorous work, or a Sonnet owner with an Opus audit as RD-1 and RD-2 had; RD-2 on Sonnet needed two fix rounds). Include #377 (Thu tiền cramped at 960) and the desktop badge wrapping. Write briefs/rd-3.md from briefs/rd-2.md.
- **Then:** RD-4 (Tổng quan and the Trợ lý thread), RD-5 (property tabs, documents, reports, Cài đặt, wizard). Then Mẹ's session (Ryan's step), P5-09, P5-14, P5-15, P5-16b, P5-10, Phase 6.
- **Tripwire set** since 23:30 on 2026-11-01: heavy.sh runs everything one at a time. Clear with `rm /tmp/ci-local/one-at-a-time` after a quiet stretch, and record it.
- **Watch:** shell and auth-password specs lost a poll-until-pass in #383; a random failure there means a title-flicker wait, not a retry loop.

## Waiting for Ryan (defaults apply)

1. Thread per person (default) or one shared family thread.
2. One email per brief and per urgent note, per PLT-4 (default). The planner recommends one combined email a morning instead.
3. D9 wording stays (the thread counts as the in-app inbox).
4. #351: should a newer note about the same thing replace the older one in Cần xử lý? Kept as built for now.
5. P5-13 chips come from open notes of any day, an [app rule].
6. Redesign questions with defaults: keep Inter Display on /sign-in despite ~150 ms LCP; logo twice on desktop sign-in (#379); "Cần chú ý" = rent overdue or due today on any property (alternatives: Tổng quan's list, or the design set with expiring contracts and overdue tax); Tài sản chip rows stay open on desktop (or fold behind "Bộ lọc").
7. The redesign defaults in `docs/plan/redesign-2026-11.md`: Esta blue, role-name codemod, Thoáng/Gọn, wordmark, icon-and-word status, the new shell. Ryan can overrule any in a sentence.

## Rules added this session

- Briefs say "Spawn no subagents, except the comment-sicko that /no-comments runs". Three owners skipped or hand-ran /no-comments because the blanket ban covered the skill's own subagent.

- The root merges on a clean independent verdict plus green ci at the exact head. Call `gh pr merge` directly. At most 2 reviewed PRs wait above main.
- Prototype first, live checks for each assistant slice, and Mẹ's session before more assistant features. Repeat findings become checks (owner-brief "Known defect classes"). The redesign's prototype is Ryan's artifact.
- Fix rounds are capped at 2. A language-rule change needs live English and Vietnamese probes that name real seed records.
- No force-push. Restack with commit-tree merge commits plus a patch-id check. When a 3-way merge conflicts on adjacent edits, apply the PR's own diff (`git diff prev head | git apply --cached` on a temp index) instead.
- The number rule beats a false reject: compounds such as `hai bên` and `ba mẹ` stay number words, and Trợ lý rewords.
- Each member reads only her own conversations and their audit rows. The operator does not either.

## Budget

Week at 18% at 03:10 on 2026-11-02 (17% at 00:57) (9% at 23:25 the night before). The root pauses new spawns at 30% of the week and tells Ryan; running agents finish.


No cap stated for 2026-11-01; the last explicit one was 50% of a 5-hour window, so spawning stops at 30% and owners pause at 38%. Read the plan limits with the session usage tool, which matches /usage; `usage-pct.sh` under-reads. At 23:25 on 2026-11-01 the week stood at 9%. On a 429, resume the owner with SendMessage after the reset.

## Gotchas

- zsh reads `$var:r` in a refspec as a modifier. Use `${var}:` or literal SHAs.
- A PR with a merge conflict gets no `pull_request` CI run. When "no checks" appears, look at `mergeStateStatus`.
- Owners in git-excluded worktrees keep their `decisions.tsv` rows locally. The root merges those rows into main.
- Slot 6 is Ryan's and slot 4 is never used. Ryan had his slot 5 test app and slot 6 stack stopped on 2026-11-01 (data kept in docker volumes).
- e2e runs on ESTA_FROZEN_NOW=2026-11-01T10:00+07:00 (playwright.config.ts) unless the shell sets it. A local dev server started before #376 keeps the real date until restarted.
- Artifact brand SVGs are uploads: read them one at a time with `path` set to the asset id; `paths` refuses ids.
