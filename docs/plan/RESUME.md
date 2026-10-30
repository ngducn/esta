# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full, **only when Ryan says to resume**. Read the 2026-10-30 retro rules in standing-orders.md first (standing order 2026-10-27: his weekly limit ran low, so the run stopped). Read:
- `docs/plan/trail/standing-orders.md` (newest first: 2026-10-27 merge-and-stop, 2026-10-25 17:10 thread direction);
- `verification-tiers.md`, `owner-brief.md`, `lane-brief.md`;
- the tail of `decisions.tsv`;
- `ARCHITECTURE.md`, `docs/spec/AGENT.md` (§5.6 thread, §6.3 guard, §6.4 fact sources) and `docs/plan/STATUS.md`.

Briefs are in `~/.claude/orchestrate/esta/briefs/`. The root's todo is `~/.claude/orchestrate/esta/todo-1023.md`. Media is in `~/.claude/orchestrate/esta/media/<PR code>/`.

## Where the run is (written 2026-10-27 +07)

**Ryan granted the merge of #341, #342, #344, #347 and #350 on 2026-10-27, and all five are on main** (#341 53131220, #342 fdd30f69, #347 554639c1, #350 f051352b, #344 b4bcf271). The root landed them with `land3.sh` (scratchpad):
- each PR's own diff goes onto main with a patch-id check, then a merge commit, green `ci` at that head, and a squash merge;
- #344 goes last, with one hand resolution in AGENT.md's table rows: keep #341's `deferred_until` and `state`, and #347's own-conversation reads.

**What these bring to main:**
- #341 spending caps: daily caps per job kind, the paused line, Thử lại (P5-08a).
- #342: the Sunday weekly review and the operator diagnostics page (P5-08b).
- #344: the plan re-cut around one Trợ lý thread (P5-12 to P5-16, P5-09 shrunk).
- #347: one Trợ lý thread replacing Hộp thư and Hỏi (P5-12). It also adds a creator-only privacy migration, the busy rule across segments, and the open prompt with the guard probe.
- #350: the pinned Cần xử lý list and Sao chép (P5-12b).

## Open items

- **P5-13, reply to a note, ask about a property, suggestion chips (#352, branch esta/p5-13-topics).**
  - Paused by Ryan's order at b816eb8d, 688 of 800 product lines, all features built (chips not cut). Its notes are in `/tmp/owner-p5-13/RESUME-13.md`.
  - Done: the migration and pgTAP for `p_topic`, the topic preload, T3/T4 goldens, the SUGGESTIONS registry.
  - Left: chip recordings, the e2e extension, heavy checks, screenshots and the PR body; then the rigorous reviews.
  - Next: a fresh Opus owner on slot 2 from `briefs/p5-13.md` plus RESUME-13.md. Restack onto main first, since its base #350 has landed.
- **After P5-13 (standing order 2026-10-30):** Mẹ's session on Ryan's phone (the root prepares the build and a one-page script), then one cleanup round (P5-16 widened to the lows Mẹ can see, #353 first), then P5-09 (notice email), P5-14 (web quotes, `quote_page`) and P5-15 (typed numbers, `calculate`), then P5-10 (live run), then Phase 6.

## Waiting for Ryan (defaults apply)

1. Thread per person (default) or one shared family thread.
2. One email per brief and per urgent note, per PLT-4 (default). The planner recommends one combined email a morning instead.
3. D9 wording stays (the thread counts as the in-app inbox).
4. #351: should a newer note about the same thing replace the older one in Cần xử lý? Recommended: yes.
5. Merges: settled on 2026-10-30. Ryan lets the root merge itself, and `.claude/settings.local.json` allows `gh pr merge`.

## Rules added this session

- No force-push. Restack with commit-tree merge commits plus a patch-id check. When a 3-way merge conflicts on adjacent edits, apply the PR's own diff (`git diff prev head | git apply --cached` on a temp index) instead.
- The number rule beats a false reject: compounds such as `hai bên` and `ba mẹ` stay number words, and Trợ lý rewords.
- Each member reads only her own conversations and their audit rows. The operator does not either.

## Budget

The cap is 60% per 5-hour window: stop spawning at 48% and pause owners at 54%. Ryan's **weekly** limit is the binding constraint now. Resume only on his word.

## Gotchas

- zsh reads `$var:r` in a refspec as a modifier. Use `${var}:` or literal SHAs.
- A PR with a merge conflict gets no `pull_request` CI run. When "no checks" appears, look at `mergeStateStatus`.
- Owners in git-excluded worktrees keep their `decisions.tsv` rows locally. The root merges those rows into main.
- Slot 6 is Ryan's, slot 5 holds his test app, and slot 4 is never used.
