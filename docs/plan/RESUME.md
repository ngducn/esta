# Resume notes for the Esta v1 run

Resume with `skills/poteto-mode/playbooks/session-pickup.md`, then Autopilot-full. Read `docs/plan/trail/standing-orders.md` (newest updates first), `verification-tiers.md`, `owner-brief.md`, `lane-brief.md`, the tail of `decisions.tsv`, `ARCHITECTURE.md`, `docs/plan/connector-track.md` and `docs/plan/STATUS.md`. Briefs are in `~/.claude/orchestrate/esta/briefs/`.

## Where the run is (written 2026-10-21 09:20 +07)

Main is a7364cf plus this handoff. The Mac root took over from the cloud session at 08:43 +07 and paused at 09:15 +07 on the usage cap. Ryan read 68% in /usage while `usage-pct.sh` read 12.6%. The meter sees only this Mac's transcripts, not cloud sessions or other projects' sessions in the same window. No agent is running.

**Merged since the last Mac handoff (by the cloud root, 2026-10-20):** #239 (connector C2b), #231 and #242 (VietQR bills, void, issue early, receiving account), #244 (receipts), #246 (Zalo reminders and the public `/q/<token>` link), #248 (meter readings), #251 (receipt wording), #253 (statement import), #256 (Home), #259 (statement column mapping). The cloud's own handoff is #258.

**Ryan's words this session:**
- 08:43: "check and resume, there are some PRs being merge, but not used poteto mode, so check their quality and fix-forward. go on and build the next feature too, but keep the limit to below 60%".
- 09:10: "ok meter is at 68%, stop when you see fit".

**Post-merge audit of the eight cloud PRs (done).** It ran in four independent lanes. The bills-and-meters lane used a seeded stack and two months of nightly runs. The statement import lane used SQL and REST probes. The receipts, reminders, public link and Home lane used unit proofs. The code-health lane read the code. Findings and probes are in `~/.claude/orchestrate/esta/audit-1021/L1..L4/`.
- Blocking, all from meter readings (#248):
  - A downward meter correction after its bill went out makes the next bill negative (-91,650,000 ₫ on a Demo room). The overcharged bill stays owed in full, and Home, Thu tiền and that bill's receipt then throw.
  - Voiding a bill in order to end a lease early silently drops the meter use that bill carried (440,000 ₫ on Demo 7).
- Two lows lifted into the fix because each can post a payment twice:
  - The web Excel statement reader rounds long numeric references.
  - Equal references across a 30/4 or Tết break fall outside the 3-day window.
- Clean:
  - The public QR link (128-bit token, anon client plus a definer, nothing beyond what payment needs, void answers 404, no-store, noindex, no-referrer).
  - Statement import's hold rule, idempotent commit and household isolation.
  - Void, issue-early and the receiving account.
- Lows filed for the cleanup round: #265 (meters and voiding), #266 (statement import), #267 (Home, receipts and the QR link, with a question for Ryan), #268 (code health: one action hook, one place-name rule).

## Open work, with the next step for each

- **Fix-forward for the audit (not started).** The branch `esta/fix-cloud-audit` equals main a7364cf. There is no PR yet. Its brief is `briefs/fix-cloud-1021.md`, with the first owner's accepted plan under "RESUME NOTES". Next: start a fresh Opus owner on slot 3. It is rigorous tier and covers five scope items. Its migration is 20261007402900. Its PR body puts Ryan's question first: how should Mẹ fix a bill that already went out with a wrong reading? The default after the fix is to refuse the big correction and void the bill, which gives up that bill's rent. The recommendation is to let a void re-plan its period.
- **Connector C4 "See what Claude changed and undo it" (#269, d554066, paused).** The SQL half is done, and pgTAP batch_undo passes 61 of 61. The design was accepted with four conditions (decisions.tsv 2026-10-21T01:5x). The owner's trail is in `~/.claude/orchestrate/esta/trails/c4/`. Next: start a fresh Opus owner from `briefs/connector-c4.md`, whose "RESUME NOTES" list what is left: the integration undo test, the tool by size, the history screen, e2e and media, gates, then CI. The PR splits into C4a and C4b if it passes 800 product lines.
- **#261, the Phase 3 exit (d75ffe7, ci green).** It went past its second fix round, so it is Ryan's to merge. Then come the two-bank-app VietQR scan and the Mom test.
- **#61** (number guard): parked.
- **Queue after these:** P3-19 (lease prefill from a contract photo; needs `pnpm agent:record` on the Mac), Phase 4 (P4-03 ledger, P4-06 valuations, P4-04 tax card, P4-05 reports), the cleanup round (#193 action hook, #268, #265 to #267 and the older lows), and #149 and #197 before real data.

## Questions waiting for Ryan

1. New: how Mẹ fixes an issued bill with a wrong meter reading (in the fix-forward PR body; recommendation above).
2. New, #267: should a receipt show overpayment kept as credit ("Tiền thừa chuyển sang kỳ sau")? The recommendation is yes.
3. Merge #261 when ready.
4. From 2026-10-20, still open:
   - the move-out month's meter reading (#248);
   - the flat electricity price;
   - the statement import cases the hold misses;
   - voiding a paid bill (default no);
   - tap `Mở Zalo` once on a phone;
   - the QR caption on an unpaid bill (#252);
   - whether owners may push their own branches in the cloud.
5. Older, still open:
   - #223 (a full ID in Claude's change history);
   - the placeholder names;
   - the seed districts;
   - the commit email;
   - the expense button position;
   - a branch ruleset for `ci`;
   - the live extraction eval.

## Rules added this session

- **Budget from Ryan's /usage.** The meter is blind to cloud sessions and to other projects' sessions in the same window. Ask Ryan for his reading before spawning when anything else ran in the window. Ryan's cap this session was 60%.
- **Subagents cannot write report files** under `/tmp` in this harness, so the root saves lane findings itself. Copy anything that must survive a reboot out of `/tmp` into `~/.claude/orchestrate/esta/`.
- **A post-merge audit is a valid fix-forward path** for PRs merged without the Mac review swarm. Lanes find; the root lifts only blocking items, plus cheap money-safety lows, into one PR, and files the rest as grouped `[low]` issues.

## How CI runs now

Actions runs on every PR push: `timeout 30 gh pr checks <n>`. There are six e2e shards, a merged report and one `ci` summary job. The local fallback is `tools/ci-local.sh`.

## Running the stack in the cloud container

These notes are for a cloud root only:
- Node 24 via `npx -y n install 24`. Supabase CLI 2.90.0 from its GitHub release.
- Start `dockerd` by hand. Images come from Docker Hub (`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`).
- Set `[realtime] enabled = false` in the gitignored slot config, because there is no IPv6.
- Run pgTAP through psql when pg_prove fails to pull.
- Use the heavy lock with `flock /tmp/claude-0/heavy.lock`.
- The connector test `files.test.ts` "unreadable entries" fails only because the container runs as root.
- Lighthouse over HTTP/1.1 reads LCP 2.5 to 2.8 s everywhere.

## Gotchas

- After a Mac restart, Docker Desktop does not start on its own (`open -a Docker`). Old slot stacks restart with it, so stop them with `ESTA_SLOT=<k> pnpm db:stop` before slots look free.
- The Mac has Node 25.9; `.nvmrc` names 24.
- Write the exact money rule into an owner's brief before a money PR (the cloud root's lesson from #248 and #253).
- `gh` calls can hang. Wrap them in `timeout`.
