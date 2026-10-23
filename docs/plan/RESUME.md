# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read:
- `docs/plan/trail/standing-orders.md` (newest updates first);
- `verification-tiers.md`, `owner-brief.md` and `lane-brief.md`;
- the tail of `decisions.tsv`;
- `ARCHITECTURE.md`, `docs/plan/connector-track.md` and `docs/plan/STATUS.md`.

Briefs are in `~/.claude/orchestrate/esta/briefs/`. The root's todo is `~/.claude/orchestrate/esta/todo-1023.md`. Lane reports are saved under `~/.claude/orchestrate/esta/review-<pr>/`.

## Where the run is (written 2026-10-23 19:00 +07)

**Phase 4 is done.** Main is 8fe3d99d plus this handoff. `pnpm phase:check 4` passes all seven rows: tax examples, report invariants, the FND-7 checksum, seed coverage, RLS, integration and the north-star through step 8. STATUS.md "Shipped" holds the evidence.

No agent is running, and no PR is open from this run. Usage is 25.8% of the window ending 20:00 +07 (13:00Z). The root stopped here on purpose. CLAUDE.md says the cleanup and audit round at a phase boundary is decided with Ryan, and the meter is near the 28% spawn stop.

**Merged this run (2026-10-23):**

| PR | What it does |
| --- | --- |
| #273 | CI caches |
| #269 | Connector C4 undo |
| #270 | Audit fix |
| #275 | Property ledger |
| #261 | Phase 3 exit |
| #277 | Lease prefill from a contract photo |
| #280 | Valuations and the Home portfolio figure |
| #283 | Mẹ's tax card |
| #286 | P&L, rent roll and collections with Excel |
| #289 | Occupancy, portfolio, owner summary and PDF |
| #291 | Phase 4 exit; closes #288 |

Each had a clean rigorous verdict (live or gates, Opus audit, health, and a second opinion) and a green Actions `ci` at the exact head.

**Ryan's words this run:**
- 00:24: "ok we can continue now, /pstack:poteto-mode resume from last session. this time keep the limit below 40%. im going to bed now. good night, please be diligent with your work".
- Later: "you know what, lets include graphify in our workflow. i think is credible enough, i want to start saving now", then "yeah do it".

## Next, for Ryan to decide

1. **The cleanup and audit round at the Phase 4 boundary.**
   - Recommendation: one cleanup PR per batch.
   - #292 goes first. It is the dev-only receipt 500 that makes the strict north-star exit row fail about one run in three on a dev server. Fix it, and run the phase north-star rows on a production build.
   - Then #193 (the action hook, which lowers the quality raises), followed by the review lows: #284, #285, #287, #290, #293, #265 to #268, #271, #272, #274, #276, #278, #279 and #282.
   - #149 and #197 must land before real data.
   - The default, if Ryan just says go, is #292, then #193, then the lows in batches.
2. **Phase 5 (the agent)** after that, per the plan. #61's branch `esta/p5-11-number-guard` stays for P5-03.
3. **Phase 3 still waits on Ryan:** the two-bank-app VietQR scan (`pnpm gate:vietqr`) and the Mom test.
4. **Root defaults on main.** They are listed in STATUS.md under "Defaults the root chose on 2026-10-23"; say the word to change any. The newest:
   - the demo Quận 1 rent change;
   - "Chưa thu" counting bills not yet due;
   - the two vacancy numbers;
   - archived property revenue on the owner summary;
   - four runtime tables left out of the demo data.
5. Older questions: STATUS.md "Waiting for Ryan" (#267, #270's wrong-meter fix, #223 and others).

## Graphify (adopted 2026-10-23 on Ryan's order)

- **Setup.** Hooks live in the main checkout's `.claude/settings.local.json`. Building the map is a numbered setup step in owner-brief.md and lane-brief.md.
- **Measurement.** Run `~/.claude/orchestrate/esta/bin/agent-usage.py`. The rule and the per-PR quality log are in `~/.claude/orchestrate/esta/graphify-adoption.md`.
- **First judgment at 12 lane agents: INCONCLUSIVE.**

| Role | Change in median cost |
| --- | --- |
| Audit | +60% |
| Short reviews | +19% |
| Owner-run Opus reviews | −57% |
| Owners | −44% (biased low by small fix-forwards) |

  No wrong-graph incidents so far. Lanes use it lightly, about 1 to 4 calls, mostly the build, and `explain` often finds no node.
- **Decide at 25 lane agents.** Keep it only if the median cost change across roles is negative.

## Rules added this run

- **Budget.** Stay below 40% of Ryan's /usage per 5-hour window: stop spawning at 28% and pause owners at 34% on `usage-pct.sh`. Never spawn in the first 20 minutes of a window. One Opus owner burns about 10 points an hour, and a four-lane round about 5.
- **Rigorous review.** Run live (or gates for a non-UI PR), an Opus audit, codebase health, and a second opinion from a different model on the riskiest logic. The second opinion caught bugs the audit missed on #283.
- **Fix-forward.** A fresh owner works from a brief listing only the blocking items. Then a scoped round 2 Sonnet review of the fix diff. Then merge.
- **Write the money and day rules, and the lessons, into owner briefs.** The lessons:
  - one lease-in-effect rule (`inEffect` in `packages/core/src/lease/current.ts`);
  - filter deleted properties;
  - a lease terminated on a future date counts until that date;
  - a label says what its number is;
  - a test must be able to fail.

## How CI runs now

Actions runs on every PR push; check it with `timeout 30 gh pr checks <n>`. Rerun failed jobs once on `toomanyrequests` with `gh run rerun <id> --failed`. The local fallback is `tools/ci-local.sh`.

## Gotchas

- After a Mac restart, Docker Desktop does not start on its own (`open -a Docker`).
- The e2e tests that need the demo date run in the clock project.
- Integration test files read their lane from the registry in `apps/web/src/test` (#291). A new file must be registered.
- `gh` calls can hang. Wrap them in `timeout`.
- Use `<<'EOF'` for heredocs that contain backticks.
