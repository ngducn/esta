# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read `docs/plan/trail/standing-orders.md` (the 2026-10-19 00:20 and 08:45 updates first), `verification-tiers.md`, `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, and `docs/plan/STATUS.md`. Briefs are in `~/.claude/orchestrate/esta/briefs/`; the root's checklist is `~/.claude/orchestrate/esta/todo.md` (newest section at the bottom).

## Where the run is (written 2026-10-19 10:35 +07, Ryan online this morning)

Merged since the last handoff: #150 documents vault (4cccbaf), #158 multi-page capture (5e1acb9), #165 speed budgets, closes #148 (783bf4d), #142 nightly invoices and lease status (3136d45, Ryan's click), #152 email and password accounts (ab7be33, Ryan's click). Closed unmerged by Ryan's 08:45 ruling: #161 and #166 (ID cleanup), #147.

**Ryan's rulings at 08:45 (standing orders):** text a person types is saved as typed, full ID numbers included, in every typed field; the assistant's own readings keep only the last four digits (D11 amended). No blur on any document (DOC-5 amended); sensitivity still limits the assistant and drops ocr_text; views stay logged. Ryan also asked for the Lên and Xuống room buttons to move behind a reorder mode ("those buttons looks weird").

Open, with the next step for each:

- **#169 rulings PR (track A, rigorous), owner running on slot 5** (`briefs/rulings-1019.md`). Removes blur everywhere, removes typed-ID refusals (Sửa thông tin, review-screen edits, the accepted_fields CHECK for typed values), edits SPEC D11 and DOC-5. Next: code-ready head, then a rigorous round (one combined Opus lane plus a Sonnet second opinion, because stacks are the bottleneck), CI, merge (root merges: Ryan made both calls).
- **#164 Phase 2 exit (track A, rigorous), code-ready at 0ed18cc, owner done.** Round 1: lane S PASS (owner shares and transitions); lane LA was stopped by the budget hold before it ran, so respawn it from `briefs/lane-pr164.md` on slot 3. Then one fix-forward with: the rebase over #165 and #169 (drop thumbBlur and `sensitive` from the wizard's upload in step-photo.tsx and server/properties/wizard.ts), lane S's owner match (use the certificate's holder_party_ids, so two same-name parties without ID digits cannot get each other's share), and lane LA's blocking items; rerun `pnpm phase:check 2` (its /documents Lighthouse row failed only because #165 was not in the base; DOC-5 row must check the amended DOC-5). Merge after #169.
- **#170 room order (Ryan's ask, rigorous by verify:tier), parked at c5def0b.** Code done, pnpm check and design:detect pass. Left: the property-units, collections and properties-list specs through heavy.sh, axe in both modes, screenshots and the 390 video (script at /tmp/owner-rooms/shots/), PR body verification. A fresh owner finishes it when a slot is free; then one Sonnet live lane plus CI; root merges. The Thu tiền board already sorts by room number (it never read sort_order); left as is.
- **Track B: P3-08 lease detail, amend, terminate, renew** is unblocked now that #142 merged. Brief ready: `briefs/p3-08.md` (fill SQUASHSHA with 3136d45; migration after 306300 and after #169's). It closes #144. Review-gated: stops at merge-ready for Ryan.
- **#149 (land use term ranges)** needs its own PR with tests first; the full list of shapes from #161's three rounds is in its comment. Not urgent; before real certificates.
- **#61** stays parked (P5-11, owned by P5-03).

Open issues added today: #151 (vault search punctuation, small vault items), #153 (ways to tell which emails have accounts), #156 (account copy and tests), #157 (test helper race), #159, #160, #162, #163 (term after "hạn"), #167 (before deploy: no-store CDN headers and GET-only on app-origin previews), #168 (axe scans wait for colour fades), #171 (a single added room lands at the bottom). #140 keeps the extraction-path ID items (label accents on acronyms, middle dots).

## Rules added this session (read before acting)

- **The heavy lock is first come, first served** (`bin/lock.sh` gives each waiter a ticket in /tmp/ci-local/queue). Ask owners and lanes to run each Lighthouse or e2e batch inside one heavy.sh call.
- **ci-when-calm.sh does not check its own slot.** Before starting CI on a slot an owner or lane may hold, wrap it: `until bin/slot-free.sh <n>; do sleep 30; done; bin/ci-when-calm.sh ...`.
- **Stacks are the bottleneck** (two besides esta-1, slots 3 and 5). For rigorous PRs, one combined Opus live-audit-regression lane plus a no-stack Sonnet second opinion has been the working pattern (#142, #164, #165).
- **Hold the owner's push while a live lane drives the old head**; send "push" when the lane reports and add its findings to that message.
- **After the second fix-forward fails, park and offer Ryan a narrower PR** (the #161/#166 pattern), built by the root when the split is mechanical.
- **Never fold accents onto ordinary words** in ID labels or range words (đền is not đến; sơ thế is not số thẻ); fold only acronyms.

## How CI runs now

Unchanged from before, plus the slot-free wrap above: `bin/ci-when-calm.sh <worktree> <pr> <slot> [jobs]` in the background with output in /tmp/root-ci/<name>.log, watched with `bin/ci-watch.sh <name>.log | grep --line-buffered -E ": end |failure|end [0-9]"` as a Monitor (re-arm it if CI waited on the lock past 30 minutes). Before each merge, check `git merge-tree` and the overlap of the PR's files with what main changed; rebase with a range-diff check and push with lease; rerun CI when main moved with code.

## Budget

`bin/usage-pct.sh`. The 23:00Z to 04:00Z block (06:00 to 11:00 +07) reached about 90% at 10:30 with a budget hold (lane LA on #164 stopped, #170 parked). A new block starts at 11:00 +07. Opus owners cost about 6 to 10 points an hour; Sonnet lanes 2 to 4.

## Gotchas learned this run

- At most two Supabase stacks besides esta-1; never slot 2 (broken, #131) or 4.
- `next dev` fails on @swc/helpers in fresh worktrees (#127); use production builds.
- A first-time flake gets a probe (repeat on head and main) before it is dismissed; axe colour-contrast flakes so far were transition frames (#168).
- Background agents can report "completed" with live children; TaskStop them after their final report.
