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

## Update 2026-10-07 08:40

- The operator merged P0-02 to P0-11 on GitHub, which approves every held item in them, including the NSO and NAPAS data in P0-06. GitHub merged stacked PRs into their parent branches, so the root landed each verified head on `main` as one squash commit in stack order (`main` at `edff19d`). The held list is empty.
- Merge mechanics from now on. A PR targets `main` as soon as its parent is on `main`; the root retargets it. Only a PR whose base is `main` is ready for the operator's merge click. A stacked PR whose base is another branch is never merged on GitHub; the root lands it after its parent.
- GitHub Actions is disabled for the repo to save minutes. CI runs locally with `tools/ci-local.sh <worktree> <pr> <slot>`, which mirrors `.github/workflows/ci.yml` and posts `local-ci/<job>` commit statuses plus one summary comment. Owners run it once at code-ready; the gates lane runs it at the verdict head.
- Claude usage. Round 1 per PR is one Sonnet worker (ten lanes, local CI, perf) plus one audit lane, Opus for security, money and data PRs and Sonnet otherwise. Later rounds are one Sonnet lane. Owners do not babysit CI.

## Update 2026-10-15 23:40 +07

Operator's words, 2026-10-15: "yeah please do apply what you suggested, but at this stage, evaluate and merge everything for me please", "add to your memory a skill that plan and architect features more vertically", and on the stated plan "yeah do it, 50% is ok by me, please go do it".

Tonight's objective. #29 merged. Agent worktrees cleaned and open issues triaged. A vertical re-slice of the plan merged with its acceptance-coverage check green. P0-14 merged on a clean verdict or parked with its reason. A lint PR for #14 and #22 merged or parked. Pause safely run, with RESUME.md and a morning brief in STATUS.md. All of it inside 50% of the block that started 2026-10-15T16:00Z. Stop spawning at 35%, pause at 45%. Do not continue into the next block.

Rules from this update. They override the earlier sections and the plan's per-PR boxes where they conflict.

1. Playbook is Autopilot-full. Every PR branches off `main`. Sequenced work is merge-then-branch. No stacks.
2. Landing authority for Phase 0 and the plan docs is granted. The root squash-merges with `gh pr merge --squash --match-head-commit <sha>` only on its clean verdict at that exact SHA. Owners stop at merge-ready and never merge.
3. Still the operator's: deploys, cloud Supabase, real email, paid services, deleting anything outside the local dev stack, SPEC §3, the Mac's firewall or Docker settings, the VietQR banking-app scan and the Mom test.
4. Verification per PR. The owner encodes each live lane's pass rule as a Playwright assertion where it is deterministic, runs local CI once at code-ready, and puts verify-skill screenshots (390x844 and 1440x900, Vietnamese, light and dark) in the PR body. One Sonnet verifier lane at the head SHA re-runs local CI, drives the load-bearing behavior live through `.claude/skills/verify`, and audits the diff against the PR body. An Opus audit lane runs only on security, money and data PRs. No review video.
5. Perf budgets (Lighthouse LCP, TBT, CLS) apply to user routes only. `/dev/*` routes check initial JS only.
6. One fix-forward per PR. A blocking finding that survives it parks the PR with its evidence.
7. Plan vertically with the `vertical-slice-matrix` skill (`~/.claude/skills/vertical-slice-matrix/SKILL.md`). Build each shared capability inside the first slice that consumes it. P0-13 is removed; its composites move to their first consuming PRs. P0-14 depends on P0-12.
8. Concurrency. At most two owners with a local stack plus one verifier. Owners use slots 2 and 3, the verifier slot 14. Never touch `esta-1` or `ekh-*`.

## Update 2026-10-16 07:40 +07

Operator's words, 2026-10-16: "ok awesome, but please find an icon and stock photoes or something to make the design look real, also, act as a real user, think UI UX and really on what they are using day to day, what features matter to them" and "the styling looks good, so adjust the design as i suggest if needed, and go ahead with the build, im going to work now". Earlier the same morning, on UI frameworks: "maybe use some UI framework to make your job easier is also a good option? ant-design, daisy ui, .. you choose", and "i also like it bright, not dark themed".

Objective. P0-14 fixed and merged. A redesign PR merged that moves Esta to the bright, modern direction of the canvas at https://claude.ai/artifact/5WMgbh8EwS9T3eiY1SkM3c, with lucide icons, licensed stock photos recorded with their sources, the design docs rewritten, and DESIGN-BRIEF §4 constraints kept. The UX reasoning lives in `docs/plan/trail/ux-daily-use.md`.

Defaults the agent chose, since the operator did not pick (label: agent interpretation):

1. UI framework stays shadcn/ui on Tailwind (SPEC D2). Ant Design and daisyUI were declined; reasons are in the 2026-10-16 decisions rows.
2. Accent is lacquer red `#B83A26`. Font is Plus Jakarta Sans if it passes `pnpm glyphs:check` (full Vietnamese coverage and `tnum`), else Source Sans 3. Source Serif 4 is dropped.
3. Light theme is the default whatever the system setting; dark stays opt-in in Cài đặt.
4. Property cover photos belong to P1-04 and P1-05, not this run.
5. Budget: at most 50% of each 5-hour block, the operator's last explicit cap, because the operator is at work and may need the rest. Stop spawning at 35%, pause at 45%.
6. Merging stays under the 2026-10-15 grant. The redesign PR counts as Phase 0 work because it restyles Phase 0 surfaces only. Phase 1 PRs stop at merge-ready for the operator's click.

## Update 2026-10-16 10:30 +07

Operator's words, 2026-10-16: "nice work, continue, now the budget it 70%, go ham, work until you cant no more".

Objective. Drain the queue in this order until the budget or the operator stops the run: #40 (local CI in a fresh worktree), the issue #36 plan fixes, P0-15, P0-16, then the Phase 1 slices in `Seq` order from `docs/plan/trail/pr-inventory.md`.

Budget. 70% of each 5-hour block. Stop spawning at 60%, pause at 65%, and resume when the next block starts.

Defaults the agent chose for questions the operator left open in #36 (label: agent interpretation):

1. Landing authority extends to Phase 1 under the same verdict bar, read from "continue ... go ham, work until you cant no more" together with the 2026-10-15 "evaluate and merge everything for me please". One message from the operator withdraws it; Phase 1 PRs then stop at merge-ready.
2. S6 follows SPEC §10 and §11: P1-01 moves to `Seq` 01, before P1-04. No spec change. It also fits the vertical-slice rule that an unproven column goes first.
3. The interrogate list names P5-11 (the number guard) in place of P5-03.
4. Owners and verifiers spawn no subagents unless their brief names them.
