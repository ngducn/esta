# Owner brief, shared by every PR owner

You own one PR of the Esta v1 stack from build to STACK-READY. You never merge, never arm auto-merge, never close a PR, never force-push a branch other than your own, and never touch topology beyond your own branch. The root owns topology and merges.

## Read first

1. `/Users/ngducn/.claude/plugins/cache/pstack-claude/pstack/0.9.74/skills/poteto-mode/SKILL.md` in full, then `playbooks/autopilot-stack.md` step 1 and `playbooks/autopilot-full.md` step 2 (your lifecycle), `playbooks/opening-a-pr.md`, `playbooks/babysit.md`, `references/bugbot-triage.md`.
2. The repo's `CLAUDE.md`, `PRODUCT.md`, and the spec files your PR touches under `docs/spec/`.
3. Your PR's section in `docs/plan/esta-v1-plan.md` (find the H2 ending in `(<PR id>)`), the plan's "PR mechanics, for every PR" and "Boot recipe" boxes, and `docs/plan/trail/standing-orders.md`.
4. For UI PRs, `.claude/skills/impeccable/SKILL.md` and its `reference/craft-floor.md` before any UI edit. Run `/impeccable shape` first when your Build block says so.
5. Spike evidence on branches `spike/s1-agent-sdk`, `spike/s2-fonts`, `spike/s3-admin-units`, `spike/s4-vietqr`, `spike/s7-receipt` (`git show origin/<branch>:<path>`), when your PR uses one.

## Lifecycle

1. Work in the worktree you are given, on branch `esta/<pr id lowercase>-<slug>` created from the base branch the root names. Use `ESTA_SLOT=<slot the root names>` for every local stack you start.
2. Within about 15 minutes, start `decisions.tsv` in the worktree root per the show-me-your-work skill (keep it uncommitted), push a first snapshot, and open the PR ready (never draft) with `gh pr create --base <base branch>`. Title in Conventional Commits with the PR id as scope, for example `feat(p0-01): scaffold the pnpm monorepo and CI`. Body per opening-a-pr.md.
3. Build every Files and Build box of your section. Name the data shape first. Push after every verifiable unit with hooks on.
4. Self-prove on the real artifact. Run every Verify, unit box. Drive the You see boxes yourself on the real surface (gstack browse before P0-10 merges, the project verify skill after). Save evidence under `/tmp/owner-<pr id>/`.
5. Run `/deslop`, then `/no-comments`, then `pnpm check` (and `pnpm db:test` when SQL changed) on the committed head. Report the code-ready head SHA to the root with a SendMessage to `main` when the shipped code is final.
6. Babysit CI to green per babysit.md. Triage review-bot comments per bugbot-triage.md. Fix what the root sends back in one fix-forward per round; at most two fix-forwards.
7. Report STACK-READY to the root with the exact head SHA, the evidence paths, your decisions.tsv path, and every box of your section you could not check with the reason.

## Rules

- Real family data, `.env*` files, tokens and `fixtures-private/` never enter a commit, screenshot, log or PR body. Seed data names contain "Demo". Never print `apps/agent/.env.local`.
- Never create or change a cloud project, deploy, send real email, add a paid service or a new external data source. Stop and report instead.
- Money is integer VND. No `new Date()` in domain code. No `any`. Every user-facing string goes through next-intl. Design tokens only.
- Keep comments to a non-obvious why. No phase-narrating comments.
- If the plan section is wrong or impossible as written, do the smallest correct thing, record why in decisions.tsv and in the PR body under Tradeoffs, and tell the root.
