# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read:
- `docs/plan/trail/standing-orders.md` (newest updates first; 2026-10-25 17:10 is the latest);
- `verification-tiers.md`, `owner-brief.md` and `lane-brief.md`;
- the tail of `decisions.tsv`;
- `ARCHITECTURE.md`, `docs/spec/AGENT.md` (§6.3 is the placeholder guard; §6.4 the new fact sources once #344 lands) and `docs/plan/STATUS.md`.

Briefs are in `~/.claude/orchestrate/esta/briefs/`. The root's todo is `~/.claude/orchestrate/esta/todo-1023.md`. Review-gate media is under `~/.claude/orchestrate/esta/media/<PR code>/`. The landing lever is `land-stack.sh` in the root's scratchpad (restack with a merge commit, patch-id check, wait for ci, squash-merge at that head).

## Where the run is (written 2026-10-25 18:10 +07)

**Phase 5 is on main through asking Trợ lý questions (#339).** Main is 258c876b plus this handoff. Usage is 24% of the window 08:00Z to 13:00Z (cap 60%).

**Merged since the last handoff (all 2026-10-25, Ryan merged #319 himself, the root merged the rest on his grant):**

| PR | What it does |
| --- | --- |
| #319 | Morning brief in Hộp thư and on Home (P5-04) |
| #322 | Market and legal news under Thị trường (P5-05) |
| #324, #330, #332 | Suggested tasks and confirmations: approve, dismiss, reminder drafts, renewals, rent changes, data issues (P5-06) |
| #334 | Ask a question on Hỏi, answer streams sentence by sentence (P5-07a) |
| #336 | The ten golden questions, tables, English answers (P5-07b) |
| #339 | Follow-ups, past conversations, `Suy nghĩ kỹ hơn` (P5-07c) |

**Ryan's words since then:**
- "continue until 60%" (cap 60%: stop spawning at 48%, pause owners at 54%).
- "merge them all for me please, then launch local for me to test". The grant covered #322 to #339 only.
- On Hỏi: "why is the Hoi tab, not like LLMs regular chats?" then "she type, also Tro ly should be a combination of both, like Grok Bot, or you ... both be proactive, and she can be creative in asking you things", then "yeah replan the rest around this decision today, and work on it". Recorded as standing order 2026-10-25 17:10: one Trợ lý thread (notes plus chat), open-ended questions, the number rule stays absolute with three fact sources (numbers Mẹ typed, verbatim web quotes with a source chip, a calculate tool), and P5-09 shrinks to a "new message" email.

## Open items

- **#344 thread re-plan (docs), head 3240f906.** New P5-12 to P5-16, P5-09 shrunk, P5-10 thread cases T1 to T8, AGENT.md §6.4, DESIGN-BRIEF §5.5. `plan:coverage` passes. A Sonnet review is running (brief inline; reruns from the PR). The root merged main into it to clear a `decisions.tsv` conflict (row union, patch-id same). Next: on a CLEAN review, merge it under the plan-docs authority, then tell Ryan the two defaults below.
- **#341 caps (P5-08a), head dc92b0ed.** Both reviews CLEAN, lows in #343. No CI ran at c862c5d0, so the root pushed a merge of main (patch-id same) to trigger it. Next: ci green, then Ryan's click (not in the merge grant), or ask him whether the root may merge it.
- **#342 weekly review and diagnostics (P5-08b), head 1782c36b, stacked on #341.** Fix-round owner (Opus, slot 3, `briefs/p5-08b-ff1.md`) fixed the three blocks: the retried weekly run keyed the next week, diagnostics not-found answered 200, the 3-proposal cap race. Its CI is running. Next: when ci is green, a scoped Sonnet reader of the fix diff (`git diff 07d86c9e 1782c36b` minus the 08a merge); then merge-ready for Ryan. Merge conflict to expect with #344: keep #344's Phase 5 rows and sections, keep #342's P5-08 section and its AGENT.md lines (§2.3, §5.5, §9, §10).
- **Next build: "Talk with Trợ lý in one thread that holds its notes and her questions" (P5-12).** Depends on #341 and #342. Write `briefs/p5-12.md` from the plan section after #344 lands and spawn an Opus owner on slot 2, stacked on `esta/p5-08b-weekly`. Then P5-09 (notice email) beside P5-13, P5-14, P5-15, then P5-16 (pre-live lows #313, #314, #318, #321, #329, #333, #338, #340, #343) and P5-10 (live run).
- **Local test app for Ryan:** slot 5, http://localhost:3500, worktree `/tmp/ryan-test/wt` at a02f30fc, replay worker. Sign in as me@demo.esta.test or ryan@demo.esta.test. Only the ten golden questions and "Còn tháng 9 thì sao?" answer in replay. Ryan's own slot 6 server on :3600 is untouched.

## Waiting for Ryan

1. Thread per person (default) or one shared family thread.
2. Email: one per brief and per urgent note, as PLT-4 says (default), or one email a morning (changes PLT-4).
3. The planner's own calls, reported for veto: law, tax and procedure answers must cite a fetched page; a fresh session starts each day or after 20 questions; a suggested reply sends on one tap.
4. Merge #341, later #342.
5. Older: STATUS.md "Waiting for Ryan".

## Rules added this session

- **Budget cap 60%** (standing order 2026-10-25).
- **No force-push.** Restack with `git commit-tree <clean rebased tree> -p <reviewed head> -p origin/main` and a fast-forward push; prove the code is the reviewed code with `git diff | git patch-id --stable`.
- **The merge grant was one-time** (#322 to #339). Later PRs need Ryan's click or a new grant.
- **Thread direction** (standing order 2026-10-25 17:10), above.

## How CI runs now

Actions runs on every PR push; check with `timeout 30 gh pr checks <n>`. A PR with a merge conflict gets no `pull_request` run; when a PR shows "no checks reported", look at `mergeStateStatus` first. Rerun failed jobs once on a 502 or `toomanyrequests` (#310). The local fallback is `tools/ci-local.sh`.

## Budget

Stay below 60% of Ryan's /usage per 5-hour window: stop spawning at 48% and pause owners at 54% on `usage-pct.sh`. Never spawn in the first 20 minutes of a window. An Opus owner costs about 10 points an hour; a rigorous review pair about 5.

## Gotchas

- zsh reads `$var:r` in a refspec as a modifier. Push with a literal SHA or `${var}:refs/heads/...`.
- Git 2.39 has no `merge-tree --merge-base`; build conflict resolutions with a temporary `GIT_INDEX_FILE`.
- Owners in git-excluded worktrees write `decisions.tsv` rows the root must merge into main by hand.
- Every e2e spec that starts the agent worker must end with `stopAndForget`.
- Slot 6 is Ryan's. Slot 4 is never used. Owners use slot 2, reviewers slot 3.
- `gh` calls can hang. Wrap them in `timeout`.
