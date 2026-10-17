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
5. Never use ESTA_SLOT=4: its production port 4317 collides with the `ekh-phoenix` container, which must not be touched. Use slots 2, 3, 5 and 14.

## Update 2026-10-17 01:20 +07

Operator's words, 2026-10-17: "you can continue now up to 100%, but when reset, pls use up to 40% only".

Budget. The block that started 2026-10-16T16:00Z may run to 100%: stop spawning at about 92%, pause before 97%. Every later block is capped at 40%: stop spawning at 30%, pause at 36%. Check usage at every agent report, not only before a spawn, because one long Opus owner can move a block by 25 points between checks.
6. Screenshots in PR bodies and comments must render on GitHub: publish them with `~/.claude/orchestrate/esta/bin/pr-media.sh <pr> <image>...` and paste its Markdown (operator, 2026-10-17: "screenshots are not viewable on the UI").

## Update 2026-10-17 04:45 +07

Operator's words, 2026-10-17: "no, lets maxed it out up to 98% , i want to juice out every tokens before reset hit today", replacing the 40% cap and the plan to fall back from Fable to Opus.

Budget until the weekly reset today: up to 98% of each 5-hour block. Stop spawning at about 90%, pause at 96%. Owners stay on Fable; verifiers on Sonnet; audits on Opus. Maximize parallel owners: pure-core PRs that need no Supabase stack run alongside the UI track.
7. Defaults for the Phase 2 re-cut (PR #60), agent interpretation: the landing grant extends to Phase 2 on the same reading as Phase 1; P2-07 gets an Opus audit lane because accepting extracted fields writes certificates, parcels, ownership and parties; members see document extraction state through the `document_status` view, not `agent_jobs` rows.

## Update 2026-10-17 09:25 +07

Operator's words, 2026-10-17, after the session limit stopped every agent at about 05:20: "ok so limit is back, maybe tone down a little, lets not fable at this stage, go for 90% this time, continiue".

Models: no Fable. Owners on Opus, verifiers on Sonnet, audits on Opus.

Budget: 90% of each block. The block that hit the limit (2026-10-16T21:00Z, heavy Fable) stopped at $64.22 and 134M tokens while the ccusage meter read about 50%, so the old calibration ($121.11 and 379.9M = 100%, from an Opus-only block) undercounts Fable. With Fable off, keep that calibration, but stop spawning at 80% and pause at 86%, because the highest Opus-only block that did not hit the limit reached $95.32 (about 79%). Watch usage with `~/.claude/orchestrate/esta/bin/wait-usage.sh <pct>` in the background instead of manual checks.

## Update 2026-10-17 09:55 +07

Operator's handoff, 2026-10-17: "Resume the Esta v1 run as the coordinator (root) ... Then continue the queue in docs/plan/RESUME.md "Next, in order", using its parallel tracks and model policy."

Objective. Drain the RESUME.md queue: #60 verified and merged, then P2-01 finished from its branch on the re-cut section; #52 P1-04 through its one fix-forward and merged; #57 P3-05 and #59 P3-02 verified and merged; #58 P3-06 and P5-11 finished, verified and merged; then Phase 1 on the parallel tracks of the `583e8f0` RESUME.md (P1-09 and P1-06 after P1-04, then P1-05, P1-07 and P1-08 two at a time, then P1-10, then P1-03). Budget and models as in the 09:25 update.

Defaults the agent chose (label: agent interpretation):

1. The landing grant extends to the pure-core Phase 3 and Phase 5 PRs (P3-05, P3-02, P3-06, P5-11) on the reading already applied to Phases 1 and 2, and every verdict for them includes an Opus audit lane. One message from the operator withdraws it; those PRs then stop at merge-ready.
2. The root runs local CI, one run at a time, when the 1-minute load is under 5, on a slot no owner or lane holds. Owners and lanes do not start `tools/ci-local.sh` unless their brief says so.
3. Slots: the P1-04 owner holds 5 and the P3-05 lane holds 3; root CI takes 3 after that lane. Pure-core owners and docs lanes start no Supabase stack.

## Update 2026-10-17 11:25 +07

Operator's answers, 2026-10-17, to the three parked PRs:

1. P1-04 (#52): "Accept, gate at P1-03". Merge #52 with the LCP miss; #56 (shell floor) and a new photo-bytes issue are both required before the Phase 1 exit P1-03 can merge, so SPEC §7.2's 2.5 s binds at the phase gate.
2. P3-06 (#58): "Second narrow round". One more fix-forward limited to refusing quoted fields that span a line break, then a scoped review.
3. P5-11 (#61): "Second structural round". One more fix-forward that makes fail-closed structural (one strict grammar per digit token, else unparseable), then a scoped Opus review.

These are operator-granted exceptions to rule 6 of the 2026-10-15 update for these PRs only; the one-fix-forward rule still holds everywhere else.

## Update 2026-10-17 11:55 +07

Operator's words, 2026-10-17: "the actual usage is at 65%, go at it". The local meter read 78.8% at that moment, so `~/.claude/orchestrate/esta/bin/usage-pct.sh` is rescaled by 0.825 (100% is now $146.8 or 460.5M tokens per block). The 80% stop-spawning and 86% pause lines from the 09:25 update stay, on the rescaled meter.

## Update 2026-10-17 13:00 +07

Operator's words, 2026-10-17: "it resets in 1 hr, we still have 15% left. lets spawn some lower effort tasks to cover the usage, stop at 97". For the block ending 07:00Z: spawn lower-effort tasks (Sonnet owners, Opus at medium effort for the critical path), send stop orders at 94% and stop everything by 97%.

## Update 2026-10-17 14:30 +07

Operator's answer, 2026-10-17, on P1-09's map view: "Exempt the map view". SPEC §7.2 gains a map exception: `/properties?view=map` has its own budget (map-view script ≤ 300 KB gzipped, TBT ≤ 500 ms, every seeded pin within 8 s on Lighthouse mobile); the list view keeps the general budgets. D10 is unchanged.

## Update 2026-10-17 16:00 +07

Operator's words, 2026-10-17: "choose all of them for me on your recommended action as a staff engineer and someone who uses this app". Decisions taken on that grant:

1. P5-11 (#61) stays parked and is not merged. P5-03, the first PR that writes agent prose to Mẹ, owns the guard and builds it over the rendered plain text, reusing #61's grammar, its 236 tests and the three verifiers' probe sets as the starting corpus.
2. Cover photo signed URLs stay at 24 h (property photos, low sensitivity; phone caching on Mẹ's mobile data matters more); documents stay at 300 s per DOC-4.
3. The issues already fixed on main stay listed for the operator to close, because the permission classifier blocks closing from the session.

## Update 2026-10-17 19:00 +07

Decision by the root under the operator's 16:00 delegation ("choose ... on your recommended action as a staff engineer and someone who uses this app"): SPEC §7.2's Lighthouse budgets are measured over HTTP/2, through the local TLS proxy `pnpm dev:lan` already uses, because production serves HTTP/2 or later and Lighthouse's six-connection HTTP/1.1 queue (stylesheet, font, cover, favicon, manifest and icon ahead of the framework chunk) is a cost no user meets. Measured by the #87 owner: /properties with photos at about 2.13 s (7 properties) and 2.34 s (1,000) over HTTP/2 on main and head alike. HTTP/1.1 numbers stay in PR bodies as a secondary signal. scripts/perf/lighthouse.ts defaults to HTTP/2 in a follow-up tooling PR.
