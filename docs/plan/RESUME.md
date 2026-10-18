# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read `docs/plan/trail/standing-orders.md` (every 2026-10-18 update), `verification-tiers.md`, `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, and `docs/plan/STATUS.md`. Briefs for every owner and lane are in `~/.claude/orchestrate/esta/briefs/`; the root's checklist is `~/.claude/orchestrate/esta/todo.md` (newest section at the bottom).

## Where the run is (handoff written 2026-10-18 22:55 +07)

Merged this session (session esta-78, from 15:10): #123 P3-07 leases (cb72c18), #132 P3-09 collections board (f8599dc), #124 P2-03 the assistant reads documents (8a306f4), #136 P3-10 record payments (148dec1). `main` is at 148dec1 plus docs.

Open, with the next step for each:

- **#141 P2-07 merged as 38413b4** (round 3 PASS, CI 5/5 at 89b1b6d). Ryan did not answer the speed-budget question; the posted default was applied and #148 is a P2-08 entry requirement.
- **P2-05: the documents vault (track A, rigorous).** Owner spawned 23:30 from 38413b4 with `briefs/p2-05.md` (Opus, slot 3, worktree /tmp/owner-p2-05/wt, migration 306100). Next: code-ready, then the rigorous swarm (live and regression on main, Opus audit with rule 2's no-thumbnail check and the ocr_text D11 path, second opinion on search), CI, merge. If no PR exists for it, rerun the brief.
- **#142 P3-04: the nightly invoice and lease-status job (track B, rigorous, interrogate list).**
  - Round 2 PASS at 65f9bc9; the root rebased it onto 38413b4 as **ef5de0d** (no conflicts, range-diff identical) and reran CI on slot 5 (`/tmp/root-ci/pr142-rebased.log`). **Waiting for Ryan's merge click** at ef5de0d once CI is green (PR comments 6251656881 and the new-head note). If main moves again before he clicks, rebase and rerun CI, then tell him the new head.
- **Next on each track.**
  - Track A after P2-05: P2-06 (multi-page capture into one PDF), then P2-08 (add a property from a certificate photo, the Phase 2 exit; it must include #148, and #147 and #149 should land before it).
  - Track B after #142 merges: P3-08 (lease detail, amend, terminate, renew). Its brief must include #144: terminate and renew through a security definer function that sets end_date to the real termination date, with direct lease status writes revoked (this also closes the cron's early-end gap). Write it from `briefs/p3-04.md`. P3-08 changes the billing SQL, so it cannot start before #142 merges.
- **Open issues.**
  - `[low]` for cleanup rounds: #114, #115, #118, #119, #121, #125, #126, #129, #131, #133, #134, #135, #137, #138, #140, #143, #144 (P3-08), #145, #146, #147 (D11 on the legal tab forms; do before P2-08).
  - #130 closes when #142 merges.
  - Decision for Ryan, no rush: #139 (advance payments when nothing is owed).
  - CI: #122. Local dev: #127, #128. Deploy: #20 and #82 for P6-07.
  - **Slot 2's database volume is broken** (a failed reset left it without `schema_migrations`, #131). Removing its volumes was refused by the permission check; it is waiting for Ryan. Never use slot 2 until then.

## Rules added this session (read before acting)

- **Slots.** Run `~/.claude/orchestrate/esta/bin/slot-free.sh <slot>` before any `db:start`. `ci-when-calm.sh` now writes `/tmp/esta-slot-<n>.busy` from the moment it is queued, because CI's first job runs without a stack and a lane once started the same slot under it. Owner and lane briefs say so.
- **esta-1.** No lane may run anything inside the esta-1 or ekh-* containers, not even a rolled-back query (lane-brief.md).
- **Stacks are the bottleneck.** Two stacks besides esta-1. CI takes the heavy lock and then waits for stacks, so start CI only when it will not wait behind a lane that needs the lock; give CI and lanes different slots.
- **Owners push only at code-ready and fix-forward heads.** An owner's later perf commit moved #141's code under a waiting live lane, which then had to stop. Tell owners: after reporting code-ready, push only PR-body changes unless the root asks.
- **The ID reducer (SPEC D11) is fail closed** (#124, Ryan's choice): every 9 to 12 digit run starting within 40 characters after an ID label is cut to its last four. Nearby phones, tax codes and prices without a currency mark lose digits; Mẹ reads them from the photo. Never add a path that writes extracted or typed text without the reducer and the database judging it.
- **Money and legal rows are written only inside SQL.** Invoices (#123, #142), payments (#136). Members cannot write them in arbitrary shapes. Apply the same rule to lease status in P3-08 (#144).

## How CI runs now

- The root runs `~/.claude/orchestrate/esta/bin/ci-when-calm.sh <worktree> <pr> <slot> [jobs]` in the background with output in `/tmp/root-ci/<name>.log`, and watches it with `~/.claude/orchestrate/esta/bin/ci-watch.sh <name>.log | grep --line-buffered -E ": end |failure"` as a Monitor. Job logs are in `/tmp/ci-local/pr-<n>-<sha>/`.
- Before each merge, compare the PR's files with what main changed since its merge base (`git merge-base`, then `comm` of the two name lists). Rebases this session hit the generated types, the message files and the Playwright shared-clock list every time.
- The CI db job regenerates `packages/db/src/database.types.ts` and fails on any difference, so a scripted rebase that takes one side of that file is safe as long as CI's db job passes afterwards.
- Load around 7 makes e2e slow and adds retries (one 20 MB upload timed out once at load 7). A first-time flake gets a probe (repeat the spec, time the page against main) before it is dismissed.

## Budget

- `~/.claude/orchestrate/esta/bin/usage-pct.sh` reads the current block. Up to 95% per block: stop spawning at 90%, pause at 95%. The block 13:00Z to 18:00Z (20:00 to 01:00 +07) was at about 50% at this handoff.
- Opus owners cost about 6 to 10 points an hour; Sonnet lanes 2 to 4.

## Gotchas learned this run

- At most two Supabase stacks besides `esta-1`; never slot 2 (broken) or 4.
- A bash script edited in place keeps running its old text; write a new file and `mv` it.
- `next dev` 500s on `@swc/helpers` in fresh worktrees and breaks the document view route (#127); use production builds for screenshots and e2e (`ESTA_E2E_SERVER=build`).
- The permission classifier denied removing slot 2's Docker volumes and, once, read-only `gh issue list` right after; retry GitHub reads later rather than working around a denial.
- Background agents report through SendMessage hand-backs; a hand-back saying it is "waiting on its own background work" is interim.
