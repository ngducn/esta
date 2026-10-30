# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read the 2026-10-30 retro rules in standing-orders.md first. Read:
- `docs/plan/trail/standing-orders.md` (newest first: 2026-10-27 merge-and-stop, 2026-10-25 17:10 thread direction);
- `verification-tiers.md`, `owner-brief.md`, `lane-brief.md`;
- the tail of `decisions.tsv`;
- `ARCHITECTURE.md`, `docs/spec/AGENT.md` (§5.6 thread, §6.3 guard, §6.4 fact sources) and `docs/plan/STATUS.md`.

Briefs are in `~/.claude/orchestrate/esta/briefs/`. The root's todo is `~/.claude/orchestrate/esta/todo.md`. Media is in `~/.claude/orchestrate/esta/media/<PR code>/`.

## Where the run is (written 2026-10-30 14:25 +07)

The run is live again (Ryan, 2026-10-30: "ok continue the work ... todays cap is 50%"). The root merges on its own under rule 1 of the 2026-10-30 standing orders.

**Since the last handoff:**
- #352 (P5-13): replying to a note, asking about a property, and suggestion chips. The root merged it as f03a6893.
- Mẹ's session script is committed as `docs/plan/trail/mom-session.md` (8c22de10). It waits for Ryan to run it.
- The UX audit Ryan asked for is in `/Users/ngducn/Workplace/esta-ux-audit-2026-10-30/` (outside the repo): README plus files 01 to 08, and 321 screenshots. The silently wrong records it found are filed as #356.
- The cleanup round is split in two:
  - P5-16a: #353, #318, #345, #340 and #348.
  - P5-16c: #321, #343, #351 items 1 to 4, #349, #354, #329 and #333.

## Open items

- **#358, cleanup round A (P5-16a), branch esta/p5-16a-cleanup, head 1eb3a501, ci green.**
  - It closes a real leak found by #353's check: members and viewers could read bank statement lines through audit_log. Migration 620000 fixes it.
  - Done: the Opus audit, the Sonnet second opinion, fix round 1, and a CLEAN scoped reader at 1eb3a501.
  - Then the P5-16c owner found a regression live. An English question that names a Vietnamese property ("Should I renew the lease on Căn hộ Thủ Đức?") gets a Vietnamese reply.
  - Fix round 2, the last one allowed, is running with a Sonnet owner on slot 2 (`briefs/p5-16a-ff2.md`, worktree `/tmp/owner-p5-16a-ff1/wt`). It strips the household's own labels before deciding the language.
  - Next: a scoped Sonnet reader of the round-2 diff. Then the root merges with `gh pr merge 358 --squash --match-head-commit <head>` and posts a plain-words summary.
- **P5-16c, cleanup round C, branch esta/p5-16c-cleanup, stacked on 16a, slot 3, worktree `/tmp/owner-p5-16a/wt`.**
  - The owner is the agent that ran P5-16a, resumed. The fix for #354 is at a7e34b0e: 0 of 5 live renewal replies contradict their numbers, against 1 of 5 before.
  - Next: it merges the round-2 head of #358, re-keys recordings, pushes and reports code-ready. Then the rigorous reviews, then merge after #358.
- **After the cleanup:** Mẹ's session (Ryan's step), then P5-09, P5-14 and P5-15, then P5-16b (#313, #314, #338, #346), then P5-10 (live run), then Phase 6. #356 can be picked up between them.

## Waiting for Ryan (defaults apply)

1. Thread per person (default) or one shared family thread.
2. One email per brief and per urgent note, per PLT-4 (default). The planner recommends one combined email a morning instead.
3. D9 wording stays (the thread counts as the in-app inbox).
4. #351: should a newer note about the same thing replace the older one in Cần xử lý? Kept as built for now.
5. P5-13 chips come from open notes of any day, an [app rule].
6. Merges: settled on 2026-10-30. Ryan lets the root merge itself, and `.claude/settings.local.json` allows `gh pr merge`.

## Rules added this session

- The root merges on a clean independent verdict plus green ci at the exact head. Call `gh pr merge` directly. At most 2 reviewed PRs wait above main.
- Prototype first, live checks for each assistant slice, and Mẹ's session before more assistant features. Repeat findings become checks (owner-brief "Known defect classes").
- Fix rounds are capped at 2. A language-rule change needs live English and Vietnamese probes that name real seed records.

- No force-push. Restack with commit-tree merge commits plus a patch-id check. When a 3-way merge conflicts on adjacent edits, apply the PR's own diff (`git diff prev head | git apply --cached` on a temp index) instead.
- The number rule beats a false reject: compounds such as `hai bên` and `ba mẹ` stay number words, and Trợ lý rewords.
- Each member reads only her own conversations and their audit rows. The operator does not either.

## Budget

Today's cap is 50% (Ryan, 2026-10-30). `usage-pct.sh` under-reads: a 429 hit while it showed about 31%. So spawning stops at 30% and owners pause at 38%. Never spawn in a window's first 20 minutes. On a 429, resume the owner with SendMessage after the reset.

## Gotchas

- zsh reads `$var:r` in a refspec as a modifier. Use `${var}:` or literal SHAs.
- A PR with a merge conflict gets no `pull_request` CI run. When "no checks" appears, look at `mergeStateStatus`.
- Owners in git-excluded worktrees keep their `decisions.tsv` rows locally. The root merges those rows into main.
- Slot 6 is Ryan's, slot 5 holds his test app, and slot 4 is never used.
