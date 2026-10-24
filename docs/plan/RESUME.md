# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read:
- `docs/plan/trail/standing-orders.md` (newest updates first; 2026-10-24 22:05 is the latest);
- `verification-tiers.md`, `owner-brief.md` and `lane-brief.md`;
- the tail of `decisions.tsv`;
- `ARCHITECTURE.md`, `docs/spec/AGENT.md` (§6.3 is the placeholder guard) and `docs/plan/STATUS.md`.

Briefs are in `~/.claude/orchestrate/esta/briefs/`. The root's todo is `~/.claude/orchestrate/esta/todo-1023.md`. Review-gate media is under `~/.claude/orchestrate/esta/media/<PR code>/`.

## Where the run is (written 2026-10-25 03:25 +07)

**Phase 5 (the assistant) is under way.** Main is 4272e926 plus this handoff. Five Phase 5 PRs have merged: the watch rules, the number guard, Hộp thư and the morning watch job. Usage is 20.6% of the window ending 05:00 +07 (22:00Z).

**Merged since the last handoff (2026-10-24 and 25):**

| PR | What it does |
| --- | --- |
| #295 | Inter font, weights 400/500/600 (ceiling 600) |
| #294 | Receiving bank accounts and a sample QR |
| #299 | The shared action hook (#193) |
| #300 | Node pin 24.22.0; closes #292 and #127 |
| #302 | Lows batch 1 |
| #305 | CI runs the web integration tests in the db job |
| #306 | Watch rules W1 to W11 (P5-02) |
| #311 | Placeholder number guard (P5-03a) |
| #312 | Hộp thư: read, dismiss with undo, operator-only notes (P5-03c) |
| #315 | The 06:40 morning watch job and the "Theo dõi buổi sáng" card (P5-03b) |

**Ryan's words since then:**
- "on QR can we get a feature where we can setup the account QR?" (done, #294); "make it a bit cleaner with Geist font or something" (done as Inter, #295); "40% this time, be concise".
- "yeah cut off Graphify" (removed).
- "ok continue please, what is progress now, when until i see some UI ?"
- Number guard: chose "Placeholders (Recommended)". The model writes `{{fN.field}}` and Esta fills every number.
- After the feature brainstorm: "skip questions and propose a list of features you think can be wow here". The root proposed three for Phase 5: 1 rent that collects itself (match bank SMS or a screenshot by the ESTA memo), 2 tenant reminders on autopilot (one-tap "Gửi tất cả" through Zalo), and the brief reframe (lead with what Trợ lý already handled, then one or two yes/no questions). **No answer yet.**

## Open items

- **#319 morning brief (P5-04), head e0fad32d, merge-ready.** It has the operator review gate, so Ryan merges it. Opus BLOCK on bold at 700 was fixed in the one fix-forward, and the root read the fix diff. Sonnet CLEAN. Perf PASS on all four rules. 12 lanes and a 36 s video are in `media/P5-04/` and were sent to Ryan. Its lows are in #321 and #320. Next: wait for Ryan's click. If he wants the reframe, it is a reorder of `BRIEF_SECTIONS` before merge.
- **#322 market and legal news scan (P5-05), owner running (Opus, slot 2, `briefs/p5-05.md`).** It is stacked on #319's branch `esta/p5-04-morning-brief`. After #319 squash-merges, the owner rebases with `git rebase --onto origin/main e0fad32d` and retargets the base to main. Next: on code-ready, check the tier, then run the reviews (Opus audit live on slot 3 plus a Sonnet second opinion when rigorous).
- **Pre-live lows, to fix before the first live run (P5-10):** #318 (watch job turn limit, en recording, rerun duplicates), #321 (brief), #314 (guard false positives), #313.
- **After P5-05:** P5-06 (proposals, depends on P5-04), then P5-07 to P5-10, then Phase 6.

## Waiting for Ryan

1. Merge #319 (review gate).
2. The brainstorm items 1, 2 and the reframe: add them to the Phase 5 plan as new slices?
3. Earlier: the bank and number lock default (#294), #139 advance payment, #308 (W9 same-month rule), `ESTA_SLOT=6 pnpm db:reset` for his slot 6 Home ZodError (his stack is missing migrations 601000 to 601200; the root has not reset it), and Phase 3's two-bank-app VietQR scan and the Mom test.
4. Older questions: STATUS.md "Waiting for Ryan".

## Rules added this session

- **Placeholders** (standing order 2026-10-24 22:05). The model never types a number. Every write tool (`create_item`, `create_brief`) goes through `guardedWriter` with the run's FactSheet. Recordings are hand-written and labelled as such until P5-10.
- **Typography.** Inter, weight ceiling 600. `b, strong` are 600 in the base CSS, and a test enforces both (`globals-css.test.ts`).
- **Stacking.** A PR behind an operator review gate does not block the next PR. Stack on its branch and rebase after the squash merge.
- **Graphify removed.** Do not re-add unprompted.

## How CI runs now

Actions runs on every PR push; check it with `timeout 30 gh pr checks <n>`. The db job also runs `pnpm --filter web test:integration`. Rerun failed jobs once on a 502 or `toomanyrequests` (#310). The local fallback is `tools/ci-local.sh`.

## Budget

Stay below 40% of Ryan's /usage per 5-hour window: stop spawning at 28% and pause owners at 34% on `usage-pct.sh`. Never spawn in the first 20 minutes of a window. An Opus owner costs about 10 points an hour. A rigorous review pair (Opus plus Sonnet) costs about 5.

## Gotchas

- Every e2e spec that starts the agent worker must end with `stopAndForget` (`e2e/helpers/agent-worker.ts`). A stale heartbeat puts the offline banner on later specs.
- On the dev server, the upload specs sometimes see two "Đã lưu" toasts (#115, #316). They pass on the production build that CI uses (`ESTA_E2E_SERVER=build`).
- Slot 6 is Ryan's. Slot 4 is never used. Owners use slot 2 and reviewers slot 3.
- After a Mac restart, Docker Desktop does not start on its own (`open -a Docker`).
- Integration test files read their lane from the registry in `apps/web/src/test`. A new file must be registered.
- `gh` calls can hang. Wrap them in `timeout`. Use `<<'EOF'` for heredocs that contain backticks.
