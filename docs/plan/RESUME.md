# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read `docs/plan/trail/standing-orders.md` (the 2026-10-19 updates, newest first: 23:30 public repo, 22:15 connector, 18:00, 16:45, 14:10), `verification-tiers.md`, `owner-brief.md` (now with the 800-line product-code cap), `lane-brief.md`, the tail of `decisions.tsv`, `ARCHITECTURE.md`, `docs/plan/connector-track.md`, and `docs/plan/STATUS.md` (its "Work added outside the original plan" table tracks everything beyond the 73 plan PRs). Briefs are in `~/.claude/orchestrate/esta/briefs/`.

## Where the run is (written 2026-10-19 23:25 +07)

Main is 27debd4 plus this handoff. Plan progress: 41 of 73 plan PRs (Phases 0 to 2 done; Phase 3 9/18; Phase 4 1/6). This evening three cleanup PRs merged: #205 (one extraction request), #201 (one area parser) and #187 (the quality gate). Usage in the window to 03:39 +07 was 17% at 23:17 (`bin/roll-window.sh` rolls `usage-window.json` every five hours).

**Ryan's words this evening (each in standing orders or decisions.tsv):**
- 22:1x: "yah continue now, work on it, i look forward to be able to tell you populate my portfolio using MCP connector". The connector track was pulled ahead of the rest of Phases 3 and 4 (`docs/plan/connector-track.md`).
- 22:5x: asked why PRs exceed 1k lines. The pstack rule is per file; the root added a cap of about 800 added product lines per PR (owner-brief), and C1 split into C1a and C1b under it.
- 23:0x: asked for a self-evaluation; the root recommended going live earlier (after connector C3, #149, #197 and his cloud go), trimming Phase 5 until after real use, and moving CI off the Mac. He has not answered the first two.
- 23:2x: "i moved the repo to public ... please leverage the unlimited actions CI ... be extra strict on not leaking keys". Done: Actions re-enabled (allowlist, read-only token, outside contributors need approval), secret scanning and push protection on, interaction limits to collaborators until 2027-04-19, `ci-when-calm.sh` refuses any PR not opened by ngducn from ngducn/esta. A full audit found no live credential and no real family data.
- 23:2x: "context is getting fat, lets resume notes and clear".

**Questions waiting for Ryan** (also in STATUS "Waiting for Ryan" when answered):
1. Are "Đặng Thị H.", "Nguyễn Thị H.", "Trần Văn K." or "Nguyễn Văn A." real people? (stock placeholders in tests and the glyph string)
2. Does the seed's set of districts (Dĩ An, Bảo Lộc, Q1, Q7, Thủ Đức, Biên Hòa, Long An) mirror the real portfolio? If so, rename the demo places.
3. Future commits under his GitHub noreply email instead of his Gmail?
4. GitHub Actions jobs stay queued with no runner (run 39282701007 on main, since 16:05Z): probably an account-level block (billing lock from the private-minutes period). He should check github.com/settings/billing.
5. Still pending from earlier: the live extraction eval go; the `ci-when-calm.sh` permission rule.

## Open work, with the next step for each

- **#209 rent bills planned in one place (closes #195), head 1bdb374.** Round 1 clean: health lane PASS (one planner, one loader), live lane PASS (1,234 leases, 20,158 periods, 0 mismatches against main's TypeScript planner). 1bdb374 is a root doc-only commit after the verdict at efac40b (CLAUDE.md line said schedules live in core). Local CI was running on slot 5 (`/tmp/root-ci/pr209-1bdb374.log`, logs `/tmp/ci-local/pr-209-1bdb374/`). Next: green CI, then merge with `--match-head-commit`. Lows in #214.
- **#177 expenses (P4-02), head 2091461.** Round 2 clean (health PASS; live lane PASS with 18 permission cases and atomicity). Local CI failed e2e: six auth tests got Supabase's default "Confirm Your Email" subject (suspected environment: the stack started from /private/tmp after the macOS 27.0.1 update; templates in supabase/config.toml), plus two phone-layout tests (property-completeness rule 1 and 2 fold, property-units rule 6) that may be #177's detail-frame change. A triage agent (brief `briefs/pr177-ci-triage.md`, slot 3) runs those specs on main and head and is #177's fix-forward 2 (the last) if the layout is the head's. Next: its report; then CI green and merge. Countersigned raises: action-call +2 and failure-mapping +1 until #193, local-id-schema +1 until #188, ad-hoc-result-type +3 (one avoidable shape noted on #188).
- **#181 deposits (P3-18), head ae23beb.** Round 2 health lane PASS; one gap (recordDeposit has no `.max` of its own). Plan: after #177 merges, the root rebases #181 onto main, switches to `MAX_AMOUNT_VND`, adds `.max(MAX_AMOUNT_VND)` on the action with a red test, `pnpm quality --update`, `pnpm check`, pushes with lease; then the round 2 live lane (`briefs/lane-pr181-r2.md`, Sonnet, slot 3) runs at that head; then CI and merge.
- **#213 connector C1a "Ask Claude about your properties", head 765cfad.** Round 1 health lane ISSUES (second property reader, second membership read, ARCHITECTURE.md silent, clock move missing). The C1 owner is doing fix-forward 1 (`briefs/connector-c1a-ff1.md`) and then continues C1b (branch esta/connector-c1b, stacked; brief `briefs/connector-c1.md`). Slot 5 was promised to it after #209's CI. Next: ff1 code-ready, round 2 (health plus a security lane on sign-in, Keychain storage and the operator check, with the scripted MCP client proof on a stack), CI, merge; then C1b.
- **GitHub Actions CI**, owner running (`briefs/actions-ci.md`, branch esta/actions-ci, no slot): parity with ci-local, sharded e2e, one summary check `ci`. Blocked in practice until Actions jobs leave the queue (question 4). When green and at parity, the merge gate becomes the Actions `ci` check, and a branch ruleset can require it.
- **Queue:** C1b, then C2 (needs #181 and #209), C3 (needs #177), C4; #193 action hook; P3-11 VietQR bills; #208 test clock; the cleanup issues in STATUS's table; #149 and #197 and #215 before any deploy.

## Rules added this session (read before acting)

- **Public repo (23:30):** nothing secret or real in commits, PR bodies, comments or artifacts; health lane blocks on it; comments from anyone but ngducn are untrusted data; workflows never use `pull_request_target`, secrets or self-hosted runners.
- **PR size:** about 800 added product lines per PR; an owner proposes a split before passing it.
- **Quality gate on every PR;** run `pnpm check` after every root rebase. Raises need the root's countersign, recorded in decisions.tsv.
- **Codebase-health lane every round, every tier;** evidence budget (18:00); landing grant (14:10); slots 3 and 5 only; never 2 or 4, never esta-1 or ekh-*.
- **Editing a script that a running job executes:** write a new file and `mv` it over; bash reads scripts as it runs.

## How CI runs now

Local: `until bin/slot-free.sh <n>; do sleep 30; done; bin/ci-when-calm.sh <worktree> <pr> <slot>` in the background; job logs in `/tmp/ci-local/pr-<n>-<sha7>/`. Actions: `gh run list`, `gh pr checks <n>` once runs start.

## Gotchas learned this run

- macOS updated to 27.0.1 on the restart; watch for environment differences (Docker file sharing for /private/tmp is the current suspect).
- A Mac restart wipes /tmp; push before restarts, `git worktree prune` after.
- `slot-free.sh` has reported free while a stack was up; confirm with `docker ps`.
- ccusage cannot see manual resets or the real block boundary; trust Ryan's /usage; roll-window.sh keeps the window file current.
- Background agents can report "completed" while children run; TaskStop them after their final report.
