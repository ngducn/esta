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

## Open items

- **#365, data trust A, branch esta/data-trust-a, head 3941658a on GitHub, ci green there.**
  - Fix round 1 owner: Opus, slot 2, brief `briefs/data-trust-a-ff1.md` with its 2026-11-01 addendum, worktree `/tmp/owner-data-trust-a/wt`. Items: holder check flags her own certificates, blank records through review and edit, refusal out of sight, suggestCurrentUnits throw, the 6-candidate cap probe.
  - Next: on its report, a scoped Sonnet reader of 3941658a..head (rigorous tier), then merge with `gh pr merge 365 --squash --match-head-commit <head>` and a plain-words summary.
- **RD-1, redesign foundation, branch esta/rd-1-design-foundation (opens as a new PR).**
  - Owner: Sonnet (took over from Opus at 2e19735f, handover `/tmp/owner-rd-1/handover.md`), slot 3, brief `briefs/rd-1.md`, worktree `/tmp/owner-rd-1/wt`. Tokens with the design system's role names (codemod), Thoáng/Gọn density, ESTA wordmark and icons, restyled primitives, tab bar, rail, sidebar and account menu. May split the shell into RD-1b past about 800 product lines.
  - Next: on its report, the review round for its tier (standard at least: one Sonnet verifier lane with live screenshots; add an Opus audit if verify:tier says rigorous), then merge. Whichever of #365 and RD-1 lands second merges main and re-runs the codemod.
- **After RD-1:** RD-2 (Tài sản) and RD-6 (sign-in and onboarding) side by side, then RD-3 (Thu tiền and the payment sheet), RD-4 (Tổng quan and Trợ lý), RD-5 (the remaining screens). Write each brief from the plan and `briefs/rd-1.md`.
- **Then the earlier order:** Mẹ's session (Ryan's step; she should see the new look), P5-09, P5-14 and P5-15, P5-16b (#313, #314, #338, #346), P5-10 (live run), Phase 6. #356's remaining items can go between them.

## Waiting for Ryan (defaults apply)

1. Thread per person (default) or one shared family thread.
2. One email per brief and per urgent note, per PLT-4 (default). The planner recommends one combined email a morning instead.
3. D9 wording stays (the thread counts as the in-app inbox).
4. #351: should a newer note about the same thing replace the older one in Cần xử lý? Kept as built for now.
5. P5-13 chips come from open notes of any day, an [app rule].
6. The redesign defaults in `docs/plan/redesign-2026-11.md`: Esta blue, role-name codemod, Thoáng/Gọn, wordmark, icon-and-word status, the new shell. Ryan can overrule any in a sentence.

## Rules added this session

- The root merges on a clean independent verdict plus green ci at the exact head. Call `gh pr merge` directly. At most 2 reviewed PRs wait above main.
- Prototype first, live checks for each assistant slice, and Mẹ's session before more assistant features. Repeat findings become checks (owner-brief "Known defect classes"). The redesign's prototype is Ryan's artifact.
- Fix rounds are capped at 2. A language-rule change needs live English and Vietnamese probes that name real seed records.
- No force-push. Restack with commit-tree merge commits plus a patch-id check. When a 3-way merge conflicts on adjacent edits, apply the PR's own diff (`git diff prev head | git apply --cached` on a temp index) instead.
- The number rule beats a false reject: compounds such as `hai bên` and `ba mẹ` stay number words, and Trợ lý rewords.
- Each member reads only her own conversations and their audit rows. The operator does not either.

## Budget

No cap stated for 2026-11-01; the last explicit one was 50% of a 5-hour window, so spawning stops at 30% and owners pause at 38%. Read the plan limits with the session usage tool, which matches /usage; `usage-pct.sh` under-reads. At 21:40 the window stood at 9% and the week at 5%. On a 429, resume the owner with SendMessage after the reset.

## Gotchas

- zsh reads `$var:r` in a refspec as a modifier. Use `${var}:` or literal SHAs.
- A PR with a merge conflict gets no `pull_request` CI run. When "no checks" appears, look at `mergeStateStatus`.
- Owners in git-excluded worktrees keep their `decisions.tsv` rows locally. The root merges those rows into main.
- Slot 6 is Ryan's and slot 4 is never used. Ryan had his slot 5 test app and slot 6 stack stopped on 2026-11-01 (data kept in docker volumes).
- Artifact brand SVGs are uploads: read them one at a time with `path` set to the asset id; `paths` refuses ids.
