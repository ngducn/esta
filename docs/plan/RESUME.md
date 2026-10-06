# Resume notes for the Esta v1 run

Updated 2026-10-07 05:05 +07 by the root. Read `docs/plan/trail/standing-orders.md`, `owner-brief.md`, `lane-brief.md` and the tail of `decisions.tsv` before acting. Resume with `skills/poteto-mode/playbooks/session-pickup.md`.

## Stack state

| PR | Branch head | Base | Verdict | Merge state |
| --- | --- | --- | --- | --- |
| P0-01 #1 | merged as 08b3559 | main | clean | merged |
| P0-02 #2 | 4a74549 | main | clean after 2 fix-forwards and round 3 | held for Ryan (security PR) |
| P0-03 #5 | 5abe703 | esta/p0-02 | clean after 1 fix-forward | waits for P0-02 |
| P0-04 #6 | 6e7545f | esta/p0-03 | clean after 2 fix-forwards | waits for P0-02 |
| P0-05 #7 | 4e6bc1d | esta/p0-04 | clean after 2 fix-forwards | waits for P0-02 |
| P0-06 #13 | f883131 | esta/p0-05 (4e6bc1d) | round 1 in progress (both audits PASS, live and gates relaunched) | held for Ryan's data approval |
| P0-07 #12 | deff0eb | esta/p0-05 (4e6bc1d) | round 1: live 9/10 PASS (lane 6 needs P0-06 underneath), gates PASS, parity PASS, data-safety audit relaunched | needs restack onto P0-06, then rerun lane 6 |
| P0-08 | e2e33ad plus uncommitted work in worktree agent-ad0957a43d04dec53 | esta/p0-07 | owner relaunched after usage limit | building |

## Next steps

1. Collect P0-06 live and gates results, then fix-forward or clean verdict.
2. Restack P0-07 onto P0-06's final head (conflicts: seed README, keep both sections; regenerate `packages/db/src/database.types.ts`), then rerun P0-07 lane 6 and its data-safety audit result.
3. Restack P0-08 onto P0-07 when P0-07 settles. Then P0-09 (sign-in, gated) and P0-10 (verify skill).
4. Owners never run more than three PRs ahead of the lowest unverified PR.

## Rules learned during the run

- Migration versions: `20261007<phase><two-digit PR><seq>00`, increasing in stack order.
- Docker has 8 GB shared with the `ekh-*` project; about 1 GB per Supabase stack; at most four esta stacks at once; never touch `ekh-*`.
- Never `pkill` by pattern; stop only PIDs you started.
- Isolated gstack browse per lane with `BROWSE_STATE_FILE` and `BROWSE_PORT`.
- Follow-up issues carry the owning PR id in the title; owners pull them into scope at start.
- The session hit its usage limit at about 03:00 and reset at 05:00. Watch for it; keep owners pushing after each unit.

## Waiting for Ryan

See `docs/plan/STATUS.md` on the P0-02 to P0-06 branches: operator-only grant rule, NSO and NAPAS data approval and license reading, curated legacy rows, dev:lan CA trust (P0-08), the 500,000,000 VND transfer cap, the `Sổ cái` tagline wording, and review of every held or gated PR.
