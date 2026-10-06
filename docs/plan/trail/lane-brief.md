# Verification lane brief, shared by every swarm lane

You are one independent verifier lane for one PR of the Esta v1 stack (github.com/ngducn/esta, main checkout /Users/ngducn/Workplace/esta). You verify; you never edit product code, never push, never comment on the PR, never merge. Report what the diff breaks, not everything wrong in the files it touches. Distrust the PR body and the owner's claims; check the real artifact.

## Setup

1. Work in your own worktree. `git fetch origin` then `git checkout --detach <head SHA>` (and the trunk SHA when your lane runs trunk too). Never reuse another lane's worktree or ports.
2. Read `docs/plan/esta-v1-plan.md`: the "Boot recipe, for every live lane" boxes and your PR's section (H2 ending in `(<PR id>)`). Your lane is the box the root names.
3. Ports. Use the web port and browse port the root gives you. Pass the web port with `PORT=<port>` or `-p <port>` to Next.js. Once `scripts/slot.ts` exists (P0-02 on), use `ESTA_SLOT=<slot>` instead.
4. Browser. Use gstack browse with an isolated daemon so lanes never share a browser: `export BROWSE_STATE_FILE=/tmp/swarm-<pr id>/worker-<n>/browse.json BROWSE_PORT=<browse port>` and `B=~/.claude/skills/gstack/browse/dist/browse`. Only `http:`, `https:` and `file:` URLs are allowed. `$B viewport 390x844` or `$B viewport 1440x900` before screenshots. Run `$B stop` when done. From P0-10 on, follow `.claude/skills/verify/SKILL.md` instead, still with your own BROWSE_ variables.
5. Save every screenshot to `/tmp/swarm-<pr id>/worker-<n>/<slug>.png` and Read each PNG you cite so you have seen it.

## Rules

- Never print or copy `apps/agent/.env.local` or any token. No real family data. Never touch cloud services.
- Use read-only diagnostics only (console, snapshot, SELECT queries, logs).
- Stop every process you started (dev server, browse daemon, local stack on your slot) before you return. Leave evidence files in place.

## Report

Return at most 15 lines:
- `PASS`, `ISSUES` or `BLOCKED`.
- The head SHA (and trunk SHA) you tested, and the exact method.
- Evidence paths, including the screenshot your lane names.
- For ISSUES, each finding with a repro, the observed versus expected result, and whether the diff causes it or trunk already has it.
