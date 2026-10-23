# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read `docs/plan/trail/standing-orders.md` (newest updates first; the 2026-10-23 00:30 update holds this run's objective and budget), `verification-tiers.md`, `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, `ARCHITECTURE.md`, `docs/plan/connector-track.md` and `docs/plan/STATUS.md`. Briefs are in `~/.claude/orchestrate/esta/briefs/`; the root's todo is `~/.claude/orchestrate/esta/todo-1023.md`; lane reports are saved under `~/.claude/orchestrate/esta/review-<pr>/`.

## Where the run is (written 2026-10-23 13:25 +07)

Main is e54102ff plus this handoff. Usage is 28.9% of the window that ends 15:00 +07 (08:00Z), past the 28% spawn stop, so nothing runs. One PR is code-ready and waits for review lanes after the reset.

**Merged this run (2026-10-23):**
- #273: CI caches the Supabase images.
- #269: connector C4, see and undo Claude's changes.
- #270: the post-merge audit fix-forward.
- #275: P4-03, the property ledger by month with CSV and Excel export.
- #261: the Phase 3 exit (Ryan said "yeah").
- #277: P3-19, prefill a lease from a photo of the contract.
- #280: P4-06, valuations and the Home portfolio figure.
- #283: P4-04, Mẹ's tax card against the 500 million threshold.

Every merge had a clean rigorous verdict and a green Actions `ci` at the exact head. #61 (the number guard) was closed unmerged at Ryan's request. Its branch `esta/p5-11-number-guard` stays for P5-03.

**Ryan's words this run:**
- 00:24: "ok we can continue now, /pstack:poteto-mode resume from last session. this time keep the limit below 40%. im going to bed now. good night, please be diligent with your work".
- Later: "you know what, lets include graphify in our workflow. i think is credible enough, i want to start saving now", then "yeah do it".

## Open work, with the next step for each

- **#286, P4-05a: the money reports on Báo cáo with Excel** (head 32473b27, code-ready, rigorous; the owner is stopped).
  - What it ships: P&L by property, rent roll and monthly collections, report invariants, and Excel through the existing export.
  - Product code is +829/−168. About 100 of those lines are reads moved into ops. The owner flagged the size instead of splitting.
  - The owner changed `scripts/plan-coverage.ts` to accept ids like P4-05a.
  - Next, after 15:20 +07: check `timeout 30 gh pr checks 286`. Write the round 1 lane briefs by copying `lane-pr283-{live,audit,health,second}.md` and pointing them at the money rules in `briefs/p4-05a.md`. Spawn live (Sonnet, slot 5), Opus audit (slot 3), health (Sonnet) and second opinion (Sonnet). The health lane rules on the size.
- **P4-05b** (occupancy, portfolio summary, owner annual summary, Tải PDF) and **P4-05c** (the Phase 4 exit: seed coverage, the FND-7 checksum extension, `pnpm phase:check 4`) follow. The split is recorded in the trail. North-star step 8 already landed in #283.
- **Cleanup round after Phase 4:** #193 (action hook), #265 to #268, #271, #272, #274, #276, #278, #279, #282, #284, #285 and older lows. #149 and #197 must land before real data.
- **Phase 3 waits on Ryan:** the two-bank-app VietQR scan (`pnpm gate:vietqr`) and the Mom test.

## Graphify (adopted 2026-10-23 on Ryan's order)

- Hooks are in the main checkout's `.claude/settings.local.json`, and subagents inherit them. The rule is in owner-brief.md and lane-brief.md; f26a0577 made building the map a numbered setup step.
- Measurement: `~/.claude/orchestrate/esta/bin/agent-usage.py [--rows]` gives median weighted tokens per role and model, before and after the cutoff of 05:40Z.
- The removal rule is pre-registered in `~/.claude/orchestrate/esta/graphify-adoption.md`, with an amendment. Judge it at 12 post-cutoff lane agents or the Phase 4 exit, and log each merged PR's quality row there.
- Early data: #283's round 1 lanes made 0 graph calls, before the setup step. The r2 lane made 3, and `explain` found only file edges for a SQL function.

## Questions waiting for Ryan

1. Root defaults now on main, each listed in STATUS.md:
   - the ledger counts rent on a cash basis;
   - credit is not income until it is applied;
   - a kept deposit is not income;
   - #269's undo also undoes bills;
   - #270 refuses a meter correction too large to absorb.
2. #283 lowered the demo Quận 1 shop's rent from 30,000,000 to 2,500,000 ₫ a month, so Mẹ lands in the tax band the spec's demo expects. The plan allows that change (plan line 3556). Its yield drops from 5% to 0.42%, and its 2026 income drops from 360M to 30M. Home is unchanged.
3. How Mẹ fixes a bill that went out with a wrong meter reading (#270).
4. Should a receipt show overpayment kept as credit (#267)? The recommendation is yes.
5. Older questions: see STATUS.md "Waiting for Ryan".

## Rules added this run

- **Budget:** stay below 40% of Ryan's /usage per 5-hour window. Stop spawning at 28% and pause owners at 34% on `usage-pct.sh`. No Fable. Owners and audits run on Opus, lanes on Sonnet. Never spawn in the first 20 minutes after the window boundary. One Opus owner burns about 10 points an hour.
- **Rigorous review:** live (Sonnet), adversarial audit (Opus), codebase health (Sonnet), and a second opinion from a different model on the riskiest logic. On #283 the second opinion caught a money bug the Opus audit missed, so keep it.
- **Owners hand back at code-ready.** Stop each owner after its report; the root watches Actions.
- **Fix-forward:** a fresh owner with a brief that lists only the blocking items, then a scoped round 2 review of the fix diff.

## How CI runs now

Actions runs on every PR push; check with `timeout 30 gh pr checks <n>`. Rerun failed jobs once on `toomanyrequests` with `gh run rerun <id> --failed`. The local fallback is `tools/ci-local.sh`.

## Gotchas

- After a Mac restart, Docker Desktop does not start on its own (`open -a Docker`). Stop old slot stacks before trusting `slot-free.sh`.
- Write the exact money rule into an owner's brief before a money PR.
- The e2e tests that need the demo date must run in the clock project, not the mobile one (#283's red shard).
- `gh` calls can hang. Wrap them in `timeout`.
- An unquoted heredoc with backticks runs them as commands. Use `<<'EOF'`.
