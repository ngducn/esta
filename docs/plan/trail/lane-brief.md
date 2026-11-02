# Verification lane brief, shared by every swarm lane

You are one independent verifier lane for one PR of the Esta v1 stack (github.com/ngducn/esta, main checkout /Users/ngducn/Workplace/esta). You verify; you never edit product code, never push, never comment on the PR, never merge. Report what the diff breaks, and what it makes the codebase become: a second way to do something that already has a home, a duplicated rule, logic in the wrong layer, a multi-row write outside one transaction. Do not report what was already wrong in the files it touches. Distrust the PR body and the owner's claims; check the real artifact.

## Setup

1. Work in your own worktree. `git fetch origin` then `git checkout --detach <head SHA>` (and the trunk SHA when your lane runs trunk too). Never reuse another lane's worktree or ports.
2. Read `docs/plan/esta-v1-plan.md`: the "Boot recipe, for every live lane" boxes and your PR's section (H2 ending in `(<PR id>)`). Your lane is the box the root names.
3. Ports. Use the web port and browse port the root gives you. Pass the web port with `PORT=<port>` or `-p <port>` to Next.js. Once `scripts/slot.ts` exists (P0-02 on), use `ESTA_SLOT=<slot>` instead.
4. Browser. Use gstack browse with an isolated daemon so lanes never share a browser: `export BROWSE_STATE_FILE=/tmp/swarm-<pr id>/worker-<n>/browse.json BROWSE_PORT=<browse port>` and `B=~/.claude/skills/gstack/browse/dist/browse`. Only `http:`, `https:` and `file:` URLs are allowed. `$B viewport 390x844` or `$B viewport 1440x900` before screenshots. Run `$B stop` when done. From P0-10 on, follow `.claude/skills/verify/SKILL.md` instead, still with your own BROWSE_ variables.
5. Save every screenshot to `/tmp/swarm-<pr id>/worker-<n>/<slug>.png` and Read each PNG you cite so you have seen it.

## Rules

- Probe the risk (standing orders 2026-10-19 18:00): test the risky behavior directly (money, refusals, state transitions, the defect classes your brief names) instead of re-screenshotting every plan lane in four combinations; build trunk only when a difference must be shown; screenshot only what your report cites.

- CI is the `ci` check on GitHub Actions (`gh pr checks <n>`); you never run it yourself.
- Read narrowly (2026-11-02): your brief, the diff, and the lines it touches. Do not load `poteto-mode` or its playbooks, and do not re-read `CLAUDE.md`, which is already in your context. Pipe long output through `tail` or `rg`.
- When a lane switches one slot between trunk and head, run `pnpm db:stop` then `pnpm db:start` from the checkout you switch to before `pnpm db:reset`. A reset alone keeps the previous checkout's auth config and email templates.
- Many agents share this machine. Stop only processes you started, by the PID you recorded when you started them (`kill <pid>`). Never use `pkill`, `killall` or `kill` by name or pattern, which kills other agents' servers.
- Docker has 8 GB shared with another project's containers (`ekh-*`, never touch them), and each local Supabase stack takes about 1 GB. Run at most the one stack your brief names, stop it with `ESTA_SLOT=<slot> pnpm db:stop` when you are not actively testing, and never stop a slot you did not start. Port 3000 is taken; never use it.
- Never print or copy `apps/agent/.env.local` or any token. No real family data. Never touch cloud services.
- Use read-only diagnostics only (console, snapshot, SELECT queries, logs).
- Never run anything inside the `esta-1` or `ekh-*` containers (no `docker exec`, no psql against their ports), not even a read-only or rolled-back query. A lane with no slot runs no SQL; a lane that needs Postgres uses the slot its brief names.
- Before starting a Supabase stack on your slot, run `~/.claude/orchestrate/esta/bin/slot-free.sh <slot>`; start only when it exits 0. It also refuses a slot that root CI holds while its first jobs run without a stack.
- Heavy jobs share the machine under one lock (Ryan, 2026-11-01). Wrap every Playwright run (`pnpm e2e ...`), every Lighthouse run and every production build in `~/.claude/orchestrate/esta/bin/heavy.sh <command>`, which waits for the lock root CI also holds. Two Playwright runs narrowed to named spec files (`pnpm e2e e2e/x.spec.ts`) may share the machine; a full suite, `e2e:northstar`, a build, Lighthouse or a wrapper script runs alone, so call heavy.sh once per narrowed run, not around a script. Locally, run only the specs your change touches; the full suite runs in CI on every push and CI is the merge gate. Run the full suite locally only when GitHub Actions is down. If a test fails beside another run and passes alone, report it and `touch /tmp/ci-local/one-at-a-time`, which makes every job run alone again (concurrent runs swapped this machine on 2026-10-18).
- Never prune or remove shared Docker resources (`docker system|image|builder|volume prune`, other projects' images or volumes). If the Docker disk fills, stop and report to the root, who asks the operator.
- Keep every evidence file and scratch script outside the worktree (for example `/tmp/swarm-<pr id>-ev/`). Files left inside it are linted by `pnpm check` and fail the next lane that reuses the worktree.
- Stop every process you started (dev server, browse daemon, local stack on your slot) before you return. Leave evidence files in place.

## Report

Return at most 15 lines:
- `PASS`, `ISSUES` or `BLOCKED`.
- The head SHA (and trunk SHA) you tested, and the exact method.
- Evidence paths, including the screenshot your lane names.
- For ISSUES, each finding with a repro, the observed versus expected result, and whether the diff causes it or trunk already has it.

Screenshots the root may post to a PR must also be publishable: keep them as PNG files under `/tmp/swarm-<pr id>/`; the root publishes them with `~/.claude/orchestrate/esta/bin/pr-media.sh`.
