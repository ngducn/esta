# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read `docs/plan/trail/standing-orders.md` (the 2026-10-19 00:20 and 08:45 updates first), `verification-tiers.md`, `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, and `docs/plan/STATUS.md`. Briefs are in `~/.claude/orchestrate/esta/briefs/`; the root's checklist is `~/.claude/orchestrate/esta/todo.md` (newest section at the bottom).

## Where the run is (written 2026-10-19 11:35 +07, Ryan cleared the session)

Merged today: #150 documents vault (4cccbaf), #158 multi-page capture (5e1acb9), #165 speed budgets, closes #148 (783bf4d), #142 nightly invoices and lease status (3136d45), #152 email and password accounts (ab7be33). Closed unmerged by Ryan's ruling: #161, #166 (ID cleanup) and #147.

**Ryan's rulings and requests today (standing orders 2026-10-19 08:45):**
- "Store as typed": text a person types is saved as typed, full ID numbers included, in every typed field. The assistant's own readings keep only the last four digits (D11 amended).
- "No blur": every document shows clear (DOC-5 amended). Sensitivity still limits the assistant and drops ocr_text; views stay logged.
- On the room cards: "yeah do it, those buttons looks weird" (Lên and Xuống behind a reorder mode).
- He approved #142 and #152 ("merge for me when ready"); both merged.

**/clear killed three running agents at 11:35.** Their stacks may still be up on slots 3 and 5: run `docker ps`, and stop orphans with `ESTA_SLOT=3 pnpm db:stop` and `ESTA_SLOT=5 pnpm db:stop` from any worktree before anything else. Then `bin/slot-free.sh` both.

Open, with the next step for each:

- **#169 rulings PR (track A, rigorous), head 08b1123, base 783bf4d.** CI 5/5 at 08b1123.
  - Lane S: ISSUES.
  - Lane LA (combined Opus on slot 5) was killed mid-run. Its evidence so far is in /tmp/swarm-pr169-ev/la/. It had confirmed one blocking finding live: a member's hand-crafted accepted_fields entry with a non-string decision stores a full ID.
  - Next: rerun only lane LA's remaining checks from `briefs/lane-pr169.md`. These are live clear documents, logging, typed text, the assistant's output, sensitivity and regression. The read_entries probe is done. Then send one fix-forward to a fresh Opus owner (`/tmp/owner-rulings/wt`) with:
    1. `private.read_entries` counts an entry as typed only when its decision is exactly the JSON string "edited" (`... where value->'decision' is distinct from '"edited"'::jsonb`), with pgTAP cases for 5, true, an object, an array, null and "EDITED";
    2. reduceNationalIds on documents.title where the worker copies it into agent_items.title (apps/agent/src/jobs/extract-document.ts:143, tools/save-extraction.ts:105);
    3. keep a document's stored sensitivity unless its category changes;
    4. the SPEC §5.5 sentence on which accepted entries the CHECK judges;
    5. any blocking item from lane LA's rerun.
  - Then a scoped round, a rebase onto main (it predates #142 and #152; migration 306400 sorts after 306300), CI and merge. The root merges it, because Ryan made both calls.
- **#164 Phase 2 exit (track A, rigorous), head 0ed18cc.** Owner done.
  - Lane S: PASS.
  - Lane LA (combined Opus on slot 3) was killed mid-run, with partial evidence in /tmp/swarm-pr164-ev/la/. Rerun it from `briefs/lane-pr164.md` (its spawn note: judge against today's main, ignore the wizard's thumbBlur and `sensitive`).
  - Then fix-forward 1 to a fresh owner (`/tmp/owner-p2-08/wt`):
    1. rebase over main and #169 once #169 merges, dropping thumbBlur and `sensitive` from step-photo.tsx and server/properties/wizard.ts;
    2. use the certificate's holder_party_ids for owners, so two same-name parties without ID digits cannot get each other's share;
    3. lane LA's blocking items;
    4. rerun `pnpm phase:check 2`. Its /documents Lighthouse row failed only because #165 was not in its base, and its DOC-5 row must check the amended DOC-5.
  - Merge after #169.
- **#172 lease detail, amend, terminate, renew (P3-08, track B, review-gated), WIP at aaea97c.** The owner stopped before running anything (slot 5 was busy); its trail is in /tmp/owner-p3-08/decisions.tsv.
  - Written but never run: migration 20261007306500, the core timeline and change helpers (their unit tests pass), the amend, terminate and renew actions, the lease detail UI, the seed, and pgTAP lease_changes.test.sql.
  - Left: pnpm db:types, typecheck and lint, db:test, the integration test extension, the /dev/core ScheduleSection, e2e/lease-detail.spec.ts, moving lane 7 in pr-inventory, screenshots and GIF, Lighthouse, deslop and no-comments, and the PR body.
  - Spawn a fresh Opus owner from `briefs/p3-08.md` (ROOT NOTE at the end) to continue from the branch. It closes #144 and stops at merge-ready for Ryan's click.
- **#170 room order (Ryan's ask, rigorous by verify:tier), parked at c5def0b.** Code done; pnpm check and design:detect pass. A fresh owner (`briefs/room-order.md`, continue from the branch) runs the property-units, collections and properties-list specs through heavy.sh, axe in both modes, the screenshots and the 390 video (script at /tmp/owner-rooms/shots/), and finishes the PR body. Then one combined lane plus CI, and the root merges. The Thu tiền board already sorts by room number; leave it.
- **#149 (land use term ranges)** needs its own PR, with tests written first; the shapes from #161's rounds are in its comment. Do it before real certificates are entered.
- **#61** stays parked (P5-11, owned by P5-03).
- **Carry to P5-03 and every Phase 5 assistant-output brief:** business rows and titles can now hold typed full IDs, so anything the assistant writes from them must run the reducer.

Open issues added today: #151, #153, #156, #157, #159, #160, #162, #163, #167 (before deploy: no-store CDN headers and GET-only on app-origin previews), #168 (axe scans wait for colour fades) and #171. #140 keeps the extraction-path ID items.

## Rules added this session (read before acting)

- **The heavy lock is first come, first served** (`bin/lock.sh` gives each waiter a ticket in /tmp/ci-local/queue). Run each Lighthouse or e2e batch inside one heavy.sh call.
- **ci-when-calm.sh does not check its own slot.** Wrap it: `until bin/slot-free.sh <n>; do sleep 30; done; bin/ci-when-calm.sh ...`.
- **Stacks are the bottleneck** (slots 3 and 5 only). For rigorous PRs, one combined Opus live-audit-regression lane plus a no-stack Sonnet second opinion is the working pattern.
- **Hold the owner's push while a live lane drives the old head.** Send "push" when the lane reports, with its findings.
- **After the second fix-forward fails, park the PR and offer Ryan a narrower PR**, built by the root when the split is mechanical (#161 and #166).
- **Never fold accents onto ordinary words** in ID labels or range words; fold only acronyms.
- **Handoffs:** run the `esta-handoff` skill unprompted at quiet points. A SessionStart hook feeds the handoff after /clear, and auto-compaction at 400k keeps agents alive. /clear kills agents.

## How CI runs now

`bin/ci-when-calm.sh <worktree> <pr> <slot> [jobs]` runs in the background with output in /tmp/root-ci/<name>.log, wrapped in a slot-free wait. Watch it with `bin/ci-watch.sh <name>.log | grep --line-buffered -E ": end |failure|end [0-9]"` as a Monitor, and re-arm the Monitor if CI waited on the lock past 30 minutes. Before each merge, check `git merge-tree` and the overlap of the PR's files with main's changes. Rebase with a range-diff check, push with lease, and rerun CI when main moved with code.

## Budget

`bin/usage-pct.sh`. The 04:00Z to 09:00Z block (11:00 to 16:00 +07) was at 18.8% at 11:30. Stop spawning at 90%, pause at 95%. Opus owners cost about 6 to 10 points an hour; Sonnet lanes 2 to 4.

## Gotchas learned this run

- At most two Supabase stacks besides esta-1; never slot 2 (broken, #131) or 4.
- `next dev` fails on @swc/helpers in fresh worktrees (#127); use production builds.
- A first-time flake gets a probe (repeat on head and main) before it is dismissed; the axe colour-contrast flakes so far were transition frames (#168).
- Background agents can report "completed" while their children still run; TaskStop them after their final report.
