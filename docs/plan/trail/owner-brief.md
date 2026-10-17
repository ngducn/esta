# Owner brief, shared by every PR owner

You own one PR of Esta v1 from build to merge-ready (see the 2026-10-15 update in standing-orders.md, which overrides this brief where they conflict). You never merge, never arm auto-merge, never close a PR, never force-push a branch other than your own, and never touch topology beyond your own branch. The root owns topology and merges.

## Read first

1. `/Users/ngducn/.claude/plugins/cache/pstack-claude/pstack/0.9.74/skills/poteto-mode/SKILL.md` in full, then `playbooks/autopilot-stack.md` step 1 and `playbooks/autopilot-full.md` step 2 (your lifecycle), `playbooks/opening-a-pr.md`, `playbooks/babysit.md`, `references/bugbot-triage.md`.
2. The repo's `CLAUDE.md`, `PRODUCT.md`, and the spec files your PR touches under `docs/spec/`.
3. Your PR's section in `docs/plan/esta-v1-plan.md` (find the H2 ending in `(<PR id>)`), the plan's "PR mechanics, for every PR" and "Boot recipe" boxes, and `docs/plan/trail/standing-orders.md`.
4. For UI PRs, `.claude/skills/impeccable/SKILL.md` and its `reference/craft-floor.md` before any UI edit. Run `/impeccable shape` first when your Build block says so.
5. Spike evidence on branches `spike/s1-agent-sdk`, `spike/s2-fonts`, `spike/s3-admin-units`, `spike/s4-vietqr`, `spike/s7-receipt` (`git show origin/<branch>:<path>`), when your PR uses one.

## Lifecycle

0. Run `gh issue list --state open --search "<pr id lowercase> in:title"` (for example `p0-09`). Every open issue tagged with your PR id is part of your scope; close it from your PR with `Closes #<n>` and a red test.
1. Work in the worktree you are given, on branch `esta/<pr id lowercase>-<slug>` created from the base branch the root names. Use `ESTA_SLOT=<slot the root names>` for every local stack you start.
2. Within about 15 minutes, start `decisions.tsv` in the worktree root per the show-me-your-work skill (keep it uncommitted), push a first snapshot, and open the PR ready (never draft) with `gh pr create --base <base branch>`. Title in Conventional Commits with the PR id as scope, for example `feat(p0-01): scaffold the pnpm monorepo and CI`. Body per opening-a-pr.md.
3. Build every Files and Build box of your section. Name the data shape first. Push after every verifiable unit with hooks on.
4. Self-prove on the real artifact. Run every Verify, unit box. Drive the You see boxes yourself on the real surface (gstack browse before P0-10 merges, the project verify skill after). Save evidence under `/tmp/owner-<pr id>/`.
5. Run `/deslop`, then `/no-comments`, then `pnpm check` (and `pnpm db:test` when SQL changed) on the committed head. Report the code-ready head SHA to the root with a SendMessage to `main` when the shipped code is final.
6. Babysit CI to green per babysit.md. Triage review-bot comments per bugbot-triage.md. Fix what the root sends back in one fix-forward; one is the maximum.
7. Report merge-ready to the root with the exact head SHA, the evidence paths, your decisions.tsv path, and every box of your section you could not check with the reason.

## Rules

- GitHub Actions is off. CI is `/Users/ngducn/Workplace/esta/tools/ci-local.sh <worktree> <pr> <slot>`, which runs the five jobs in a fresh throwaway worktree at your pushed PR head (uncommitted and gitignored files in yours never count, so commit and push first), then posts `local-ci/*` statuses and a summary comment; `gh pr checks` shows them. Run it once at code-ready (owners) or at the verdict head (gates lane), never in a loop.
- Screenshots in a PR body or comment must render on GitHub. Publish them with `~/.claude/orchestrate/esta/bin/pr-media.sh <pr> <image>...` (it pushes them to the `pr-media` branch) and paste the Markdown it prints. Never list `/tmp` paths as evidence a reviewer is meant to see.
- Write temporary files (PR bodies, logs, probes) under `/tmp/owner-<pr id>/`, never in a shared scratchpad, so parallel owners never overwrite each other.
- Name every new migration `supabase/migrations/20261007<P><NN><S>00_<name>.sql`, where `<P>` is the phase digit, `<NN>` the PR's two-digit `Seq` in `docs/plan/trail/pr-inventory.md` (its delivery position in the phase, not its id number) and `<S>` a sequence digit within the PR. For example P1-07, Seq 06, names its first migration `20261007106000_...` and its second `20261007106100_...`. In Phase 0, `Seq` equals the id number, so merged migrations keep their versions. Versions must increase in delivery order. Before your verdict, check that your versions sort after the newest migration on `main`; if a PR with a later `Seq` merged first, renumber yours to the next free version after it and say so in the PR body. This rule overrides the placeholder timestamps in the plan's Files boxes. P0-02 keeps its existing `0001xx` to `0004xx` versions.
- Heavy jobs run one at a time across the machine. Wrap every Playwright suite run (`pnpm e2e ...`), every Lighthouse run and every production build in `~/.claude/orchestrate/esta/bin/heavy.sh <command>`, which waits for the lock root CI also holds. Concurrent e2e, Lighthouse and CI runs swapped this machine and failed whole CI runs on 2026-10-18.
- Never prune or remove shared Docker resources (`docker system|image|builder|volume prune`, other projects' images or volumes). If the Docker disk fills, stop and report to the root, who asks the operator.
- Many agents share this machine. Stop only processes you started, by the PID you recorded when you started them (`kill <pid>`). Never use `pkill`, `killall` or `kill` by name or pattern, which kills other agents' servers.
- Docker has 8 GB shared with another project's containers (`ekh-*`, never touch them), and each local Supabase stack takes about 1 GB. Run at most the one stack your brief names, stop it with `ESTA_SLOT=<slot> pnpm db:stop` when you are not actively testing, and never stop a slot you did not start. Port 3000 is taken; never use it.
- Real family data, `.env*` files, tokens and `fixtures-private/` never enter a commit, screenshot, log or PR body. Seed data names contain "Demo". Never print `apps/agent/.env.local`.
- Never create or change a cloud project, deploy, send real email, add a paid service or a new external data source. Stop and report instead.
- Money is integer VND. No `new Date()` in domain code. No `any`. Every user-facing string goes through next-intl. Design tokens only.
- Keep comments to a non-obvious why. No phase-narrating comments.
- If the plan section is wrong or impossible as written, do the smallest correct thing, record why in decisions.tsv and in the PR body under Tradeoffs, and tell the root.
