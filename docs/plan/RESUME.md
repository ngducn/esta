# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read `docs/plan/trail/standing-orders.md` (newest updates first; the 2026-10-23 00:30 update holds this run's objective and budget), `verification-tiers.md`, `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, `ARCHITECTURE.md`, `docs/plan/connector-track.md` and `docs/plan/STATUS.md`. Briefs are in `~/.claude/orchestrate/esta/briefs/`; the root's todo is `~/.claude/orchestrate/esta/todo-1023.md`.

## Where the run is (written 2026-10-23 07:05 +07)

Main is 0f6a7b93 plus this handoff. The root paused at 07:00 +07 at 26.9% of the meter. Spawning stops at 28% under Ryan's 40% cap. The current window ends at about 10:00 to 10:24 +07; the meter reads 2026-10-22T22:00Z to 2026-10-23T03:00Z. No agent is running. Two PRs are code-ready or nearly so, with Actions runs in flight that no one is watching.

**Merged this run (2026-10-23):**
- #273: CI caches the Supabase images and retries rate-limited pulls on the other registry.
- #269: connector C4, see what Claude changed and undo it.
- #270: the post-merge audit fix-forward. It stops a meter correction from making a bill negative, and it says when ending a lease drops meter charges.
- #275: P4-03, the property ledger by month with CSV and Excel export.

Every merge had a clean rigorous verdict and a green Actions `ci` at the exact head.

**Ryan's words this run:** 2026-10-23 00:24: "ok we can continue now, /pstack:poteto-mode resume from last session. this time keep the limit below 40%. im going to bed now. good night, please be diligent with your work".

## Open work, with the next step for each

- **#277, P3-19 lease prefill from a contract photo** (head a2258fc7, code-ready, rigorous).
  - State: the golden replay meets every target (99.3% of required fields exact). Three synthetic lease recordings were made live through `pnpm agent:record`, costing about 0.38 USD. The owner is done and stopped.
  - Actions run 39874991360 was in flight at the pause. Check it with `timeout 30 gh pr checks 277`, and rerun failed jobs once on `toomanyrequests`.
  - Next: start round 1 from the written briefs `lane-pr277-live.md` (Sonnet, slot 5), `lane-pr277-audit.md` (Opus), `lane-pr277-health.md` (Sonnet) and `lane-pr277-second.md` (Sonnet). Give each lane the head SHA in its prompt.
  - The owner saw three local e2e failures not tied to this PR: duplicate save toasts in documents-extract rule 4 and documents-multipage rule 2, and a hover contrast failure in documents-vault rule 4. If Actions shows them, a lane reruns them alone on main.
- **#280, P4-06 valuations and the Home portfolio figure** (head c69b2190, rigorous). Built and tested, but `/deslop` and `/no-comments` did not run before the stop.
  - Actions run 39875283781 was in flight.
  - Next: start a fresh Opus owner on slot 3 from `briefs/p4-06-finish.md`. Then run round 1 with the same four lanes as #277. Those lane briefs are not written yet; copy the #277 set and point it at valuations, gross yield, the portfolio sum and the migration.
  - The scope moved: seed coverage, the FND-7 checksum extension, north-star step 8 and the Phase 4 exit evidence go to P4-05.
  - The quality raise (the hand-rolled action-call count, 38 to 40, until #193) is accepted by the root, subject to the health lane.
- **#261, the Phase 3 exit** (d75ffe7c): Ryan's to merge. After it come the two-bank-app VietQR scan and the Mom test.
- **#61** (the number guard): closed unmerged 2026-10-23 at Ryan's request. The branch `esta/p5-11-number-guard` stays for P5-03, and the Phase 5 re-cut folds the P5-11 row into P5-03.
- **Queue after these:** P4-01 then P4-04 (tax core and the tax card, Opus audit), then P4-05 (reports and the Phase 4 exit). Then the cleanup round: #193 action hook, #265 to #268, #271, #272, #274, #276, #278, #279, #281 and the older lows. #149 and #197 must land before real data.

## Questions waiting for Ryan

1. From this run, root defaults now on main. Each is listed in STATUS.md; say the word to change any of them.
   - The ledger counts rent by the day the money arrived. Home counts it by the month the bill is due, so the two never match month by month (in the demo, October is 54,000,000 on Home and 10,000,000 in the ledger).
   - Money kept as credit is not income until it is applied to a bill.
   - When the landlord keeps part of a deposit, the ledger does not count it as income.
   - Undoing a batch of Claude's changes also undoes the bills that batch issued, and refuses when anything references them (#269).
   - A meter correction too large to absorb is refused at end of lease, amendment and renewal (#270).
2. How Mẹ fixes a bill that already went out with a wrong meter reading (#270's PR body). The current default is to void it and record again; the recommendation is to let a void re-plan its period.
3. #267: should a receipt show overpayment kept as credit? The recommendation is yes.
4. Merge #261 when ready.
5. Older, still open: see STATUS.md "Waiting for Ryan" (#223, the move-out meter reading, voiding a paid bill, the Zalo link on a phone, the placeholder names, a branch ruleset for `ci`, and others).

## Rules added this run

- **Budget:** below 40% of Ryan's /usage per 5-hour window. Stop spawning at 28% and pause owners at 34% on `usage-pct.sh`. Nothing else runs in his account overnight, so the meter is trusted. No Fable; owners and audits run on Opus, lanes on Sonnet. Never spawn in the first 20 minutes after the meter's window boundary. Two Opus owners together burned about 18 points an hour in build and CI; one owner plus lanes burns about 9.
- **Rigorous review is five lanes:** live (Sonnet), adversarial audit (Opus), codebase health (Sonnet), and a second opinion from a different model on the riskiest part that also runs the touched flow on main as the regression lane.
- **Owners hand back at code-ready** under budget pressure, and the root watches Actions itself. Stop each owner after its report, because a CI watcher of its own resumes it.

## How CI runs now

Actions runs on every PR push: `timeout 30 gh pr checks <n>`. The db and e2e jobs restore the Supabase images from the Actions cache (#273). The first run after a cache-key change, and main's first post-merge run, start cold and may fail on `toomanyrequests`; rerun the failed jobs once with `gh run rerun <id> --failed`. db:test's pg_prove image is not cached yet (#274). The local fallback is `tools/ci-local.sh`.

## Gotchas

- After a Mac restart, Docker Desktop does not start on its own (`open -a Docker`). Old slot stacks restart with it, so stop them with `ESTA_SLOT=<k> pnpm db:stop` before slots look free.
- The Mac has Node 25.9; `.nvmrc` names 24.
- Write the exact money rule into an owner's brief before a money PR. P4-03's "THE MONEY RULE" section was tested case by case by three lanes and held.
- Leases e2e lane 3 ("second tab already active") fails locally on main too but passes on Actions; it is not a PR finding.
- `gh` calls can hang. Wrap them in `timeout`.
- The stale `wt-sheets` worktree is harmless; removing it was blocked by the permission classifier.
