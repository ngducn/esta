# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read `docs/plan/trail/standing-orders.md` (every 2026-10-18 update), `verification-tiers.md`, `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, and `docs/plan/STATUS.md`. Briefs for every owner and lane are in `~/.claude/orchestrate/esta/briefs/`; the root's checklist is `~/.claude/orchestrate/esta/todo.md` (newest section at the bottom).

## Where the run is (handoff written 2026-10-19 00:25 +07, Ryan going to bed)

Merged in session esta-78 (2026-10-18 15:10 to 00:25): #123 P3-07 leases (cb72c18), #132 P3-09 collections board (f8599dc), #124 P2-03 the assistant reads documents (8a306f4), #136 P3-10 record payments (148dec1), #141 P2-07 review and accept extracted fields (38413b4). `main` is at 38413b4 plus docs.

**Ryan's new request (do this next on track A): accounts like other apps.** His words, 00:20: "can we just for now create account and log in like any other apps?" It changes locked decision D8, and he raised it himself, so it is his go. The defaults are in standing-orders.md (2026-10-19 00:20):
- email and password sign-up, sign-in and forgot-password;
- a one-time email confirmation by the existing code, which keeps invites safe;
- the code kept as a secondary way in and for tests;
- an 8-character minimum;
- Google sign-in stays at Phase 6.

Brief: `~/.claude/orchestrate/esta/briefs/auth-password.md` (rigorous). Start it as soon as #150 merges, on slot 3, before P2-06. If Ryan changes a default in the morning, update the brief before the owner starts, or send it to a running owner.

Open, with the next step for each:

- **#150 P2-05: the documents vault (track A, rigorous).** Code-ready at 9d6d941 (base af1fa31, migration 306100).
  - At 00:05, root CI started on slot 5 (`/tmp/root-ci/pr150-9d6d941.log`, job logs `/tmp/ci-local/pr-150-9d6d941/`). Round 1 also started from `briefs/lane-pr150.md` with three lanes:
    - lane L: Sonnet live and regression, slot 5 after CI;
    - lane A: Opus audit, slot 3;
    - lane S: Sonnet second opinion on search and expiry, no stack.
  - Their evidence lands in `/tmp/swarm-pr150-ev/{live,audit,math}/`.
  - **These were still running at the handoff.** Their reports may not reach the next session. If they do not, read each evidence folder. A lane whose folder has no report after its timebox (80, 75 and 45 minutes from 00:05) is stuck: rerun only that lane's section. Check `docker ps` and `bin/slot-free.sh` first, so you do not start a duplicate on a slot a lane still holds.
  - **Already known for the fix-forward:** `/documents` LCP is 2.72 s against the 2.5 s budget. The cause is the first tile's lazy thumbnail. The fix is in one file: load the first tiles eagerly with high priority, as the property list does (owner report).
  - **Lane S reported at 00:30 (ISSUES):**
    - **Blocking:** Sửa thông tin sends expiresOn null when the date cannot be read. 31/02/2027, 30-10-26, 30/10 and abc each erase q7's 2026-10-30, and it drops out of Sắp hết hạn. Cause: document-edit-sheet.tsx lines 54 and 101. Fix it like LeaseForm and RecordPaymentSheet: refuse an unreadable date. Repro: /tmp/swarm-pr150-ev/math/web/edit-sheet.dom.test.tsx and run1.log.
    - **Not blocking:** typed queries such as `Q.7`, `TP.HCM`, `07/10/2026` and `1.234.000` miss, because to_tsvector('simple') keeps them as one lexeme while the query splits on punctuation. File it as `[low]`. The suggested fix is to replace `[^[:alnum:]]+` with a space in document_search_vector. Also not blocking: turning a document sensitive drops its ocr_text, and Hoàn tác does not restore it. Add that to the same `[low]`.
    - **Passed:** accent folding and expiry, over 5,000 generated cases each.
    - Lanes L and A were still running.
  - Also confirm that CI ran `documents-extract` and `extraction-review`. The owner changed one tile selector in each and could not run them.
  - Send every blocking finding in one fix-forward: a fresh Opus owner in `/tmp/owner-p2-05/wt`. Then run a scoped round, CI and the merge.
- **#142 P3-04: the nightly invoice and lease-status job (track B, rigorous, interrogate list).**
  - Merge-ready at **ef5de0d**: round 2 PASS, rebased onto 38413b4 with an identical range-diff, CI 5/5 there. **Waiting for Ryan's merge click** (PR comments 6251656881 and 6252413044).
  - If main moves before he clicks, rebase again. Scripted resolvers: `/tmp/root-pr124/resolve-messages.py` and `resolve-playwright.py`. Rerun CI and post the new head for him.
- **Next on each track.**
  - Track A: #150, then accounts like other apps, then P2-06 (multi-page capture into one PDF), then P2-08 (the Phase 2 exit).
    - P2-08 must include #148: a review-size photo copy and a lazily loaded PDF viewer. Ryan never answered the speed question on #141, and the posted default was applied.
    - #147 and #149 should land before P2-08.
  - Track B after Ryan merges #142: P3-08 (lease detail, amend, terminate, renew). Its brief must include #144: terminate and renew through a security definer function that sets end_date to the real termination date, with direct lease status writes revoked. Write it from `briefs/p3-04.md`. P3-08 changes the billing SQL, so it cannot start before #142 merges.
- **Open issues.**
  - `[low]` for cleanup rounds: #114, #115, #118, #119, #121, #125, #126, #129, #131, #133, #134, #135, #137, #138, #140, #143, #144 (P3-08), #145, #146, #147 (D11 on the legal tab forms; before P2-08), #149 (dash-range terms; before real certificates).
  - #130 closes when #142 merges. #148 is a P2-08 entry requirement.
  - Decision for Ryan, no rush: #139 (advance payments when nothing is owed).
  - CI: #122. Local dev: #127, #128. Deploy: #20 and #82 for P6-07.
  - **Slot 2's database volume is broken**: a failed reset left it without `schema_migrations` (#131). Removing its volumes was refused by the permission check. Ryan can run `docker volume rm supabase_db_esta-2 supabase_storage_esta-2` while slot 2 is stopped. Never use slot 2 until then.

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

- `~/.claude/orchestrate/esta/bin/usage-pct.sh` reads the current block. Up to 95% per block: stop spawning at 90%, pause at 95%. The block 13:00Z to 18:00Z (20:00 to 01:00 +07) was at about 77% at this handoff; a new block starts at 01:00 +07.
- Opus owners cost about 6 to 10 points an hour; Sonnet lanes 2 to 4.

## Gotchas learned this run

- At most two Supabase stacks besides `esta-1`; never slot 2 (broken) or 4.
- A bash script edited in place keeps running its old text; write a new file and `mv` it.
- `next dev` 500s on `@swc/helpers` in fresh worktrees and breaks the document view route (#127); use production builds for screenshots and e2e (`ESTA_E2E_SERVER=build`).
- The permission classifier denied removing slot 2's Docker volumes and, once, read-only `gh issue list` right after; retry GitHub reads later rather than working around a denial.
- Background agents report through SendMessage hand-backs; a hand-back saying it is "waiting on its own background work" is interim.
