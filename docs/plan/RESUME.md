# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read `docs/plan/trail/standing-orders.md` (the 2026-10-19 updates, newest first: 23:30 public repo, 22:15 connector, 18:00, 16:45, 14:10), `verification-tiers.md`, `owner-brief.md` (800-line product cap; CI on Actions; heavy jobs and full `pnpm check` through heavy.sh), `lane-brief.md`, the tail of `decisions.tsv`, `ARCHITECTURE.md`, `docs/plan/connector-track.md`, and `docs/plan/STATUS.md` ("Work added outside the original plan"). Briefs are in `~/.claude/orchestrate/esta/briefs/`.

## Where the run is (written 2026-10-20 04:30 +07)

Main is c8dc732 plus this handoff. Plan progress: 43 of 73 plan PRs. Usage window 03:39 to 08:39 +07 was about 3% at 04:00 (the previous window ended near 45%).

**Merged overnight (2026-10-19 23:30 to 2026-10-20 04:20):**
- #209 rent bills planned in one place, the database (9d30de0).
- #218 local stacks keep Esta's own emails after a reset (f83ac0a). Docker 29.2.0 broke the mounted email templates after `db:reset`, which made six auth e2e specs fail everywhere.
- #213 connector C1a "Ask Claude about your properties" (1e5a8fe).
- #177 expenses with receipts, P4-02 (08fd91c).
- #216 GitHub Actions CI (d66dd75). From here on, the merge gate is a green Actions `ci` check at the exact head, about 6 minutes. `tools/ci-local.sh` is the fallback.
- #217 connector C1b "Add a property by talking to Claude" (c2cbfde).
- #181 deposits on the lease, P3-18 (c8dc732).

**Ryan's words since the last handoff:** "also CI on actions doesn't run well" (00:3x, with a screenshot of #209's failed Actions run). The causes:
- The root's own allowlist blocked oven-sh/setup-bun, which supabase/setup-cli uses. It is now allowed at its exact SHA.
- The old workflow never installed Chromium.
- GitHub had an Actions incident.

All three are fixed or over, and question 4 below (billing) is withdrawn.

**Questions waiting for Ryan:**
1. Are "Đặng Thị H.", "Nguyễn Thị H.", "Trần Văn K." or "Nguyễn Văn A." real people? (stock placeholders in tests and the glyph string)
2. Does the seed's set of districts mirror the real portfolio? If so, rename the demo places.
3. Future commits under his GitHub noreply email instead of his Gmail?
4. #223: may Claude's change history keep a full ID that Mẹ typed into a property note? Default: keep it. Recommended: cut it to the last four. Answer before real data.
5. Expense buttons now sit under the tab bar, not in the property header (the plan said header; no header spot keeps the tabs on the first phone screen). Accepted as reversible; he may want it back.
6. A branch ruleset requiring `ci` would block the root's direct docs pushes to main. Not set; ask whether he wants it, with plan notes moving into PRs.
7. Still pending from earlier: the live extraction eval go; going live earlier and trimming Phase 5 (self-evaluation).

## Open work, with the next step for each

- **Connector C3 "load a folder of properties and documents" (owner running, Opus, slot 3, branch esta/connector-c3, brief `briefs/connector-c3.md`).** Design accepted with conditions (decisions.tsv 2026-10-19T21:4x): `list_folder`, `read_spreadsheet` (read-excel-file 9.3.10, csv through core), `document.attach` as a plan item with path, size and sha256 rechecked at apply, import roots only, LocalContext on Op, vault signing and registration moved to packages/ops, previews equal to the vault's from one shared constant, no test needing the agent worker. It also brings `parse_money` and `parse_date`. Next: its report, then round 1 (health lane plus a live lane on file safety, stale files, previews and records equal to the web path), Actions `ci`, then merge. Split into C3a and C3b if it passes 800 product lines.
- **Connector C2 "add a rented room with its lease" (owner running, Opus, slot 5, branch esta/connector-c2, brief `briefs/connector-c2.md`).** Unit, person (IDs cut to the last four), lease, activation with paid-through and deposit received as ops. Items in one batch refer to each other. Tools: `find_person`, `list_leases` and `get_lease`. Expect a design summary and a split proposal (C2a room and tenant, C2b lease start with deposit) before it builds far. It coordinates with C3 on packages/ops and tools.ts.
- **#61** (p5-11 number guard): an old open PR, not touched tonight.
- **Queue:** C4 history and undo (with #223's guard items: a batch starts `planned`, `undone` only through undo); #193 action hook; P3-11 VietQR bills; #208 test clock; the cleanup issues in STATUS's table; #149, #197, #215 and #220 before any real data; rerun the outsider review after the cleanup round.

## Rules added this session (read before acting)

- **Merge gate is Actions `ci`** at the exact head, plus the clean independent verdict. A PR branch must contain #216's tools/ci scripts, so rebase onto main before expecting CI. GitHub runs no CI on a conflicting PR.
- **Full `pnpm check` runs through heavy.sh** (owner-brief, lane-brief). An agent's check beside a CI e2e run pushed the load past 100 and failed tests on timeouts.
- **Root rebases** after merges and verifies the rebase by range-diff, `pnpm check`, quality, and a scoped proof on a slot for any hand-resolved product hunk. Generated `database.types.ts` conflicts: take either side, then regenerate on a stack. Baseline conflicts: take main's file, then `--update`.
- **Test order on one stack:** never run e2e right after the connector integration on the same stack without `db:reset`. The hourly sign-in code limit trips.
- **Public repo:** nothing secret or real anywhere; Actions allowlist pins third-party actions by SHA (pnpm/action-setup, supabase/setup-cli, oven-sh/setup-bun at 0c5077e5).

## How CI runs now

Actions on every PR push: `gh pr checks <n>` or `gh run list --branch <b>`. Six e2e shards, a merged report with flaky titles, one `ci` summary job. Local fallback: `until bin/slot-free.sh N; do sleep 30; done; bin/ci-when-calm.sh <wt> <pr> <slot>`, with logs in `/tmp/ci-local/pr-<n>-<sha7>/`.

## Gotchas learned this run

- macOS 27.0.1 and Docker 29.2.0 arrived with the restart. The email template mount broke (#218). Watch for other single-file mounts.
- Under load, Docker clock drift shows as "JWT issued at future" and dropped streams. Rerun on a calm machine before triaging.
- GitHub status lags during incidents: a "queued" run can already be finished.
- `gh` calls can hang. Wrap them in `timeout`.
- Background agents report "completed" while their children run. Stop them once they hand back. A SendMessage to a finished agent resumes it.
