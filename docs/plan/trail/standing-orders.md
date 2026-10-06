# Standing orders for the Esta v1 run

Written 2026-10-06 on the operator's go (prompt 2), with the operator's later instruction to keep working through review gates while asleep.

Run docs/plan/esta-v1-plan.md under skills/poteto-mode/playbooks/autopilot-stack.md as one linear stack in id order from P0-01 to P6-07. Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

Merging. The root squash-merges a PR with `gh pr merge --squash --match-head-commit <verified head>` only when its verdict is clean, every PR below it has merged, and it is not held. Held PRs stop at STACK-READY with their review package and wait for the operator:

- every review-gated PR the plan lists;
- P0-02, P0-15, P3-02, P3-03, P3-04, P4-01 and P5-03, the security and money PRs the plan sends to interrogate;
- P0-06, until the operator approves the NSO admin units source, its license reading and the NAPAS BIN snapshot.

Work never stops at a held PR. Owners keep building on top of it in the stack, and the root keeps restacking. The operator's instruction "don't stop on review gates" means keep working, not merge without review.

Human gates the root never waives: the S3 and NAPAS data approval, the VietQR scan with two banking apps, the Mom test after Phase 3 and in P6-06, the P6-07 cloud and deploy steps, the 500,000,000 VND transfer cap decision, and everything under CLAUDE.md "Stop and ask Ryan". Each is recorded in docs/plan/STATUS.md under "Waiting for Ryan" and work continues around it.

Model use. Owners run on opus. Live and gates lanes run on sonnet. Audit lanes run on opus. The root watches usage at every tick and runs Pause safely, writing docs/plan/RESUME.md, before limits or when a session must end.

Done when every box in the plan is checked with its evidence, `pnpm e2e:northstar` passes on a local production build against local Supabase, docs/plan/STATUS.md lists every slipped P1 or P2 item with its reason, and P6-07 is merge-ready with the operator. Until the operator returns, the reachable end state is the stack built and verified as far as held PRs and human gates allow.

The decision trail lives in docs/plan/trail/decisions.tsv.
