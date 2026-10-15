# Esta v1 build plan

This plan builds Esta v1, the private web app Mẹ and Ryan use to run the family's houses, land, leases, rent, money and the Trợ lý assistant, as specified in `docs/spec/`.
It runs as 72 PRs in seven phases, in the order of SPEC §10, cut into vertical slices on 2026-10-15 (`docs/plan/trail/slice-matrix.md`).
`docs/plan/trail/pr-inventory.md` gives each PR's delivery order (`Seq`), user outcome, scope and proof. Ids stay stable when a PR moves, so ids are not in delivery order, and the sections below follow delivery order for Phases 0 and 1.
The 2026-10-15 update in `docs/plan/trail/standing-orders.md` overrides this plan where they conflict. It runs Autopilot-full with every PR off `main`, encodes lane rules as Playwright assertions, uses one Sonnet verifier lane and no review video, and applies Lighthouse budgets to user routes only.
Spikes S1, S2, S3, S4 and S7 are settled with evidence in Appendix A. S6 is P1-01 and S5 is P2-01.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `skills/poteto-mode/playbooks/autopilot-stack.md` from the installed plugin. The root is the only topology writer and builds one linear stack in PR id order, so work continues on top of review-gated PRs while they wait. The operator grants the root one exception to that playbook. The root may squash-merge a PR that is not review-gated once its verdict is clean and every PR below it has merged. Review-gated PRs stop at STACK-READY, and the operator reviews and lands them bottom-up in one batch at the end of each phase. A gated PR therefore holds every PR above it until the phase batch lands, which is why each phase lists its non-gated PRs first. Two non-gated PRs sit above a gated PR because they need it. P0-10 needs the sign-in from P0-09, and P6-05 measures budgets on the finished surfaces, so both land with their phase batch.

The operator's items stop at merge-ready and never run without Ryan. P6-07 is the cloud setup and deploy PR. Any step that touches a cloud Supabase project, a production deploy, a real email sender, deleting data outside the local stack, a paid service, a new external data source, or a SPEC §3 decision is also an operator item, as CLAUDE.md "Stop and ask Ryan" lists. The admin units source chosen in S3 needs Ryan's approval at this plan review.

Each PR section names its parent under **Depends on.** Its **Files.** and **Build.** boxes are the change. **You see.** is the result a person observes. The three verify blocks are the evidence. **Review gate.** says whether the operator reviews it. **Merge.** says how it lands.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] On the operator's go, write this exact text into the standing orders and restate it in your todolist. "Run docs/plan/esta-v1-plan.md under skills/poteto-mode/playbooks/autopilot-stack.md as one linear stack in id order from P0-01 to P6-07. Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. The root squash-merges a PR that is not review-gated once its verdict is clean and every PR below it has merged. Review-gated PRs stop at STACK-READY, and the operator lands them bottom-up in a batch at each phase end. Operator items and everything under CLAUDE.md Stop and ask Ryan stop at merge-ready. Done when every box in the plan is checked with its evidence and P6-07 is merge-ready with the operator."
- [ ] Read these from the installed plugin at program start. Re-read them at every tick.
  - [ ] `skills/poteto-mode/playbooks/autopilot-stack.md`
  - [ ] `skills/poteto-mode/playbooks/autopilot-full.md`, steps 2, 4 and 6, which autopilot-stack runs.
  - [ ] `skills/poteto-mode/playbooks/shipping.md`, for the patch-id rule.
  - [ ] `skills/swarm/SKILL.md`
  - [ ] `.claude/skills/verify/SKILL.md` in the repo once P0-10 merges. Before that, `~/.claude/skills/browse/SKILL.md` (gstack browse).
  - [ ] `skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `skills/poteto-mode/references/merge-safety.md` and `skills/poteto-mode/references/bugbot-triage.md`
  - [ ] `skills/show-me-your-work/SKILL.md`, `skills/technical-writing/SKILL.md`, `skills/unslop/SKILL.md`, `skills/deslop/SKILL.md`, `skills/no-comments/SKILL.md`
  - [ ] `skills/how/SKILL.md` and `skills/interrogate/SKILL.md` for the PRs Appendix D names.
  - [ ] `skills/create-verification-skill/SKILL.md` and `skills/maintain-verification-skill/SKILL.md`
  - [ ] `.claude/skills/impeccable/SKILL.md` in the repo, for every UI PR.
- [ ] Arm the hourly audit tick as a real `/loop` in dynamic mode, which schedules its own wake-up rather than blocking on a sleep. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from the installed plugin and the standing objective. Audit the operation against both and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then post a short status message to the operator in chat only when the audit found a tracked change that no earlier status message reported, such as a PR opened, a code-ready head, a round launched or closed, a verdict, a merge, a stuck agent and the action taken, a blocker added or cleared, or a decision only the operator can make. Name every such change and nothing else. Do not repeat a table, the merged list, or an unchanged blocker. If the audit found none, end the turn with no reply text. Either way, log this tick's row in your decision trail. The row names the items reported, or none."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.
- [ ] Before a session runs low on usage or context, run `skills/poteto-mode/playbooks/pause-safely.md` and write `docs/plan/RESUME.md`. A new session resumes with `skills/poteto-mode/playbooks/session-pickup.md`.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names, as `pstack:poteto-agent` in its own worktree.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges, or base it on the parent branch when the execution playbook stacks.
  - [ ] P0-01 is the root of the stack and branches from `main`.
  - [ ] Every later PR branches from the PR directly before it in id order, from P0-02 through P6-07, and its PR targets that parent's branch.
  - [ ] Owners may build up to three PRs ahead of the lowest unverified PR at once, each on its parent's current tip. The root restacks them per `references/merge-safety.md` when a parent changes.
  - [ ] A phase starts its gated PRs only after that phase's non-gated PRs reach a clean verdict, so the root can merge the non-gated run first.
- [ ] Name every migration `20261007<phase digit><two-digit Seq><sequence digit>00_<name>.sql`, where Seq is the PR's delivery position in `docs/plan/trail/pr-inventory.md`, so versions increase in delivery order. `docs/plan/trail/owner-brief.md` says what to do when PRs merge out of Seq order. This rule overrides the placeholder timestamps in the Files boxes below. P0-02 keeps its `0001xx` to `0004xx` versions.
- [ ] Hold the file boundaries. Each PR touches only the files its **Files.** block lists, plus regenerated types in `packages/db/src/database.types.ts` and new keys in `apps/web/messages/vi.json` and `apps/web/messages/en.json`. Only migration PRs add files under `supabase/migrations/`, and no PR edits an applied migration.
- [ ] Hold the review gate. The PRs marked `G` in `docs/plan/trail/pr-inventory.md` change an interaction. The operator reviews their screenshots in the PR body before merge. No review video (2026-10-15 update).
- [ ] Hold the human gates. The operator approves the S3 admin units source at this plan review, scans the VietQR code with two banking apps at the Phase 3 gate, runs the Mom test after Phase 3 and again in P6-06, and performs every P6-07 step.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`.
- [ ] Open the PR ready, never draft, per **Opening a PR**. Use the run's built-in PR tool when it has one, else `origin pr create --status open --base <base-branch>` or `gh pr create --base <base-branch>` according to the resolved forge. A stack child targets its parent branch.
- [ ] Name the branch `esta/<pr id in lowercase>-<slug>`, for example `esta/p0-01-monorepo`. Title the PR in Conventional Commits form with the PR id in the scope, for example `feat(p1-04): properties list with filters and search`.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Push with hooks on.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Meet the definition of done in SPEC §9.1 and CLAUDE.md. `pnpm check`, `pnpm db:test` and the touched e2e specs pass. A UI PR also has zero `pnpm design:detect` findings or a recorded ignore with a reason, axe clean on touched routes, and an `/impeccable critique` with every high-severity point fixed. An agent PR also passes its AGENT.md §7 golden tests in replay mode.
- [ ] Keep real family data, `.env*` files and `fixtures-private/` out of every commit, screenshot, recording and PR body. Seed data names contain "Demo".
- [ ] Triage every review-bot and security-reviewer comment per `../references/bugbot-triage.md`.
- [ ] Before the code-ready report and babysit, and again after merge prep, record the base and head SHAs prepared by the topology owner under the execution playbook.

### Verdict and merge, for every PR

- [ ] At the code-ready head SHA and at each later push that changes the patch, run the swarm per `skills/swarm/SKILL.md`. One gates lane. The ten live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. Two or more audit lanes, each with its own focus, that read the diff and the receipts and distrust the PR body. The root audits the receipts in the merge-ready report before the verdict.
- [ ] Give the audit lanes these focuses at minimum. One audits data safety, which covers RLS, household isolation, money as integer VND, idempotent writes and the service role allowlist. One audits consumer parity and Vietnamese correctness, which covers callers of changed code, i18n parity, formatting per DOMAIN-VN §9 and the brief's voice rules.
- [ ] Clean only when every lane is `PASS`. Findings go back to the owner, including a defect that a lane filed as a note. A new head gets a fresh swarm and a fresh verdict, except for results that stay valid under the patch-id rule in `playbooks/shipping.md`.
- [ ] Merge a PR that is not review-gated with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged and its verdict holds under the patch-id rule in `playbooks/shipping.md`. Append a review-gated PR to the stack at STACK-READY and leave its landing to the operator. Never use `--admin`, and never arm auto-merge.

### Boot recipe, for every live lane

Each live lane runs in its own worktree at the PR head. Drive through the skill path or exact commands recorded in this boot recipe.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] Export `ESTA_SLOT=<slot>` so the lane's Supabase and web ports do not collide with other stacks. Run `pnpm install`, `pnpm db:start`, then `pnpm db:reset` for the `full` seed with ten lane households, or `pnpm db:reset:northstar` when the lane says so.
- [ ] Run `pnpm clock:set 2026-10-07T09:00:00+07:00` unless the lane names another time. The test clock is one row per stack, so a lane that sets any other time or advances the clock runs on its own `ESTA_SLOT`.
- [ ] When the PR touches `apps/agent`, start the worker with `ESTA_AGENT_MODE=replay pnpm agent:dev`.
- [ ] Start the surface with `pnpm dev` and wait until `curl -sf http://localhost:<web port>/` answers.
- [ ] Deliver input only through the driver skill's commands. Before P0-10 merges, use gstack browse with `$B viewport 390x844` or `$B viewport 1440x900`, then `$B goto`, `$B fill`, `$B click` and `$B screenshot`. From P0-10 on, use `.claude/skills/verify/SKILL.md`, which signs in as `me.lane<n>@demo.esta.test` or `ryan.lane<n>@demo.esta.test` by reading the code from Inbucket, and switches language, theme and text scale through its helpers.
- [ ] Use only read-only diagnostics. These are `$B console`, `$B snapshot`, `SELECT` statements through `supabase db query`, the Inbucket web UI, Supabase Studio, and worker logs.
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## Scaffold the pnpm monorepo, CI and the dev route guard (P0-01)

**Depends on.** None.

**Files.**

- [ ] Create `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`, `.env.example`.
- [ ] Create `apps/web/` (Next.js App Router, TypeScript strict, Tailwind CSS), `apps/agent/package.json`, `packages/core/package.json`, `packages/db/package.json`.
- [ ] Create `eslint.config.mjs`, `vitest.workspace.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`.
- [ ] Create `apps/web/src/server/env.ts`, `apps/web/src/server/env.test.ts`, `apps/web/src/server/dev-guard.ts` and `apps/web/src/server/dev-guard.test.ts`.
- [ ] Create `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/dev/layout.tsx` and `apps/web/src/app/dev/page.tsx`.
- [ ] Create `e2e/root.spec.ts` with `@axe-core/playwright`.
- [ ] Edit `CLAUDE.md`.

**Build.**

- [ ] Add the root `check` script that runs typecheck, lint and unit tests across the workspace. Turn on `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` in `tsconfig.base.json`, and make `@typescript-eslint/no-explicit-any` an error in `eslint.config.mjs`.
- [ ] Parse every environment variable in SPEC §8 with zod in `apps/web/src/server/env.ts` and export `env`. Default `ESTA_ENV` to `development`. The web schema omits `SUPABASE_SERVICE_ROLE_KEY`, which only cron modules read (P0-02).
- [ ] Add `isDevSurfaceEnabled(env)` in `apps/web/src/server/dev-guard.ts`, true for every `ESTA_ENV` except `production`.
- [ ] Make `apps/web/src/app/dev/layout.tsx` call `notFound()` when `isDevSurfaceEnabled(env)` is false, so every `/dev/*` route is absent from production builds. `apps/web/src/app/dev/page.tsx` lists the dev pages that exist.
- [ ] Add `pnpm e2e` (Playwright against `pnpm dev`) and `pnpm design:detect` (the Impeccable detector over `apps/web` with JSON output) to the root `package.json`.
- [ ] Run `pnpm check` in `.github/workflows/ci.yml` on every push and pull request.

**You see.**

- [ ] `pnpm dev` serves `http://localhost:3000` with a single placeholder line `Esta`.
- [ ] `ESTA_ENV=production pnpm build && pnpm start` returns 404 for `/dev`.
- [ ] `pnpm check` prints a typecheck, lint and test pass for `apps/web`, `apps/agent`, `packages/core` and `packages/db`, and exits 0.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/web/src/server/env.test.ts` gains cases for a missing required variable, an unknown `ESTA_ENV` value and the `development` default. `apps/web/src/server/dev-guard.test.ts` gains one case per `ESTA_ENV` value, with only `production` returning false. Run `pnpm check`.
- [ ] `e2e/root.spec.ts` loads `/` and `/dev`. Run `pnpm e2e e2e/root.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/root.spec.ts`.
- [ ] CI is green on the PR head.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no app, so the lane records that and gates the head serving `/` at 390x844, light, through `$B goto http://localhost:3000/`. Save `p0-01-root-mobile.png`. Pass when the page shows `Esta` and `$B console` has no errors.
- [ ] Lane 2. At 1440x900, dark (the lane sets `data-theme=dark` on `<html>`; nothing reads it before P0-11), open `/` with `$B`. Save `p0-01-root-desktop.png`. Pass when the page text is exactly `Esta` and `$B js "document.documentElement.lang"` returns `vi`.
- [ ] Lane 3. At 390x844, light, open `/dev` on `pnpm dev`. Save `p0-01-dev-index.png`. Pass when the response is 200 and the page lists the dev pages that exist.
- [ ] Lane 4. Build with `ESTA_ENV=production pnpm build && pnpm start` and open `/dev` and `/dev/anything` at 1440x900, light. Save `p0-01-dev-prod-404.png`. Pass when both paths show the Next.js 404 page and `curl -s -o /dev/null -w '%{http_code}'` prints `404` for each.
- [ ] Lane 5. Build a local production build with `NODE_ENV=production ESTA_ENV=test` and open `/dev` at 390x844, dark. Save `p0-01-dev-test-build.png`. Pass when `/dev` returns 200, because only `ESTA_ENV=production` hides dev routes.
- [ ] Lane 6. Run `pnpm check`, write its output inside a `<pre>` in `/tmp/swarm-p0-01/lane6.html` and open it with `$B load-html` at 1440x900, light. Save `p0-01-check-output.png`. Pass when the output names all four workspaces and the exit code line reads `0`.
- [ ] Lane 7. Add an uncommitted `packages/core/src/scratch.ts` with `export const x: any = 1`, run `pnpm check`, render the output as in lane 6 at 390x844, light, then delete the file. Save `p0-01-any-rejected.png`. Pass when lint reports `@typescript-eslint/no-explicit-any` at `packages/core/src/scratch.ts`, the exit code is non-zero, and `git status --short` is empty afterwards.
- [ ] Lane 8. Start `ESTA_ENV=staging pnpm dev`, render stderr at 1440x900, dark. Save `p0-01-env-rejected.png`. Pass when the process exits before serving and the zod message names `ESTA_ENV` and lists `development`, `test`, `preview` and `production`.
- [ ] Lane 9. Render `gh pr checks <pr>` and `gh run view <run-id>` for the PR head at 390x844, dark. Save `p0-01-ci.png`. Pass when the `check` job concluded `success` on the exact head SHA.
- [ ] Lane 10. Extract the variable names from the SPEC §8 table and from `.env.example`, render `diff` of the two sorted lists at 1440x900, light. Save `p0-01-env-example.png`. Pass when the diff is empty.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Cold `pnpm check` wall time, and initial JS gzipped for `/` on a production build.
- [ ] Probe. Run `pnpm check` 5 times at trunk and head, interleaved, and run `next build` once per side reading the route size table.
- [ ] Baseline. Trunk has no workspace, so record that and take the head values as the first baseline.
- [ ] Rule. Fail when `pnpm check` exceeds 60 s or `/` initial JS exceeds 200 KB gzipped (SPEC §7.2).

**Review gate.** None. P0-01 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Run local Supabase with slots, tenancy tables, RLS harness and audit trigger (P0-02)

**Depends on.** P0-01.

**Files.**

- [ ] Create `supabase/config.toml`, `scripts/slot.ts`, `scripts/slot.test.ts` and `scripts/db.ts`.
- [ ] Create `supabase/migrations/20261007000100_tenancy.sql` and `supabase/migrations/20261007000200_audit.sql`.
- [ ] Create `supabase/seed/bootstrap.sql`.
- [ ] Create `supabase/tests/tenancy_isolation.test.sql`, `supabase/tests/viewer_readonly.test.sql` and `supabase/tests/audit_log.test.sql`.
- [ ] Create `packages/db/src/database.types.ts` (generated) and `packages/db/src/index.ts`.
- [ ] Create `eslint-rules/service-role-allowlist.mjs` and `eslint-rules/service-role-allowlist.test.ts`. Edit `eslint.config.mjs` and `.github/workflows/ci.yml`.

**Build.**

- [ ] Add `slotPorts(k)` in `scripts/slot.ts`. It returns the web, API, DB, Studio and Inbucket ports, each the default plus 100·k, and writes a per-slot Supabase workdir under `supabase/.slots/<k>/` with `project_id = "esta-<k>"`. `ESTA_SLOT` unset means slot 0.
- [ ] Add `pnpm db:start`, `db:stop`, `db:reset`, `db:types` and `db:test` as subcommands of `scripts/db.ts`, each honoring `ESTA_SLOT`. `db:types` writes `packages/db/src/database.types.ts`.
- [ ] Create `households`, `household_members`, `household_settings`, `parties` and `notification_preferences` per SPEC §5.1 in `20261007000100_tenancy.sql`, with the `member_role` enum `viewer | member | admin`.
- [ ] Add `private.is_member(household_id uuid, min_role member_role)` as a `stable security definer` SQL function that ranks `viewer < member < admin` for `auth.uid()`, and `is_operator(household_id uuid)`.
- [ ] Enable RLS on all five tables. Select needs `private.is_member(household_id, 'viewer')`. Writes need `'member'`, except `households`, `household_members` and `household_settings`, which need `'admin'`.
- [ ] Create `audit_log` per SPEC §5.7 plus `household_id`, and the trigger function `audit_row()` in `20261007000200_audit.sql`. The trigger copies `household_id` from the audited row (the row's own `id` for `households`), so P1-06's `Hoạt động` tab can list one household's history under RLS. It takes the actor from `auth.uid()` for user sessions, from the `x-esta-actor` value in `request.headers` only when the JWT role is `service_role`, else from `current_setting('esta.actor', true)`. Attach it to all five tables.
- [ ] Give `audit_log` one select policy, `private.is_member(household_id, 'viewer')`, and no insert, update or delete policy for any role (SPEC §5.7).
- [ ] Write `supabase/seed/bootstrap.sql` with `Gia đình Demo` and lane households `Gia đình Demo 1..10`, each with claimed members `me.lane<n>@demo.esta.test` (admin, not operator) and `ryan.lane<n>@demo.esta.test` (admin, operator) as confirmed `auth.users` rows, plus owner parties `Nguyễn Thị Demo` and `Trần Minh Demo`. Ids come from `uuid_generate_v5` over seed keys. P0-07 replaces this file with the generator.
- [ ] Add the ESLint rule `esta/service-role-allowlist`, which reports any reference to `SUPABASE_SERVICE_ROLE_KEY` outside `apps/agent/**`, `scripts/**` and `apps/web/src/server/cron/**`.
- [ ] Add a `db` job to `.github/workflows/ci.yml` that runs `pnpm db:start`, `pnpm db:reset` and `pnpm db:test`.

**You see.**

- [ ] `pnpm db:start` prints Studio at `http://127.0.0.1:54323`. `ESTA_SLOT=2 pnpm db:start` prints `http://127.0.0.1:54523`.
- [ ] Studio's Table Editor shows 11 rows in `households`.
- [ ] `pnpm db:test` ends with `Result: PASS`.
- [ ] `pnpm lint` fails with `esta/service-role-allowlist` on a file under `apps/web/src/app/` that reads the service role key.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `supabase/tests/tenancy_isolation.test.sql` proves that a member of household A cannot select, insert, update or delete any row of household B in each of the five tables (FND-2 for these tables; storage objects join in Phase 2).
- [ ] `supabase/tests/viewer_readonly.test.sql` proves a viewer reads its household and every write fails.
- [ ] `supabase/tests/audit_log.test.sql` covers a user actor, a service-role request with `x-esta-actor: system:cron`, an authenticated request carrying a spoofed `x-esta-actor` (ignored), `set_config('esta.actor', ...)` on a direct connection, `household_id` copied from the audited row, a member of household A reading zero of household B's audit rows, and insert, update and delete on `audit_log` failing for `authenticated`.
- [ ] `scripts/slot.test.ts` covers slots 0, 1 and 10. `eslint-rules/service-role-allowlist.test.ts` uses `RuleTester` with one valid file per allowlisted root and invalid files under `apps/web/src/app` and `packages/core`.
- [ ] Run `pnpm check`. Run `pnpm db:test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no database, so the lane records that and gates the head after `pnpm db:start && pnpm db:reset`. Open Studio's Table Editor on `households` with `$B` at 1440x900, light. Save `p0-02-households.png`. Pass when the table shows 11 rows, one named `Gia đình Demo 1`.
- [ ] Lane 2. In Studio's SQL editor at 1440x900, dark, run `set local role authenticated` with `request.jwt.claims` set to the `sub` of `ryan.lane2@demo.esta.test`, then `select name from households`. Save `p0-02-select-own.png`. Pass when exactly one row, `Gia đình Demo 2`, returns.
- [ ] Lane 3. As `me.lane3@demo.esta.test` in Studio at 390x844, light, update the name of `Gia đình Demo 4` and insert a `parties` row with household 4's id. Save `p0-02-cross-write.png`. Pass when the update reports `UPDATE 0` and the insert fails with `new row violates row-level security policy`.
- [ ] Lane 4. With the service role, add a viewer member for a new confirmed user `viewer.lane4@demo.esta.test` in `Gia đình Demo 4`. As that user, select `parties` and then insert a party, at 1440x900, light. Save `p0-02-viewer.png`. Pass when the select returns household 4's two parties and the insert fails with the RLS error.
- [ ] Lane 5. As `ryan.lane5@demo.esta.test`, update `full_name` of household 5's `Trần Minh Demo` party to `Trần Minh Demo 5`, then select the newest `audit_log` row at 390x844, dark. Save `p0-02-audit-user.png`. Pass when the row has `actor_kind = 'user'`, `actor_id` equal to that user's id, `household_id` equal to `Gia đình Demo 5`'s id, and a diff holding the old and new `full_name`, and the same select run as `me.lane6@demo.esta.test` returns no household 5 rows.
- [ ] Lane 6. Send `curl -X PATCH` to `/rest/v1/parties?id=eq.<household 6 party>` on the slot's API port with the service role key and `x-esta-actor: system:cron`, then read the newest `audit_log` row in Studio at 1440x900, dark. Save `p0-02-audit-cron.png`. Pass when the row reads `actor_kind = 'system'` and `actor_id = 'cron'`.
- [ ] Lane 7. Repeat lane 6 for household 7 with the JWT of `ryan.lane7@demo.esta.test` and the header `x-esta-actor: agent:spoof`, at 390x844, light. Save `p0-02-audit-spoof.png`. Pass when the audit row reads `actor_kind = 'user'` with Ryan's lane 7 id and no row names `spoof`.
- [ ] Lane 8. Run `pnpm db:test`, render the TAP output in `/tmp/swarm-p0-02/lane8.html` with `$B load-html` at 1440x900, light. Save `p0-02-pgtap.png`. Pass when every test prints `ok`, the run ends with `Result: PASS`, and `tenancy_isolation`, `viewer_readonly` and `audit_log` all appear.
- [ ] Lane 9. Add uncommitted files `apps/web/src/app/x.ts` and `apps/web/src/server/cron/x.ts`, each reading `process.env.SUPABASE_SERVICE_ROLE_KEY`, run `pnpm lint`, render the output at 390x844, dark, then delete both. Save `p0-02-lint-allowlist.png`. Pass when lint reports `esta/service-role-allowlist` for `apps/web/src/app/x.ts` only and `git status --short` is empty afterwards.
- [ ] Lane 10. Start slot 10 with `ESTA_SLOT=10 pnpm db:start && ESTA_SLOT=10 pnpm db:reset` beside the lane's main slot, render both `supabase status` outputs, then open Studio on port 55323 at 1440x900, dark. Save `p0-02-slot-10.png`. Pass when every slot 10 port is its slot 0 port plus 1000 and both stacks show 11 households.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `pnpm db:reset` wall time, `pnpm db:test` wall time, and execution time of `select * from parties` as a member under RLS from `EXPLAIN (ANALYZE)`.
- [ ] Probe. Run each command 5 times at head, interleaved with `pnpm check` runs at trunk and head for the shared metric.
- [ ] Baseline. Trunk has no database, so record that, take the head values as the first baseline, and compare `pnpm check` wall time trunk against head.
- [ ] Rule. Fail when `pnpm db:reset` exceeds 30 s, `pnpm db:test` exceeds 30 s, the RLS select exceeds 5 ms, or `pnpm check` at head exceeds trunk by more than 10 s.

**Review gate.** None. P0-02 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Add the injected Clock, the test clock and the cron route skeleton (P0-03)

**Depends on.** P0-02.

**Files.**

- [ ] Create `packages/core/src/clock/clock.ts`, `packages/core/src/clock/resolve.ts` and `packages/core/src/clock/clock.test.ts`.
- [ ] Create `supabase/migrations/20261007003000_test_clock.sql` and `supabase/tests/test_clock.test.sql`.
- [ ] Create `apps/web/src/server/clock.ts`, `apps/web/src/server/clock.test.ts` and `apps/web/src/instrumentation.ts`.
- [ ] Create `apps/web/src/server/cron/auth.ts`, `apps/web/src/server/cron/supabase.ts`, `apps/web/src/server/cron/keep-alive.ts` and `apps/web/src/server/cron/test-clock.ts`.
- [ ] Create `apps/web/src/app/api/cron/keep-alive/route.ts` and `apps/web/src/app/api/test/clock/route.ts`.
- [ ] Create `scripts/clock-set.ts`, `scripts/cron-run.ts` and `vercel.json`. Edit `apps/web/src/app/layout.tsx`.
- [ ] Create `e2e/clock.spec.ts`.

**Build.**

- [ ] Define `IsoDate`, `Instant`, `Clock` (`now(): Instant`, `today(): IsoDate`) and the union `ClockSource` (`table`, `env`, `system`) in `packages/core/src/clock/clock.ts`.
- [ ] Add pure `resolveClockSource({ estaEnv, testClockRow, frozenNowEnv, systemNow })` and `businessDate(instant, timezone)` in `packages/core/src/clock/resolve.ts`. Outside `production` the order is table row, then `ESTA_FROZEN_NOW`, then system time. In `production` it is always system time.
- [ ] Add `assertClockAllowed(env)` in the same module. It throws `Refusing to start: frozen clock configured while ESTA_ENV=production` when `ESTA_ENV=production` and `ESTA_FROZEN_NOW` is set.
- [ ] Create `test_clock` as a single-row table (boolean primary key fixed to true, `frozen_now timestamptz`). RLS allows select for `anon` and `authenticated` and has no write policy.
- [ ] Add `getClock()` in `apps/web/src/server/clock.ts`. It reads `test_clock` through the session client on every request, never caches across requests, and skips the read when `ESTA_ENV=production`.
- [ ] Call `assertClockAllowed(env)` from `register()` in `apps/web/src/instrumentation.ts` so `pnpm start` exits 1 on the refused combination.
- [ ] Add `requireCronSecret(request)` in `apps/web/src/server/cron/auth.ts` (401 without `Authorization: Bearer $CRON_SECRET`) and the cron service client in `apps/web/src/server/cron/supabase.ts`, which sends `x-esta-actor: system:cron`.
- [ ] Make `/api/cron/keep-alive` run `select count(*) from households` and return `{"ok":true,"as_of":"<IsoDate>"}` from `getClock()`. Register it in `vercel.json`.
- [ ] Make `/api/test/clock` accept `POST {"frozen_now":"<iso>"}` and `DELETE` behind `requireCronSecret`, writing through `apps/web/src/server/cron/test-clock.ts`. The route returns 404 when `ESTA_ENV=production`.
- [ ] Add `pnpm clock:set <iso>` and `pnpm clock:set off` in `scripts/clock-set.ts`, printing `Test clock: <utc iso> (business date <IsoDate>)` or `Test clock off`.
- [ ] Add `pnpm cron:run` in `scripts/cron-run.ts`, which calls every route under `/api/cron/` on the slot's web port with the secret and prints each status and body.
- [ ] Render a date line `<p data-testid="date-line">` with `getClock().today()` in `apps/web/src/app/layout.tsx` (FND-9 web and cron parts). P0-04 formats it.

**You see.**

- [ ] After `pnpm clock:set 2026-10-07T09:00:00+07:00`, `/` shows the date line `2026-10-07`.
- [ ] After `pnpm clock:set 2026-10-08T09:00:00+07:00`, a reload shows `2026-10-08` with no restart.
- [ ] `pnpm cron:run` prints `200 /api/cron/keep-alive {"ok":true,"as_of":"2026-10-07"}` at the first clock.
- [ ] `ESTA_ENV=production ESTA_FROZEN_NOW=2026-10-07T09:00:00+07:00 pnpm start` exits 1 with the refusal message.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/clock/clock.test.ts` gains cases for the source order, production ignoring the table and the env value, `businessDate` at `2026-10-07T16:59:59Z` (`2026-10-07`) and `2026-10-07T17:00:00Z` (`2026-10-08`), and `assertClockAllowed` for `production` and for `test` with `NODE_ENV=production` (FND-9).
- [ ] `apps/web/src/server/clock.test.ts` proves two requests read two different rows after a write between them.
- [ ] `supabase/tests/test_clock.test.sql` proves at most one row and that `authenticated` cannot write.
- [ ] `e2e/clock.spec.ts` sets the clock through `/api/test/clock`, asserts the date line, advances one day and asserts again. Run `pnpm e2e e2e/clock.spec.ts`.
- [ ] Run `pnpm check`. Run `pnpm db:test`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/clock.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no clock and `/` shows only `Esta`, so the lane gates the head on its own slot (`ESTA_SLOT=1`). Run `pnpm clock:set 2026-10-07T09:00:00+07:00` and open `/` with `$B` at 390x844, light. Save `p0-03-date-line.png`. Pass when `[data-testid=date-line]` reads `2026-10-07` and `Esta` still shows.
- [ ] Lane 2. On slot 2 at 1440x900, dark, set the clock to `2026-10-07T09:00:00+07:00`, load `/`, then run `pnpm clock:set 2026-10-08T00:30:00+07:00` and reload without restarting `pnpm dev`. Save `p0-03-advance.png`. Pass when the date line reads `2026-10-08` and the `pnpm dev` PID is unchanged.
- [ ] Lane 3. On slot 3 at 390x844, dark, set `2026-10-07T23:59:00+07:00`, read the date line, then set `2026-10-08T00:00:00+07:00` and reload. Save `p0-03-midnight.png`. Pass when the first read is `2026-10-07` and the second is `2026-10-08`.
- [ ] Lane 4. On slot 4, run `pnpm clock:set off`, restart `pnpm dev` with `ESTA_FROZEN_NOW=2026-01-01T09:00:00+07:00`, and open `/` at 1440x900, light. Save `p0-03-env-fallback.png`. Pass when the date line reads `2026-01-01`.
- [ ] Lane 5. On slot 5 with the clock off and no `ESTA_FROZEN_NOW`, open `/` at 390x844, light. Save `p0-03-system-time.png`. Pass when the date line equals the output of `TZ=Asia/Ho_Chi_Minh date +%F`.
- [ ] Lane 6. On slot 6, `POST` `{"frozen_now":"2026-10-10T09:00:00+07:00"}` to `/api/test/clock` once without the secret and once with it, then reload `/` at 1440x900, dark. Save `p0-03-test-route.png`. Pass when the first call returns 401, the second returns 200, and the date line reads `2026-10-10`.
- [ ] Lane 7. Build with `ESTA_ENV=production` (no frozen clock), start it, and render `curl -i -X POST` to `/api/test/clock` with the secret at 390x844, light. Save `p0-03-test-route-prod.png`. Pass when the response is 404 and `select count(*) from test_clock` is unchanged.
- [ ] Lane 8. Render the stderr and exit codes of `ESTA_ENV=production ESTA_FROZEN_NOW=2026-10-07T09:00:00+07:00 pnpm start` and of the same start with `NODE_ENV=production ESTA_ENV=test`, then open `/` on the second at 1440x900, dark. Save `p0-03-refuse-prod.png`. Pass when the first exits 1 with `Refusing to start: frozen clock configured while ESTA_ENV=production` and the second serves `/` with the date line `2026-10-07`.
- [ ] Lane 9. On slot 9 at clock `2026-10-07T09:00:00+07:00`, render `pnpm cron:run` and `curl -i /api/cron/keep-alive` without the secret at 390x844, dark. Save `p0-03-cron-run.png`. Pass when `pnpm cron:run` prints `200` with `{"ok":true,"as_of":"2026-10-07"}` and the bare curl returns 401.
- [ ] Lane 10. On slot 10, run `pnpm cron:run` at `2026-10-07T09:00:00+07:00`, set `2026-10-09T09:00:00+07:00` and run it again without restarting anything, rendering both at 1440x900, light. Save `p0-03-cron-advance.png`. Pass when the second body reads `"as_of":"2026-10-09"`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Median TTFB of `GET /` on a production build with `ESTA_ENV=test`, and wall time of `pnpm cron:run`.
- [ ] Probe. Request `/` 20 times per run, 5 runs per side, interleaved between trunk and head on the same slot. Run `pnpm cron:run` 5 times at head.
- [ ] Baseline. Trunk serves `/` without a clock read, so the TTFB comparison is the same request on both sides. Trunk has no cron route, so `pnpm cron:run` takes an absolute budget.
- [ ] Rule. Fail when head median TTFB for `/` exceeds trunk by more than 10 ms, or `pnpm cron:run` exceeds 2 s.

**Review gate.** None. P0-03 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Build the formatting and parsing core with the /dev/core playground (P0-04)

**Depends on.** P0-03.

**Files.**

- [ ] Create `packages/core/src/money/vnd.ts` and `packages/core/src/money/vnd.test.ts`.
- [ ] Create `packages/core/src/format/index.ts` and `packages/core/src/format/format.test.ts`.
- [ ] Create `packages/core/src/parse/vnd-input.ts`, `packages/core/src/parse/date-input.ts`, `packages/core/src/parse/statement.ts` and `packages/core/src/parse/parse.test.ts`.
- [ ] Create `packages/core/src/phone/index.ts`, `packages/core/src/phone/phone.test.ts`, `packages/core/src/names/index.ts` and `packages/core/src/names/names.test.ts`.
- [ ] Create `packages/core/src/search/fold.ts` and `packages/core/src/search/fold.test.ts`.
- [ ] Create `supabase/migrations/20261007004000_unaccent.sql` and `supabase/tests/unaccent.test.sql`.
- [ ] Create `apps/web/src/app/dev/core/page.tsx`, `apps/web/src/app/dev/core/sections.ts` and `e2e/dev-core.spec.ts`. Edit `apps/web/src/app/layout.tsx`.

**Build.**

- [ ] Define the branded `Vnd` type and `vnd(n)` in `packages/core/src/money/vnd.ts`. `vnd` throws on anything that is not a safe integer.
- [ ] Add `formatVnd`, `formatVndCompact`, `formatArea`, `formatDate`, `formatDateLong` and `formatRelativeDue(due, today)` in `packages/core/src/format/index.ts`, each taking a `locale` of `vi` or `en`. `formatVndCompact` picks the unit after rounding, keeps up to 2 decimals for `tỷ` and 1 for `tr`, and trims trailing zeros. `formatDateLong` in `en` reads `Wednesday, 07/10/2026`. Dates are `IsoDate` strings; nothing reads the system time.
- [ ] Add `parseVndInput(text)` returning `{ ok: true, value: Vnd }` or `{ ok: false, reason }` for every DESIGN-BRIEF §7 shorthand, rejecting fractional đồng.
- [ ] Add `parseDateInput` for `dd/mm/yyyy` (rejecting impossible dates), and `parseStatementAmount` and `parseStatementDate` for every DOMAIN-VN §9 bank statement format.
- [ ] Add `normalizePhone`, `formatPhone` and `phoneForZaloLink` in `packages/core/src/phone/index.ts`. `phoneForZaloLink` keeps its `[verify]` tag until LSE-11.
- [ ] Add `sortKeyVietnameseName` and `compareVietnameseNames` (given name, then middle, then family, `vi` collation) in `packages/core/src/names/index.ts`.
- [ ] Add `foldVietnamese(text)` (lowercase, `đ` to `d`, NFD with marks stripped) in `packages/core/src/search/fold.ts`.
- [ ] Enable the `unaccent` extension and add the immutable SQL function `esta_unaccent(text)` with the same folding in `20261007004000_unaccent.sql`.
- [ ] Build `/dev/core` from the registry in `apps/web/src/app/dev/core/sections.ts`. Each section is one core module with rows of function, input, expected and actual. A row whose actual differs from its expected reads `MISMATCH`. The page also has a live `parseVndInput` box.
- [ ] Format the root date line with `formatDateLong`.

**You see.**

- [ ] `/dev/core` shows sections for money, format, parse, phone, names and search, with zero `MISMATCH` rows.
- [ ] Typing `3tr5` in the live box shows `3.500.000 ₫`.
- [ ] At clock `2026-10-07T09:00:00+07:00` the date line reads `Thứ Tư, 07/10/2026`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/format/format.test.ts`, `parse/parse.test.ts`, `phone/phone.test.ts`, `names/names.test.ts` and `search/fold.test.ts` gain every DOMAIN-VN §9 row and every DESIGN-BRIEF §7 `parseVndInput` example, with exact expected strings including the NBSP (FND-4). `money/vnd.test.ts` covers `vnd(1.5)` and `vnd(2 ** 53)` throwing.
- [ ] `supabase/tests/unaccent.test.sql` proves `di an` matches `Dĩ An`, `hop dong` matches `Hợp đồng`, `DUONG` matches `Đường` and `bao loc so` matches `Sổ hồng Bảo Lộc` through `esta_unaccent`.
- [ ] `e2e/dev-core.spec.ts` asserts zero `MISMATCH` rows. Run `pnpm e2e e2e/dev-core.spec.ts`.
- [ ] Run `pnpm check`. Run `pnpm db:test`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/dev-core.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no `/dev/core` and its date line reads `2026-10-07`, so the lane records both and gates the head. Open `/dev/core` with `$B` at 390x844, light, at clock `2026-10-07T09:00:00+07:00`. Save `p0-04-dev-core.png`. Pass when `$B js` counts zero `MISMATCH` cells and every section listed in You see is present.
- [ ] Lane 2. At 1440x900, dark, read the `formatVnd` row for `15000000`. Save `p0-04-format-vnd.png`. Pass when the cell text is `15.000.000 ₫` and `$B js` finds character code 160 between the digits and `₫`.
- [ ] Lane 3. At 390x844, dark, read the compact rows. Save `p0-04-compact.png`. Pass when `999999999` shows `1 tỷ`, `3200000000` shows `3,2 tỷ` in the `vi` column and `3.2B ₫` in the `en` column, and `850000` shows `850 nghìn`.
- [ ] Lane 4. At 1440x900, light, type `1ty2`, then `850k`, then `abc` into the live `parseVndInput` box. Save `p0-04-parse-live.png` after `abc`. Pass when the previews read `1.200.000.000 ₫` and `850.000 ₫` and `abc` shows a reason with no amount.
- [ ] Lane 5. At 390x844, light, read the date rows and the root date line. Save `p0-04-dates.png`. Pass when `formatDate` shows `07/10/2026`, `formatDateLong` shows `Thứ Tư, 07/10/2026`, `formatRelativeDue` for due `2026-09-25` shows `quá hạn 12 ngày`, and the root date line reads `Thứ Tư, 07/10/2026`.
- [ ] Lane 6. At 1440x900, dark, read the phone section. Save `p0-04-phone.png`. Pass when `0903123456`, `+84903123456` and `84903123456` all normalize to `+84903123456`, `formatPhone` shows `0903 123 456`, and `phoneForZaloLink` shows `0903123456`.
- [ ] Lane 7. At 390x844, dark, read the names section, which sorts six synthetic `Demo` names. Save `p0-04-names.png`. Pass when the sorted column equals the expected column and `Nguyễn Thị Hường` precedes `Trần Văn Khoa`.
- [ ] Lane 8. In Studio's SQL editor at 1440x900, light, run `select esta_unaccent('Đường Dĩ An')` and the four DOMAIN-VN §9 search matches as `ilike` predicates over `esta_unaccent`. Save `p0-04-unaccent.png`. Pass when the first returns `duong di an` and all four predicates return `true`.
- [ ] Lane 9. At 1440x900, dark, read the statement section. Save `p0-04-statement.png`. Pass when `1.500.000`, `1,500,000`, `1500000.00` and `+1.500.000` give `1500000`, `-1.500.000` gives `-1500000`, `1.500.000,50` is rejected, and the three date formats give `2026-10-07`.
- [ ] Lane 10. Restart `pnpm dev` with `TZ=America/Los_Angeles` and open `/dev/core` at 390x844, light, at clock `2026-10-07T09:00:00+07:00`. Save `p0-04-host-tz.png`. Pass when the date line still reads `Thứ Tư, 07/10/2026` and zero rows read `MISMATCH`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Mean time per call of `formatVnd`, `formatVndCompact` and `parseVndInput` from `vitest bench`, and initial JS gzipped for `/` on a production build.
- [ ] Probe. Run `vitest bench packages/core` 5 times at head. Run `next build` once per side and read `/` from the route size table.
- [ ] Baseline. Trunk has no core functions, so the bench takes an absolute budget. `/` exists on both sides and compares directly.
- [ ] Rule. Fail when any benched function exceeds 5 µs per call, or `/` initial JS at head exceeds trunk by more than 5 KB gzipped or exceeds 200 KB.

**Review gate.** None. P0-04 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Wire next-intl with vi and en and the string literal lint (P0-05)

**Depends on.** P0-04.

**Files.**

- [ ] Create `apps/web/messages/vi.json` and `apps/web/messages/en.json`.
- [ ] Create `apps/web/src/i18n/locale.ts`, `apps/web/src/i18n/locale.test.ts` and `apps/web/src/i18n/request.ts`. Edit `apps/web/next.config.ts`, `apps/web/src/app/layout.tsx` and `apps/web/src/app/page.tsx`.
- [ ] Create `eslint-rules/no-jsx-literals.mjs` and `eslint-rules/no-jsx-literals.test.ts`. Edit `eslint.config.mjs`.
- [ ] Create `scripts/i18n-parity.ts` and `scripts/i18n-parity.test.ts`. Edit the root `package.json`.
- [ ] Create `e2e/i18n.spec.ts`.

**Build.**

- [ ] Add pure `resolveLocale({ memberLocale, cookieLocale })` in `apps/web/src/i18n/locale.ts`. It returns the member locale, else a valid `NEXT_LOCALE` cookie, else `vi`. Before P0-09 the member locale is always null.
- [ ] Configure next-intl in `apps/web/src/i18n/request.ts` with `resolveLocale` and set `<html lang>` from it.
- [ ] Move the placeholder `Esta` and a one-line tagline (`Sổ cái nhà đất của gia đình` and `The family's property ledger`) into the message files.
- [ ] Add `esta/no-jsx-literals`, which fails on JSX text and on string literals in `aria-label`, `title`, `placeholder` and `alt` outside message files. It exempts `apps/web/src/app/dev/**`, which is developer-only and absent in production.
- [ ] Add `scripts/i18n-parity.ts`, which fails when `vi.json` and `en.json` differ in key paths or in ICU placeholder names per key, and run it from `pnpm check` (FND-3).

**You see.**

- [ ] `/` shows `Esta` and `Sổ cái nhà đất của gia đình` with `<html lang="vi">`.
- [ ] With the cookie `NEXT_LOCALE=en`, `/` shows `The family's property ledger` with `<html lang="en">`.
- [ ] `pnpm lint` fails with `esta/no-jsx-literals` on `<p>Xin chào</p>` in a file under `apps/web/src/app/`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/web/src/i18n/locale.test.ts` covers member locale over cookie, a valid cookie, an unknown cookie value and the `vi` default.
- [ ] `eslint-rules/no-jsx-literals.test.ts` covers JSX text, each listed attribute, a message call (valid), whitespace-only text (valid) and the `dev` exemption.
- [ ] `scripts/i18n-parity.test.ts` covers a missing key, an extra key and a renamed placeholder (FND-3).
- [ ] `e2e/i18n.spec.ts` covers the default and the `en` cookie. Run `pnpm e2e e2e/i18n.spec.ts`.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/i18n.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open `/` with `$B` at 390x844, light, at trunk and at head. Save `p0-05-root-vi.png` from head. Pass when both show `Esta` and the date line `Thứ Tư, 07/10/2026`, and head also shows `Sổ cái nhà đất của gia đình` with `<html lang="vi">`.
- [ ] Lane 2. Set `$B cookie NEXT_LOCALE=en` and open `/` at 1440x900, dark. Save `p0-05-root-en.png`. Pass when the page shows `The family's property ledger` and `$B js "document.documentElement.lang"` returns `en`.
- [ ] Lane 3. Set `NEXT_LOCALE=fr` and open `/` at 390x844, dark. Save `p0-05-unknown-locale.png`. Pass when the page falls back to Vietnamese and `lang` is `vi`.
- [ ] Lane 4. Add an uncommitted `apps/web/src/app/scratch.tsx` rendering `<p>Xin chào</p>`, run `pnpm lint`, render the output at 1440x900, light, then delete it. Save `p0-05-lint-text.png`. Pass when lint reports `esta/no-jsx-literals` at that file and `git status --short` is empty afterwards.
- [ ] Lane 5. Repeat lane 4 with `<button aria-label="Đóng" />` at 390x844, light. Save `p0-05-lint-attr.png`. Pass when lint reports `esta/no-jsx-literals` for the `aria-label` attribute.
- [ ] Lane 6. Delete the tagline key from an uncommitted copy of `en.json`, run `pnpm check`, render the output at 1440x900, dark, then restore. Save `p0-05-parity-missing.png`. Pass when the parity check fails and names the missing key path in `en.json`.
- [ ] Lane 7. Add a key with `{count}` in `vi.json` and `{n}` in `en.json` in an uncommitted change, run `pnpm check`, render at 390x844, dark, then restore. Save `p0-05-parity-placeholder.png`. Pass when the parity check names the key and both placeholder names.
- [ ] Lane 8. Run `pnpm lint` on the clean head and open `/dev/core` at 1440x900, light. Save `p0-05-dev-exempt.png`. Pass when lint exits 0 and `/dev/core` still renders with zero `MISMATCH` rows.
- [ ] Lane 9. Open `/` at 390x844, light, and run `$B js "document.body.innerText === document.body.innerText.normalize('NFC')"`. Save `p0-05-nfc.png`. Pass when the result is `true`.
- [ ] Lane 10. Build a production build with `ESTA_ENV=test` and render `curl -s -H 'Cookie: NEXT_LOCALE=en' /` at 1440x900, dark. Save `p0-05-ssr-en.png`. Pass when the server HTML contains `lang="en"` and `The family's property ledger`, so no Vietnamese text renders before hydration.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Initial JS gzipped for `/` on a production build, and cold `pnpm check` wall time.
- [ ] Probe. Run `next build` once per side for the route table. Run `pnpm check` 5 times per side, interleaved.
- [ ] Baseline. Trunk serves the same `/` without next-intl and runs `pnpm check` without the parity script and the new lint rule.
- [ ] Rule. Fail when `/` initial JS at head exceeds trunk by more than 15 KB gzipped or exceeds 200 KB, or `pnpm check` at head exceeds trunk by more than 10 s.

**Review gate.** None. P0-05 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Import admin units, legacy mapping, land use codes, bank BINs and tax rules (P0-06)

**Depends on.** P0-05.

**Files.**

- [ ] Create `scripts/reference/fetch.sh`, `scripts/reference/build-admin-units.ts`, `scripts/reference/build-admin-units.test.ts` and `scripts/reference/build-migration.ts`.
- [ ] Create `supabase/seed/reference/admin_units.csv`, `supabase/seed/reference/admin_unit_legacy_map.csv`, `supabase/seed/reference/legacy_curated.csv`, `supabase/seed/reference/land_use_codes.csv`, `supabase/seed/reference/napas_bins.csv` and `supabase/seed/reference/bank_short_names.csv`.
- [ ] Create `supabase/seed/README.md`.
- [ ] Create `supabase/migrations/20261007000500_reference_tables.sql` and the generated `supabase/migrations/20261007006100_reference_data.sql`.
- [ ] Create `supabase/tests/reference_data.test.sql` and `supabase/tests/suggest_current_unit.test.sql`.
- [ ] Edit `apps/web/src/app/dev/core/sections.ts`, `apps/web/src/app/dev/core/page.tsx`, `e2e/dev-core.spec.ts` and `docs/spec/DOMAIN-VN.md`.

**Build.**

- [ ] Port `fetch.sh` from branch `spike/s3-admin-units` (1945c64) to `scripts/reference/fetch.sh`. It calls the NSO SOAP catalog (`DanhMucTinh`, `DanhMucPhuongXa`, `DenNgay` 06/10/2026) and downloads `BangChuyendoiĐVHCmoi_cu_final.xlsx`, and it fails when any SHA-256 differs from the pinned value.
- [ ] Add `buildAdminUnits(raw)` in `scripts/reference/build-admin-units.ts`. It applies these S3 cleanups. It derives the old province from the old district code, collapses whitespace in names, takes province-level `kind` from the catalog, joins on the 5-digit commune code, and appends the cited rows in `legacy_curated.csv` (Phường 2 Tân An merged on 1 Dec 2024, the two code typos).
- [ ] Copy the NAPAS BIN snapshot from branch `spike/s4-vietqr` (a7c9e76) to `supabase/seed/reference/napas_bins.csv` (74 rows of `bin`, `name`, `code`). Add `bank_short_names.csv`, a small curated map from BIN to display short name labelled `[app rule]`. Nothing in the app or the scripts fetches the NAPAS portal; a person refreshes the snapshot by hand.
- [ ] Add `scripts/reference/build-migration.ts`, which writes `20261007006100_reference_data.sql` from the CSVs in sorted order, so a rerun produces a byte-identical file. Reference data lives in a migration because production runs no seed.
- [ ] Create `admin_units`, `admin_unit_legacy_map` (the S3 shape with `merge_kind whole | partial` and `source`), `land_use_codes`, `bank_bins` (`bin`, `name`, `napas_code`, `short_name`) and `tax_rules` in `20261007000500_reference_tables.sql`. They have no `household_id`. RLS allows select for `authenticated` and has no write policy.
- [ ] Add `admin_name_key(text)`, an immutable SQL function with the S3 matching rules. It applies `esta_unaccent`, maps a curly apostrophe to straight, every dash alike, `TP.` expanded, one unit prefix stripped.
- [ ] Add `suggest_current_unit(p_text text)` returning `commune_code`, `commune_name`, `province_code`, `province_name`, `merge_kind`, `matched_legacy_name` and `rank`. It splits the input on commas, scopes numeric names such as `Phường 1` by their parent, never keys on a name alone, and lists every candidate of a split commune.
- [ ] Seed the 12 DOMAIN-VN §3 codes into `land_use_codes` and the DOMAIN-VN §5 row into `tax_rules`, with a `note` that the PIT effective date is `[verify]`.
- [ ] Write `supabase/seed/README.md` with each source, URL, fetch date, SHA-256 and license basis. The admin units cite IP Law Article 15, approved by Ryan at plan review. The NAPAS snapshot records that its terms allow personal non-commercial use with the source cited and bar automated collection.
- [ ] Add an address lookup section to `/dev/core` with a free-text box that calls `suggest_current_unit` and the five frozen FND-6 rows.
- [ ] Update DOMAIN-VN §4 from S3. Mark the Tây Ninh, Đồng Nai and Lâm Đồng rows `[verified]` with the expected commune codes, change the province split to 25 provinces and 9 cities with the sources for the 2026 upgrades of Đồng Nai, Quảng Ninh and Bắc Ninh, and mark the 3,321 commune count verified.

**You see.**

- [ ] Studio shows 34 province-level and 3,321 commune-level rows in `admin_units` (709 wards, 2,599 communes, 13 special zones).
- [ ] `/dev/core` lists `Phường Dĩ An` (25942) under `Thành phố Hồ Chí Minh` first for `Dĩ An, Bình Dương`.
- [ ] `bank_bins` has 74 rows.
- [ ] `pnpm db:test` passes the FND-6 tests.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `supabase/tests/reference_data.test.sql` asserts 34 province-level units, 3,321 commune-level units, 10,571 or more legacy rows, 74 BINs, 12 land use codes, one `vn_rental_individual` row with `threshold_vnd` 500000000, and no write access for `authenticated` (FND-6).
- [ ] `supabase/tests/suggest_current_unit.test.sql` freezes the five FND-6 lookups (25942 in 79, 26506 in 79, 27694 in 80, 26188 in 75, 24823 in 68), the PRP-4 order for `Dĩ An, Bình Dương` (25942, 25945, 25951) and the four wards for `Quận 7`.
- [ ] `scripts/reference/build-admin-units.test.ts` covers each cleanup rule on small fixtures.
- [ ] `e2e/dev-core.spec.ts` gains the address section. Run `pnpm e2e e2e/dev-core.spec.ts`.
- [ ] Run `pnpm check`. Run `pnpm db:test`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/dev-core.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no reference tables, so the lane records that, checks the trunk `/dev/core` sections still render at head, and runs `select kind, count(*) from admin_units group by kind` in Studio at 1440x900, light. Save `p0-06-counts.png`. Pass when province plus city rows total 34, ward plus commune plus special zone rows total 3,321, and the older `/dev/core` sections show zero `MISMATCH`.
- [ ] Lane 2. In the `/dev/core` address box at 390x844, light, type `Phường Dĩ An, Thành phố Dĩ An, Tỉnh Bình Dương`. Save `p0-06-di-an.png`. Pass when the first row is `Phường Dĩ An` 25942 under province 79.
- [ ] Lane 3. At 1440x900, dark, type `Phường 1, Thành phố Vũng Tàu, Tỉnh Bà Rịa–Vũng Tàu`. Save `p0-06-vung-tau.png`. Pass when the first row is `Phường Vũng Tàu` 26506 under 79 and no other `Phường 1` appears.
- [ ] Lane 4. At 390x844, dark, type `Phường 2, Thành phố Tân An, Tỉnh Long An`. Save `p0-06-tan-an.png`. Pass when the first row is `Phường Long An` 27694 under `Tây Ninh` 80 and its source names the curated row.
- [ ] Lane 5. At 1440x900, light, look up `Phường Tân Phong, Thành phố Biên Hòa, Tỉnh Đồng Nai` and then `Phường 1, Thành phố Bảo Lộc, Tỉnh Lâm Đồng`. Save `p0-06-bien-hoa-bao-loc.png` after the second. Pass when the first gives `Phường Tân Triều` 26188 under 75 and the second gives `Phường 1 Bảo Lộc` 24823 under 68.
- [ ] Lane 6. At 390x844, light, type `Dĩ An, Bình Dương`. Save `p0-06-prp4.png`. Pass when the rows are 25942, 25945 and 25951 in that order, all under `Thành phố Hồ Chí Minh`.
- [ ] Lane 7. At 1440x900, dark, type `Quận 7`. Save `p0-06-quan-7.png`. Pass when exactly four wards show, each with `merge_kind` `partial`.
- [ ] Lane 8. At 390x844, dark, type `di an binh duong`, then `Dĩ An – Bình Dương` with an en dash. Save `p0-06-folding.png` after the second. Pass when both list the same three rows as lane 6.
- [ ] Lane 9. As `ryan.lane9@demo.esta.test` in Studio at 1440x900, light, insert a row into `bank_bins`, then select `count(*)` from `bank_bins` and the `params` of `tax_rules`. Save `p0-06-readonly.png`. Pass when the insert fails with the RLS error, the count is 74, and `params->>'threshold_vnd'` is `500000000`.
- [ ] Lane 10. Run `scripts/reference/fetch.sh --verify`, then `tsx scripts/reference/build-migration.ts` and `git diff --exit-code supabase/migrations/20261007006100_reference_data.sql`, and render the output at 390x844, light. Save `p0-06-determinism.png`. Pass when every checksum prints `OK` and `git diff` exits 0.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `pnpm db:reset` wall time, and execution time of `suggest_current_unit` for the five FND-6 inputs and `Quận 7` from `EXPLAIN (ANALYZE)`.
- [ ] Probe. Run `pnpm db:reset` 5 times per side, interleaved. Run each lookup 5 times at head.
- [ ] Baseline. Trunk resets without reference data, so the reset compares directly. Trunk has no lookup, so the lookup takes an absolute budget.
- [ ] Rule. Fail when head `pnpm db:reset` exceeds trunk by more than 10 s, or any lookup exceeds 20 ms.

**Review gate.** None. P0-06 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Build the deterministic seed generator for households, parties and properties (P0-07)

**Depends on.** P0-06.

**Files.**

- [ ] Create `supabase/seed/generator/index.ts`, `ids.ts`, `rng.ts`, `variants.ts`, `households.ts`, `parties.ts`, `properties.ts`, `sql.ts` and `generator.test.ts` under `supabase/seed/generator/`.
- [ ] Create `supabase/migrations/20261007000700_properties.sql` and `supabase/tests/properties.test.sql`.
- [ ] Create `scripts/db-checksum.ts` and `scripts/seed-determinism.ts`. Edit `scripts/db.ts`, the root `package.json`, `.gitignore` and `.github/workflows/ci.yml`.
- [ ] Delete `supabase/seed/bootstrap.sql`.

**Build.**

- [ ] Add `seedId(key)` in `ids.ts`, UUIDv5 under one fixed namespace, with keys such as `seed:household:lane-3` and `seed:property:lane-3:di-an`. Keep the P0-02 bootstrap keys so existing ids do not change.
- [ ] Add `createRng(seed)` (mulberry32) in `rng.ts`. Ban `Math.random` and `Date.now` under `supabase/seed/generator/` with `no-restricted-properties`.
- [ ] Take `--as-of`, default `2026-10-07T09:00:00+07:00`, and stamp every `created_at` and `updated_at` from it.
- [ ] Define the variants `full` and `northstar` as data in `variants.ts`. `northstar` drops the `di-an` property in every household (SPEC §9.3).
- [ ] Write `Gia đình Demo` (members `me@demo.esta.test` and `ryan@demo.esta.test`) and lane households `Gia đình Demo 1..N` from `--households N`. Each household gets the two members of P0-02, default `household_settings`, in-app `notification_preferences` and the owner parties `Nguyễn Thị Demo` and `Trần Minh Demo` linked to their members.
- [ ] Create the minimal `properties` table (nickname, code, kind, kind_details, use_mode, legal_status, current_address, certificate_address_text, location) with `unique (household_id, code)`, soft delete, RLS through `private.is_member`, and the audit trigger.
- [ ] Write the seven SPEC §9.3 properties into every household. `code` is the seed key in uppercase without hyphens. Current addresses use `admin_units` codes (`di-an` 25942 in 79, `bien-hoa` 26188 in 75, `long-an` 27694 in 80, `bao-loc` 24823 in 68, and wards of 79 for `q7`, `q1` and `thu-duc`). Certificate addresses are verbatim legacy text, and locations sit inside Vietnam's bounds.
- [ ] Set `esta.actor` to `system:seed` for the seed transaction so audit rows name the seed.
- [ ] Make `pnpm db:reset` generate `supabase/seed/generated/full.sql` with `--households 10` before `supabase db reset`, and add `pnpm db:reset:northstar`. Ignore `supabase/seed/generated/` in git.
- [ ] Add `pnpm db:checksum` in `scripts/db-checksum.ts`. It prints one md5 per public table over every column except `created_at` and `updated_at`, ordered by `id`, and skips `audit_log`, whose ids and times are set at write time.
- [ ] Add `pnpm db:seed:check` in `scripts/seed-determinism.ts`. It resets twice, compares the checksums, and exits 1 on any difference (FND-7). Run it in the CI `db` job.

**You see.**

- [ ] After `pnpm db:reset`, Studio shows 11 households and 77 properties.
- [ ] `pnpm db:seed:check` prints `identical` with one line per table.
- [ ] After `pnpm db:reset:northstar`, Studio shows 66 properties and no `Dãy trọ Dĩ An`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `supabase/seed/generator/generator.test.ts` proves two runs with the same arguments emit byte-identical SQL, a different `--as-of` changes only timestamps, `northstar` omits `di-an`, and `seedId` returns the known UUID for one fixed key.
- [ ] `supabase/tests/properties.test.sql` proves household isolation for all four operations, viewer read-only, the unique code per household and an audit row per write.
- [ ] Run `pnpm check`. Run `pnpm db:test`. Run `pnpm db:seed:check` (FND-7).

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk's bootstrap seed has 11 households and no properties. At head, run `pnpm db:reset` and open Studio's `households` and `properties` tables with `$B` at 1440x900, light. Save `p0-07-seeded.png`. Pass when `households` still has 11 rows with the same ids as trunk and `properties` has 77 rows.
- [ ] Lane 2. In Studio at 390x844, light, select the nicknames of household `Gia đình Demo 2`'s properties. Save `p0-07-lane2-properties.png`. Pass when exactly seven return, namely `Nhà phố Q7`, `Căn hộ Thủ Đức`, `Dãy trọ Dĩ An`, `Mặt bằng Quận 1`, `Kho Biên Hòa`, `Đất vườn Long An`, `Đất Bảo Lộc`.
- [ ] Lane 3. On its own slot (`ESTA_SLOT=3`), run `pnpm db:seed:check` and render it at 1440x900, dark. Save `p0-07-determinism.png`. Pass when both checksum columns match on every line and the script exits 0.
- [ ] Lane 4. On slot 4, run `pnpm db:reset:northstar` and select the property count and `count(*) where nickname = 'Dãy trọ Dĩ An'` at 390x844, dark. Save `p0-07-northstar.png`. Pass when the counts are 66 and 0.
- [ ] Lane 5. Render `tsx supabase/seed/generator/ids.ts seed:property:lane-5:di-an` beside the Studio row for lane 5's `Dãy trọ Dĩ An` at 1440x900, light. Save `p0-07-uuidv5.png`. Pass when the printed UUID equals the row `id`.
- [ ] Lane 6. In Studio at 390x844, light, join lane 6's `di-an` `current_address->>'commune_code'` to `admin_units`. Save `p0-07-address.png`. Pass when the name is `Phường Dĩ An`, the province code is 79, and `certificate_address_text` contains `Bình Dương`.
- [ ] Lane 7. As `me.lane7@demo.esta.test` at 1440x900, dark, select `count(*)` from `properties`, then select lane 8's properties by household id. Save `p0-07-rls.png`. Pass when the first returns 7 and the second returns 0.
- [ ] Lane 8. As `ryan.lane8@demo.esta.test` at 390x844, dark, rename lane 8's `Nhà phố Q7` to `Nhà phố Q7 Demo`, then select the newest two `audit_log` rows for `properties` in household 8. Save `p0-07-audit.png`. Pass when the newest row has `actor_kind = 'user'` with Ryan's lane 8 id and the seed insert row reads `system` and `seed`.
- [ ] Lane 9. On slot 9, generate with `--households 3` and reset, then select the household count and the distinct `created_at` values of `properties` at 1440x900, light. Save `p0-07-households-3.png`. Pass when 4 households exist and the only `created_at` is `2026-10-07 02:00:00+00`.
- [ ] Lane 10. As `ryan.lane10@demo.esta.test` at 390x844, light, insert a property with code `Q7` into household 10, then into a household Ryan does not belong to. Save `p0-07-unique-code.png`. Pass when the first fails with the unique violation on `(household_id, code)` and the second fails with the RLS error.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `pnpm db:reset` wall time and generator run time for `--households 10`.
- [ ] Probe. Run `pnpm db:reset` 5 times per side, interleaved, on one slot. Time the generator alone 5 times at head.
- [ ] Baseline. Trunk resets with the static bootstrap seed, so the reset compares directly. The generator is new and takes an absolute budget.
- [ ] Rule. Fail when head `pnpm db:reset` exceeds 60 s or exceeds trunk by more than 20 s, or the generator exceeds 2 s.

**Review gate.** None. P0-07 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Serve the app and local Supabase over LAN HTTPS for phone testing (P0-08)

**Depends on.** P0-07.

**Files.**

- [ ] Create `scripts/dev-lan.ts`, `scripts/lan-address.ts` and `scripts/lan-address.test.ts`.
- [ ] Create `infra/caddy/Caddyfile.template` and `scripts/caddyfile.test.ts`.
- [ ] Edit `apps/web/next.config.ts`, `supabase/config.toml`, the root `package.json` and `.gitignore`.

**Build.**

- [ ] Add pure `lanAddress(interfaces)` in `scripts/lan-address.ts`. It returns the first non-internal IPv4 address in 10.0.0.0/8, 172.16.0.0/12 or 192.168.0.0/16 and refuses public addresses.
- [ ] Make `pnpm dev:lan` in `scripts/dev-lan.ts` check for `mkcert` and `caddy` and exit 1 with an install hint when one is missing. It runs `mkcert` for the LAN address, `localhost` and `127.0.0.1` into `.certs/` (gitignored) and reuses existing certificates.
- [ ] Render `infra/caddy/Caddyfile.template` with the LAN address and slot ports. HTTPS 3443 proxies the web app, 8443 proxies the Supabase API and 9443 proxies Inbucket, each plus 100·k for `ESTA_SLOT=k`. Every site binds the LAN address only.
- [ ] Start Caddy and `next dev` with `NEXT_PUBLIC_SUPABASE_URL=https://<lan>:8443`, then print `Esta LAN: https://<lan>:3443`, `Inbucket: https://<lan>:9443` and the path of the mkcert root CA to install on the phone. A second run while one is live prints the same URLs and exits 0.
- [ ] Add the LAN origin to `allowedDevOrigins` in `apps/web/next.config.ts` and to `additional_redirect_urls` in `supabase/config.toml`.
- [ ] Start no tunnel and contact no external host (SPEC D13).

**You see.**

- [ ] `pnpm dev:lan` prints `Esta LAN: https://192.168.x.y:3443`.
- [ ] That URL loads `/` with a trusted certificate and the date line on the same machine.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `scripts/lan-address.test.ts` covers each private range, a public address (refused), loopback (skipped) and no address (error).
- [ ] `scripts/caddyfile.test.ts` proves the rendered file binds only the LAN address, contains no `0.0.0.0`, and offsets every port by 100·k for slots 0 and 7.
- [ ] Run `pnpm check`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no `pnpm dev:lan`, so the lane checks that `http://localhost:3000/` still serves at head and gates the LAN URL. Open the printed `https://<lan>:3443/` with `$B` at 390x844, light. Save `p0-08-lan-root.png`. Pass when `Esta` and the date line `Thứ Tư, 07/10/2026` show, `location.protocol` is `https:`, and no certificate interstitial appears.
- [ ] Lane 2. Open `https://<lan>:3443/dev/core` at 1440x900, dark, and read `$B network`. Save `p0-08-lan-dev-core.png`. Pass when zero rows read `MISMATCH` and the address lookup request goes to `https://<lan>:8443`.
- [ ] Lane 3. Open `https://<lan>:9443` at 1440x900, light. Save `p0-08-lan-inbucket.png`. Pass when the Inbucket mailbox page loads over HTTPS.
- [ ] Lane 4. Render `curl -s https://<lan>:8443/rest/v1/land_use_codes?select=code -H "apikey: <anon>"` at 390x844, dark. Save `p0-08-lan-api.png`. Pass when the response is 200 and the authenticated-only table returns an empty array to the anon key.
- [ ] Lane 5. On the LAN URL at 390x844, light, run `$B js "window.isSecureContext && !!navigator.mediaDevices"`. Save `p0-08-secure-context.png`. Pass when the result is `true`, the precondition for camera capture and PWA install.
- [ ] Lane 6. Render `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3443|8443|9443)'` at 1440x900, light. Save `p0-08-binding.png`. Pass when every listener shows the LAN address and none shows `*` or `0.0.0.0`.
- [ ] Lane 7. Run `ESTA_SLOT=7 pnpm dev:lan` and open the printed URL at 390x844, dark. Save `p0-08-slot-7.png`. Pass when the URL port is 4143 and the page loads.
- [ ] Lane 8. Run `pnpm dev:lan` with a `PATH` that lacks `mkcert` and render the output at 1440x900, dark. Save `p0-08-no-mkcert.png`. Pass when it exits 1 and the message names `brew install mkcert` and `mkcert -install`.
- [ ] Lane 9. Run `pnpm dev:lan` a second time while the first is live and render both outputs plus `stat -f %m .certs/*.pem` at 390x844, light. Save `p0-08-rerun.png`. Pass when both runs print the same URLs, the second exits 0, and the certificate modification times are unchanged.
- [ ] Lane 10. Render `pnpm dev:lan` output and `lsof -i -nP` for the Caddy and Next processes at 1440x900, light. Save `p0-08-no-tunnel.png`. Pass when no process holds a connection to a non-private address and no `ngrok` or `cloudflared` process runs.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Median TTFB of `GET /` direct on localhost and through the LAN proxy, and time from `pnpm dev:lan` start to the printed URL.
- [ ] Probe. Request each URL 20 times per run, 5 runs, interleaved, on one machine after a warm-up request. Start `pnpm dev:lan` 5 times from stopped.
- [ ] Baseline. Trunk serves `/` directly only, so the direct TTFB compares trunk against head. The proxy is new and takes an absolute budget for its overhead and startup.
- [ ] Rule. Fail when head direct TTFB exceeds trunk by more than 5 ms, the proxy adds more than 20 ms median over direct at head, or startup exceeds 15 s with warm certificates.

**Review gate.** None. P0-08 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Sign in with a 6-digit email code, create a household and claim invites (P0-09)

**Depends on.** P0-08.

**Files.**

- [ ] Edit `supabase/config.toml` and create `supabase/templates/otp.html`.
- [ ] Create `supabase/migrations/20261007000800_onboarding.sql` and `supabase/tests/onboarding.test.sql`.
- [ ] Create `packages/core/src/auth/otp.ts` and `packages/core/src/auth/otp.test.ts`.
- [ ] Create `apps/web/src/server/supabase/server.ts`, `apps/web/src/server/member.ts` and `apps/web/src/middleware.ts`.
- [ ] Create `apps/web/src/app/sign-in/page.tsx`, `apps/web/src/app/sign-in/actions.ts`, `apps/web/src/app/onboarding/page.tsx` and `apps/web/src/app/onboarding/actions.ts`. Edit `apps/web/src/app/page.tsx` and `apps/web/src/i18n/request.ts`.
- [ ] Edit `apps/web/messages/vi.json` and `apps/web/messages/en.json`.
- [ ] Create `e2e/helpers/inbucket.ts` and `e2e/auth.spec.ts`.

**Build.**

- [ ] Set `otp_length = 6`, a 30-day session timebox and the Vietnamese template `supabase/templates/otp.html` (subject `Mã đăng nhập Esta`) in `supabase/config.toml`. Mail goes to Inbucket through the local SMTP setting only.
- [ ] Gate the Google provider on `ESTA_GOOGLE_AUTH`. When it is `off`, `supabase/config.toml` disables the provider and `/sign-in` renders no Google button.
- [ ] Add `parseOtpInput(text)` in `packages/core/src/auth/otp.ts`. It strips spaces and accepts exactly 6 digits.
- [ ] Add `sendCode(email)` and `verifyCode(email, code)` server actions. `verifyCode` calls `verifyOtp` with type `email`, then `claim_pending_invites()`, then redirects to `/` for a member or `/onboarding` otherwise. A wrong or expired code shows `Mã không đúng hoặc đã hết hạn. Gửi lại mã.`, and resend waits 60 s.
- [ ] Add the security definer functions `claim_pending_invites()`, `create_household(p_name text, p_display_name text)` and `invite_member(p_household_id uuid, p_email text, p_role member_role)` in `20261007000800_onboarding.sql`. Claiming sets `user_id` on every unclaimed row whose `lower(invited_email)` matches the session email and is idempotent. `create_household` makes the caller an admin with `is_operator` true (`[app rule]`, listed in STATUS.md by P0-16) and creates `household_settings`. `invite_member` requires `private.is_member(p_household_id, 'admin')`.
- [ ] Build `/sign-in` with an email step (`Gửi mã`) and a code step using `inputmode="numeric"` and `autocomplete="one-time-code"`.
- [ ] Build `/onboarding` with the household name and the member's display name, then an optional invite step (email and role). An invite sends no email in Phase 0. The invitee signs in with the same address and lands in the household.
- [ ] Make `apps/web/src/middleware.ts` refresh the session and redirect unauthenticated requests to `/sign-in`, leaving `/sign-in`, `/api/cron/*`, `/api/test/*` and `/dev/*` public. Feed the member locale from `apps/web/src/server/member.ts` into `resolveLocale`.
- [ ] Show the household name, the member's display name and `Đăng xuất` on `/` for a signed-in member.

**You see.**

- [ ] `/` redirects to `/sign-in`, which shows `Đăng nhập`, an email field and `Gửi mã`.
- [ ] After entering the Inbucket code for `me.lane1@demo.esta.test`, `/` shows `Gia đình Demo 1`.
- [ ] A new address lands on `/onboarding` and, after creating `Gia đình Mới Demo`, `/` shows that name.
- [ ] An invited address lands on `/` in the inviting household with no onboarding.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/auth/otp.test.ts` covers `123456`, `123 456`, 5 digits, 7 digits and letters.
- [ ] `supabase/tests/onboarding.test.sql` covers claiming once and twice, claiming with a different email case, `create_household` making an admin operator, and `invite_member` refused for a member and a viewer.
- [ ] `e2e/auth.spec.ts` covers FND-1. A new email reads its code through `e2e/helpers/inbucket.ts`, signs in and lands on onboarding. An invited email lands directly in the household with the invited role. Run `pnpm e2e e2e/auth.spec.ts`.
- [ ] Run `pnpm check`. Run `pnpm db:test`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/auth.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk serves `/` with no sign-in. At head, open `/` with `$B` at 390x844, light, sign in as `me.lane1@demo.esta.test` with the code read from the slot's Inbucket API. Save `p0-09-signed-in.png`. Pass when the first load lands on `/sign-in` and the final page shows `Gia đình Demo 1` and `Đăng xuất`.
- [ ] Lane 2. At 390x844, dark, sign in as `new.lane2@demo.esta.test`, create `Gia đình Mới Demo 2` with display name `Demo Hai`. Save `p0-09-onboarding.png` on the onboarding form before submitting. Pass when the final page shows `Gia đình Mới Demo 2` and Studio shows that member as `admin` with `is_operator` true.
- [ ] Lane 3. At 1440x900, light, sign in as `ryan.lane3@demo.esta.test`, invite `invitee.lane3@demo.esta.test` as `viewer`, sign out, and sign in as the invitee. Save `p0-09-invite-claimed.png`. Pass when the invitee lands on `/` showing `Gia đình Demo 3` without onboarding and Studio shows the row with `user_id` set and role `viewer`.
- [ ] Lane 4. At 390x844, light, request a code for `me.lane4@demo.esta.test` and enter `000000`. Save `p0-09-wrong-code.png`. Pass when the page shows `Mã không đúng hoặc đã hết hạn. Gửi lại mã.` and `$B cookies` holds no Supabase auth cookie.
- [ ] Lane 5. At 1440x900, dark, sign in as `ryan.lane5@demo.esta.test` and paste the code with a space after the third digit. Save `p0-09-code-with-space.png`. Pass when sign-in succeeds and `/` shows `Gia đình Demo 5`.
- [ ] Lane 6. Request a code for `me.lane6@demo.esta.test` and open that message in Inbucket at the slot's Inbucket port at 1440x900, light. Save `p0-09-otp-email.png`. Pass when the subject reads `Mã đăng nhập Esta` and the body holds exactly one 6-digit code with correct Vietnamese diacritics.
- [ ] Lane 7. At 390x844, dark, sign in as `me.lane7@demo.esta.test` and read `$B cookies`. Save `p0-09-session.png`. Pass when the auth cookie expires at least 29 days after the test clock.
- [ ] Lane 8. Open `/sign-in` at 1440x900, dark, with `ESTA_GOOGLE_AUTH=off`, then restart with `on` and reload. Save `p0-09-google-flag.png` from the `off` run. Pass when no Google button exists with `off` and one exists with `on`.
- [ ] Lane 9. At 390x844, light, sign in as `ryan.lane9@demo.esta.test`, press `Đăng xuất`, then `$B goto /`. Save `p0-09-signed-out.png`. Pass when the page is `/sign-in` and the household name does not appear.
- [ ] Lane 10. Set `NEXT_LOCALE=en`, open `/sign-in` at 1440x900, dark, and sign in as `me.lane10@demo.esta.test`. Save `p0-09-english.png` on the code step. Pass when the labels read `Sign in` and `Send code` and the final page shows `Gia đình Demo 10` in English chrome. Lane 10 runs SPEC §9.4 seed 10 from P0-14 on.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS, and initial route JS gzipped, for `/sign-in` and `/` on a production build with the full seed, plus wall time from `Gửi mã` to the code arriving in Inbucket.
- [ ] Probe. 5 interleaved Lighthouse runs per side. Time 5 code deliveries at head.
- [ ] Baseline. Trunk has no `/sign-in`, so it takes the SPEC §7.2 budgets. `/` exists on both sides and compares directly.
- [ ] Rule. Fail when `/sign-in` LCP exceeds 2.5 s, TBT exceeds 200 ms, CLS exceeds 0.05, initial JS exceeds 200 KB, `/` initial JS exceeds trunk by more than 30 KB, or code delivery exceeds 3 s.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/P0-09/P0-09-review-<slug>.png`, one file per screenshot.
- [ ] Record a 30 to 60 second video of a new address signing in, creating a household and inviting a member, saved as `~/.claude/orchestrate/esta/media/P0-09/P0-09-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Generate the project verify skill for the web app (P0-10)

**Depends on.** P0-09.

**Files.**

- [ ] Create `.claude/skills/verify/SKILL.md`.
- [ ] Create `.claude/skills/verify/features/sign-in.md` and `.claude/skills/verify/features/onboarding.md`.
- [ ] Create `.claude/skills/verify/scripts/launch.sh`, `doctor.sh`, `sign-in.sh`, `set-theme.sh`, `set-locale.sh`, `evidence.sh` and `cleanup.sh`.
- [ ] Create `scripts/inbucket-code.ts` and `scripts/inbucket-code.test.ts`.

**Build.**

- [ ] Run `/create-verification-skill` and record its output in `.claude/skills/verify/SKILL.md` with the sections Launch, Doctor, Drive, Evidence and Cleanup.
- [ ] Make Launch run `pnpm db:start`, `pnpm db:reset`, `pnpm clock:set 2026-10-07T09:00:00+07:00` and `pnpm dev` for `ESTA_SLOT`, and wait until `/sign-in` returns 200.
- [ ] Make `doctor.sh` print one `OK` or `FAIL` line each for Docker, the slot's Supabase stack, the web port, the Inbucket API, the gstack browse binary and the test clock row, with the command that fixes each failure.
- [ ] Drive through gstack browse at 390x844 and 1440x900. `sign-in.sh <email>` fills `/sign-in`, reads the newest code for that mailbox through `scripts/inbucket-code.ts`, submits it and waits for `/`. `set-theme.sh <light|dark>` sets the `esta_theme` cookie and `data-theme` on `<html>` (P0-11 reads the cookie). `set-locale.sh <vi|en>` sets `NEXT_LOCALE`.
- [ ] Make `evidence.sh <pr-id> <slug>` save screenshots as `/tmp/swarm-<pr-id>/<slug>.png`.
- [ ] Make `cleanup.sh` stop `pnpm dev`, clear the test clock and stop the slot's stack, leaving no listener on the slot's ports.
- [ ] Map the sign-in and onboarding features in `features/sign-in.md` (existing member, wrong code, invite claim) and `features/onboarding.md` (new address, invite step), each with its routes, seed members and pass predicates.

**You see.**

- [ ] `doctor.sh` prints `OK` for all six checks on a launched slot.
- [ ] `sign-in.sh me.lane1@demo.esta.test` leaves the browser on `/` showing `Gia đình Demo 1`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `scripts/inbucket-code.test.ts` extracts the code from the Vietnamese template body, picks the newest of two messages, and fails with the mailbox name when none arrives in 10 s.
- [ ] Run `pnpm check`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no verify skill, so lanes there drive raw `$B` commands. At head, run Launch and Doctor, then `sign-in.sh me.lane1@demo.esta.test` at 390x844, light. Save `p0-10-sign-in.png` through `evidence.sh`. Pass when Doctor prints six `OK` lines, `/` shows `Gia đình Demo 1`, and `/tmp/swarm-p0-10/p0-10-sign-in.png` exists.
- [ ] Lane 2. On slot 2, stop the slot's stack and run `doctor.sh` at 1440x900, light, with the output rendered through `$B load-html`. Save `p0-10-doctor-fail.png`. Pass when the Supabase line reads `FAIL` and names `ESTA_SLOT=2 pnpm db:start`.
- [ ] Lane 3. Run `set-theme.sh dark` and `sign-in.sh ryan.lane3@demo.esta.test` at 1440x900, dark. Save `p0-10-theme-dark.png`. Pass when `data-theme` on `<html>` is `dark`, the `esta_theme` cookie is `dark`, and `/` shows `Gia đình Demo 3`.
- [ ] Lane 4. Follow `features/onboarding.md` for `new.lane4@demo.esta.test` at 390x844, dark. Save `p0-10-onboarding.png`. Pass when the household `Gia đình Mới Demo 4` exists and `/` shows it.
- [ ] Lane 5. Follow the invite claim in `features/sign-in.md` for lane 5 at 1440x900, light. Save `p0-10-invite.png`. Pass when `invitee.lane5@demo.esta.test` lands in `Gia đình Demo 5` as `viewer`.
- [ ] Lane 6. Run `set-locale.sh en` and open `/sign-in` at 390x844, light. Save `p0-10-locale-en.png`. Pass when the page reads `Sign in`.
- [ ] Lane 7. Sign in as `me.lane7@demo.esta.test` at 1440x900, dark, save two screenshots through `evidence.sh`, and render `ls /tmp/swarm-p0-10/`. Save `p0-10-evidence.png`. Pass when both files exist under the `<slug>.png` names given.
- [ ] Lane 8. On slot 8, run Launch, sign in as `ryan.lane8@demo.esta.test`, then run `cleanup.sh` and render `lsof` for the slot's web and API ports and `select count(*) from test_clock` at 390x844, dark. Save `p0-10-cleanup.png`. Pass when no listener remains and Cleanup cleared the clock before stopping the stack.
- [ ] Lane 9. Launch slots 9 and 8 at once and sign in on each at 1440x900, light. Save `p0-10-parallel.png` from slot 9. Pass when both sign-ins succeed and each Inbucket holds only its own lane's message.
- [ ] Lane 10. Sign in as `me.lane10@demo.esta.test` at 390x844, light, after Launch set the clock. Save `p0-10-clock.png`. Pass when the date line reads `Thứ Tư, 07/10/2026`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of Launch from a stopped slot to Doctor all `OK`, and of `sign-in.sh` from `/sign-in` to `/`.
- [ ] Probe. 5 runs each at head, interleaved with 5 runs of the same sign-in as raw `$B` commands.
- [ ] Baseline. Trunk has no skill, so the raw `$B` sign-in is the trunk baseline for the same scenario, and Launch takes an absolute budget.
- [ ] Rule. Fail when Launch exceeds 120 s, or `sign-in.sh` exceeds 10 s or the raw `$B` sign-in by more than 2 s.

**Review gate.** None. P0-10 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Set design tokens, self-host fonts and prove glyph coverage and contrast (P0-11)

**Depends on.** P0-10.

**Files.**

- [ ] Create `apps/web/src/design/tokens.ts`, `apps/web/src/design/text-pairs.ts` and `scripts/build-tokens.ts`, which writes `apps/web/src/styles/tokens.css`.
- [ ] Edit `apps/web/src/app/globals.css` and `apps/web/src/app/layout.tsx`. Create `apps/web/src/app/fonts.ts` and `apps/web/src/server/theme.ts`.
- [ ] Create `apps/web/src/fonts/` with Source Sans 3 and Source Serif 4 variable woff2 files subset to Latin and Vietnamese, and `apps/web/src/fonts/LICENSE-OFL.txt`.
- [ ] Create `fixtures/glyph-test-string.txt`, `scripts/glyphs-check.mjs`, `scripts/contrast-check.ts` and `scripts/contrast-check.test.ts`.
- [ ] Create `apps/web/src/app/dev/glyphs/page.tsx` and `e2e/dev-glyphs.spec.ts`.
- [ ] Create `DESIGN.md`.

**Build.**

- [ ] Define every DESIGN-BRIEF §5.2 token in OKLCH for light and dark in `apps/web/src/design/tokens.ts`, namely `paper`, `surface`, `ink`, `ink-muted`, `rule`, `lacquer`, `paid`, `due`, `overdue`, `vacant`, and `paid-ink`, `due-ink`, `overdue-ink`, `vacant-ink`. No value is pure black or pure white. Add the §5.1 type scale, a spacing scale, motion durations of 150 to 220 ms, and `--text-scale` (default 1) feeding the root font size.
- [ ] Generate `tokens.css` from `tokens.ts` with `scripts/build-tokens.ts`, under `:root` and `[data-theme="dark"]`, and map the tokens into the Tailwind theme in `globals.css`. `pnpm check` fails when `tokens.css` is stale.
- [ ] Load Source Sans 3 (UI) and Source Serif 4 (figures and display, optical size axis) from `apps/web/src/fonts/` with `next/font/local`, taken from google/fonts commit `7085eb89` per branch `spike/s2-fonts` (31dd4a6). Add a `figures` utility with `font-feature-settings: "tnum", "lnum"`.
- [ ] Port `spikes/s2-fonts/coverage.mjs` to `scripts/glyphs-check.mjs` as `pnpm glyphs:check`. It checks every font file at every weight the tokens use against `fixtures/glyph-test-string.txt` (the DESIGN-BRIEF §5.1 string, 68 code points), requires `tnum` and `lnum` on the figure face, and exits 1 on any miss. Run it in `pnpm check`.
- [ ] Add `scripts/contrast-check.ts`. It converts OKLCH to sRGB and checks every pair in `text-pairs.ts` at 4.5:1 and every status shape at 3:1 against `paper` and `surface`, in both themes. It prints each ratio, exits 1 on any failure, and runs in `pnpm check` (FND-5).
- [ ] Read the `esta_theme` cookie (`light`, `dark` or `system`) in `apps/web/src/server/theme.ts` and render `data-theme` on `<html>` on the server, so no theme flash occurs. `system` follows `prefers-color-scheme` in CSS. This is the hook `set-theme.sh` drives.
- [ ] Build `/dev/glyphs` with the glyph string in each face and weight at 16 and 32 px, a right-aligned figure column of amounts in the figure face, `Đặng Thị Hường` and `3.500.000 ₫` at 32 px, and a swatch per token pair with its measured ratio.
- [ ] Run `/impeccable document` to seed `DESIGN.md` with the tokens and the S2 typography decision (Source Sans 3 and Source Serif 4, why Be Vietnam Pro and Fraunces failed the `tnum` check, why Newsreader and Public Sans lost on look).

**You see.**

- [ ] `/dev/glyphs` shows the glyph string in both faces with no fallback glyphs, and a figure column whose digits align.
- [ ] `pnpm glyphs:check` prints `68/68` for every file and weight and exits 0.
- [ ] `pnpm check` prints the contrast table with every pair passing.
- [ ] With `esta_theme=dark`, `/` renders on the dark `paper` token from the first byte.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `scripts/contrast-check.test.ts` covers a known passing pair, a known failing pair, and the OKLCH conversion of `ink` against a reference value (FND-5).
- [ ] `e2e/dev-glyphs.spec.ts` asserts `document.fonts.check` is true for each face with the glyph string, and equal widths for `1.111.111 ₫` and `8.888.888 ₫` in the figure face. Run `pnpm e2e e2e/dev-glyphs.spec.ts`.
- [ ] Run `pnpm glyphs:check`. Run `pnpm check`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/dev-glyphs.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no tokens and no `/dev/glyphs`. Through the verify skill, sign in as `me.lane1@demo.esta.test` at trunk and head and open `/`, then open `/dev/glyphs` at head, at 390x844, light. Save `p0-11-glyphs-mobile.png`. Pass when `/` shows `Gia đình Demo 1` on both sides, and at head `document.fonts.check('16px "Source Serif 4"', <glyph string>)` and the same for Source Sans 3 return `true`.
- [ ] Lane 2. At 1440x900, dark, open `/dev/glyphs` and scan computed `color` and `background-color` of every element with `$B eval`. Save `p0-11-glyphs-dark.png`. Pass when the body background equals the dark `paper` token and no element computes to `rgb(0, 0, 0)` or `rgb(255, 255, 255)`.
- [ ] Lane 3. At 390x844, dark, measure the widths of `1.111.111 ₫` and `8.888.888 ₫` in the figure column. Save `p0-11-tabular.png`. Pass when the widths differ by less than 0.5 px.
- [ ] Lane 4. Render `pnpm glyphs:check` at 1440x900, light. Save `p0-11-glyphs-check.png`. Pass when every file and weight line reads `68/68`, `tnum` and `lnum` are present on Source Serif 4, and the exit code is 0.
- [ ] Lane 5. Render `node scripts/glyphs-check.mjs apps/web/src/fonts/*.woff2 --text "Ꙭ"` at 390x844, light. Save `p0-11-glyphs-miss.png`. Pass when it exits 1 and names `U+A66C`.
- [ ] Lane 6. Render `tsx scripts/contrast-check.ts` at 1440x900, dark. Save `p0-11-contrast.png`. Pass when every text pair shows at least 4.5, every status shape at least 3.0, in both themes, and the exit code is 0.
- [ ] Lane 7. Run `set-theme.sh dark`, sign in as `ryan.lane7@demo.esta.test`, and render `curl -s -H 'Cookie: esta_theme=dark' /sign-in` beside the page at 390x844, dark. Save `p0-11-theme-ssr.png`. Pass when the server HTML contains `data-theme="dark"` and a reload keeps the dark theme.
- [ ] Lane 8. Sign in as `me.lane8@demo.esta.test` and open `/` at 1440x900, light. Save `p0-11-root-type.png`. Pass when the body computes `font-family` starting with the Source Sans 3 family and `font-size` 16px.
- [ ] Lane 9. Open the `/dev/glyphs` status swatches at 390x844, light. Save `p0-11-status-swatches.png`. Pass when each of `paid`, `due`, `overdue` and `vacant` shows its `-ink` word at a ratio of at least 4.5 and its shape at least 3.0.
- [ ] Lane 10. Open `/dev/glyphs` at 1440x900, dark, and read `$B network`. Save `p0-11-self-hosted.png`. Pass when every font request is served from `/_next/static/media/` and no request goes to `fonts.googleapis.com` or `fonts.gstatic.com`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS, initial route JS gzipped, and font bytes transferred, for `/sign-in` and `/dev/glyphs` on a production build with `ESTA_ENV=test` and the full seed.
- [ ] Probe. 5 interleaved runs per side for `/sign-in`. 5 runs at head for `/dev/glyphs`.
- [ ] Baseline. `/sign-in` exists on both sides and compares directly. Trunk has no `/dev/glyphs`, so it takes the SPEC §7.2 budgets.
- [ ] Rule. Fail when `/sign-in` CLS at head exceeds 0.05 or trunk plus 0.01, LCP exceeds 2.5 s or trunk plus 300 ms, font bytes on `/sign-in` exceed 200 KB, or `/dev/glyphs` misses the SPEC §7.2 budgets.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/P0-11/P0-11-review-<slug>.png`, one file per screenshot.
- [ ] Record a 30 to 60 second video of `/dev/glyphs` in light and dark at 390 and 1440, then the contrast and glyph script output, saved as `~/.claude/orchestrate/esta/media/P0-11/P0-11-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Build the base components on /dev/components (P0-12)

**Depends on.** P0-11.

**Files.**

- [ ] Create `apps/web/src/components/ui/` with the shadcn primitives the components use (button, input, dialog, sheet, popover, checkbox, table, toast), restyled to the tokens.
- [ ] Create `apps/web/src/components/money/money-display.tsx` and `apps/web/src/components/money/money-input.tsx`.
- [ ] Create `apps/web/src/components/date-input.tsx`, `status-mark.tsx`, `completeness-ring.tsx`, `address-block.tsx`, `data-table.tsx`, `undo-toast.tsx`, `confirm-dialog.tsx`, `skeleton.tsx` and `empty-state.tsx` under `apps/web/src/components/`, each with a `*.test.tsx`.
- [ ] Create `apps/web/src/app/dev/components/page.tsx` and `apps/web/src/app/dev/components/registry.tsx`.
- [ ] Edit `apps/web/messages/vi.json`, `apps/web/messages/en.json` and `apps/web/src/design/text-pairs.ts`.
- [ ] Create `e2e/dev-components.spec.ts`.

**Build.**

- [ ] Add `MoneyDisplay` with variants `full`, `compact`, `signed` and `large`, formatting through `formatVnd` and `formatVndCompact` in the figure face, right-aligned.
- [ ] Add `MoneyInput`, which accepts Vietnamese shorthand through `parseVndInput`, shows the parsed full amount live under the field, shows `Số tiền chưa đúng` for unparseable input, and emits `Vnd` or null.
- [ ] Add `DateInput`, which accepts typed `dd/mm/yyyy` through `parseDateInput` and a picker, and emits an `IsoDate`.
- [ ] Add `StatusMark` from a registry in `status-mark.tsx` that maps `paid`, `due`, `overdue`, `vacant`, `draft` and `ended` to a shape, a message key and a token (check, clock, filled diamond, open square, dashed circle, bar). `overdue` takes a day count.
- [ ] Add `CompletenessRing` with the missing-item count as text, and `AddressBlock` with `Theo sổ` and `Hiện nay` lines that collapses to one line when both addresses match.
- [ ] Add `DataTable` with a sticky header, right-aligned tabular figures, row selection with select-all and a `Đã chọn {count}` label, keyboard selection with Space, and a stacked layout below 640 px with the amount on the right.
- [ ] Add `UndoToast` (6 s, with a `Hoàn tác` text button), `ConfirmDialog` whose title names the object, `Skeleton` shapes matching each component, and `EmptyState` with one action.
- [ ] Build `/dev/components` from `registry.tsx`, listing every component in every state (default, focus, disabled, error, loading, empty, and long Vietnamese text) with each state in a `[data-state-card]`. Every user-facing string comes from the message files.

**You see.**

- [ ] `/dev/components` shows every base component in every state at 390 and 1440, light and dark.
- [ ] Typing `3tr5` in the money input shows `3.500.000 ₫` under the field.
- [ ] Triggering the toast shows `Đã ghi nhận 3.500.000 ₫ từ Phòng 3.` with `Hoàn tác`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The component tests cover `MoneyInput` with each DESIGN-BRIEF §7 example and `abc`, `DateInput` with `07/10/2026` and `31/02/2026`, `StatusMark` rendering a shape and a word for each status, `AddressBlock` collapsing equal addresses, `DataTable` select-all and Space, and `UndoToast` calling its undo handler (FND-5).
- [ ] `e2e/dev-components.spec.ts` asserts the `[data-state-card]` count equals the registry size in both themes. Run `pnpm e2e e2e/dev-components.spec.ts`.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/dev-components.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no `/dev/components`, so the lane checks `/dev/glyphs` still passes at head and opens `/dev/components` through the verify skill at 390x844, light. Save `p0-12-components-mobile.png`. Pass when the `[data-state-card]` count equals the registry size, `$B console` has no errors, and `/dev/glyphs` still shows equal figure widths.
- [ ] Lane 2. At 1440x900, dark, type `3tr5`, then `1ty2`, then `850k` into the money input. Save `p0-12-money-input.png` after `850k`. Pass when the previews read `3.500.000 ₫`, `1.200.000.000 ₫` and `850.000 ₫`.
- [ ] Lane 3. At 390x844, dark, type `abc` into the money input. Save `p0-12-money-invalid.png`. Pass when `Số tiền chưa đúng` shows, no preview amount shows, and the field has `aria-invalid="true"`.
- [ ] Lane 4. At 1440x900, light, apply `filter: grayscale(1)` to the status mark row with `$B js`. Save `p0-12-status-grayscale.png`. Pass when each of the six marks has an `svg` and a visible word, and the six shapes differ in the grayscale screenshot.
- [ ] Lane 5. At 390x844, light, open the table example. Save `p0-12-table-stacked.png`. Pass when rows render stacked with the amount right-aligned and no horizontal scroll (`scrollWidth <= clientWidth` on the page).
- [ ] Lane 6. At 1440x900, light, select three rows with the keyboard (Tab and Space) and scroll the table. Save `p0-12-table-select.png`. Pass when `Đã chọn 3` shows and the header's top offset stays 0 inside the scroll container.
- [ ] Lane 7. At 390x844, dark, trigger the toast and press `Hoàn tác`. Save `p0-12-undo-toast.png` before pressing. Pass when the toast text reads `Đã ghi nhận 3.500.000 ₫ từ Phòng 3.` and the undo handler's example state reverts.
- [ ] Lane 8. At 1440x900, dark, open the confirm dialog, press Escape, and check focus. Save `p0-12-confirm.png` with the dialog open. Pass when the title reads `Kết thúc hợp đồng Phòng 3 từ ngày 31/10/2026?`, Escape closes it, and focus returns to the trigger.
- [ ] Lane 9. At 390x844, light, type `07/10/2026`, then `31/02/2026`, into the date input. Save `p0-12-date-input.png` after the second. Pass when the first emits `2026-10-07` and the second shows an error and emits nothing.
- [ ] Lane 10. At 390x844, dark, measure every button, input and checkbox with `$B eval`, and view the long-address `AddressBlock`. Save `p0-12-targets.png`. Pass when every target is at least 44 by 44 px and the long address wraps with no truncation.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS and initial route JS gzipped for `/dev/components` and `/` on a production build with `ESTA_ENV=test` and the full seed.
- [ ] Probe. 5 interleaved runs per side for `/`. 5 runs at head for `/dev/components`.
- [ ] Baseline. `/` exists on both sides and must not grow, because no base component ships on it yet. Trunk has no `/dev/components`, so it takes the SPEC §7.2 budgets.
- [ ] Rule. Fail when `/` initial JS at head exceeds trunk by more than 2 KB, or `/dev/components` exceeds LCP 2.5 s, TBT 200 ms, CLS 0.05 or 200 KB of initial JS.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/P0-12/P0-12-review-<slug>.png`, one file per screenshot.
- [ ] Record a 30 to 60 second video of `/dev/components` at 390 and 1440 in light and dark, typing `3tr5` and using undo, saved as `~/.claude/orchestrate/esta/media/P0-12/P0-12-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Build the app shell with navigation and member display settings (P0-14)

**Depends on.** P0-12.

**Files.**

- [ ] Create `apps/web/src/app/(app)/layout.tsx` and move the signed-in `/` into `apps/web/src/app/(app)/page.tsx`.
- [ ] Create `apps/web/src/app/(app)/properties/page.tsx`, `collections/page.tsx`, `documents/page.tsx`, `assistant/page.tsx`, `reports/page.tsx` and `settings/page.tsx` under `apps/web/src/app/(app)/`, and `apps/web/src/app/(app)/settings/actions.ts`.
- [ ] Create `apps/web/src/components/shell/nav.ts`, `tab-bar.tsx`, `sidebar.tsx`, `avatar-menu.tsx` and `display-settings-form.tsx` under `apps/web/src/components/shell/`.
- [ ] Create `supabase/migrations/20261007000900_member_display.sql` and `supabase/tests/member_display.test.sql`.
- [ ] Edit `apps/web/src/app/layout.tsx`, `apps/web/src/server/member.ts` and the message files.
- [ ] Create `e2e/shell.spec.ts`.

**Build.**

- [ ] Run `/impeccable shape app shell` and record the confirmed brief in the PR body before building.
- [ ] Define the sections once in `apps/web/src/components/shell/nav.ts` as data (key, href, icon, message key, placement). The tab bar and the sidebar both render from it.
- [ ] Render a bottom tab bar below 1024 px with `Tổng quan`, `Tài sản`, `Thu tiền`, `Tài liệu` and `Trợ lý`, each icon with its text label, and a 240 px sidebar at 1024 px and above with content at most 1200 px wide. The active item carries `aria-current="page"` and the `lacquer` marker.
- [ ] Add the avatar menu with `Báo cáo`, `Cài đặt`, a language switch and `Đăng xuất`.
- [ ] Give each section page its title and one line saying the section arrives in a later phase. No placeholder claims a section is empty, because lane households already hold seeded data.
- [ ] Add `update_my_display_settings(p_locale text, p_text_scale int, p_density text)` as a security definer function that writes only those three columns of the caller's own `household_members` rows. A viewer can change its own display settings and nothing else.
- [ ] Build the display settings form on `/settings` with language, text scale 100, 115 and 130, density and theme. Theme stays in the `esta_theme` cookie because it is per device.
- [ ] Apply the settings app-wide from the root layout. `lang` and next-intl follow the member locale, `--text-scale` follows `text_scale`, and `data-density` follows density (the FND-8 mechanism). Compact density never sets text below 15 px.
- [ ] Move the date line into the shell header.
- [ ] Run `/impeccable harden` on the screen for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.

**You see.**

- [ ] At 390 px, signed in as Mẹ, the tab bar shows the five sections and `Tổng quan` is active.
- [ ] At 1440 px the sidebar is 240 px wide.
- [ ] Choosing 130% on `/settings` enlarges text on every section with no horizontal overflow, and the choice survives sign-out and sign-in.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `supabase/tests/member_display.test.sql` proves a viewer can change its own display columns, cannot change its role or another member's row, and cannot write any other table (FND-2).
- [ ] `e2e/shell.spec.ts` covers navigation to each section, the avatar menu, and 130% on all five sections at 390 px with no overflow. Run `pnpm e2e e2e/shell.spec.ts`.
- [ ] Run `pnpm check`. Run `pnpm db:test`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/shell.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Through the verify skill, sign in as `me.lane1@demo.esta.test` at 390x844, light, at trunk and head. Save `p0-14-shell-mobile.png` from head. Pass when both sides show `Gia đình Demo 1`, and head shows the tab bar labels `Tổng quan`, `Tài sản`, `Thu tiền`, `Tài liệu`, `Trợ lý` in that order with `Tổng quan` carrying `aria-current="page"`.
- [ ] Lane 2. Sign in as `ryan.lane2@demo.esta.test` at 1440x900, light. Save `p0-14-shell-desktop.png`. Pass when the sidebar measures 240 px wide, the content measures at most 1200 px, and no tab bar renders.
- [ ] Lane 3. At 390x844, dark, as `me.lane3@demo.esta.test`, tap each tab in turn. Save `p0-14-tab-collections.png` on `Thu tiền`. Pass when each tap changes the URL to its section and only the tapped item carries `aria-current="page"`.
- [ ] Lane 4. At 390x844, light, as `ryan.lane4@demo.esta.test`, open the avatar menu and choose `Báo cáo`. Save `p0-14-avatar-menu.png` with the menu open. Pass when the menu lists `Báo cáo`, `Cài đặt`, the language switch and `Đăng xuất`, and `Báo cáo` opens `/reports`.
- [ ] Lane 5. At 390x844, light, as `me.lane5@demo.esta.test`, choose 130% on `/settings`, visit all five sections, sign out and sign back in. Save `p0-14-scale-130.png` on `Tài sản`. Pass when the root font size computes to 20.8px, `scrollWidth <= clientWidth` holds on every section, and Studio shows `text_scale` 130 for that member after sign-in.
- [ ] Lane 6. At 1440x900, dark, as `ryan.lane6@demo.esta.test`, choose compact density. Save `p0-14-compact.png`. Pass when `<html>` has `data-density="compact"` and no text element computes below 15px.
- [ ] Lane 7. At 1440x900, dark, as `ryan.lane7@demo.esta.test`, choose the dark theme on `/settings`, sign out and sign back in. Save `p0-14-theme.png`. Pass when the server HTML after sign-in carries `data-theme="dark"`.
- [ ] Lane 8. At 1440x900, light, as `me.lane8@demo.esta.test`, move through the sidebar with Tab and Enter only. Save `p0-14-keyboard.png` with focus on `Tài liệu`. Pass when every item is reachable, focus is visible, and Enter opens the focused section.
- [ ] Lane 9. Add `viewer.lane9@demo.esta.test` as a viewer of `Gia đình Demo 9` with the service role, sign in as that viewer at 390x844, dark, and switch the language to `English`. Save `p0-14-viewer-display.png`. Pass when the shell turns English and Studio shows only that viewer's `locale` changed.
- [ ] Lane 10. SPEC §9.4 seed 10 adapted to the shell. As `me.lane10@demo.esta.test` at 390x844, switch to English, 130% and dark, then visit `Collections`. Save `p0-14-seed10.png`. Pass when the tab labels read `Overview`, `Properties`, `Collections`, `Documents`, `Assistant`, `<html lang="en">` and `data-theme="dark"` are set, and no label's `scrollWidth` exceeds its `clientWidth`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS and initial route JS gzipped for signed-in `/` on a production build with the full seed.
- [ ] Probe. 5 interleaved runs per side, signed in as `me.lane1@demo.esta.test`.
- [ ] Baseline. Trunk serves the signed-in placeholder at `/`, so the same route compares directly.
- [ ] Rule. Fail when head misses LCP 2.5 s, TBT 200 ms (INP proxy), CLS 0.05 or 200 KB of initial JS, or head initial JS exceeds trunk by more than 60 KB.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/P0-14/P0-14-review-<slug>.png`, one file per screenshot.
- [ ] Record a 30 to 60 second video of Mẹ moving through the five tabs on a phone-sized viewport, then switching to 130% and dark, saved as `~/.claude/orchestrate/esta/media/P0-14/P0-14-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Run the agent worker skeleton and complete a ping on subscription auth (P0-15)

**Depends on.** P0-14.

**Files.**

- [ ] Create `apps/agent/src/main.ts`, `env.ts`, `clock.ts`, `supabase.ts`, `heartbeat.ts`, `scheduler.ts` and `runner.ts` under `apps/agent/src/`.
- [ ] Create `apps/agent/src/jobs/registry.ts` and `apps/agent/src/jobs/ping.ts`.
- [ ] Create `apps/agent/src/sdk/options.ts`, `apps/agent/src/sdk/path-policy.ts` and `apps/agent/src/sdk/result.ts`.
- [ ] Create `apps/agent/src/tools/server.ts` and `apps/agent/src/tools/household-info.ts`.
- [ ] Create `apps/agent/src/replay/canonicalize.ts` and `apps/agent/src/replay/store.ts`, and `fixtures/agent-replay/ping/<hash>.json`.
- [ ] Create `*.test.ts` beside each module above.
- [ ] Create `supabase/migrations/20261007001000_agent_core.sql`, `supabase/tests/agent_core.test.sql` and `supabase/seed/generator/agent.ts`.
- [ ] Create `apps/web/src/app/dev/agent/page.tsx` and `apps/web/src/app/dev/agent/actions.ts`, and `e2e/dev-agent.spec.ts`.
- [ ] Create `scripts/agent-record.ts`. Edit the root `package.json` and `docs/spec/AGENT.md`.

**Build.**

- [ ] Create `agent_jobs`, `agent_runs` and `worker_heartbeats` per AGENT.md §10, plus `agent_jobs.result jsonb` for a job's final output. Members select their household's jobs and runs. Admins may insert only `ping` jobs, with `requested_by = auth.uid()`. Heartbeats are readable by `authenticated`. Attach the audit trigger to `agent_jobs` and `agent_runs`.
- [ ] Add `claim_agent_job(worker_id text, p_as_of timestamptz)` with `FOR UPDATE SKIP LOCKED`, ordered by priority then `run_after`, reclaiming a job whose `locked_at` is older than its kind's timeout plus 2 minutes. It never reads `now()`.
- [ ] Parse the worker env with zod in `apps/agent/src/env.ts`. `assertStartAllowed(env)` refuses `live` mode without the credential for `ESTA_AUTH_MODE`, and refuses a frozen clock under `ESTA_ENV=production`. `replay` mode reads no credential.
- [ ] Read the Clock from `test_clock` at every scheduler tick and every job in `apps/agent/src/clock.ts`, reusing `resolveClockSource` (FND-9 worker part).
- [ ] Send `x-esta-actor: agent:<worker_id>` from the service client in `apps/agent/src/supabase.ts`.
- [ ] Define the job kinds as data in `apps/agent/src/jobs/registry.ts` (built-in tools, MCP tools, `maxTurns`, timeout, model role, handler). `ping` has built-in tools `[]`, MCP tool `household_info`, 3 turns and 1 minute.
- [ ] Build SDK options in `apps/agent/src/sdk/options.ts` per branch `spike/s1-agent-sdk` (83c56e0). They set `tools` per kind, `permissionMode: 'default'`, `strictMcpConfig: true`, `settingSources: []`, a job temp dir as `cwd`, the model from `ESTA_MODEL_ROUTINE`, and `env` holding only the active credential plus `CLAUDE_CONFIG_DIR` set to an empty per-worker dir under `ESTA_AGENT_HOME`.
- [ ] Add the `PreToolUse` hook in `apps/agent/src/sdk/path-policy.ts`. It denies any tool outside the kind's list and any `Read` outside the job dir.
- [ ] Add the in-process MCP server `esta` with `createSdkMcpServer` and `alwaysLoad: true`, and `household_info` returning the household name, member count, property count and locale for the household bound in the job's closure.
- [ ] Handle results in `apps/agent/src/sdk/result.ts`. A result with `is_error: true` fails the job, and a 401 records `auth_error`. Write `num_turns`, `session_id`, `total_cost_usd`, `usage`, `modelUsage` and `permission_denials` to `agent_runs`.
- [ ] Run the heartbeat every 60 s with `auth_mode` and `agent_mode`, the scheduler skeleton that inserts scheduled jobs by idempotency key (no schedules exist in Phase 0), and retries with backoff of 1, 5 and 25 minutes up to 3 attempts.
- [ ] Add replay mode per AGENT.md §8. It canonicalizes ids, memo codes and timestamps, hashes the input, reads `fixtures/agent-replay/ping/<hash>.json`, and fails a missing recording with the hash and the hint `pnpm agent:record`.
- [ ] Add `pnpm agent:dev` (worker on the slot's local Supabase) and `pnpm agent:record` (runs the ping case live and rewrites its recording).
- [ ] Build `/dev/agent` with a household picker, an `Enqueue ping` button, the jobs table with status and result, the runs table with auth mode, agent mode, model, turns, cost and tool calls, and the latest heartbeat.
- [ ] Extend the seed generator for the new tables in every household with one `done` ping job and its run, using fixed ids and the frozen clock (FND-7).
- [ ] Rewrite AGENT.md §2.2 with the S1 corrections (`tools` per kind instead of `allowedTools`, the `PreToolUse` hook, `is_error`, `CLAUDE_CONFIG_DIR`, `alwaysLoad`), add `agent_jobs.result` to §10, and add a `ping` case to §7.
- [ ] Live model calls happen only in the gate demo lane and in `pnpm agent:record`. CI runs replay.

**You see.**

- [ ] On `/dev/agent`, `Enqueue ping` for `Gia đình Demo 1` produces a `done` job whose result names `Gia đình Demo 1`.
- [ ] The runs table shows one `mcp__esta__household_info` call.
- [ ] The heartbeat row shows the worker's auth mode and agent mode, updated within 60 s.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The worker tests cover `assertStartAllowed` for each mode, `buildSdkEnv` holding exactly one credential, the path policy denying `/etc/hosts` and a sibling job dir, `household_info` for household A returning zero data from household B, `is_error` handling, canonicalization stability, and the missing-recording error.
- [ ] `supabase/tests/agent_core.test.sql` covers household isolation, viewer read-only, a member unable to insert jobs, an admin able to insert only `ping`, two concurrent claims getting different jobs, and stale reclaim at a later `p_as_of` (AGT-1 groundwork).
- [ ] Golden tests in AGENT.md §7 for `ping` pass in replay mode with `ESTA_AGENT_MODE=replay pnpm --filter agent test`.
- [ ] `e2e/dev-agent.spec.ts` enqueues a ping and waits for `done` with a replay worker. Run `pnpm e2e e2e/dev-agent.spec.ts`.
- [ ] Run `pnpm check`. Run `pnpm db:test`. Run `pnpm db:seed:check`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/dev-agent.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no worker, so the lane checks the trunk shell still loads at head and gates the ping. Start `pnpm agent:dev` in replay mode, sign in as `ryan.lane1@demo.esta.test` through the verify skill, and enqueue a ping on `/dev/agent` at 1440x900, light. Save `p0-15-ping-replay.png`. Pass when the job reads `done`, its result contains `Gia đình Demo 1`, and the run's tool calls read `{"mcp__esta__household_info":1}`.
- [ ] Lane 2. Gate demo on subscription auth. Start the worker with `ESTA_AGENT_MODE=live` and `ESTA_AUTH_MODE=subscription`, reading `CLAUDE_CODE_OAUTH_TOKEN` from the main checkout's `apps/agent/.env.local`, and enqueue a ping for `Gia đình Demo 2` at 1440x900, dark. Save `p0-15-ping-live.png`. Pass when the run row reads `subscription` and `live`, the cost is above 0, the result contains `Gia đình Demo 2`, and the screenshot shows no token.
- [ ] Lane 3. At 390x844, light, read the heartbeat on `/dev/agent`. Save `p0-15-heartbeat.png`. Pass when `last_seen_at` is within 60 s of the test clock plus elapsed time and the row reads `replay`.
- [ ] Lane 4. Start the worker with `ESTA_AGENT_MODE=live ESTA_AUTH_MODE=api_key` and no `ANTHROPIC_API_KEY`, and render stderr at 1440x900, light. Save `p0-15-refuse-auth.png`. Pass when it exits 1 and the message names `ESTA_AUTH_MODE=api_key` and `ANTHROPIC_API_KEY`.
- [ ] Lane 5. Start the worker with `ESTA_ENV=production ESTA_FROZEN_NOW=2026-10-07T09:00:00+07:00` and render stderr at 390x844, dark. Save `p0-15-refuse-clock.png`. Pass when it exits 1 with the frozen clock refusal.
- [ ] Lane 6. Enqueue a ping for `Gia đình Demo 6` at 390x844, light, and compare its result with Studio counts for household 6. Save `p0-15-household-info.png`. Pass when the result's property count is 7 and its member count is 2, matching Studio.
- [ ] Lane 7. Render `tsx apps/agent/src/sdk/path-policy.ts --probe /etc/hosts` and `--probe <job dir>/page.png` at 1440x900, dark. Save `p0-15-path-policy.png`. Pass when the first prints `deny` and the second prints `allow`.
- [ ] Lane 8. Move the ping recording aside, enqueue a ping at 390x844, dark, then restore it. Save `p0-15-missing-recording.png`. Pass when the job reads `failed` and its error shows the input hash and `pnpm agent:record`.
- [ ] Lane 9. On its own slot (`ESTA_SLOT=9`), kill the worker with SIGKILL right after it claims a ping, restart it, advance the clock by 3 minutes, and view `/dev/agent` at 1440x900, light. Save `p0-15-reclaim.png`. Pass when the job ends `done` with exactly one run row.
- [ ] Lane 10. SPEC §9.4 seed 10 adapted to the worker. As `ryan.lane10@demo.esta.test` in English, 130% and dark at 390x844, enqueue a ping, then read the newest `audit_log` rows for `agent_jobs` in Studio. Save `p0-15-seed10.png`. Pass when the job ends `done`, `/dev/agent` has no page-level horizontal overflow, and the worker's update row reads `actor_kind = 'agent'` with the worker id.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Ping wall time from enqueue to `done` in replay and in live mode, `claim_agent_job` time with 1,000 queued jobs from `EXPLAIN (ANALYZE)`, and idle worker CPU.
- [ ] Probe. 5 replay pings and 1 live ping (the gate demo). 5 claims at head. Idle CPU averaged over 60 s with `ps`.
- [ ] Baseline. Trunk has no worker, so every metric takes an absolute budget. `pnpm db:reset` compares trunk against head for the new seed rows.
- [ ] Rule. Fail when a replay ping exceeds 3 s, the live ping exceeds 60 s, a claim exceeds 5 ms, idle CPU exceeds 2%, or `pnpm db:reset` exceeds trunk by more than 5 s.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/P0-15/P0-15-review-<slug>.png`, one file per screenshot.
- [ ] Record a 30 to 60 second video of `/dev/agent` enqueuing a live ping on subscription auth and the run row appearing, saved as `~/.claude/orchestrate/esta/media/P0-15/P0-15-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Prove the Phase 0 exit across web, cron and worker (P0-16)

**Depends on.** P0-15.

**Files.**

- [ ] Create `e2e/fnd9-integration.spec.ts`.
- [ ] Create `scripts/phase-exit.ts` and `scripts/table-coverage.ts`. Edit the root `package.json`.
- [ ] Create `docs/plan/STATUS.md`.
- [ ] Create `docs/plan/trail/phase-0/s1-ping-run.json` (redacted run record).
- [ ] Edit `docs/spec/DOMAIN-VN.md`, `docs/spec/SPEC.md` and `DESIGN.md`.

**Build.**

- [ ] Write `e2e/fnd9-integration.spec.ts` for FND-9. It sets the clock to `2026-10-07T09:00:00+07:00`, signs in, and reads the shell header (`Thứ Tư, 07/10/2026`), `/api/cron/keep-alive` (`as_of` `2026-10-07`) and a replay ping's `agent_runs.started_at` (business date `2026-10-07`). It then sets `2026-10-08T09:00:00+07:00`, reads all three again (`Thứ Năm, 08/10/2026`, `2026-10-08`, `2026-10-08`), and asserts the web and worker PIDs did not change.
- [ ] Add `pnpm phase:check 0` in `scripts/phase-exit.ts`. It runs the check for each of FND-1 (`e2e/auth.spec.ts`), FND-2 (`pnpm db:test`), FND-3 (lint and parity), FND-4 (core tests), FND-5 (`pnpm glyphs:check`, the contrast script, `e2e/dev-components.spec.ts`), FND-6 (the reference tests), FND-7 (`pnpm db:seed:check`) and FND-9 (`e2e/fnd9-integration.spec.ts`), prints one `PASS` or `FAIL` row each, and exits 1 on any `FAIL`.
- [ ] Add `scripts/table-coverage.ts`, which fails when a public table has no RLS or no pgTAP file naming it, and run it in `pnpm db:test`.
- [ ] Fold the S4 DOMAIN-VN §10 corrections and the §9 known-codes memo matching rule from branch `spike/s4-vietqr` (a7c9e76) into `docs/spec/DOMAIN-VN.md`. Tag 01 `12` with an amount and `11` without becomes an `[app rule]`. Memo purpose is capped at 25 characters. Amounts at or above 500,000,000 VND drop tag 54 as an `[app rule]` pending Ryan. Each fact gets its source.
- [ ] Confirm `DESIGN.md` carries the S2 typography decision, and that AGENT.md §2.2 and DOMAIN-VN §4 carry the S1 and S3 results with sources. Record each contradiction resolved in Phase 0 in the plan's risks appendix (SPEC §0).
- [ ] Create `docs/plan/STATUS.md` with the shipped PRs, slipped items (none expected), a spike table (S1, S2, S3, S4, S7, each with branch, SHA and result), the date the AGENT.md §2.5 terms were last checked, and "Needs professional confirmation" listing the DOMAIN-VN §5 VAT and PIT interaction, co-owner attribution and PIT effective date, the §8 household exemption, the NAPAS amount cap default, and the operator-on-create rule from P0-09.
- [ ] Save the redacted record of the P0-15 live ping (auth mode, agent mode, model, turns, cost, tool calls, no token or session id) to `docs/plan/trail/phase-0/s1-ping-run.json`.
- [ ] Assemble the Phase 0 gate package. It holds the tokens (`/dev/glyphs` swatches), the glyph page, the components page, and the S1 evidence.

**You see.**

- [ ] `pnpm phase:check 0` prints `PASS` for FND-1 to FND-7 and FND-9 and exits 0.
- [ ] The FND-9 run shows the header, the cron route and the worker all moving from 07/10 to 08/10 with no restart.
- [ ] `docs/plan/STATUS.md` lists every spike as resolved, with no `pending` row.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/fnd9-integration.spec.ts` passes (FND-9). Run `pnpm e2e e2e/fnd9-integration.spec.ts`.
- [ ] Run `pnpm phase:check 0`, which covers FND-1 to FND-7 and FND-9 for every existing table.
- [ ] Golden tests in AGENT.md §7 for `ping` pass in replay mode with `ESTA_AGENT_MODE=replay pnpm --filter agent test`.
- [ ] Run `pnpm check`. Run `pnpm db:test`. Run `pnpm e2e`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/fnd9-integration.spec.ts`, `e2e/shell.spec.ts` and `e2e/dev-components.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has every FND-9 part but no integration run. On its own slot (`ESTA_SLOT=1`), sign in as `me.lane1@demo.esta.test` through the verify skill at 390x844, light, at clock `2026-10-07T09:00:00+07:00`, then run `pnpm clock:set 2026-10-08T09:00:00+07:00` and reload. Save `p0-16-header-advance.png` after the reload. Pass when the header reads `Thứ Tư, 07/10/2026` before and `Thứ Năm, 08/10/2026` after with unchanged `pnpm dev` PID, on trunk and head alike.
- [ ] Lane 2. On slot 2, run `pnpm cron:run` at the two clocks of lane 1 with no restart, rendering both at 1440x900, dark. Save `p0-16-cron-advance.png`. Pass when `as_of` reads `2026-10-07` and then `2026-10-08`.
- [ ] Lane 3. On slot 3 with a replay worker, enqueue a ping on `/dev/agent` at each clock of lane 1 at 390x844, dark. Save `p0-16-worker-advance.png`. Pass when the two runs' `started_at` fall on business dates `2026-10-07` and `2026-10-08` and the worker PID is unchanged.
- [ ] Lane 4. Render `pnpm phase:check 0` at 1440x900, light. Save `p0-16-phase-check.png`. Pass when every FND row reads `PASS` and the exit code is 0.
- [ ] Lane 5. Through `features/onboarding.md` and `features/sign-in.md`, run a new address and an invite claim for lane 5 at 390x844, light. Save `p0-16-fnd1.png`. Pass when the new address lands on onboarding and `invitee.lane5@demo.esta.test` lands in `Gia đình Demo 5` with the invited role (FND-1).
- [ ] Lane 6. Render `pnpm db:test` including `scripts/table-coverage.ts` at 1440x900, dark. Save `p0-16-fnd2.png`. Pass when every public table appears as covered and the run ends `Result: PASS`.
- [ ] Lane 7. Open `/dev/glyphs` at 390x844, dark, and `/dev/components` at 1440x900, light. Save `p0-16-fnd5.png` from `/dev/components`. Pass when the glyph and contrast checks exit 0, the component state count equals the registry size, and `$B console` has no errors on either page.
- [ ] Lane 8. On slot 8, run `pnpm db:seed:check`, then select the admin unit counts in Studio at 390x844, light. Save `p0-16-fnd6-fnd7.png`. Pass when the checksums match on every line and the counts are 34 and 3,321.
- [ ] Lane 9. Gate demo. Enqueue one live ping on subscription auth for `Gia đình Demo 9` at 1440x900, dark, then render `docs/plan/STATUS.md` as HTML. Save `p0-16-s1-evidence.png`. Pass when the run reads `subscription`, `live` and `done` with a `household_info` call, and the STATUS spike table lists S1, S2, S3, S4 and S7 as resolved with SHAs `83c56e0`, `31dd4a6`, `1945c64`, `a7c9e76` and `8548686`.
- [ ] Lane 10. SPEC §9.4 seed 10 adapted to the exit. As `me.lane10@demo.esta.test` on slot 10 in English, 130% and dark at 390x844, advance the clock from `2026-10-07T09:00:00+07:00` to `2026-10-08T09:00:00+07:00`. Save `p0-16-seed10.png`. Pass when the header reads `Wednesday, 07/10/2026` and then `Thursday, 08/10/2026` with no horizontal overflow.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of `pnpm phase:check 0`, and Lighthouse mobile LCP, TBT, CLS and initial route JS gzipped for signed-in `/` on a production build with the full seed.
- [ ] Probe. 3 runs of `pnpm phase:check 0` at head. 5 interleaved Lighthouse runs per side.
- [ ] Baseline. Trunk has no `phase:check`, so it takes an absolute budget. `/` exists on both sides and compares directly.
- [ ] Rule. Fail when `pnpm phase:check 0` exceeds 10 minutes, or `/` misses the SPEC §7.2 budgets or exceeds trunk initial JS by more than 2 KB.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots and the gate package (tokens, glyph page, components page, S1 evidence) to `~/.claude/orchestrate/esta/media/P0-16/P0-16-review-<slug>.png`, one file per screenshot.
- [ ] Record a 30 to 60 second video of the clock advancing one day and the header, the cron route and the worker following it, then `pnpm phase:check 0` passing, saved as `~/.claude/orchestrate/esta/media/P0-16/P0-16-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click on the Phase 0 gate.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Parse Google Maps links and resolve short links behind SSRF guards (P1-01)

**Depends on.** P0-16.

**Files.**

- [ ] Create `packages/core/src/maps/parseMapsUrl.ts`, `packages/core/src/maps/bounds.ts`, `packages/core/src/maps/index.ts`, `packages/core/src/maps/parseMapsUrl.test.ts`, `packages/core/src/maps/parseMapsUrl.bench.ts`.
- [ ] Create `apps/web/src/server/maps/resolveShortMapsLink.ts`, `apps/web/src/server/maps/addressPolicy.ts`, `apps/web/src/server/maps/actions.ts`, `apps/web/src/server/maps/resolveShortMapsLink.test.ts`.
- [ ] Create `fixtures/maps/links.json` with the canonical long links, short link shapes and refusal inputs, each with its expected result.
- [ ] Create `apps/web/src/app/dev/core/MapsSection.tsx`. Edit `apps/web/src/app/dev/core/page.tsx`, `apps/web/messages/vi.json`, `apps/web/messages/en.json`, `apps/web/package.json` (add `ipaddr.js`), `e2e/dev-core.spec.ts`, `docs/spec/DOMAIN-VN.md` §9 and `docs/spec/SPEC.md` §6.2 PRP-5.

**Build.**

- [ ] Define `MapsLinkParse` in `packages/core/src/maps/parseMapsUrl.ts` as a discriminated union. `{ kind: 'point', point: LatLng, source: 'place' | 'viewport' | 'query' | 'll', outsideVietnam: boolean }`, `{ kind: 'short_link', url: URL }` and `{ kind: 'invalid', reason: 'not_a_url' | 'not_maps' | 'no_coordinates' | 'out_of_range' }`. `LatLng` is a branded pair that only `toLatLng(lat, lng)` constructs, with lat in [-90, 90] and lng in [-180, 180].
- [ ] Implement `parseMapsUrl(input: string): MapsLinkParse` as an ordered pattern registry `MAPS_PATTERNS`, one entry per DOMAIN-VN §9 row (`!3d`/`!4d`, `@lat,lng`, `q`, `ll`, short hosts). Place coordinates win over the viewport center. Parsing accepts `google.com`, `www.google.com`, `maps.google.com` and the `google.com.vn` variants, because parsing never fetches. The function is pure and trims surrounding text so a pasted share message still parses.
- [ ] Implement `isInVietnam(point: LatLng): boolean` in `packages/core/src/maps/bounds.ts` with the DOMAIN-VN §9 box (lat 8 to 24, lng 102 to 110). `parseMapsUrl` sets `outsideVietnam` from it.
- [ ] Implement `vetAddress(ip: string): 'public' | 'refused'` in `apps/web/src/server/maps/addressPolicy.ts` with `ipaddr.js`. Refuse every range that is not `unicast`, including loopback, private, link-local, unique local, carrier-grade NAT, multicast, unspecified and IPv4-mapped IPv6 forms of those.
- [ ] Implement `resolveShortMapsLink(url: URL, deps: ResolveDeps): Promise<Result<MapsLinkParse, ResolveError>>` in `apps/web/src/server/maps/resolveShortMapsLink.ts` behind `import 'server-only'`. It fetches only `https` URLs on `maps.app.goo.gl` or `goo.gl` with a path under `/maps`, on the default port, without userinfo. It uses `redirect: 'manual'` and an undici `Agent` whose `connect.lookup` resolves every address, refuses the hop when any answer fails `vetAddress`, and pins the socket to the vetted address so a DNS rebind cannot swap it. A `Location` on a short host is followed and counts toward a limit of 5. A `Location` on `google.com` or `www.google.com` with a path at or under `/maps` is terminal and goes to `parseMapsUrl` without being fetched. Any other target is refused. One `AbortSignal.timeout(3000)` covers the whole chain. `ResolveError` is `'host_not_allowed' | 'not_https' | 'private_address' | 'redirect_not_allowed' | 'too_many_redirects' | 'no_redirect' | 'timeout'`. `ResolveDeps` carries `dispatcher` and `lookup` so tests inject fakes.
- [ ] Add the server action `resolveMapsLink(input: string)` in `apps/web/src/server/maps/actions.ts`. It refuses callers without a session from the session client, parses input with zod, returns the long-link parse directly, and calls `resolveShortMapsLink` only for `short_link`. It logs one line per hop as `maps.resolve hop=<n> host=<host> status=<code>` and one outcome line `maps.resolve result=<ok|error code>`.
- [ ] Add `MapsSection` to `/dev/core`. It renders every row of `fixtures/maps/links.json` with expected and computed values side by side and `khớp` or `lệch`, a refusal table computed live through `resolveMapsLink`, and a paste box that shows the parse, the hop log and the elapsed milliseconds.
- [ ] Run spike S6 in this PR. Capture the hop chain of three fresh short links (a named place, a dropped pin, and a `goo.gl/maps` link if one still resolves) and record each chain with the date in DOMAIN-VN §9. Amend the PRP-5 wording in SPEC §6.2 to state the follow-short-hosts, terminate-on-google-maps rule above, with the evidence in the PR body.

**You see.**

- [ ] `/dev/core` shows a `Google Maps` section where every canonical row reads `khớp`, including `10.7769, 106.7009` from the `!3d`/`!4d` link that also carries a different `@` viewport.
- [ ] Pasting a fresh `https://maps.app.goo.gl/...` link for Chợ Bến Thành shows a point near `10.772, 106.698`, a hop log of at most 5 lines, and an elapsed time under 3000 ms.
- [ ] Pasting `https://maps.app.goo.gl@127.0.0.1/x` shows `host_not_allowed` and the server log has no `maps.resolve hop=` line for it.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/maps/parseMapsUrl.test.ts` gains one case per DOMAIN-VN §9 pattern, `!3d`/`!4d` preferred over `@`, `q` with a place name and no coordinates (`no_coordinates`), `google.com.vn` links, a share message with text around the URL, a non-Google host (`not_maps`), latitude 91 (`out_of_range`), and the Vietnam bounds warning for `@48.8584,2.2945` (PRP-5).
- [ ] `apps/web/src/server/maps/resolveShortMapsLink.test.ts` gains one case per SSRF refusal with a fake dispatcher and lookup. Lookalike hosts (`maps.app.goo.gl.evil.test`, `evilgoo.gl`), userinfo (`https://maps.app.goo.gl@127.0.0.1/`), an explicit port, `http:`, IP literals (`169.254.169.254`, `[::1]`), DNS answers of `10.0.0.1`, `127.0.0.1`, `169.254.169.254`, `fc00::1`, `fe80::1` and `::ffff:127.0.0.1`, a mixed answer with one private address, a redirect to a non-Google host, a redirect to `www.google.com/url?q=`, a sixth redirect, a 200 with no `Location`, a relative `Location` resolved then vetted, and the 3 s timeout under fake timers. Each refusal case also asserts the dispatcher saw no connection to a refused address (PRP-5).
- [ ] Run `pnpm check`.
- [ ] Run `pnpm e2e e2e/dev-core.spec.ts` with a new case asserting every maps row reads `khớp`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/dev-core.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Sign in as `ryan.lane1@demo.esta.test` and open `/dev/core` at 1440x900 light at trunk and at head. Trunk has no maps section, so the lane gates that every section present at trunk still reads as expected at head and that the head adds the maps section. Save `p1-01-dev-core-regression.png`. Pass when every pre-existing section shows the same expected values on both sides and every head maps row reads `khớp`.
- [ ] Lane 2. Sign in as `me.lane2@demo.esta.test` at 390x844 light. Paste a `/maps/place/` link that carries `!3d10.7769!4d106.7009` and a different `@` viewport into the maps paste box. Save `p1-01-place-wins.png`. Pass when the result reads `10.7769, 106.7009` with source `place` and no hop log.
- [ ] Lane 3. Sign in as `ryan.lane3@demo.esta.test` at 1440x900 dark. Paste `https://www.google.com/maps?q=10.7769,106.7009`, then `https://maps.google.com/?ll=10.7769,106.7009`. Save `p1-01-query-ll.png`. Pass when both parse to `10.7769, 106.7009` with sources `query` and `ll`.
- [ ] Lane 4. Sign in as `ryan.lane4@demo.esta.test` at 1440x900 light. In the browse session open Google Maps, search Chợ Bến Thành, copy the Share short link and paste it into the maps paste box. Save `p1-01-short-link-live.png`. Pass when the point is within 0.005 degrees of `10.772, 106.698`, the hop log shows at most 5 hops on allowed hosts, elapsed is under 3000 ms, and the chain is recorded in DOMAIN-VN §9.
- [ ] Lane 5. Sign in as `me.lane5@demo.esta.test` at 390x844 dark. Paste `https://maps.app.goo.gl@127.0.0.1/x`, `https://maps.app.goo.gl:8443/x` and `http://maps.app.goo.gl/x`. Save `p1-01-refused-shapes.png`. Pass when they show `host_not_allowed`, `host_not_allowed` and `not_https`, and the server log has no `maps.resolve hop=` line for any of them.
- [ ] Lane 6. Sign in as `ryan.lane6@demo.esta.test` at 1440x900 dark. Read the refusal table and paste `https://169.254.169.254/maps` and `https://[::1]/maps`. Save `p1-01-refusal-table.png`. Pass when every refusal row reads `khớp` and both pasted IP literals show `host_not_allowed` with no hop line.
- [ ] Lane 7. Sign in as `me.lane7@demo.esta.test` at 390x844 light. Paste `https://www.google.com/maps/@48.8584,2.2945,17z`. Save `p1-01-outside-vietnam.png`. Pass when the result shows the point with the warning `Điểm này nằm ngoài Việt Nam.`
- [ ] Lane 8. Sign in as `ryan.lane8@demo.esta.test` at 1440x900 dark. Paste `https://maps.app.goo.gl/` followed by a random 17-character id that Google does not know. Save `p1-01-unknown-short.png`. Pass when the result is `no_redirect` or `redirect_not_allowed`, the hop log has at most 5 lines, and elapsed is under 3000 ms.
- [ ] Lane 9. Build with `ESTA_ENV=production pnpm build && pnpm start` and open `/dev/core` at 1440x900 light, then grep `.next/static` for `resolveShortMapsLink` and `ipaddr`. Save `p1-01-prod-dev-404.png`. Pass when `/dev/core` returns 404 and the grep finds nothing in client chunks.
- [ ] Lane 10. Sign in as `me.lane10@demo.esta.test`, switch to English, text scale 130% and dark at 390x844, and repeat lane 2 on the maps section. Save `p1-01-english-130-dark.png`. Pass when labels are English, the result reads `10.7769, 106.7009`, and no label is cut off without a way to read it.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Mean time per call of `parseMapsUrl` over `fixtures/maps/links.json` from `parseMapsUrl.bench.ts`, time to refuse a private DNS answer with the fake lookup, and server time of `/dev/core` on a production-mode build with `ESTA_ENV=test`.
- [ ] Probe. Run `pnpm vitest bench packages/core/src/maps` and 20 timed requests to `/dev/core`, 5 times per side, interleaved trunk and head.
- [ ] Baseline. Trunk has no parser or resolver, so record that and take head bench values as the first baseline. Trunk and head both serve `/dev/core`, so its server time is compared directly.
- [ ] Rule. Fail when `parseMapsUrl` mean exceeds 20 µs, a refusal exceeds 5 ms, any real resolve in lane 4 or 8 exceeds 3000 ms, or `/dev/core` median server time on head exceeds trunk by more than 20%.

**Review gate.** None. P1-01 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Add the property, parcel, certificate, ownership, unit and utility schema (P1-02)

**Depends on.** P0-06, P0-07.

**Files.**

- [ ] Create `supabase/migrations/20261007010200_portfolio_schema.sql`.
- [ ] Create `supabase/tests/portfolio_rls.test.sql` and `supabase/tests/portfolio_constraints.test.sql`.
- [ ] Create `packages/core/src/schemas/property.ts` and `packages/core/src/schemas/property.test.ts`.
- [ ] Create `supabase/seed/generator/portfolio.ts` and `supabase/seed/generator/data/portfolio.ts`. Edit `supabase/seed/generator/index.ts` and `supabase/seed/README.md`.
- [ ] Regenerate `packages/db/src/database.types.ts` with `pnpm db:types`.

**Build.**

- [ ] In the migration, add to `properties` the SPEC §5.3 columns P0-07 left out (`kind_details`, `boundary geometry(Polygon, 4326)`, `acquired_on`, `acquisition_kind`, `acquisition_price_vnd bigint`, `certificate_address_text`, `notes`) and a unique `(household_id, id)` so children can reference both.
- [ ] Create `parcels`, `structures`, `certificates`, `ownership_shares`, `utility_accounts`, `units` and `valuations` with the SPEC §5.3 columns, `deleted_at`, and a composite foreign key `(household_id, property_id)` to `properties (household_id, id)`, so a child row can never point at another household's property. Areas are `numeric(12,2)` above 0. `share_bp` is between 1 and 10000. `valuations.value_vnd` and `acquisition_price_vnd` are non-negative `bigint`. `units` has a partial unique index on `(property_id, label)` where `deleted_at is null`.
- [ ] Add `validate_kind_details(kind, details jsonb)` and a check constraint `properties_kind_details_valid` that admits exactly the SPEC §5.3 keys per kind (apartment, rooming house, land kinds, others empty).
- [ ] Add trigger `assert_same_household()` on `certificates` and `ownership_shares` so every id in `holder_party_ids`, `ownership_shares.party_id` and `mortgage->>'bank_party_id'` is a party of the row's household.
- [ ] Add trigger `ensure_whole_unit()`. After a property insert it creates one `whole` unit labelled `Toàn bộ` whose id is `uuid_generate_v5(property id, 'unit:whole')`, so seeds stay deterministic. When the first live unit of another kind is inserted, it soft-deletes that auto unit. The invariant is that a property has either one live `whole` unit or one or more live units of other kinds.
- [ ] Leave `certificates.document_id` and `certificates.extraction_id` as nullable `uuid` without a foreign key. P2-02 and P2-03 add the keys when those tables exist.
- [ ] Enable RLS on every new table with policies through `private.is_member(household_id, 'viewer')` for select and `private.is_member(household_id, 'member')` for insert, update and delete. Attach the P0-02 audit trigger to every new table. Index `(household_id, property_id)` on every child table.
- [ ] Export zod schemas in `packages/core/src/schemas/property.ts`. `PropertyKind`, `UseMode`, `LegalStatus`, a `KindDetails` discriminated union on kind, `Parcel` with `purposes` as an array of `{ land_use_code, area_m2, term }`, `Certificate` with `form` from DOMAIN-VN §2 and `Mortgage` with `amount_vnd: Vnd`, `OwnershipShare` with `share_bp`, `Unit`, `UtilityAccount`, `Valuation`.
- [ ] Extend the seed generator in `supabase/seed/generator/portfolio.ts` for every household per SPEC §9.3. Addresses use real current codes from the FND-6 lookups (Phường Dĩ An 25942 for `di-an`, Phường Tân Triều 26188 for `bien-hoa`, Phường Long An 27694 for `long-an`, Phường 1 Bảo Lộc 24823 for `bao-loc`, a Quận 7 successor ward for `q7`) and verbatim pre-2025 certificate addresses. Certificate forms cover all five DOMAIN-VN §2 values (`long-an` is `paper_only`). `bao-loc` has two parcels and a `mortgaged` certificate with a seeded bank party. Ownership follows §9.3. Units are 8 rooms for `di-an` (Phòng 8 `available_from` 2026-08-01), one shop for `q1`, one lot each for `long-an` and `bao-loc`, and the auto whole unit elsewhere. Every property has a valuation. `long-an` has no pin, no parcel number and no acquisition, so it lands below 60% in P1-03.

**You see.**

- [ ] `pnpm db:reset` prints, for each of the 11 households, `properties 7, parcels 8, certificates 7, ownership_shares 9, units live 14, valuations 7`.
- [ ] Supabase Studio shows `Đất Bảo Lộc` with two parcels and a certificate whose status is `mortgaged` and whose mortgage names the seeded bank party.
- [ ] `pnpm db:test` ends with every `portfolio_rls` and `portfolio_constraints` test `ok`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `supabase/tests/portfolio_rls.test.sql` proves for each of the seven new tables and the altered `properties` that a household A member cannot select, insert, update or delete household B rows, and that a viewer reads but cannot write (FND-2).
- [ ] `supabase/tests/portfolio_constraints.test.sql` gains cases for a child row pointing at another household's property, a foreign holder or bank party, `share_bp` 0 and 10001, apartment `kind_details` carrying `room_count`, the auto whole unit and its deterministic id, soft deletion of the auto unit when a room is added, a duplicate live unit label, and an audit row with actor kind `user` after an update.
- [ ] `packages/core/src/schemas/property.test.ts` gains one accepting and one rejecting case per kind for `KindDetails`, a mortgage amount that is not a safe integer, and an unknown certificate form.
- [ ] The seed checksum script reports identical checksums for two consecutive `pnpm db:reset` runs over every new table (FND-7).
- [ ] Run `pnpm check`.
- [ ] Run `pnpm db:test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run `pnpm db:reset` at trunk and at head and open `properties` for `Gia đình Demo 1` in Supabase Studio at 1440x900 light. Save `p1-02-properties-regression.png`. Pass when both sides list the same 7 property ids and the checksum over the columns trunk already had is equal.
- [ ] Lane 2. In Studio at 1440x900 dark, query live units per property for `Gia đình Demo 2`. Save `p1-02-units-per-property.png`. Pass when `di-an` has 8 `room` units, `q1` one `shop`, `long-an` and `bao-loc` one `lot` each, and the other three one `whole` unit labelled `Toàn bộ`.
- [ ] Lane 3. In the Studio SQL editor at 1440x900 light, set role `authenticated` with the claims of `me.lane3@demo.esta.test`, insert a townhouse, then insert a `room` unit for it. Save `p1-02-whole-unit-trigger.png`. Pass when the first insert yields one live `whole` unit and the second leaves only the room live.
- [ ] Lane 4. In Studio at 1440x900 dark, sum `share_bp` per property for `Gia đình Demo 4` with owner names. Save `p1-02-ownership.png`. Pass when every sum is 10000, `thu-duc` and `bien-hoa` split 5000 and 5000 between Nguyễn Thị Demo and Trần Minh Demo, and `long-an` belongs to Trần Minh Demo.
- [ ] Lane 5. In Studio at 1440x900 light, list certificate forms and statuses for `Gia đình Demo 5`. Save `p1-02-certificates.png`. Pass when the five distinct forms appear and only `bao-loc` is `mortgaged`.
- [ ] Lane 6. In the Studio SQL editor at 1440x900 dark, act as `ryan.lane6@demo.esta.test` and select `parcels` of `Gia đình Demo 7`, then insert a parcel for a lane 7 property. Save `p1-02-isolation.png`. Pass when the select returns 0 rows and the insert fails with `42501`.
- [ ] Lane 7. In Studio at 1440x900 light, add a viewer member for `viewer.lane7@demo.esta.test` to `Gia đình Demo 7`, then act as that viewer and select and update `units`. Save `p1-02-viewer.png`. Pass when the select returns the 14 live units and the update changes 0 rows or fails with `42501`.
- [ ] Lane 8. In the Studio SQL editor at 1440x900 dark, act as `me.lane8@demo.esta.test`, set `kind_details` of `thu-duc` to `{"room_count": 4}`, then rename `q7`. Save `p1-02-kind-details-audit.png`. Pass when the first update fails on `properties_kind_details_valid` and `audit_log` gains one `update` row for `q7` with actor kind `user`.
- [ ] Lane 9. Run `pnpm db:reset` twice and the seed checksum script, then open the output in the browse session at 1440x900 light. Save `p1-02-checksum.png`. Pass when both runs print the same checksum for every Phase 1 table.
- [ ] Lane 10. Sign in as `me.lane10@demo.esta.test`, switch to English, text scale 130% and dark at 390x844, and open the Properties section of the app shell. Save `p1-02-shell-english-130-dark.png`. Pass when the page renders its Phase 0 content with English labels and the console has no errors.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `pnpm db:reset` wall time with 10 lane households, and `EXPLAIN (ANALYZE)` time and plan for loading one property with all its children as a lane member.
- [ ] Probe. Run `pnpm db:reset` 5 times per side, interleaved trunk and head, and run the child-load query 20 times on head.
- [ ] Baseline. Trunk resets the P0-07 seed, so its median is the baseline. Trunk has no child tables, so record that and take the head child-load median as the first baseline.
- [ ] Rule. Fail when the head reset median exceeds trunk by more than 25% or 90 s absolute, or when the child-load plan uses a sequential scan on a child table or exceeds 5 ms.

**Review gate.** None. P1-02 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Score property completeness with a weighted registry (P1-03)

**Depends on.** P1-02.

**Files.**

- [ ] Create `packages/core/src/completeness/types.ts`, `packages/core/src/completeness/registry.ts`, `packages/core/src/completeness/score.ts`, `packages/core/src/completeness/index.ts`.
- [ ] Create `packages/core/src/completeness/registry.test.ts`, `packages/core/src/completeness/score.test.ts`, `packages/core/src/completeness/score.bench.ts`.
- [ ] Create `packages/db/src/queries/completenessInput.ts` and `packages/db/src/queries/completenessInput.int.test.ts`.
- [ ] Create `apps/web/src/app/dev/core/CompletenessSection.tsx`. Edit `apps/web/src/app/dev/core/page.tsx`, `apps/web/messages/vi.json`, `apps/web/messages/en.json`, `e2e/dev-core.spec.ts`.

**Build.**

- [ ] Define `CompletenessInput` in `types.ts` as the facts a check reads (kind, use mode, kind details, current address codes, location present, acquisition fields, parcels with identifiers and areas, ownership share total in bp, certificate document count, photo count, active leases with and without a lease document, utility account count). Define `CompletenessCheck` as `{ id: CheckId, weight: number, kinds: readonly PropertyKind[] | 'all', applies?: (input) => boolean, passes: (input) => boolean, field: { tab: PropertyTab, anchor: string } }`.
- [ ] Write `COMPLETENESS_CHECKS` in `registry.ts` with the PRP-6 checks (certificate document, parcel identifiers, area, owners summing to 10000 bp, current address, pin, acquisition, photos, active lease document when rented, utility accounts) plus `kind_details` for apartments and rooming houses. Weights are integers. Parcel checks apply to land kinds, houses and rooming houses. The lease check applies only when the input has active leases.
- [ ] Implement `scoreProperty(input: CompletenessInput): CompletenessResult` in `score.ts`. The score is an integer percent of passing weight over applicable weight, rounded half up. `failing` lists failing checks ordered by weight, then registry order, and `nextMissing(result, 3)` takes the first three.
- [ ] Implement `fieldHref(propertyId, check)` returning `/properties/{id}/{tab}#{anchor}`. P1-06 and P1-07 make those anchors focus real fields.
- [ ] Implement `loadCompletenessInputs(client, householdId)` in `packages/db/src/queries/completenessInput.ts` with one query per child table. Tables that do not exist yet in Phase 1 (documents, leases) contribute empty facts, so certificate document and photo checks fail for every property until Phase 2.
- [ ] Add `CompletenessSection` to `/dev/core`. It shows each seed property of the signed-in household with its score, failing checks and links, beside the expected bands (`long-an` below 60, the rest at least 60), plus two canonical inputs that must score 100 and 0.

**You see.**

- [ ] `/dev/core` shows a `Mức đầy đủ` section where `Đất vườn Long An` scores below 60 and the six other properties score 60 or more, each row marked `khớp`.
- [ ] Each failing check shows an href such as `/properties/<id>/legal#parcel-no`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/completeness/registry.test.ts` gains cases proving every check id is unique, every kind's applicable weights are positive, every check has a field anchor, and the lease check does not apply without active leases (PRP-6).
- [ ] `packages/core/src/completeness/score.test.ts` gains cases for all-pass 100, none-pass 0, rounding, ownership at 9000 bp failing the owners check and lowering the score (PRP-3), next three ordered by weight, and kind-specific checks for an apartment and agricultural land (PRP-6).
- [ ] `packages/db/src/queries/completenessInput.int.test.ts` runs against local Supabase on the `full` seed and asserts `long-an` below 60 and every other property at least 60 (PRP-6).
- [ ] Run `pnpm check`.
- [ ] Run `pnpm e2e e2e/dev-core.spec.ts` with a new case asserting the completeness rows read `khớp`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/dev-core.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Sign in as `ryan.lane1@demo.esta.test` and open `/dev/core` at 1440x900 light at trunk and at head. Trunk has no completeness section, so the lane gates that every section present at trunk still matches at head and that the head adds the completeness section. Save `p1-03-dev-core-regression.png`. Pass when every pre-existing row reads `khớp` on both sides and every completeness row reads `khớp` on head.
- [ ] Lane 2. Sign in as `me.lane2@demo.esta.test` at 390x844 light and read the `Đất vườn Long An` row. Save `p1-03-long-an.png`. Pass when its score is below 60 and its failing checks include pin, parcel identifiers and acquisition.
- [ ] Lane 3. Sign in as `ryan.lane3@demo.esta.test` at 1440x900 dark and read all seven rows. Save `p1-03-all-scores.png`. Pass when the six properties other than `long-an` show 60 or more.
- [ ] Lane 4. Sign in as `ryan.lane4@demo.esta.test` at 1440x900 light. In Studio set Trần Minh Demo's `thu-duc` share to 4000 bp, then reload `/dev/core`. Save `p1-03-owners-drop.png`. Pass when the `Căn hộ Thủ Đức` score drops and its failing checks include the owners check with an href ending `#ownership`.
- [ ] Lane 5. Sign in as `me.lane5@demo.esta.test` at 390x844 dark. In Studio clear `location` on `q7`, then reload. Save `p1-03-pin-missing.png`. Pass when `Nhà phố Q7` lists the pin check as failing with an href ending `#location`.
- [ ] Lane 6. Sign in as `ryan.lane6@demo.esta.test` at 1440x900 dark and compare the checklists of `Căn hộ Thủ Đức` and `Đất vườn Long An`. Save `p1-03-kind-checks.png`. Pass when the apartment row lists the building and unit check and the agricultural land row does not.
- [ ] Lane 7. Sign in as `me.lane7@demo.esta.test` at 390x844 light and read the next three missing items for `Đất vườn Long An`. Save `p1-03-next-three.png`. Pass when exactly three items show, ordered by weight, each with an href under `/properties/`.
- [ ] Lane 8. Sign in as `ryan.lane8@demo.esta.test` at 1440x900 light. In Studio give `long-an` a parcel number, map sheet and pin, then reload. Save `p1-03-long-an-rises.png`. Pass when the `long-an` score rises by the weights of those checks and the rows for other properties are unchanged.
- [ ] Lane 9. Sign in as `me.lane9@demo.esta.test` at 390x844 dark and read the two canonical rows. Save `p1-03-canonical.png`. Pass when they read 100 and 0 and both are marked `khớp`.
- [ ] Lane 10. Sign in as `me.lane10@demo.esta.test`, switch to English, text scale 130% and dark at 390x844, and repeat lane 2. Save `p1-03-english-130-dark.png`. Pass when the section labels are English, `Đất vườn Long An` stays in Vietnamese as data, its score is below 60, and no text is cut off without a way to read it.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time to score 1,000 generated inputs with `scoreProperty` from `score.bench.ts`, and `loadCompletenessInputs` wall time for one household.
- [ ] Probe. Run `pnpm vitest bench packages/core/src/completeness` and the loader 20 times, 5 rounds on head.
- [ ] Baseline. Trunk has no completeness module, so record that and take the head medians as the first baseline.
- [ ] Rule. Fail when scoring 1,000 inputs exceeds 10 ms or the loader median exceeds 50 ms for a 7-property household.

**Review gate.** None. P1-03 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Build the properties list with filters and accent-insensitive search (P1-04)

**Depends on.** P0-14, P1-03.

**Files.**

- [ ] Create `supabase/migrations/20261007010400_property_list.sql` and `supabase/tests/property_list.test.sql`.
- [ ] Create `packages/core/src/property/listQuery.ts`, `packages/core/src/property/status.ts` and their `.test.ts` files.
- [ ] Create `apps/web/src/server/properties/listProperties.ts`.
- [ ] Create `apps/web/src/app/(app)/properties/page.tsx`, `apps/web/src/app/(app)/properties/loading.tsx`, `apps/web/src/app/(app)/properties/_components/PropertyList.tsx`, `PropertyRow.tsx`, `PropertyFilters.tsx`, `PropertySearch.tsx`, `PropertySort.tsx`.
- [ ] Create `scripts/seed-bulk-properties.ts` and `scripts/perf/lighthouse.ts` (reuse the Phase 0 script if one exists).
- [ ] Create `e2e/properties-list.spec.ts`. Edit `apps/web/messages/vi.json`, `apps/web/messages/en.json`, `apps/web/package.json` (add `@tanstack/react-virtual`).

**Build.**

- [ ] Run `/impeccable shape Tài sản` and record the confirmed brief in the PR body before building.
- [ ] Add SQL `property_list(p_as_of date, p_query text)` (security invoker) returning one row per live property with nickname, code, kind, use mode, legal status, current address line, current province and commune names, certificate address, legacy province, district and commune names joined through `admin_unit_legacy_map` on the current commune code, owner party ids, live unit count, the sum of units' `list_rent_vnd`, and whether any unit is available on `p_as_of`. When `p_query` is set, every whitespace token of `esta_unaccent(p_query)` must appear in `esta_unaccent` of the concatenated nickname, code, both addresses and all current and legacy unit names.
- [ ] Define `PropertyListQuery` in `packages/core/src/property/listQuery.ts` as a zod schema over URL search params (`q`, `owner`, `province`, `kind`, `use`, `legal`, `sort`, `dir`). Implement `filterProperties(rows, query)` and `sortProperties(rows, sort, scores)` with a filter registry keyed by chip, where `province` matches a current province code or a legacy province name. Sorting by name uses `sortKeyVietnameseName` on the nickname, by rent uses the list rent sum, by completeness uses `scoreProperty`.
- [ ] Implement `propertyStatus(input)` in `packages/core/src/property/status.ts` as a registry from use mode and units to a status mark. A rental property with no active lease shows `vacant` with `Trống`. Other use modes show their use-mode word without a status shape. Phase 3 adds the leased states.
- [ ] Build `PropertyRow` with nickname, kind, current address with the certificate address in `ink-muted` when it differs, the status mark, the monthly rent column showing the list rent sum labelled `Giá niêm yết` until Phase 3 swaps in lease rent, and the completeness ring with its missing count. The whole row is one link with a visible label.
- [ ] Build `PropertyFilters` as chips with counts (owner, province current or legacy, kind, use mode, legal status) that open a bottom sheet on mobile, `PropertySort` for name, rent and completeness, and `PropertySearch` updating `?q=` after 200 ms. Filters and search live in the URL, so reload and back keep them.
- [ ] Virtualize the list with `@tanstack/react-virtual` above 100 rows and render plainly at 100 or fewer.
- [ ] Add empty states. No properties shows `Chưa có tài sản nào. Thêm tài sản đầu tiên bằng ảnh sổ hoặc nhập tay.` with the add action (live once P1-05 lands). No match shows the query and a `Xóa bộ lọc` action.
- [ ] Write `scripts/seed-bulk-properties.ts --household <n> --count 1000` that inserts deterministic synthetic properties named `Tài sản Demo 0001` to `Tài sản Demo 1000` into one lane household through the service role with `esta.actor` set.
- [ ] Run `/impeccable harden` on the screen for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.

**You see.**

- [ ] `/properties` for `me.lane1@demo.esta.test` lists 7 rows. `Dãy trọ Dĩ An` shows its current address under `TP. Hồ Chí Minh` with the Bình Dương address muted below it.
- [ ] Typing `bao loc` leaves one row, `Đất Bảo Lộc`. Typing `binh duong` leaves `Dãy trọ Dĩ An`.
- [ ] Sorting by completeness ascending puts `Đất vườn Long An` first with a ring below 60.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `supabase/tests/property_list.test.sql` gains cases for `di an`, `DUONG`, `binh duong`, `quan 7` and `bao loc` matching the expected seed properties, multi-token AND matching, and household isolation of `property_list` (PRP-8, FND-2).
- [ ] `packages/core/src/property/listQuery.test.ts` gains cases for parsing every param, rejecting unknown values, the legacy province filter, owner filter on a 50/50 property, and each sort with ties broken by nickname (PRP-8).
- [ ] `packages/core/src/property/status.test.ts` gains one case per use mode.
- [ ] `e2e/properties-list.spec.ts` covers search, each filter chip, each sort, URL persistence across reload, both empty states, and 1,000 rows rendering at most 60 row nodes (PRP-8). Run `pnpm e2e e2e/properties-list.spec.ts`.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm db:test`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/properties-list.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Sign in as `me.lane1@demo.esta.test` and open `Tài sản` from the bottom tab bar at 390x844 light at trunk and at head. Trunk shows the Phase 0 placeholder, so the lane gates the list the head adds. Save `p1-04-list-regression.png`. Pass when trunk shows its placeholder without errors and head lists 7 rows with nickname, kind, address, status mark, `Giá niêm yết` and a completeness ring.
- [ ] Lane 2. Sign in as `me.lane2@demo.esta.test` at 390x844 dark. Type `di an`, then `binh duong`, then `quan 7`. Save `p1-04-search-legacy.png`. Pass when the first two leave only `Dãy trọ Dĩ An` and the third leaves only `Nhà phố Q7`.
- [ ] Lane 3. Search regression from SPEC §9.4 seed 4 adapted to properties. Sign in as `ryan.lane3@demo.esta.test` at 1440x900 light and type `bao loc`. Save `p1-04-search-bao-loc.png`. Pass when one row remains, `Đất Bảo Lộc`, and clearing the box restores 7 rows.
- [ ] Lane 4. Sign in as `ryan.lane4@demo.esta.test` at 1440x900 dark. Pick province `Bình Dương (cũ)`, then switch to `TP. Hồ Chí Minh`. Save `p1-04-filter-province.png`. Pass when the legacy chip leaves `Dãy trọ Dĩ An` and the current chip leaves `Nhà phố Q7`, `Căn hộ Thủ Đức`, `Dãy trọ Dĩ An` and `Mặt bằng Quận 1`.
- [ ] Lane 5. Sign in as `me.lane5@demo.esta.test` at 390x844 light. Open the filter sheet, pick owner `Trần Minh Demo`, then add use mode `Đang giữ`. Save `p1-04-filter-owner-use.png`. Pass when the owner chip leaves `Căn hộ Thủ Đức`, `Kho Biên Hòa` and `Đất vườn Long An`, and adding the use mode leaves only `Đất vườn Long An`.
- [ ] Lane 6. Sign in as `ryan.lane6@demo.esta.test` at 1440x900 light. Sort by completeness, then rent, then name, and reload after the last. Save `p1-04-sort.png`. Pass when completeness ascending puts `Đất vườn Long An` first, rent descending puts the highest `Giá niêm yết` first, and the name sort survives the reload.
- [ ] Lane 7. Sign in as `me.lane7@demo.esta.test` at 390x844 dark and read the `Dãy trọ Dĩ An` and `Đất vườn Long An` rows. Save `p1-04-row-detail.png`. Pass when Dĩ An shows both addresses with the old one muted, the vacant mark shows shape plus `Trống`, and the Long An ring shows its missing count.
- [ ] Lane 8. Run `scripts/seed-bulk-properties.ts --household 8 --count 1000`, sign in as `ryan.lane8@demo.esta.test` at 1440x900 dark, and scroll to the end. Save `p1-04-virtualized-1000.png`. Pass when `Tài sản Demo 1000` is reachable, the DOM never holds more than 60 row nodes, and typing `demo 0999` leaves one row.
- [ ] Lane 9. Sign in as `me.lane9@demo.esta.test` at 390x844 light. Search `xyz`, then go offline in devtools and reload. Save `p1-04-empty-offline.png`. Pass when the no-match state names `xyz` with `Xóa bộ lọc`, and the offline reload shows `Chưa tải được. Kiểm tra kết nối mạng rồi thử lại.` instead of a blank page.
- [ ] Lane 10. Sign in as `me.lane10@demo.esta.test`, switch to English, text scale 130% and dark at 390x844, and repeat lane 2. Save `p1-04-english-130-dark.png`. Pass when chips and headings are English, the search results match lane 2, and no row text overflows or truncates without a way to read it (FND-8 for the Properties list).

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT as the INP proxy, CLS and initial route JS gzipped for `/properties` on a production build (`pnpm build && pnpm start`) with the full seed, for a 7-property household and the 1,000-property lane 8 household.
- [ ] Probe. Run `scripts/perf/lighthouse.ts /properties` 5 times per side, interleaved trunk and head, signed in through a session cookie passed with `--extra-headers`.
- [ ] Baseline. Trunk serves the Phase 0 placeholder at `/properties`, so record its medians as the route baseline. Trunk has no list, so the head list also gets the absolute budgets below.
- [ ] Rule. Fail when any head median exceeds SPEC §7.2 (LCP 2.5 s, TBT 200 ms, CLS 0.05, initial JS 200 KB gzipped) for either household, or when typing into search takes more than 200 ms to repaint the 1,000-row list in a performance trace.

**Review gate.** The operator reviews before merge.

- [ ] Copy every lane screenshot to `~/.claude/orchestrate/esta/media/P1-04/P1-04-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of searching `di an`, picking the owner and province chips and sorting by completeness at 390x844, saved as `~/.claude/orchestrate/esta/media/P1-04/P1-04-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Create, edit and archive properties with kind-aware forms and the address picker (P1-05)

**Depends on.** P0-06, P1-04.

**Files.**

- [ ] Create `packages/core/src/property/formFields.ts`, `packages/core/src/property/code.ts`, `packages/core/src/address/formatCurrent.ts` and their `.test.ts` files.
- [ ] Create `apps/web/src/app/(app)/properties/new/page.tsx`, `apps/web/src/app/(app)/properties/[propertyId]/edit/page.tsx`, `apps/web/src/app/(app)/properties/actions.ts`.
- [ ] Create `apps/web/src/app/(app)/properties/_components/PropertyForm.tsx`, `KindFields.tsx`, `AddressPicker.tsx`, `LegacyAddressSuggest.tsx`, `ArchiveButton.tsx`.
- [ ] Create `apps/web/src/server/address/suggest.ts` and `e2e/property-form.spec.ts`. Edit `apps/web/messages/vi.json`, `apps/web/messages/en.json`, `apps/web/src/app/(app)/properties/page.tsx` (add action and archived filter).

**Build.**

- [ ] Write `KIND_FIELDS: Record<PropertyKind, readonly FieldId[]>` in `packages/core/src/property/formFields.ts` so the form renders fields from data. Apartments get building, block, floor, unit number and management fee. Rooming houses get room count. Land kinds get frontage and road width. Others get none.
- [ ] Implement `suggestPropertyCode(nickname, existingCodes)` in `packages/core/src/property/code.ts` returning uppercase ASCII of at most 8 characters, unique within the household, with a numeric suffix on collision (`Nhà phố Q7` gives `Q7`).
- [ ] Implement `formatCurrentAddress({ houseNo, street, commune, province })` in `packages/core/src/address/formatCurrent.ts` producing the `line` stored in `current_address`.
- [ ] Build `AddressPicker`. Province select over the 34 province-level units, then a ward or commune combobox filtered by `parent_code` with accent-insensitive matching through the core unaccent helper, then house number and street. Every option has a visible label and a 44 px target.
- [ ] Build `LegacyAddressSuggest` on the certificate address field. It calls `suggest_current_unit(text)` through `apps/web/src/server/address/suggest.ts` after 300 ms, lists every candidate with its current province and `Một phần` for partial merges, and fills the picker when the user taps one. The certificate address text is stored verbatim and never rewritten (PRP-4, DOMAIN-VN §4).
- [ ] Write server actions `createProperty`, `updateProperty`, `archiveProperty` and `restoreProperty` in `actions.ts` on the session client, parsing input with the P1-02 zod schemas. Map a unique-code violation to `Mã Q7 đã dùng cho Nhà phố Q7.` and network failure to `Chưa lưu được. Kiểm tra kết nối mạng rồi thử lại.`
- [ ] Archive sets `deleted_at` with no confirm dialog and shows the toast `Đã lưu trữ Kho Biên Hòa. Hoàn tác`. `Hoàn tác` calls `restoreProperty`. An `Đã lưu trữ` filter on the list shows archived properties with a restore action.
- [ ] After create, navigate to `/properties` with the new row highlighted and a toast naming it. P1-06 redirects to the detail page instead.

**You see.**

- [ ] `/properties/new` with kind `Căn hộ` shows building, block, floor, unit number and a management fee input that previews `1tr2` as `1.200.000 ₫`.
- [ ] Typing `Dĩ An, Bình Dương` in the certificate address lists `Phường Dĩ An` first under `TP. Hồ Chí Minh`, then `Phường Tân Đông Hiệp` and `Phường Đông Hòa`.
- [ ] Archiving `Kho Biên Hòa` shows `Đã lưu trữ Kho Biên Hòa. Hoàn tác`, and `Hoàn tác` puts it back in the list.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/property/formFields.test.ts` gains one case per kind listing its fields (PRP-1). `code.test.ts` gains cases for diacritics, collisions and length. `formatCurrent.test.ts` gains cases with and without a house number.
- [ ] `e2e/property-form.spec.ts` creates one property of each of the 10 kinds and asserts the kind-specific fields, edits one, archives and restores one (PRP-1), and asserts the `Dĩ An, Bình Dương` and `Quận 7` suggestions (PRP-4). Run `pnpm e2e e2e/property-form.spec.ts`.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/property-form.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Sign in as `me.lane1@demo.esta.test` at 390x844 light, open `Tài sản` at trunk and at head, and at head create townhouse `Nhà Demo Thảo Điền`. Trunk has no create action, so the lane gates that the list still shows its 7 rows on both sides and that the head adds the new row. Save `p1-05-create-regression.png`. Pass when trunk and head both list the 7 seed rows and head shows `Nhà Demo Thảo Điền` with the code suggested by `suggestPropertyCode`.
- [ ] Lane 2. Sign in as `me.lane2@demo.esta.test` at 390x844 dark. Create an apartment with building `Demo Tower`, floor 12, unit `12.05` and management fee `1tr2`. Save `p1-05-apartment.png`. Pass when the fee preview reads `1.200.000 ₫` and the saved row shows kind `Căn hộ`.
- [ ] Lane 3. Sign in as `ryan.lane3@demo.esta.test` at 1440x900 light. Start a property, pick `Đất nông nghiệp`, then switch to `Nhà phố`. Save `p1-05-kind-switch.png`. Pass when land shows `Mặt tiền` and `Lộ giới` and hides building fields, and the townhouse shows neither.
- [ ] Lane 4. Sign in as `me.lane4@demo.esta.test` at 390x844 light. Create a rooming house with room count `8`. Save `p1-05-rooming-house.png`. Pass when the form shows `Số phòng`, saves, and the edit page shows `8`.
- [ ] Lane 5. Sign in as `me.lane5@demo.esta.test` at 390x844 dark. Type `Dĩ An, Bình Dương` in the certificate address and tap the first suggestion. Save `p1-05-legacy-di-an.png`. Pass when `Phường Dĩ An` is first under `TP. Hồ Chí Minh` followed by `Phường Tân Đông Hiệp` and `Phường Đông Hòa`, the picker fills with Phường Dĩ An, and the certificate address keeps the typed text (PRP-4).
- [ ] Lane 6. Sign in as `ryan.lane6@demo.esta.test` at 1440x900 dark. Type `Quận 7, TP. Hồ Chí Minh` in the certificate address. Save `p1-05-split-quan-7.png`. Pass when four wards are listed, none is preselected, and tapping one fills the picker with it.
- [ ] Lane 7. Sign in as `ryan.lane7@demo.esta.test` at 1440x900 light. Pick province `Đồng Nai` and type `tan trieu` in the ward box. Save `p1-05-picker-accentless.png`. Pass when `Phường Tân Triều` is offered and selecting it produces an address line ending `Phường Tân Triều, Đồng Nai`.
- [ ] Lane 8. Sign in as `me.lane8@demo.esta.test` at 390x844 light. Archive `Kho Biên Hòa`, tap `Hoàn tác`, archive it again, then open the `Đã lưu trữ` filter. Save `p1-05-archive-undo.png`. Pass when the toast reads `Đã lưu trữ Kho Biên Hòa. Hoàn tác`, undo restores the row, and the archived filter shows it after the second archive.
- [ ] Lane 9. Sign in as `ryan.lane9@demo.esta.test` at 1440x900 dark. Create a property with code `Q7`, then go offline and save an edit. Save `p1-05-errors.png`. Pass when the first shows `Mã Q7 đã dùng cho Nhà phố Q7.` inline and the second shows `Chưa lưu được. Kiểm tra kết nối mạng rồi thử lại.` with the typed values kept.
- [ ] Lane 10. Sign in as `me.lane10@demo.esta.test`, switch to English, text scale 130% and dark at 390x844, and repeat lane 5. Save `p1-05-english-130-dark.png`. Pass when labels are English, the Dĩ An suggestions match lane 5, and the long ward names wrap without clipping.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT as the INP proxy, CLS and initial route JS gzipped for `/properties` and `/properties/new` on a production build (`pnpm build && pnpm start`) with the full seed, plus the `suggest_current_unit` round trip from keystroke to rendered list.
- [ ] Probe. Run `scripts/perf/lighthouse.ts` on both routes 5 times per side, interleaved trunk and head, and time 20 suggestion round trips on head.
- [ ] Baseline. Trunk serves `/properties`, so its medians are that route's baseline. Trunk has no `/properties/new` or suggestion call, so record that and apply the absolute budgets below.
- [ ] Rule. Fail when `/properties` regresses by more than 10% on any metric against trunk, when either route exceeds SPEC §7.2 (LCP 2.5 s, TBT 200 ms, CLS 0.05, initial JS 200 KB gzipped), or when the suggestion round trip median exceeds 300 ms after the debounce.

**Review gate.** The operator reviews before merge.

- [ ] Copy every lane screenshot to `~/.claude/orchestrate/esta/media/P1-05/P1-05-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of creating a rooming house from a `Dĩ An, Bình Dương` certificate address, then archiving and undoing at 390x844, saved as `~/.claude/orchestrate/esta/media/P1-05/P1-05-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Build the property detail header and overview tab (P1-06)

**Depends on.** P1-03, P1-05.

**Files.**

- [ ] Create `supabase/migrations/20261007010600_property_activity.sql` and `supabase/tests/property_activity.test.sql`.
- [ ] Create `packages/core/src/activity/describe.ts` and `packages/core/src/activity/describe.test.ts`.
- [ ] Create `apps/web/src/app/(app)/properties/[propertyId]/layout.tsx`, `page.tsx`, `loading.tsx`, `not-found.tsx`, `legal/page.tsx`, `rent/page.tsx`, `money/page.tsx`, `documents/page.tsx`, `activity/page.tsx`.
- [ ] Create `apps/web/src/app/(app)/properties/[propertyId]/_components/PropertyHeader.tsx`, `MissingItems.tsx`, `PropertyTabs.tsx`, `OverviewFacts.tsx`, `ActivityList.tsx`, and `apps/web/src/components/useFocusAnchor.ts`.
- [ ] Create `e2e/property-detail.spec.ts`. Edit `apps/web/messages/vi.json`, `apps/web/messages/en.json`, `apps/web/src/app/(app)/properties/actions.ts` (redirect to detail after create).

**Build.**

- [ ] Run `/impeccable shape Property detail` and record the confirmed brief in the PR body before building.
- [ ] Build `PropertyHeader` in the detail layout with the nickname in the display face, the P0-12 address block showing `Theo sổ` and `Hiện nay` when they differ and only `Hiện nay` when they match or no certificate address exists, the status mark from `propertyStatus`, the completeness ring with its score, and `MissingItems` with the next three missing items from `nextMissing`, each a text link to `fieldHref`.
- [ ] Build `PropertyTabs` as links for `Tổng quan`, `Pháp lý`, `Cho thuê`, `Thu chi`, `Tài liệu` and `Hoạt động`, keyboard reachable, with the active tab marked by shape and weight. `Pháp lý` and `Cho thuê` show empty states until P1-07 and P1-08. `Thu chi` and `Tài liệu` show empty states that name what will appear there.
- [ ] Build `OverviewFacts` on `Tổng quan` with kind and kind details, use mode, legal status, acquisition, the latest valuation formatted with `formatVndCompact` and labelled `Ước tính` with its date and method, the live unit count, and a `Vị trí` block with coordinates or `Chưa có vị trí` (the map arrives in P1-09). Each fact has the anchor id that the completeness registry uses.
- [ ] Implement `useFocusAnchor()` so a hash such as `#acquisition` scrolls to and focuses that element on load.
- [ ] Add SQL `property_activity(p_property_id uuid, p_limit int)` that checks `private.is_member` on the property's household and returns `audit_log` rows for the property and its child rows (parcels, structures, certificates, ownership shares, units, utility accounts, valuations) newest first, with the actor's display name.
- [ ] Implement `describeActivity(row)` in `packages/core/src/activity/describe.ts` as a registry from table, action and changed keys to a message key and params, so `Hoạt động` reads `Nguyễn Thị Demo đổi tên thành Nhà phố Q7 mới lúc 09:12, 07/10/2026`.
- [ ] Call `notFound()` when the session client returns no property, so another household's id renders the not-found page.
- [ ] Run `/impeccable harden` on the screen for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.

**You see.**

- [ ] `/properties/<di-an id>` shows `Dãy trọ Dĩ An` with `Theo sổ` showing the Bình Dương address and `Hiện nay` showing the TP. Hồ Chí Minh address.
- [ ] The `Đất vườn Long An` header shows a score below 60 and three missing items, and tapping `Thêm ngày và hình thức nhận` focuses the acquisition field.
- [ ] After renaming `q7` through the edit page, `Hoạt động` lists the rename with Nguyễn Thị Demo and the time from the test clock.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `supabase/tests/property_activity.test.sql` gains cases for rows of child tables appearing, another household's property returning nothing, and viewer access (FND-2).
- [ ] `packages/core/src/activity/describe.test.ts` gains one case per table and action and a fallback for unknown keys.
- [ ] `e2e/property-detail.spec.ts` asserts both addresses, the score and three missing links with their focus targets, every tab rendering, the activity entry after a rename, and the not-found page for a foreign id (PRP-6). Run `pnpm e2e e2e/property-detail.spec.ts`.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm db:test`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/property-detail.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Sign in as `me.lane1@demo.esta.test` at 390x844 light and tap the `Dãy trọ Dĩ An` row at trunk and at head. Trunk opens the edit page from P1-05, so the lane gates the head detail page and that edit is still one tap away. Save `p1-06-detail-regression.png`. Pass when trunk opens the edit form without errors and head shows the header with both addresses, the score and six tabs, with `Sửa` opening the same edit form.
- [ ] Lane 2. Sign in as `me.lane2@demo.esta.test` at 390x844 light and open `Dãy trọ Dĩ An`. Save `p1-06-header-addresses.png`. Pass when `Theo sổ` shows the Bình Dương certificate address verbatim and `Hiện nay` shows `Phường Dĩ An, TP. Hồ Chí Minh`.
- [ ] Lane 3. Sign in as `me.lane3@demo.esta.test` at 390x844 dark and open `Đất vườn Long An`. Tap each of the three missing items in turn. Save `p1-06-missing-items.png`. Pass when the score is below 60, exactly three items show, and each tap lands on its tab with the target field focused or on the placeholder tab that will hold it.
- [ ] Lane 4. Sign in as `ryan.lane4@demo.esta.test` at 1440x900 light and move through the six tabs with Tab and Enter only. Save `p1-06-tabs-keyboard.png`. Pass when every tab is reachable by keyboard, the focus ring is visible, and each later-phase tab shows its empty state text.
- [ ] Lane 5. Sign in as `ryan.lane5@demo.esta.test` at 1440x900 dark and open `Đất Bảo Lộc`. Save `p1-06-overview-bao-loc.png`. Pass when `Tổng quan` shows frontage and road width, the valuation with `Ước tính`, its date in `dd/MM/yyyy` and its method, and the unit count `1`.
- [ ] Lane 6. Sign in as `me.lane6@demo.esta.test` at 390x844 light. Rename `Nhà phố Q7` to `Nhà phố Q7 mới` through `Sửa`, then open `Hoạt động`. Save `p1-06-activity.png`. Pass when the newest entry names Nguyễn Thị Demo, the old and new names, and `07/10/2026`.
- [ ] Lane 7. Sign in as `ryan.lane7@demo.esta.test` at 1440x900 light and open the URL of a `Gia đình Demo 8` property. Save `p1-06-foreign-404.png`. Pass when the not-found page shows in Vietnamese with a link back to `Tài sản` and no data of household 8 appears.
- [ ] Lane 8. Sign in as `me.lane8@demo.esta.test` at 390x844 dark. Create a townhouse with no certificate address and open it. Save `p1-06-single-address.png`. Pass when the header shows only `Hiện nay` and the missing items include the certificate.
- [ ] Lane 9. Sign in as `ryan.lane9@demo.esta.test` at 1440x900 dark. Throttle to Slow 3G and open `Dãy trọ Dĩ An`, then go offline and switch tabs. Save `p1-06-loading-offline.png`. Pass when the skeleton matches the final header layout without shift and the offline tab switch shows `Chưa tải được. Kiểm tra kết nối mạng rồi thử lại.`
- [ ] Lane 10. Sign in as `me.lane10@demo.esta.test`, switch to English, text scale 130% and dark at 390x844, and repeat lane 2 and lane 3. Save `p1-06-english-130-dark.png`. Pass when labels are English, both addresses wrap fully, the missing items stay readable, and nothing truncates without a way to read it (FND-8 for Property detail).

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT as the INP proxy, CLS and initial route JS gzipped for `/properties/<di-an id>` and `/properties/<di-an id>/activity` on a production build (`pnpm build && pnpm start`) with the full seed, plus `EXPLAIN (ANALYZE)` of `property_activity`.
- [ ] Probe. Run `scripts/perf/lighthouse.ts` on both routes 5 times per side, interleaved trunk and head, and the activity query 20 times on head.
- [ ] Baseline. Trunk has no detail route or activity function, so record that and apply the absolute budgets below. `/properties` is measured on both sides as the shared route.
- [ ] Rule. Fail when either detail route exceeds SPEC §7.2 (LCP 2.5 s, TBT 200 ms, CLS 0.05, initial JS 200 KB gzipped), when `/properties` regresses by more than 10% against trunk, or when `property_activity` exceeds 20 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy every lane screenshot to `~/.claude/orchestrate/esta/media/P1-06/P1-06-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of opening `Đất vườn Long An` from the list, following a missing item, and reading `Hoạt động` at 390x844, saved as `~/.claude/orchestrate/esta/media/P1-06/P1-06-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Edit parcels, structures, certificates and ownership on the legal tab (P1-07)

**Depends on.** P1-06.

**Files.**

- [ ] Create `packages/core/src/property/area.ts`, `packages/core/src/property/ownership.ts` and their `.test.ts` files.
- [ ] Create `apps/web/src/app/(app)/properties/[propertyId]/legal/actions.ts` and edit `legal/page.tsx`.
- [ ] Create `apps/web/src/app/(app)/properties/[propertyId]/legal/_components/ParcelList.tsx`, `ParcelForm.tsx`, `PurposeRows.tsx`, `LandUseCodePicker.tsx`, `StructureForm.tsx`, `CertificateForm.tsx`, `MortgageFields.tsx`, `AnnotationList.tsx`, `OwnershipEditor.tsx`, `OwnershipWarning.tsx`, `PartyPicker.tsx`.
- [ ] Create `e2e/property-legal.spec.ts`. Edit `apps/web/messages/vi.json`, `apps/web/messages/en.json`, `apps/web/src/app/(app)/properties/[propertyId]/_components/PropertyHeader.tsx` (ownership warning).

**Build.**

- [ ] Implement `sumLandArea(parcels)` and `purposesMismatch(parcel)` in `packages/core/src/property/area.ts`. Sums run in integer hundredths of a square meter so `120,5 + 80,25` is exactly `200,75 m²`.
- [ ] Implement `percentToBp(input)` and `ownershipStatus(shares)` in `packages/core/src/property/ownership.ts`. `percentToBp('33,33')` is 3333, and the status is `{ totalBp, state: 'complete' | 'under' | 'over' }`.
- [ ] Build the `Thửa đất` section with one card per parcel (number, map sheet, area, use form, origin) and a total line from `sumLandArea`. `PurposeRows` edits purposes with `LandUseCodePicker` over `land_use_codes`. An unknown code is kept as text with the hint `mã chưa có trong danh mục`, and a purposes total that differs from the parcel area shows `Tổng diện tích theo mục đích khác diện tích thửa.` with both numbers kept (DOMAIN-VN §2.1).
- [ ] Build `StructureForm` for kind, footprint, floor area, floors, structure text, completed year and ownership term.
- [ ] Build `CertificateForm` with form from DOMAIN-VN §2, serial, book entry number, issue date and issuer, holders from `PartyPicker`, status, `MortgageFields` (bank party, amount through the money input, registered and released dates) and `AnnotationList`. `PartyPicker` sorts with `sortKeyVietnameseName` and quick-adds an individual party with full name and optional last 4 ID digits only (D11).
- [ ] Build `OwnershipEditor` with one row per share (party, percent through `percentToBp`, `Có tên trên sổ`, since date). Saving shares that do not total 10000 bp succeeds and shows `OwnershipWarning` with `Tỷ lệ sở hữu cộng lại 90%, chưa đủ 100%.` on the legal tab and in the header until fixed (PRP-3).
- [ ] Write server actions in `legal/actions.ts` for each entity on the session client with the P1-02 zod schemas. Removing a parcel, structure or share is a soft delete with an undo toast that names it.
- [ ] Give each field the anchor id the completeness registry uses, so P1-06 missing-item links focus the exact field.

**You see.**

- [ ] `Pháp lý` for `Đất Bảo Lộc` shows two parcels with their total land area and the certificate `Đang thế chấp` with the bank name and amount.
- [ ] Setting `Căn hộ Thủ Đức` shares to 50% and 40% saves and shows `Tỷ lệ sở hữu cộng lại 90%, chưa đủ 100%.` on the tab and in the header, and the score drops.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/property/area.test.ts` gains cases for two parcels summing exactly, three decimal-comma inputs, an empty list, and a purposes mismatch (PRP-2).
- [ ] `packages/core/src/property/ownership.test.ts` gains cases for `percentToBp` with commas, dots and over 100, and each ownership state (PRP-3).
- [ ] `e2e/property-legal.spec.ts` adds a second parcel and asserts the total, adds an unknown code, edits a certificate with a mortgage, saves shares summing to 90% and asserts the persistent warning after reload and the lower score, and follows a missing-item link to a focused parcel field (PRP-2, PRP-3). Run `pnpm e2e e2e/property-legal.spec.ts`.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/property-legal.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Sign in as `me.lane1@demo.esta.test` at 390x844 light and open `Pháp lý` on `Dãy trọ Dĩ An` at trunk and at head. Trunk shows the P1-06 empty state, so the lane gates the head sections and that the header is unchanged. Save `p1-07-legal-regression.png`. Pass when both sides show the same header and score, and head shows the parcel, certificate and ownership of Dĩ An.
- [ ] Lane 2. Sign in as `me.lane2@demo.esta.test` at 390x844 light. On `Đất Bảo Lộc` add a third parcel with area `120,5`. Save `p1-07-parcel-sum.png`. Pass when the total land area rises by exactly `120,5 m²` and is shown as `formatArea` output (PRP-2).
- [ ] Lane 3. Sign in as `ryan.lane3@demo.esta.test` at 1440x900 dark. On a parcel of `Nhà phố Q7` set purposes `ODT` 50 m² and `CLN` 20,5 m² against a different parcel area. Save `p1-07-purposes.png`. Pass when both codes show their Vietnamese names and the mismatch line shows both totals.
- [ ] Lane 4. Sign in as `me.lane4@demo.esta.test` at 390x844 dark. Add purpose code `XYZ`. Save `p1-07-unknown-code.png`. Pass when it saves as text with the hint `mã chưa có trong danh mục`.
- [ ] Lane 5. Sign in as `ryan.lane5@demo.esta.test` at 1440x900 light. Open the `Đất Bảo Lộc` certificate, enter amount `2ty5` in the mortgage, and add an annotation. Save `p1-07-certificate-mortgage.png`. Pass when the amount previews `2.500.000.000 ₫`, the bank party name shows, and the annotation lists with its date.
- [ ] Lane 6. Sign in as `me.lane6@demo.esta.test` at 390x844 light. On `Căn hộ Thủ Đức` set the shares to 50% and 40%, save, and reload. Save `p1-07-ownership-warning.png`. Pass when the save succeeds, `Tỷ lệ sở hữu cộng lại 90%, chưa đủ 100%.` shows on the tab and in the header after reload, and the score is lower than before (PRP-3).
- [ ] Lane 7. Sign in as `ryan.lane7@demo.esta.test` at 1440x900 dark. Quick-add holder `Lê Văn Demo` with last digits `1234` and toggle `Có tên trên sổ` on his share. Save `p1-07-party-quick-add.png`. Pass when the party appears in the holder list sorted by given name and Studio shows `id_last4` `1234` with no other ID field.
- [ ] Lane 8. Sign in as `me.lane8@demo.esta.test` at 390x844 dark. Add a 3-floor structure to `Nhà phố Q7`, then remove it and tap `Hoàn tác`. Save `p1-07-structure-undo.png`. Pass when the toast names the structure and undo brings it back.
- [ ] Lane 9. Sign in as `ryan.lane9@demo.esta.test` at 1440x900 light. Open `Đất vườn Long An` and tap the missing item for the parcel number. Save `p1-07-missing-link-focus.png`. Pass when `Pháp lý` opens with the parcel number field focused, and filling it raises the header score.
- [ ] Lane 10. Sign in as `me.lane10@demo.esta.test`, switch to English, text scale 130% and dark at 390x844, and repeat lane 6. Save `p1-07-english-130-dark.png`. Pass when labels are English, the warning reads in English with `90%`, and the share rows wrap without clipping.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT as the INP proxy, CLS and initial route JS gzipped for `/properties/<bao-loc id>/legal` on a production build (`pnpm build && pnpm start`) with the full seed, plus server action time for saving a parcel.
- [ ] Probe. Run `scripts/perf/lighthouse.ts` 5 times per side, interleaved trunk and head, and time 20 parcel saves on head.
- [ ] Baseline. Trunk serves the empty `legal` tab from P1-06, so its medians are the route baseline. Trunk has no save action, so record that and apply the absolute budget below.
- [ ] Rule. Fail when the head route exceeds SPEC §7.2 (LCP 2.5 s, TBT 200 ms, CLS 0.05, initial JS 200 KB gzipped), when head LCP exceeds trunk by more than 300 ms, or when the parcel save median exceeds 300 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy every lane screenshot to `~/.claude/orchestrate/esta/media/P1-07/P1-07-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of adding a parcel on `Đất Bảo Lộc` and saving 50% and 40% shares on `Căn hộ Thủ Đức` at 390x844, saved as `~/.claude/orchestrate/esta/media/P1-07/P1-07-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Manage units and utility accounts on the property (P1-08)

**Depends on.** P1-06.

**Files.**

- [ ] Create `packages/core/src/property/units.ts` and `packages/core/src/property/units.test.ts`.
- [ ] Create `apps/web/src/app/(app)/properties/[propertyId]/rent/actions.ts` and edit `rent/page.tsx`.
- [ ] Create `apps/web/src/app/(app)/properties/[propertyId]/rent/_components/UnitList.tsx`, `UnitForm.tsx`, `AddRoomsSheet.tsx`, `UtilityAccountList.tsx`, `UtilityAccountForm.tsx`.
- [ ] Create `e2e/property-units.spec.ts`. Edit `apps/web/messages/vi.json`, `apps/web/messages/en.json`.

**Build.**

- [ ] Implement `nextRoomLabels(existingLabels, count)` and `moveUnit(units, unitId, direction)` in `packages/core/src/property/units.ts`. Labels continue the highest `Phòng n`. `moveUnit` returns the two changed `sort_order` values.
- [ ] Build `UnitList` on `Cho thuê` with label, kind, area, list rent through the money display, `available_from` through `formatDate`, and `Lên` and `Xuống` text buttons for order. Leases render as an empty state until Phase 3.
- [ ] Build `UnitForm` as a bottom sheet on mobile and a side panel on desktop, with list rent through the money input (`2tr8` previews `2.800.000 ₫`) and `available_from` through the date input.
- [ ] Build `AddRoomsSheet` for rooming houses that creates `count` rooms with `nextRoomLabels` and a shared list rent. The P1-02 unique live label makes a retried submit converge on the same rooms. When `kind_details.room_count` differs from the live room count, show `Theo khai báo 10 phòng, đã nhập 8 phòng.`
- [ ] Build `UtilityAccountList` and `UtilityAccountForm` for kind, provider, customer code, holder name and note, attached to the property or to one unit.
- [ ] Write server actions in `rent/actions.ts` on the session client with the P1-02 zod schemas. Removing a unit or account is a soft delete with an undo toast naming it. Removing the last non-whole unit lets `ensure_whole_unit()` restore the `Toàn bộ` unit.

**You see.**

- [ ] `Cho thuê` on `Dãy trọ Dĩ An` lists `Phòng 1` to `Phòng 8` in order, with `Phòng 8` available from `01/08/2026`.
- [ ] Adding 4 rooms to a new rooming house creates `Phòng 1` to `Phòng 4` and the `Toàn bộ` unit no longer shows.
- [ ] Adding an electricity account to `Phòng 2` shows it under that room with its provider and customer code.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/property/units.test.ts` gains cases for labels after gaps, non-numeric labels, count zero, moving the first unit up, and moving the last unit down.
- [ ] `e2e/property-units.spec.ts` adds and edits a unit, bulk-adds rooms and retries the submit, reorders by keyboard, removes and undoes, and adds utility accounts at property and unit level. Run `pnpm e2e e2e/property-units.spec.ts`.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/property-units.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Sign in as `me.lane1@demo.esta.test` at 390x844 light and open `Cho thuê` on `Dãy trọ Dĩ An` at trunk and at head. Trunk shows the P1-06 empty state, so the lane gates the head unit list and that the header is unchanged. Save `p1-08-units-regression.png`. Pass when both sides show the same header and head lists 8 rooms.
- [ ] Lane 2. Sign in as `me.lane2@demo.esta.test` at 390x844 light and read the Dĩ An rooms. Save `p1-08-di-an-rooms.png`. Pass when `Phòng 1` to `Phòng 8` show in order with list rents in `formatVnd` form and `Phòng 8` shows `01/08/2026`.
- [ ] Lane 3. Sign in as `me.lane3@demo.esta.test` at 390x844 dark. Add `Phòng 9` with list rent `2tr8`. Save `p1-08-add-room.png`. Pass when the preview reads `2.800.000 ₫` and `Phòng 9` appears last.
- [ ] Lane 4. Sign in as `ryan.lane4@demo.esta.test` at 1440x900 light. Create rooming house `Dãy trọ Demo Thủ Dầu Một` through P1-05, then add 4 rooms and submit twice quickly. Save `p1-08-bulk-rooms.png`. Pass when exactly `Phòng 1` to `Phòng 4` exist and no `Toàn bộ` unit shows.
- [ ] Lane 5. Sign in as `ryan.lane5@demo.esta.test` at 1440x900 dark. Move `Phòng 3` up twice with the keyboard on `Lên`. Save `p1-08-reorder.png`. Pass when `Phòng 3` is first and the order survives a reload.
- [ ] Lane 6. Sign in as `me.lane6@demo.esta.test` at 390x844 light. Open `Nhà phố Q7` and edit the `Toàn bộ` unit's list rent to `45tr`. Save `p1-08-whole-unit.png`. Pass when one unit `Toàn bộ` shows `45.000.000 ₫` and the list row's `Giá niêm yết` matches after returning to `Tài sản`.
- [ ] Lane 7. Sign in as `ryan.lane7@demo.esta.test` at 1440x900 light. Add an electricity account on `Phòng 2` and a water account on the property of `Dãy trọ Dĩ An`. Save `p1-08-utility-accounts.png`. Pass when the electricity account lists under `Phòng 2` and the water account at property level, each with provider and customer code.
- [ ] Lane 8. Sign in as `me.lane8@demo.esta.test` at 390x844 dark. Remove `Phòng 8` and tap `Hoàn tác`. Save `p1-08-remove-undo.png`. Pass when the toast names `Phòng 8` and undo restores it with its `available_from`.
- [ ] Lane 9. Sign in as `ryan.lane9@demo.esta.test` at 1440x900 dark. Remove every utility account of `Kho Biên Hòa`, note the header score, then add one back. Save `p1-08-utility-completeness.png`. Pass when the score drops on removal, the utility check appears among the missing items, and the score returns after the add.
- [ ] Lane 10. Sign in as `me.lane10@demo.esta.test`, switch to English, text scale 130% and dark at 390x844, and repeat lane 3. Save `p1-08-english-130-dark.png`. Pass when labels are English, the preview reads the English amount form, and unit rows wrap without clipping.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT as the INP proxy, CLS and initial route JS gzipped for `/properties/<di-an id>/rent` on a production build (`pnpm build && pnpm start`) with the full seed, plus server action time for adding 8 rooms.
- [ ] Probe. Run `scripts/perf/lighthouse.ts` 5 times per side, interleaved trunk and head, and time 20 bulk adds on head against fresh rooming houses.
- [ ] Baseline. Trunk serves the empty `rent` tab from P1-06, so its medians are the route baseline. Trunk has no bulk add, so record that and apply the absolute budget below.
- [ ] Rule. Fail when the head route exceeds SPEC §7.2 (LCP 2.5 s, TBT 200 ms, CLS 0.05, initial JS 200 KB gzipped), when head LCP exceeds trunk by more than 300 ms, or when adding 8 rooms takes more than 500 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy every lane screenshot to `~/.claude/orchestrate/esta/media/P1-08/P1-08-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of adding rooms, reordering one and adding a utility account on a rooming house at 390x844, saved as `~/.claude/orchestrate/esta/media/P1-08/P1-08-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Show properties on a map, set pins and polygons, and paste Google Maps links (P1-09)

**Depends on.** P1-01, P1-07, P1-08.

**Files.**

- [ ] Create `apps/web/src/components/map/MapCanvas.tsx`, `apps/web/src/components/map/mapStyle.ts`, `apps/web/src/components/map/PropertyPins.tsx`, `apps/web/src/components/map/PinEditor.tsx`, `apps/web/src/components/map/PolygonEditor.tsx`, `apps/web/src/components/map/PasteMapsLink.tsx`.
- [ ] Create `apps/web/src/app/(app)/properties/_components/PropertyMapView.tsx`, `apps/web/src/app/(app)/properties/[propertyId]/_components/LocationSection.tsx`, `apps/web/src/app/(app)/properties/[propertyId]/locationActions.ts`.
- [ ] Create `packages/core/src/maps/polygon.ts` and `packages/core/src/maps/polygon.test.ts`.
- [ ] Create `e2e/property-map.spec.ts`. Edit `apps/web/package.json` (add `maplibre-gl`, `terra-draw`, `terra-draw-maplibre-gl-adapter`, `@turf/area`, `@turf/kinks`), `apps/web/messages/vi.json`, `apps/web/messages/en.json`, `apps/web/src/app/(app)/properties/page.tsx`, `docs/plan/STATUS.md`.

**Build.**

- [ ] Load MapLibre GL only through `next/dynamic` with `ssr: false` from `MapCanvas`, so it is a separate chunk fetched only when the map view or the `Vị trí` section is shown (SPEC §7.2). `mapStyle.ts` picks the OpenFreeMap `positron` style in light and an OpenFreeMap dark style in dark, confirmed against openfreemap.org in this PR, falling back to `positron` if none is published. Attribution stays visible.
- [ ] Add the `Danh sách` and `Bản đồ` toggle to `/properties` writing `?view=map`, with filters and search applying to both views. `PropertyPins` draws one pin per located property with its status shape. Tapping or pressing Enter on a pin opens a card with the nickname, address and a link to the detail page. Properties without a location are counted in a line `2 tài sản chưa có vị trí` that filters the list to them.
- [ ] Build `LocationSection` on `Tổng quan` that mounts the map when scrolled into view. `PinEditor` places or drags the pin, and latitude and longitude inputs move it from the keyboard. `PolygonEditor` uses terra-draw to draw and edit a boundary, shows its area from `@turf/area` labelled `Ước tính`, and refuses a self-intersecting ring through `@turf/kinks`.
- [ ] Build `PasteMapsLink`. It parses long links in the browser with `parseMapsUrl` and sends short links to the P1-01 `resolveMapsLink` action. It shows a preview pin, then `Dùng vị trí này` saves it. A point outside Vietnam shows `Điểm này nằm ngoài Việt Nam. Kiểm tra lại liên kết.` and needs a second tap on `Vẫn lưu`. Each `ResolveError` maps to a Vietnamese message that suggests pasting the long link.
- [ ] Implement `normalizeRing(points)` and `isValidBoundary(ring)` in `packages/core/src/maps/polygon.ts` (closed ring, at least 3 distinct vertices, inside the lat and lng ranges).
- [ ] Write `setPropertyLocation(id, point)` and `setPropertyBoundary(id, ring | null)` in `locationActions.ts` on the session client with zod parsing, writing PostGIS values through `ST_SetSRID(ST_MakePoint(lng, lat), 4326)` and `ST_GeomFromGeoJSON`. Both show an undo toast.
- [ ] Carry the Phase 1 exit (SPEC §10). Run every Phase 1 e2e spec, `pnpm db:test` and Lighthouse on Properties, and record in `docs/plan/STATUS.md` that PRP-1 to PRP-6 and PRP-8 passed with evidence links, PRP-7 moves to P2-08, and the S6 result.

**You see.**

- [ ] `/properties?view=map` shows a pin for every located seed property and the line `1 tài sản chưa có vị trí` for `Đất vườn Long An`.
- [ ] Pasting a fresh `https://maps.app.goo.gl/...` link on `Đất vườn Long An` previews a pin, `Dùng vị trí này` saves it, and the header score rises.
- [ ] `pnpm e2e e2e/properties-list.spec.ts e2e/property-form.spec.ts e2e/property-detail.spec.ts e2e/property-legal.spec.ts e2e/property-units.spec.ts e2e/property-map.spec.ts` passes, `pnpm db:test` passes with every Phase 1 table covered, and the Lighthouse medians for `/properties` and `/properties/<id>` are within SPEC §7.2. This is the Phase 1 exit.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/maps/polygon.test.ts` gains cases for an open ring closed automatically, two distinct vertices refused, duplicate consecutive vertices removed, and an out-of-range vertex refused (PRP-5).
- [ ] `e2e/property-map.spec.ts` covers the map toggle and pin card, pin drag and keyboard coordinates, drawing and clearing a polygon, pasting a long link, pasting a short link against a fake resolver bound only in the test server, the outside-Vietnam confirmation, and a network assertion that `/properties` in list view requests no MapLibre chunk (PRP-5). Run `pnpm e2e e2e/property-map.spec.ts`.
- [ ] Phase 1 exit. Run `pnpm e2e e2e/properties-list.spec.ts e2e/property-form.spec.ts e2e/property-detail.spec.ts e2e/property-legal.spec.ts e2e/property-units.spec.ts e2e/property-map.spec.ts` and confirm it covers PRP-1 to PRP-6 and PRP-8.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm db:test` and confirm RLS tests exist for every table added in Phase 1.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/property-map.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Sign in as `ryan.lane1@demo.esta.test` at 1440x900 light and open `/properties`, search `di an`, then clear it, at trunk and at head. Trunk has no map, so the lane gates that the list behaves the same and that the head map view shows the located properties. Save `p1-09-map-regression.png`. Pass when the list results match on both sides and head `Bản đồ` shows 6 pins and the line `1 tài sản chưa có vị trí`.
- [ ] Lane 2. Sign in as `me.lane2@demo.esta.test` at 390x844 light. Switch to `Bản đồ` and tap the `Dãy trọ Dĩ An` pin. Save `p1-09-pin-card.png`. Pass when the card shows the nickname, the current address and a link that opens the detail page.
- [ ] Lane 3. Sign in as `me.lane3@demo.esta.test` at 390x844 dark. On `Đất vườn Long An` paste a long `/maps/place/` link with `!3d`/`!4d` for a point near Tân An and tap `Dùng vị trí này`. Save `p1-09-paste-long.png`. Pass when the pin lands on the `!3d`/`!4d` point, the toast offers `Hoàn tác`, and the pin check leaves the missing items.
- [ ] Lane 4. Sign in as `ryan.lane4@demo.esta.test` at 1440x900 light. Copy a Google Maps Share short link for Chợ Bến Thành in the browse session and paste it on a new property. Save `p1-09-paste-short.png`. Pass when the preview pin is within 0.005 degrees of `10.772, 106.698` within 3 s and saving persists it after reload.
- [ ] Lane 5. Sign in as `me.lane5@demo.esta.test` at 390x844 light. Paste `https://www.google.com/maps/@48.8584,2.2945,17z` on a property. Save `p1-09-outside-vietnam.png`. Pass when `Điểm này nằm ngoài Việt Nam. Kiểm tra lại liên kết.` shows and nothing saves until `Vẫn lưu` is tapped.
- [ ] Lane 6. Sign in as `ryan.lane6@demo.esta.test` at 1440x900 dark. On `Kho Biên Hòa` drag the pin, then set latitude and longitude by keyboard only. Save `p1-09-pin-drag-keyboard.png`. Pass when both moves persist after reload and the coordinates shown match the pin.
- [ ] Lane 7. Sign in as `ryan.lane7@demo.esta.test` at 1440x900 light. On `Đất Bảo Lộc` draw a 4-vertex boundary and save, then try a self-crossing ring. Save `p1-09-polygon.png`. Pass when the first saves with an area labelled `Ước tính` and the second is refused with a message and nothing saved.
- [ ] Lane 8. Sign in as `me.lane8@demo.esta.test` at 390x844 dark. Open `/properties` in list view with the network panel recording, then switch to `Bản đồ`. Save `p1-09-lazy-maplibre.png`. Pass when no request for the MapLibre chunk or tiles happens before the switch and both load after it.
- [ ] Lane 9. Phase 1 exit. Run the six Phase 1 e2e specs, `pnpm db:test` and `scripts/perf/lighthouse.ts` for `/properties` and `/properties/<di-an id>`, then open the Playwright HTML report at 1440x900 dark. Save `p1-09-phase1-exit.png`. Pass when every spec passes, `pnpm db:test` reports no failures with Phase 1 tables covered, and every Lighthouse median is within SPEC §7.2.
- [ ] Lane 10. Sign in as `me.lane10@demo.esta.test`, switch to English, text scale 130% and dark at 390x844, and repeat lane 2 and lane 5. Save `p1-09-english-130-dark.png`. Pass when the toggle, card and warning read in English, the dark map style is in use, and nothing clips at 130%.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT as the INP proxy, CLS and initial route JS gzipped for `/properties`, `/properties?view=map` and `/properties/<di-an id>` on a production build (`pnpm build && pnpm start`) with the full seed, plus whether the MapLibre chunk is in the initial JS of the list and detail routes.
- [ ] Probe. Run `scripts/perf/lighthouse.ts` on the three routes 5 times per side, interleaved trunk and head, and read the `next build` route table on each side.
- [ ] Baseline. Trunk serves `/properties` and the detail page without a map, so those medians are the baseline. Trunk has no map view, so record that and apply the absolute budgets below to it.
- [ ] Rule. Fail when any route exceeds SPEC §7.2 (LCP 2.5 s, TBT 200 ms, CLS 0.05, initial JS 200 KB gzipped), when list or detail initial JS grows by more than 10 KB gzipped against trunk, or when the MapLibre chunk appears in their initial JS. This is the Phase 1 Lighthouse exit on Properties.

**Review gate.** The operator reviews before merge.

- [ ] Copy every lane screenshot to `~/.claude/orchestrate/esta/media/P1-09/P1-09-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of the map view, pasting a short link on `Đất vườn Long An`, the score rising, and drawing a boundary at 390x844, saved as `~/.claude/orchestrate/esta/media/P1-09/P1-09-review.mp4`.
- [ ] Post the screenshots, the video and the Phase 1 exit evidence in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

Phase 2. The detailed sections for this phase are re-cut at phase start from `docs/plan/trail/slice-matrix.md` and `docs/plan/trail/pr-inventory.md`, which win where they conflict. The P2-04 section stays as reference for P2-02, which absorbs it.

## Measure certificate extraction quality on synthetic fixtures (P2-01)

**Depends on.** P0-06, P0-15, P1-09.

**Files.**

- [ ] Create `fixtures/certificates/generator/generate.ts`, `fixtures/certificates/generator/degrade.ts`, `fixtures/certificates/generator/templates/<form>.tsx` (one per DOMAIN-VN §2 form) and `fixtures/certificates/generator/generate.test.ts`.
- [ ] Create the generated fixtures `fixtures/certificates/<fixture-id>/` (page images or `document.pdf`, plus `truth.json`) and `fixtures/certificates/manifest.json`.
- [ ] Create `packages/core/src/agent-schemas/certificate_v1.ts`, `packages/core/src/agent-schemas/certificate_v1.test.ts`, `packages/core/src/extraction/score.ts` and `packages/core/src/extraction/score.test.ts`.
- [ ] Create `scripts/extraction-eval.ts` and add the `fixtures:certificates` and `extraction:eval` scripts to the root `package.json`.
- [ ] Create `apps/web/src/app/dev/core/sections/extraction.tsx` and register it in `apps/web/src/app/dev/core/page.tsx`.
- [ ] Create `docs/plan/spikes/s5-extraction.md` and `docs/plan/spikes/s5/outputs/<fixture-id>.json` (synthetic fixtures only).
- [ ] Edit `docs/spec/DOMAIN-VN.md` §2 and §3, `docs/plan/STATUS.md`, `apps/web/messages/vi.json` and `apps/web/messages/en.json`.
- [ ] Create `supabase/migrations/20261007020100_land_use_codes_s5.sql` only if S5 changes a land use code.

**Build.**

- [ ] Add `generateCertificateFixtures(seed)` in `fixtures/certificates/generator/generate.ts`. It renders each DOMAIN-VN §2 form (`so_do_pre2009`, `so_hong_pre2009`, `gcn_2009_2024`, `gcn_2024`, `paper_only`) with satori and @resvg/resvg-js and builds PDFs with pdf-lib, the stack settled in S7 (spike/s7-receipt 8548686). Fonts load with `loadSystemFonts: false`.
- [ ] Produce three variants per form in `degrade.ts` with a fixed RNG seed. `scan` is a clean PDF. `photo` is a JPEG at quality 70 with a 4 to 8 degree perspective skew and a glare band. `low-light` adds a 1.2 px blur and sensor noise. Fifteen fixtures result.
- [ ] Add the sixteenth fixture `northstar-di-an`, a `gcn_2009_2024` sổ hồng for Dãy trọ Dĩ An in the `photo` variant. Its parcel address reads `phường Dĩ An, thành phố Dĩ An, tỉnh Bình Dương`, so north-star step 2 can show both addresses.
- [ ] Give every holder a synthetic name containing `Demo` and a synthetic 12-digit ID number printed on the page, so P2-03 can prove the reduction to `id_last4`. `gcn_2024` pages carry a QR code from the `qrcode` package. `paper_only` uses a handwriting-style OFL font, with its source and license in `fixtures/certificates/README.md`, and its `truth.json` marks the handwritten fields.
- [ ] Write `manifest.json` with the SHA-256 of every generated file. A second run must leave it byte-identical.
- [ ] Define `certificateV1Schema` (zod) in `packages/core/src/agent-schemas/certificate_v1.ts` per DOMAIN-VN §2.1. Every leaf is `{ value, confidence, page }`, `form` is the §2 enum, `area_m2` is a number (decimal commas converted), `issued_on` is an `IsoDate`, and `id_last4` matches exactly four digits. Export `CertificateV1`. P2-03 reuses the schema unchanged.
- [ ] Add `scoreExtraction(schemaName, truth, result)` in `packages/core/src/extraction/score.ts`, a pure function. It normalizes values (NFC, collapsed whitespace, upper-case land use codes, areas to two decimals, dates to `IsoDate`) and returns schema validity, per-field hits on the required fields, and the precision of fields with confidence at or above 0.9. The required fields live in a `REQUIRED_FIELDS` registry keyed by schema name, seeded with AGENT.md §7.2's certificate list (`parcel_no`, `map_sheet_no`, `area_m2`, `address_text`, holder names, `issued_on`, `serial_no`).
- [ ] Build `scripts/extraction-eval.ts` on the S1 SDK path (spike/s1-agent-sdk 83c56e0). It copies one fixture into an empty temp dir, calls `query()` with `tools: ['Read']`, a `PreToolUse` hook that denies any `Read` outside that dir, `permissionMode: 'default'`, `settingSources: []`, `env` holding only the active credential plus an empty `CLAUDE_CONFIG_DIR`, and the model from `ESTA_MODEL_ROUTINE`. It checks `is_error` on the result and records `num_turns`, wall time and `total_cost_usd` per fixture.
- [ ] Give the script two modes. `--mode live --set synthetic` calls the model and saves raw outputs to `docs/plan/spikes/s5/outputs/`. `--from <dir>` rescores saved outputs with no model call and no credential read, and prints `auth=none`.
- [ ] Add `--set private` for `fixtures-private/certificates/`, where Ryan places scans and hand-written `truth.json` files. It runs live, never saves outputs, and prints counts and percentages only, never a field value. When the folder is absent, the report says `no private fixtures measured`.
- [ ] Run the live synthetic eval once and commit the outputs and `docs/plan/spikes/s5-extraction.md`, with per-form and per-field tables, turns, wall time and cost. If an AGENT.md §7.2 target misses, record the miss with per-field numbers and the prompt or schema change P2-03 makes. The spike does not block on the target.
- [ ] Confirm the DOMAIN-VN §2 form names and eras, the rule that older certificates stay valid, and the §3 land use codes against official sources (thuvienphapluat.vn, the ministry portal). Check the issuing circulars named in the forms' own text, starting with Circular 17/2009/TT-BTNMT for the unified form and Circular 10/2024/TT-BTNMT for the 2024 form. Replace each `[verify]` tag with `[verified]` plus the source URL and fetch date. Where no source settles a fact, keep the `[app rule]` behavior and list it in `docs/plan/STATUS.md` under `Needs professional confirmation`.
- [ ] If a land use code changes, add the migration updating `land_use_codes`, keep unknown codes as free text with the `mã chưa có trong danh mục` hint, and update the P0-06 FND-6 test.
- [ ] Add the `/dev/core` section `Trích xuất sổ`. It shows the sixteen fixture cards (first page, form label, truth fields) and `scoreExtraction` examples with expected values beside computed ones and a match mark.

**You see.**

- [ ] A second `pnpm fixtures:certificates` run prints `16 fixtures, manifest unchanged`.
- [ ] `pnpm extraction:eval --from docs/plan/spikes/s5/outputs` prints `auth=none` and a summary line `schema-valid <x>%, required exact <y>%, high-confidence precision <z>%` whose numbers equal `docs/plan/spikes/s5-extraction.md`.
- [ ] `/dev/core#extraction` shows sixteen fixture cards and every scorer example with a match mark.
- [ ] `grep -c '\[verify\]'` over DOMAIN-VN §2 and §3 prints `0`, and every replaced row carries a source URL or a STATUS.md entry.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/extraction/score.test.ts` gains cases for `125,5 m²` matching `125.5`, an NFD holder name matching its NFC truth, `07/10/2026` matching `2026-10-07`, a missing field counting as a miss, an extra holder lowering precision, and confidence exactly 0.9 counting as high-confidence (AGT-2).
- [ ] `packages/core/src/agent-schemas/certificate_v1.test.ts` gains cases rejecting a 12-digit `id_last4` and an unknown `form`, and accepting every committed `truth.json`.
- [ ] `fixtures/certificates/generator/generate.test.ts` gains cases for two runs producing the same manifest, all five forms present, and every holder name containing `Demo`.
- [ ] Run `pnpm check`. Run `pnpm db:test` if the land use migration exists.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/dev-core.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no extraction section, so the lane opens `/dev/core` at trunk and head as `me.lane1@demo.esta.test` at 390x844 light, records that trunk lacks the section, and gates the head section. Save `p2-01-devcore-mobile.png`. Pass when every trunk section still shows its match marks at head and the head `Trích xuất sổ` section shows sixteen fixture cards.
- [ ] Lane 2. Run `pnpm fixtures:certificates` twice in the PR worktree. Save `p2-01-manifest.png` of the terminal. Pass when the second run prints `16 fixtures, manifest unchanged` and `git status --porcelain fixtures/` prints nothing.
- [ ] Lane 3. Run `pnpm extraction:eval --from docs/plan/spikes/s5/outputs` in a shell with no `CLAUDE_CODE_OAUTH_TOKEN` and no network. Save `p2-01-rescore.png` of the terminal. Pass when the log shows `auth=none` and the summary line equals the numbers in `docs/plan/spikes/s5-extraction.md`.
- [ ] Lane 4. As `ryan.lane4@demo.esta.test` at 1440x900 dark, open `/dev/core#extraction` and the `gcn_2024` scan card. Save `p2-01-qr-card.png`. Pass when the card shows a QR code and decoding it with `zbarimg` on the fixture page prints the `qr_payload` from its `truth.json`.
- [ ] Lane 5. If `fixtures-private/certificates/` exists, run `pnpm extraction:eval --mode live --set private`. Otherwise record its absence. Save `p2-01-private.png` of the terminal. Pass when stdout holds only counts and percentages, a grep of stdout and the report for every private `truth.json` value returns nothing, and `git status --porcelain` lists no new file.
- [ ] Lane 6. As `me.lane6@demo.esta.test` at 1440x900 light, open `/dev/core#extraction` and read the scorer examples. Save `p2-01-scorer.png`. Pass when the `125,5 m²`, NFD name and `07/10/2026` rows each show the expected value beside the computed one with a match mark.
- [ ] Lane 7. Open `docs/spec/DOMAIN-VN.md` §2 and §3 at the PR head on GitHub and follow two source links at random. Save `p2-01-domain-sources.png`. Pass when both links return HTTP 200 and the fetched page names the form or code the row cites.
- [ ] Lane 8. As `ryan.lane8@demo.esta.test` at 390x844 dark, open Supabase Studio at the slot's Studio port and run a read-only select on `land_use_codes`. Save `p2-01-land-use-codes.png`. Pass when the row count and codes equal the DOMAIN-VN §3 table at the PR head.
- [ ] Lane 9. Open `docs/plan/spikes/s5-extraction.md` at the PR head and `docs/plan/STATUS.md`. Save `p2-01-report.png`. Pass when the report has a row for each of the five forms and the `northstar-di-an` fixture, each with turns, wall time and cost, and every missed target names the P2-03 change.
- [ ] Lane 10. Seed 10 adapted to the PR. As `me.lane10@demo.esta.test` switch to English, text scale 130% and dark, then open `/dev/core#extraction` at 390x844. Save `p2-01-en-130-dark.png`. Pass when the section heading and field labels read in English, `document.documentElement.scrollWidth` is at most 390, and Vietnamese truth values keep their diacritics.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Live wall time and `total_cost_usd` per fixture, offline rescore wall time, and cold `pnpm check` wall time.
- [ ] Probe. Take live numbers from the one committed live run. Run the rescore 5 times at head. Run `pnpm check` 5 times at trunk and head, interleaved.
- [ ] Baseline. Trunk has no fixtures or eval, so record that and take the head values as the first baseline. Trunk median for `pnpm check`.
- [ ] Rule. Fail when any fixture's live wall time exceeds 120 s (the wizard's 1 to 2 minute promise in DESIGN-BRIEF §6.4), when rescoring exceeds 5 s, or when head `pnpm check` median exceeds trunk median by more than 10%. List in STATUS.md any mean cost above 0.10 USD per fixture.

**Review gate.** None. P2-01 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Store documents in a private bucket with signed URLs and an access log (P2-02)

**Depends on.** P0-02, P0-07, P1-02, P2-01.

**Files.**

- [ ] Create `supabase/migrations/20261007020200_documents.sql`, `supabase/tests/documents.test.sql` and `supabase/tests/documents_storage.test.sql`.
- [ ] Create `packages/core/src/documents/categories.ts`, `packages/core/src/documents/storage-path.ts` and their `.test.ts` files.
- [ ] Create `apps/web/src/server/documents/actions.ts`, `apps/web/src/server/documents/actions.test.ts` and `apps/web/src/app/api/documents/[documentId]/view/route.ts`.
- [ ] Create `supabase/seed/generator/documents.ts`, `supabase/seed/generator/test/completeness-bands.test.ts` and `scripts/seed-storage.ts`, and edit the seed checksum script and `packages/db` generated types.

**Build.**

- [ ] Add `documents` per SPEC §5.5 with soft delete (`deleted_at`), a category check over the SPEC list, `sensitivity` (`normal | sensitive`), `sha256` with a non-unique index on `(household_id, sha256)`, `page_count` and `expires_on`. Leave out `lease_id`. The Phase 3 leases migration adds it with its foreign key.
- [ ] Add `search_vector` as a generated column over `esta_unaccent(title)`, tags and `ocr_text` with the `simple` configuration and a GIN index. `ocr_text` stays null in Phase 2.
- [ ] Add `search_documents(p_household_id uuid, p_query text)`, a security-invoker SQL function. It unaccents the query, turns each word into a prefix term joined by AND, and orders by rank then title, so `bao loc so` finds `Sổ hồng Bảo Lộc` (DOC-3).
- [ ] Add `document_extractions` per SPEC §5.5 with `job_id` referencing `agent_jobs`. A trigger enforces the allowed status pairs `queued > running`, `running > needs_review`, `running > failed`, `queued > failed`, `needs_review > accepted` and `needs_review > rejected`, listed as a values table in the migration.
- [ ] Add `document_access_log` (`view | download | share`) and the `document_status` view (`security_invoker = true`) returning each document's latest extraction status.
- [ ] Add RLS through `private.is_member(household_id, 'viewer')` for select and `private.is_member(household_id, 'member')` for insert and update on `documents`. On `document_extractions`, members may update only `status`, `accepted_fields`, `reviewed_by` and `reviewed_at` (column grants). On `document_access_log`, members insert only rows with their own `user_id`, and nobody updates or deletes. Attach the audit trigger to `documents` and `document_extractions`.
- [ ] Create the private bucket `documents` with a 25 MB `file_size_limit` and allowed types JPEG, PNG, WebP and PDF. Storage policies on `storage.objects` read the household from `(storage.foldername(name))[1]` and call `private.is_member` with `viewer` for select and `member` for insert, mirroring the table policies.
- [ ] Add the `DOCUMENT_CATEGORIES` registry in `packages/core/src/documents/categories.ts`. Each category has an i18n key, a default sensitivity (`certificate` and `id_card` are `sensitive`), an extraction schema name or null (`certificate_v1`, `lease_v1`, `utility_bill_v1`), and accepted MIME types. Server actions, the upload sheet and the extraction trigger read only this registry.
- [ ] Add `storagePath(householdId, documentId, filename)` in `packages/core/src/documents/storage-path.ts`. It returns `{household_id}/{document_id}/{filename}` with the filename NFC-normalized, stripped of diacritics, slugged to ASCII with its extension, and at most 100 characters. `thumbPath` and `thumbBlurPath` return `thumb.webp` and `thumb-blur.webp` in the same folder.
- [ ] Add server actions in `apps/web/src/server/documents/actions.ts` on the user's session client, inputs parsed with zod. `createDocumentUpload` checks membership by reading the caller's `household_members` row under RLS through the session client, picks a document id, returns signed upload URLs for the file and both thumbnails, and returns any same-household rows with the same `sha256` for the duplicate warning. `registerDocument` confirms the object exists and inserts the row with `on conflict (id) do nothing`, so a retry converges on one row. `getDocumentViewUrl(documentId, action)` selects the row under RLS, signs a URL with `ESTA_SIGNED_URL_TTL_SECONDS`, and inserts the access log row (DOC-4).
- [ ] Add `GET /api/documents/[documentId]/view`. It calls `getDocumentViewUrl` and answers 302 to the signed URL with `Cache-Control: no-store`, or 404 when RLS hides the row.
- [ ] Extend the seed generator for every household. Add one certificate document per P1-02 certificate row using the P2-01 fixture of that row's form, titled like `Sổ hồng Bảo Lộc`. Add standalone certificate documents for any DOMAIN-VN §2 form no row uses, so every form appears. Add `Hợp đồng thuê Căn hộ Thủ Đức` (`lease_contract`, property `thu-duc`), the `q7` insurance PDF expiring 2026-10-30, and one `id_card` scan of a synthetic Demo card for Nguyễn Thị Demo. Ids are UUIDv5 from `seed:document:<key>`. No extraction rows. The `northstar` variant drops the `di-an` documents.
- [ ] Add `scripts/seed-storage.ts`, which `pnpm db:reset` runs after the SQL seed. It uploads each seeded file and its two thumbnails (sharp, 320 px WebP, blur radius 24 for the blurred variant) to the bucket with the service role, sending `x-esta-actor: system:seed`. The service role stays inside the `scripts/` allowlist.
- [ ] Add the foreign keys P1-02 could not, both in this migration because `document_extractions` is created here. They are `certificates.document_id` to `documents.id` and `certificates.extraction_id` to `document_extractions.id`, each `on delete set null`, plus every other `document_id` column that exists at this point in the stack.
- [ ] Re-check the P1-03 completeness bands now that the certificate-document and photo checks can pass on seeded documents. Keep `long-an` below 60% and every other seed property at or above 60% (SPEC §9.3), adjusting only which seed documents attach to `long-an` if a band breaks.
- [ ] Add documents, extractions and access log rows to the FND-7 checksum and run `pnpm db:types`.

**You see.**

- [ ] Signed in as a member, `GET /api/documents/<Bảo Lộc certificate id>/view` shows the certificate image, and Studio shows one new `document_access_log` row with action `view`.
- [ ] With `ESTA_SIGNED_URL_TTL_SECONDS=2`, the signed URL returns an expired-token error 3 s after it was issued.
- [ ] `select title from search_documents('<demo household id>', 'hop dong')` returns `Hợp đồng thuê Căn hộ Thủ Đức`.
- [ ] `pnpm db:reset` twice prints identical checksum lines that include `documents`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `supabase/tests/documents.test.sql` gains household isolation for select, insert, update and delete on `documents`, `document_extractions` and `document_access_log`, viewer read-only, no update or delete on the access log, an audit row per insert, the status trigger rejecting `queued > accepted`, and DOC-3 searches (`hop dong` finds `Hợp đồng thuê Căn hộ Thủ Đức`, `bao loc so` finds `Sổ hồng Bảo Lộc`) (FND-2, DOC-3).
- [ ] `supabase/tests/documents_storage.test.sql` gains cases where a member of household A cannot select or insert objects under household B's folder and a viewer cannot insert (FND-2 storage).
- [ ] `apps/web/src/server/documents/actions.test.ts` against local Supabase gains `registerDocument` twice leaving one row, duplicates returned for a matching `sha256`, a TTL 2 URL failing after 3 s, one access log row per open, and refusal for a non-member (DOC-4).
- [ ] `packages/core/src/documents/storage-path.test.ts` covers `Sổ hồng Bảo Lộc (bản sao).jpg`, a 300-character name and a name without extension. `categories.test.ts` asserts every SPEC category has an entry and only `certificate` and `id_card` default to sensitive.
- [ ] `supabase/tests/documents.test.sql` also asserts both new certificate foreign keys exist and that a `certificates.document_id` pointing at a missing document is rejected.
- [ ] `supabase/seed/generator/test/completeness-bands.test.ts` runs `scoreProperty` over the generator's `full` rows with documents and asserts `long-an` is below 60% and every other seed property is at or above 60% (PRP-6, AGENT.md §7.1 W11).
- [ ] The FND-7 checksum test passes with documents included. Run `pnpm check` and `pnpm db:test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no documents, so the lane records that `/api/documents/<seed id>/view` returns 404 at trunk and gates the head, as `me.lane1@demo.esta.test` at 390x844 light opening the view route for `Sổ hồng Bảo Lộc`. Save `p2-02-view-mobile.png`. Pass when the certificate image renders from the local Supabase storage host and Studio shows exactly one new `view` row for that user and document.
- [ ] Lane 2. Restart the web app with `ESTA_SIGNED_URL_TTL_SECONDS=2`. As `ryan.lane2@demo.esta.test` at 1440x900 light, open the view route, copy the signed URL, wait 3 s and load it again. Save `p2-02-ttl-expired.png`. Pass when the first load renders the image and the second returns HTTP 400 with an expired-token message.
- [ ] Lane 3. As `me.lane3@demo.esta.test` at 390x844 dark, open the view route with a household 4 document id. Save `p2-02-cross-household.png`. Pass when the response is 404 and the `document_access_log` count is unchanged.
- [ ] Lane 4. Seed 4 adapted to SQL. In Studio, run `search_documents` for lane household 4 with `bao loc so`, then `hop dong`, as the authenticated role with `ryan.lane4@demo.esta.test` claims. Save `p2-02-search.png`. Pass when the first result is `Sổ hồng Bảo Lộc` and the second query returns `Hợp đồng thuê Căn hộ Thủ Đức`.
- [ ] Lane 5. As `me.lane5@demo.esta.test` at 1440x900 dark, call `supabase.storage.from('documents').list('<household 6 id>')` and `createSignedUrl` on a household 6 path from the browser console. Save `p2-02-storage-read-refused.png`. Pass when the list is empty and `createSignedUrl` returns an error.
- [ ] Lane 6. As `ryan.lane6@demo.esta.test` at 390x844 light, call `createSignedUploadUrl` from the console for a path under the lane's own household and then under household 7. Save `p2-02-storage-write.png`. Pass when the own-household call returns a token and the household 7 call returns an error.
- [ ] Lane 7. Run `pnpm db:reset` twice and the checksum script after each. Save `p2-02-checksum.png` of the terminal. Pass when both checksum lines are identical and every household has the same `documents` count.
- [ ] Lane 8. In Studio, run a read-only select on lane household 8's documents grouped by category and sensitivity. Save `p2-02-sensitivity.png`. Pass when every `certificate` and `id_card` row is `sensitive` and every other row is `normal`.
- [ ] Lane 9. As `ryan.lane9@demo.esta.test` at 1440x900 light, update one document title from the console with the session client, then select its `audit_log` rows in Studio. Save `p2-02-audit.png`. Pass when the newest row has `actor_kind` `user` and `actor_id` equal to that user's id.
- [ ] Lane 10. Seed 10 adapted to the PR. As `me.lane10@demo.esta.test` switch to English, text scale 130% and dark, then open the view route for the `q7` insurance PDF at 390x844. Save `p2-02-en-130-dark.png`. Pass when the PDF renders with intact Vietnamese diacritics and Studio shows one new `view` row.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `pnpm db:reset` wall time including `scripts/seed-storage.ts`, `search_documents` execution time from `EXPLAIN (ANALYZE)` on the full seed, and p95 latency of the view route.
- [ ] Probe. Run `pnpm db:reset` 5 times at trunk and head, interleaved. Run the search `EXPLAIN (ANALYZE)` 5 times at head. Send 50 sequential signed-in requests to the view route at head.
- [ ] Baseline. Trunk median `pnpm db:reset` time. Trunk has no documents, so search and view take absolute budgets.
- [ ] Rule. Fail when head `pnpm db:reset` median exceeds trunk median by more than 30 s, when search exceeds 20 ms, or when the view route p95 exceeds 300 ms.

**Review gate.** None. P2-02 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Run extract_document in the worker and save extractions for review (P2-03)

**Depends on.** P0-15, P2-01, P2-02.

**Files.**

- [ ] Create `supabase/migrations/20261007020300_agent_items_extraction.sql`, `supabase/tests/agent_items.test.sql` and `supabase/tests/enqueue_extract.test.sql`.
- [ ] Create `packages/core/src/agent-schemas/lease_v1.ts`, `packages/core/src/agent-schemas/utility_bill_v1.ts`, `packages/core/src/agent-schemas/index.ts`, `packages/core/src/agent-schemas/reduce-national-ids.ts` and their `.test.ts` files.
- [ ] Create `apps/agent/src/jobs/extract-document.ts`, `apps/agent/src/tools/save-extraction.ts` and `apps/agent/src/prompts/extract-document.ts`, and edit `apps/agent/src/jobs/registry.ts`.
- [ ] Create `apps/agent/test/golden/extract.test.ts`, `apps/agent/test/sensitive-documents.test.ts` and `apps/agent/test/extract-idempotency.test.ts`.
- [ ] Create `fixtures/leases/` (three leases) and `fixtures/utility-bills/` (two bills) from templates added to `fixtures/certificates/generator/`, plus `fixtures/agent-replay/extract_document/<input_hash>.json` for every fixture.
- [ ] Edit `apps/web/src/server/documents/actions.ts`, `apps/web/src/app/dev/agent/page.tsx`, `supabase/seed/generator/`, `apps/web/messages/vi.json` and `apps/web/messages/en.json`.

**Build.**

- [ ] Add `agent_items` per AGENT.md §10 with `dedupe_key` unique per household, RLS through `private.is_member(household_id, 'viewer')` for select with operator-audience rows visible only to operators, member update limited to `status`, the audit trigger, pgTAP, and the seed generator writing zero rows at this phase (SPEC §9.3 says no extraction waits for review) while the checksum covers the table.
- [ ] Add `enqueue_extract_document(p_document_id uuid)`, a security-invoker SQL function. It reads the document under RLS, inserts a `queued` `document_extractions` row and an `agent_jobs` row with idempotency key `extract_document:{document_id}:{sha256}` (`on conflict do nothing`), and returns the extraction id. Add an `agent_jobs` insert policy for members limited to kind `extract_document`.
- [ ] Call `enqueue_extract_document` from `registerDocument` when `DOCUMENT_CATEGORIES[category].extractionSchema` is set.
- [ ] Add `leaseV1Schema` and `utilityBillV1Schema` per AGENT.md §5.1 in the same `{ value, confidence, page }` shape as `certificate_v1`, and `AGENT_SCHEMAS` in `index.ts` mapping schema name to schema and version. Extend `REQUIRED_FIELDS` with the lease and bill required fields.
- [ ] Add `reduceNationalIds(result)` in `reduce-national-ids.ts`. It walks every string leaf, replaces any run of 9 or 12 digits that sits in an ID field or follows `CCCD`, `CMND` or `số định danh` with its last four digits, and sets `id_last4` (AGENT.md §5.1 step 5, D11).
- [ ] Register `extract_document` in `apps/agent/src/jobs/registry.ts` with `tools: ['Read']`, the `mcp__esta__save_extraction` tool, `maxTurns` 8 and a 5 minute timeout. Reuse the P0-15 `PreToolUse` path hook so `Read` is allowed only inside the job's directory (S1, spike/s1-agent-sdk 83c56e0).
- [ ] Build `runExtractDocument(job)` in `extract-document.ts`. It loads the document with the service role filtered by the job's household and fails when the household differs. It downloads only that file into `ESTA_AGENT_HOME/jobs/<job_id>/`, sets the extraction `running`, runs the prompt from `prompts/extract-document.ts` (the AGENT.md §6.1 skeleton plus the schema and the file's `sha256`), and validates with zod. On failure it sends the validation errors back for at most two repair turns. Then it applies `reduceNationalIds`, calls `save_extraction`, and deletes the job directory.
- [ ] Build `save_extraction` in `save-extraction.ts` with the household bound in a closure. It updates the extraction row named in the job payload to `needs_review` with `result`, `field_confidence`, `model` and `job_id`, and creates one `agent_items` row (kind `alert`, severity `info`, audience `all`, `dedupe_key` `extract_review:{extraction_id}`) whose title comes from a template in the household locale, `Đã đọc xong <title>. Mời bạn kiểm tra lại.` A re-run after a crash rewrites the same row and hits the same dedupe key.
- [ ] After the last retry fails, set the extraction `failed` and create an `info` item for admins with a Retry action, per AGENT.md §9.
- [ ] Generate the lease and utility bill fixtures with `Demo` parties and truth files. Record every fixture with `pnpm agent:record --kind extract_document` (live, allowed) and commit the recordings for Ryan to review as code. Add two crafted recordings, `repair-invalid-area` (first answer fails zod) and `deny-outside-read` (asks to `Read` `/etc/hosts`).
- [ ] Add an `Đọc tài liệu` control on `/dev/agent` that enqueues `extract_document` for a chosen document of the signed-in household and links each run to its extraction row.

**You see.**

- [ ] With the worker in replay, `/dev/agent` shows an `extract_document` run for `Sổ hồng Bảo Lộc` finish as `done`, and Studio shows its extraction in `needs_review` with one `agent_items` row.
- [ ] The saved `result` for every fixture with a printed 12-digit ID holds only `id_last4`.
- [ ] `ESTA_AGENT_MODE=replay pnpm --filter agent test` prints the AGENT.md §7.2 summary `schema-valid 100%, required exact >= 90%, high-confidence precision >= 97%`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Golden tests in AGENT.md §7 for `extract_document` pass in replay mode with `ESTA_AGENT_MODE=replay pnpm --filter agent test`. `apps/agent/test/golden/extract.test.ts` scores sixteen certificate fixtures, three leases and two bills with `scoreExtraction` and asserts the §7.2 targets (AGT-2, DOC-6).
- [ ] `apps/agent/test/sensitive-documents.test.ts` (DOC-5 tool part) gains cases where the job dir holds only the target file, the hook denies `Read` of another job's file and of `/etc/hosts` and `agent_runs.permission_denials` records it, no job kind other than `extract_document` holds `Read` or any tool returning file bytes, and `save_extraction` refuses a document of another household.
- [ ] `apps/agent/test/extract-idempotency.test.ts` kills the job after `save_extraction` and before finish, re-runs it, and asserts one extraction in `needs_review` and one `agent_items` row (AGT-1).
- [ ] `packages/core/src/agent-schemas/reduce-national-ids.test.ts` covers a 12-digit CCCD, a 9-digit CMND, a phone number left intact and an ID inside `notes_text`. `index.test.ts` asserts every schema name in `DOCUMENT_CATEGORIES` exists in `AGENT_SCHEMAS`.
- [ ] `supabase/tests/agent_items.test.sql` and `supabase/tests/enqueue_extract.test.sql` gain household isolation, viewer read-only, operator-only visibility, the insert policy refusing kinds other than `extract_document`, and a second enqueue being a no-op (FND-2).
- [ ] Run `pnpm check` and `pnpm db:test`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/dev-agent.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no `extract_document` kind, so the lane enqueues a `ping` from `/dev/agent` at trunk and head and gates the head extraction, as `me.lane1@demo.esta.test` at 390x844 light with the worker in replay. Save `p2-03-extract-run.png`. Pass when `ping` finishes `done` on both sides and the head `Đọc tài liệu` run for `Sổ hồng Bảo Lộc` finishes `done` with its extraction in `needs_review`.
- [ ] Lane 2. As `ryan.lane2@demo.esta.test` at 1440x900 dark, enqueue an extraction and stop the worker with `kill -9` once the log prints `save_extraction ok`, then restart it. Save `p2-03-crash-rerun.png`. Pass when Studio shows one extraction for the document in `needs_review` and one `agent_items` row with key `extract_review:<extraction id>`.
- [ ] Lane 3. As `me.lane3@demo.esta.test` at 390x844 dark, run the `repair-invalid-area` case from `/dev/agent`. Save `p2-03-repair.png`. Pass when `agent_runs.num_turns` shows the repair turn and the saved `area_m2` is a number.
- [ ] Lane 4. As `ryan.lane4@demo.esta.test` at 1440x900 light, extract the `so_hong_pre2009` photo fixture, then select its `result::text` in Studio. Save `p2-03-id-last4.png`. Pass when `result::text ~ '[0-9]{12}'` is false and `id_last4` equals the last four digits in `truth.json`.
- [ ] Lane 5. As `me.lane5@demo.esta.test` at 390x844 light, run the `deny-outside-read` case. Save `p2-03-hook-deny.png`. Pass when the run's `permission_denials` lists `Read /etc/hosts`, the extraction still reaches `needs_review`, and the job dir no longer exists.
- [ ] Lane 6. As `ryan.lane6@demo.esta.test` at 1440x900 dark, stop the worker, enqueue an extraction, wait 60 s, then start the worker. Save `p2-03-offline-queue.png`. Pass when the job stays `queued` while stopped and finishes `done` after start with no duplicate extraction.
- [ ] Lane 7. As `me.lane7@demo.esta.test` at 390x844 light, extract a blank-page fixture whose recording fails validation three times. Save `p2-03-failed.png`. Pass when the extraction is `failed` and one admin `info` item with a Retry action exists.
- [ ] Lane 8. As `ryan.lane8@demo.esta.test`, insert from Studio an `extract_document` job for household 8 whose payload names a household 9 document. Save `p2-03-household-guard.png`. Pass when the job fails with a household mismatch error and household 9 has no new extraction row.
- [ ] Lane 9. As `me.lane9@demo.esta.test` at 1440x900 light, upload nothing and extract one seeded lease and one utility bill fixture from `/dev/agent`. Save `p2-03-lease-bill.png`. Pass when both reach `needs_review` and their `result` fields equal the `truth.json` values for every required field.
- [ ] Lane 10. Seed 10 adapted to the PR. As `me.lane10@demo.esta.test` switch to English, text scale 130% and dark, then open `/dev/agent` at 390x844 and run one extraction. Save `p2-03-en-130-dark.png`. Pass when the controls read in English, the run row shows `done`, and nothing overflows horizontally.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `ping` job wall time on both sides, `extract_document` wall time in replay per fixture, the live wall time stored with each recording, and the golden suite wall time.
- [ ] Probe. Run 5 `ping` jobs at trunk and head, interleaved. Run every extraction fixture 5 times in replay at head. Read live times from the recording metadata.
- [ ] Baseline. Trunk median `ping` wall time. Trunk has no extraction, so extraction takes absolute budgets.
- [ ] Rule. Fail when head `ping` median exceeds trunk by more than 10%, when replay extraction p95 exceeds 5 s, when any live recording exceeds 120 s, or when the golden suite exceeds 90 s.

**Review gate.** None. P2-03 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Upload documents from file picker, drag and drop and the phone camera (P2-04)

**Depends on.** P0-12, P0-14, P1-06, P2-03.

**Files.**

- [ ] Create `apps/web/src/components/documents/upload-sheet.tsx` and `apps/web/src/components/documents/duplicate-dialog.tsx`.
- [ ] Create `apps/web/src/lib/upload/sha256.ts`, `apps/web/src/lib/upload/thumbnail.ts`, `apps/web/src/lib/upload/upload-with-progress.ts` and their `.test.ts` files.
- [ ] Edit `apps/web/src/app/(app)/documents/page.tsx` and `apps/web/src/app/(app)/properties/[propertyId]/documents/page.tsx`.
- [ ] Edit `apps/web/src/server/documents/actions.ts` (add `archiveDocument` and `restoreDocument`), `apps/web/messages/vi.json` and `apps/web/messages/en.json`.
- [ ] Create `e2e/documents-upload.spec.ts` and `e2e/helpers/make-large-image.ts`.

**Build.**

- [ ] Build `UploadSheet`, opened by `Thêm tài liệu` on the Tài liệu page and on the property Tài liệu tab. It offers `Chụp ảnh` (`accept="image/*" capture="environment"`), `Chọn tệp` (JPEG, PNG, WebP, PDF), and on desktop a labelled drop zone that is never the only path. The `accept` list lets iOS Safari hand over JPEG for library photos [inferred, confirm on Ryan's phone over `pnpm dev:lan` at the gate].
- [ ] Give the sheet five fields, so it stays a sheet per DESIGN-BRIEF §5.3. They are category (order from `DOCUMENT_CATEGORIES`), property (prefilled when opened from a property), title (prefilled as category label plus nickname), `expires_on` with the P0-12 date input, and `Tài liệu nhạy cảm (che mờ)` defaulted from the registry.
- [ ] Check size and type on the client before any request. Above 25 MB the sheet shows `Tệp lớn hơn 25 MB. Hãy chọn tệp nhỏ hơn hoặc chụp lại.`
- [ ] Add `sha256(file)` with `crypto.subtle.digest`, and `makeThumbnails(file, sensitive)` in `thumbnail.ts`. It draws a 320 px WebP with canvas from `createImageBitmap(file, { imageOrientation: 'from-image' })`, and for PDFs renders page 1 with `pdfjs-dist` loaded by dynamic import. For sensitive documents it also draws a blurred variant at blur radius 24.
- [ ] Add `uploadWithProgress(url, file, onProgress)`, an XMLHttpRequest PUT to the signed upload URL so `upload.onprogress` drives the bar. A retry reuses the same document id and path with upsert, so it converges on one object.
- [ ] Wire the flow. `createDocumentUpload` runs first. A non-empty duplicates list opens `DuplicateDialog`, which reads `Tài liệu này đã có: <title>. Vẫn tải lên?` with `Vẫn tải lên` and `Hủy`. Then the file and thumbnails upload and `registerDocument` runs. The toast reads `Đã lưu <title>.` with `Xem` and `Hoàn tác`, and `Hoàn tác` calls `archiveDocument`, which sets `deleted_at`.
- [ ] Show progress as a bar with the percent in words and `Đang tải lên 4,2 / 10 MB`. On a network error the sheet shows `Chưa tải lên được. Kiểm tra kết nối mạng rồi thử lại.` with `Thử lại`.
- [ ] Never show an unblurred preview of a file whose sensitivity switch is on. The sheet preview uses the blurred variant, because tenants may be watching over Mẹ's shoulder.
- [ ] Hide `Thêm tài liệu` for viewers.

**You see.**

- [ ] At 390x844, `Thêm tài liệu` then `Chụp ảnh` with a certificate photo, category `Sổ đỏ / sổ hồng` and `Lưu` shows the progress bar, then the toast `Đã lưu Sổ hồng Long An.`
- [ ] Choosing the seeded Bảo Lộc file again opens the dialog naming `Sổ hồng Bảo Lộc`.
- [ ] A 30 MB file shows the 25 MB message and sends no request to Storage.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/web/src/lib/upload/sha256.test.ts` matches a known digest. `thumbnail.test.ts` asserts the long side is at most 320 px, an EXIF-rotated photo comes out upright, and the blurred variant differs from the clear one. `upload-with-progress.test.ts` asserts monotonic progress and one object after a retry.
- [ ] `e2e/documents-upload.spec.ts` gains a 20 MB generated fixture uploaded at 390x844 through the camera input with `setInputFiles` (DOC-1), the duplicate dialog, the 30 MB refusal, undo setting `deleted_at`, a certificate upload creating one queued extraction, and a viewer seeing no `Thêm tài liệu`. Run `pnpm e2e e2e/documents-upload.spec.ts`.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/documents-upload.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk's Tài liệu page is a placeholder with no upload, so the lane records that and gates the head, as `me.lane1@demo.esta.test` at 390x844 light uploading `fixtures/certificates/gcn_2024-photo/page-1.jpg` through `Chụp ảnh` for property `long-an`. Save `p2-04-upload-mobile.png`. Pass when the toast reads `Đã lưu Sổ hồng Long An.` and Studio shows one `sensitive` documents row whose object and two thumbnails exist.
- [ ] Lane 2. As `ryan.lane2@demo.esta.test` at 1440x900 dark, open property `bao-loc`, then the Tài liệu tab, and drop the `gcn_2009_2024` scan PDF on the drop zone. Save `p2-04-drop-desktop.png`. Pass when the property field shows `Đất Bảo Lộc` and the new row has `page_count` equal to the PDF's pages.
- [ ] Lane 3. As `me.lane3@demo.esta.test` at 390x844 dark with the network throttled to 10 Mbps, upload a 10 MB photo. Save `p2-04-progress.png` mid-upload. Pass when the screenshot shows a percent between 10% and 90% in words and the upload completes within 12 s.
- [ ] Lane 4. As `ryan.lane4@demo.esta.test` at 1440x900 light, upload the seeded Bảo Lộc certificate file again and press `Hủy`. Save `p2-04-duplicate.png`. Pass when the dialog names `Sổ hồng Bảo Lộc` and the documents count is unchanged.
- [ ] Lane 5. As `me.lane5@demo.esta.test` at 390x844 light, choose a 30 MB image. Save `p2-04-too-large.png`. Pass when the 25 MB message shows and the network log has no request to the storage host.
- [ ] Lane 6. As `ryan.lane6@demo.esta.test` at 390x844 dark, start an upload, switch the browser offline at about 50%, switch back online and press `Thử lại`. Save `p2-04-retry.png`. Pass when Studio shows exactly one row and the bucket holds one object for that document id.
- [ ] Lane 7. As `me.lane7@demo.esta.test` at 390x844 light, pick an ID card photo and category `Căn cước`. Save `p2-04-sensitive-preview.png`. Pass when the preview shows the blurred image and no `img` or canvas in the sheet holds the clear image.
- [ ] Lane 8. As `ryan.lane8@demo.esta.test` at 1440x900 light, upload one certificate and one `photo` document. Save `p2-04-enqueue.png` of Studio. Pass when the certificate has one `agent_jobs` row keyed `extract_document:<id>:<sha256>` and one queued extraction, and the photo has none.
- [ ] Lane 9. As `me.lane9@demo.esta.test` at 1440x900 dark, upload a file and press `Hoàn tác` in the toast. Save `p2-04-undo.png`. Pass when the row has `deleted_at` set and the toast confirms the undo.
- [ ] Lane 10. Seed 10 adapted to the PR. As `me.lane10@demo.esta.test` switch to English, text scale 130% and dark, then open the sheet at 390x844 and upload a photo. Save `p2-04-en-130-dark.png`. Pass when every label reads in English, no label is clipped, and `document.documentElement.scrollWidth` is at most 390.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time to complete a 10 MB upload on a throttled 10 Mbps connection and time to the first progress update (SPEC §7.2), plus Lighthouse mobile LCP, TBT, CLS and initial route JS gzipped for the Tài liệu route on a production build (`pnpm build && pnpm start`) with the full seed.
- [ ] Probe. Run the upload 5 times at head through Playwright with CDP throttling. Run Lighthouse 5 times per side, interleaved, on the Tài liệu route.
- [ ] Baseline. Trunk has no upload, so the upload takes an absolute budget. Trunk Lighthouse medians for the placeholder route, reported beside head without a ratio because the pages differ.
- [ ] Rule. Fail when the 10 MB upload exceeds 12 s or the first progress update exceeds 1 s, or when the head route exceeds LCP 2.5 s, TBT 200 ms, CLS 0.05 or 200 KB initial JS (SPEC §7.2). `pdfjs-dist` must not appear in the initial chunk.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/p2-04/p2-04-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of Mẹ photographing a certificate at 390x844 through `pnpm dev:lan`, seeing progress and the toast, saved as `~/.claude/orchestrate/esta/media/p2-04/p2-04-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Build the documents vault with search, sensitive blur and expiring soon (P2-05)

**Depends on.** P0-13, P2-04.

**Files.**

- [ ] Create `apps/web/src/components/documents/document-vault.tsx`, `apps/web/src/components/documents/vault-search.tsx` and `apps/web/src/components/documents/sensitive-thumbnail.tsx`.
- [ ] Edit `apps/web/src/app/(app)/documents/page.tsx` and `apps/web/src/app/(app)/properties/[propertyId]/documents/page.tsx`, and create `apps/web/src/app/(app)/documents/[documentId]/page.tsx`.
- [ ] Create `packages/core/src/documents/expiry.ts` and `packages/core/src/documents/expiry.test.ts`.
- [ ] Edit `apps/web/src/server/documents/actions.ts` (add `revealThumbnail` and `updateDocument`), `apps/web/messages/vi.json` and `apps/web/messages/en.json`.
- [ ] Create `e2e/documents-vault.spec.ts`.

**Build.**

- [ ] Run `/impeccable shape Tài liệu` and record the confirmed brief in the PR body before building.
- [ ] Add `expiringSoon(documents, asOf)` in `packages/core/src/documents/expiry.ts`, a pure function returning documents whose `expires_on` falls within 30 days of the Clock's business date with the day count. The window matches W5, so the vault and the Phase 5 watch rule agree.
- [ ] Build the Tài liệu page with the search bar first. `VaultSearch` debounces by 250 ms, calls `search_documents`, and keeps the query in `?q=`. Below it sit `Sắp hết hạn` (for example `Bảo hiểm nhà Q7, hết hạn sau 23 ngày`), then the groups. A toggle switches between `Theo tài sản` (property, then category) and `Theo loại`. Each group shows its count. Lists above 100 rows virtualize.
- [ ] Render tiles with the P0-13 `DocumentTile`, showing category, property, expiry and the `document_status` label.
- [ ] Build `SensitiveThumbnail`. The server sends only the signed URL of `thumb-blur.webp` for a sensitive document, so the clear image never reaches the browser before a tap. Tapping `Xem` calls `revealThumbnail(documentId)`, which signs `thumb.webp` and logs a `view`. The tile re-blurs on `visibilitychange` to hidden and after 60 s.
- [ ] Build the document page `documents/[documentId]`. It shows image pages or the PDF (`pdfjs-dist` loaded by dynamic import) through `getDocumentViewUrl`, `Tải xuống` logging a `download`, and `Sửa thông tin` for title, category, property, `expires_on`, tags and sensitivity through `updateDocument`, with an undo toast. It also shows the extraction status label.
- [ ] Render `DocumentVault` filtered by property on the property Tài liệu tab.
- [ ] Add the empty state `Chưa có tài liệu nào. Thêm ảnh sổ, hợp đồng hoặc hóa đơn.` with `Thêm tài liệu`, a search empty state `Không tìm thấy tài liệu cho "<q>".`, and the offline error `Chưa tải được danh sách. Kiểm tra kết nối mạng rồi thử lại.`
- [ ] Run `/impeccable harden` on the screen for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.

**You see.**

- [ ] At 390x844 on the full seed, Tài liệu opens with the search bar first and `Sắp hết hạn` listing the `q7` insurance with `23 ngày`.
- [ ] Typing `bao loc so` shows `Sổ hồng Bảo Lộc` first, blurred, with `Xem`.
- [ ] Tapping `Xem` shows the clear thumbnail and adds one `view` row in `document_access_log`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/documents/expiry.test.ts` gains the `q7` insurance at 23 days on 2026-10-07, a document expiring exactly 30 days later included, one at 31 days excluded, and an expired document excluded (DOC-7 UI).
- [ ] `e2e/documents-vault.spec.ts` gains `hop dong` finding `Hợp đồng thuê Căn hộ Thủ Đức` and `bao loc so` finding `Sổ hồng Bảo Lộc` (DOC-3), sensitive tiles blurred until tapped with no request for a sensitive `thumb.webp` before the tap (DOC-5), one access log row per open (DOC-4), and the expiring soon section (DOC-7 UI). Run `pnpm e2e e2e/documents-vault.spec.ts`.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/documents-vault.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk's Tài liệu page lists documents without search or expiring soon, so the lane opens it at trunk and head as `me.lane1@demo.esta.test` at 390x844 light and gates the head. Save `p2-05-vault-mobile.png`. Pass when the head shows the search bar above `Sắp hết hạn`, which lists the `q7` insurance with `23 ngày`.
- [ ] Lane 2. Seed 4. As `me.lane2@demo.esta.test` at 390x844 light, start a timer at Home, open Tài liệu and type `bao loc so`. Save `p2-05-seed4.png`. Pass when `Sổ hồng Bảo Lộc` is the first result, blurred, within 10 s of the timer start.
- [ ] Lane 3. As `me.lane3@demo.esta.test` at 390x844 dark with 4x CPU slowdown and Slow 4G, navigate from Home to Tài liệu, capture a frame every 100 ms until network idle, and record every request. Save `p2-05-no-flash.png` as a contact sheet of the frames. Pass when no frame shows a clear sensitive thumbnail and the request log has no `thumb.webp` request for any sensitive document id.
- [ ] Lane 4. As `ryan.lane4@demo.esta.test` at 1440x900 light, tap `Xem` on `Sổ hồng Bảo Lộc`, switch to another tab and back. Save `p2-05-reveal.png` after the reveal. Pass when the clear thumbnail shows after the tap, Studio has one new `view` row, and the tile is blurred again on return.
- [ ] Lane 5. As `ryan.lane5@demo.esta.test` at 1440x900 dark, type `hop dong`. Save `p2-05-hop-dong.png`. Pass when `Hợp đồng thuê Căn hộ Thủ Đức` is in the results.
- [ ] Lane 6. As `me.lane6@demo.esta.test` at 1440x900 light, switch to `Theo loại`. Save `p2-05-by-category.png`. Pass when the `Sổ đỏ / sổ hồng` group count equals a Studio count of the household's `certificate` documents.
- [ ] Lane 7. As `me.lane7@demo.esta.test` at 390x844 light, open the `q7` insurance document, set `expires_on` to 2026-10-12 with `Sửa thông tin`, then press `Hoàn tác`. Save `p2-05-edit-undo.png`. Pass when the vault showed `5 ngày` before the undo and shows `23 ngày` after it.
- [ ] Lane 8. As `ryan.lane8@demo.esta.test` at 1440x900 dark, open property `bao-loc`, then the Tài liệu tab. Save `p2-05-property-tab.png`. Pass when the tab lists exactly the documents a Studio select returns for that property.
- [ ] Lane 9. As `me.lane9@demo.esta.test` at 390x844 dark, open the Tài liệu tab of a property created in the lane, then switch the browser offline and search. Save `p2-05-empty-offline.png`. Pass when the tab shows `Chưa có tài liệu nào.` with `Thêm tài liệu` and the offline search shows the network error copy.
- [ ] Lane 10. Seed 10 adapted to the PR. As `me.lane10@demo.esta.test` switch to English, text scale 130% and dark, then repeat seed 4 at 390x844. Save `p2-05-en-130-dark.png`. Pass when `Sổ hồng Bảo Lộc` is the first result, the UI reads in English, and `document.documentElement.scrollWidth` is at most 390.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT, CLS and initial route JS gzipped for the Tài liệu route on a production build (`pnpm build && pnpm start`) with the full seed, plus search round-trip time from keystroke to results.
- [ ] Probe. Run Lighthouse 5 times per side, interleaved. Time 20 searches at head with Playwright.
- [ ] Baseline. Trunk medians for the trunk Tài liệu route, reported beside head without a ratio because the page changed. Trunk has no search, so search takes an absolute budget.
- [ ] Rule. Fail when the head route exceeds LCP 2.5 s, TBT 200 ms, CLS 0.05 or 200 KB initial JS (SPEC §7.2), or when search p95 exceeds 500 ms after the debounce.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/p2-05/p2-05-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of seed 4 at 390x844 with the blurred tile, the tap to reveal and the document opening, saved as `~/.claude/orchestrate/esta/media/p2-05/p2-05-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Capture multi-page documents into one PDF in the browser (P2-06)

**Depends on.** P2-04, P2-05.

**Files.**

- [ ] Create `apps/web/src/components/documents/multi-page-capture.tsx`.
- [ ] Create `apps/web/src/lib/capture/pages.ts`, `apps/web/src/lib/capture/downscale.ts`, `apps/web/src/lib/capture/build-pdf.ts` and their `.test.ts` files.
- [ ] Create `e2e/fixtures/pages/page-1.jpg`, `page-2.jpg` and `page-3.jpg` (synthetic, distinct sizes, large printed page numbers).
- [ ] Edit `apps/web/src/components/documents/upload-sheet.tsx`, `apps/web/messages/vi.json` and `apps/web/messages/en.json`.
- [ ] Create `e2e/documents-multipage.spec.ts`.

**Build.**

- [ ] Add `capturePagesReducer` in `apps/web/src/lib/capture/pages.ts` with actions `add`, `moveUp`, `moveDown` and `remove`. The page list is the only state, and a page holds its blob, object URL and size.
- [ ] Build `MultiPageCapture`, opened by `Chụp nhiều trang` in the upload sheet. It has `Chụp trang tiếp` (camera input), on desktop `Chọn nhiều ảnh` (multiple file input), and a numbered strip where each page has the text buttons `Lên`, `Xuống` and `Xóa`, with no drag-only or swipe-only control. `Gộp thành PDF` finishes the capture.
- [ ] Add `downscaleForPdf(blob)` in `downscale.ts`. It applies EXIF orientation through `createImageBitmap` and re-encodes to JPEG at quality 0.85 with the long side capped at 2000 px.
- [ ] Add `buildPdfFromImages(pages)` in `build-pdf.ts` with pdf-lib loaded by dynamic import. Each page is A4 width with the height following the image's aspect ratio, in strip order.
- [ ] Pass the PDF to the P2-04 pipeline with `page_count` set and the thumbnail from page 1. A certificate category still enqueues one extraction for the combined PDF.
- [ ] Cap a capture at 20 pages with `Tối đa 20 trang mỗi tài liệu.` and revoke object URLs on remove and unmount.
- [ ] Leaving with captured pages opens the confirm `Bỏ 3 trang đã chụp?`, naming the count, because the photos are not saved yet.

**You see.**

- [ ] At 390x844, three captures show a strip numbered 1 to 3. `Lên` on page 3 moves it to second place.
- [ ] `Gộp thành PDF` then `Lưu` creates one document with `page_count` 3, and its viewer shows the pages in strip order.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/web/src/lib/capture/build-pdf.test.ts` gains three images of distinct sizes producing a 3-page PDF whose page image sizes appear in input order, and a reordered input producing the reordered PDF (DOC-2).
- [ ] `pages.test.ts` covers `moveUp` on the first page and `moveDown` on the last as no-ops, `remove` revoking the URL, and the 20-page cap. `downscale.test.ts` covers an EXIF-rotated photo coming out upright and the 2000 px cap.
- [ ] `e2e/documents-multipage.spec.ts` captures the three page fixtures, moves page 3 up, combines and saves, then reads the stored PDF with `pdfjs-dist` and asserts 3 pages with printed numbers 1, 3, 2 in that order. Run `pnpm e2e e2e/documents-multipage.spec.ts`.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/documents-multipage.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk's upload sheet has no `Chụp nhiều trang`, so the lane uploads one photo at trunk and head and gates the head capture, as `me.lane1@demo.esta.test` at 390x844 light capturing the three page fixtures. Save `p2-06-strip-mobile.png`. Pass when the single upload succeeds on both sides and the head creates one document with `page_count` 3.
- [ ] Lane 2. As `ryan.lane2@demo.esta.test` at 390x844 dark, capture three pages, press `Lên` on page 3, combine and open the document. Save `p2-06-reordered.png`. Pass when the viewer shows printed numbers 1, 3, 2 in order.
- [ ] Lane 3. As `me.lane3@demo.esta.test` at 390x844 light with 4x CPU slowdown, capture ten 12 MP photos and combine. Save `p2-06-ten-pages.png`. Pass when combining finishes within 10 s and the stored PDF is at most 25 MB.
- [ ] Lane 4. As `ryan.lane4@demo.esta.test` at 1440x900 light, add three pages and press `Xóa` on page 2. Save `p2-06-remove.png`. Pass when the strip shows two pages numbered 1 and 2 and the saved PDF has 2 pages.
- [ ] Lane 5. As `me.lane5@demo.esta.test` at 390x844 dark, capture three pages and tap the back control. Save `p2-06-leave-confirm.png`. Pass when the dialog reads `Bỏ 3 trang đã chụp?` and cancelling keeps the strip.
- [ ] Lane 6. As `ryan.lane6@demo.esta.test` at 1440x900 dark, capture the `gcn_2009_2024` pages as a certificate for `di-an`. Save `p2-06-certificate-pdf.png` of the vault. Pass when the tile is blurred and Studio shows one queued extraction for the new document.
- [ ] Lane 7. As `me.lane7@demo.esta.test` at 390x844 light, capture a photo with EXIF orientation 6. Save `p2-06-exif.png`. Pass when the PDF page is upright with the printed number reading normally.
- [ ] Lane 8. As `ryan.lane8@demo.esta.test` at 1440x900 light, select 21 images. Save `p2-06-cap.png`. Pass when the strip holds 20 pages and shows `Tối đa 20 trang mỗi tài liệu.`
- [ ] Lane 9. As `me.lane9@demo.esta.test` at 1440x900 dark, pick three images with `Chọn nhiều ảnh` and combine. Save `p2-06-desktop-multi.png`. Pass when the saved document has `page_count` 3 and keyboard focus moves through every `Lên`, `Xuống` and `Xóa` button.
- [ ] Lane 10. Seed 10 adapted to the PR. As `me.lane10@demo.esta.test` switch to English, text scale 130% and dark, then capture three pages at 390x844. Save `p2-06-en-130-dark.png`. Pass when the strip buttons read in English, none is clipped, and the saved PDF has 3 pages.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Combine time and PDF size for 3 and 10 photos of 12 MP under 4x CPU slowdown, and initial route JS gzipped for the Tài liệu route on a production build with the full seed.
- [ ] Probe. Run each combine 5 times at head. Read the route size table from `next build` once per side.
- [ ] Baseline. Trunk has no combine, so record that and use absolute budgets. Trunk initial JS for the Tài liệu route.
- [ ] Rule. Fail when 3 pages take more than 3 s, 10 pages take more than 10 s, a 10-page PDF exceeds 25 MB, or head initial JS exceeds trunk by more than 5 KB (pdf-lib stays out of the initial chunk).

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/p2-06/p2-06-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of capturing a three-page lease at 390x844, reordering one page and opening the combined PDF, saved as `~/.claude/orchestrate/esta/media/p2-06/p2-06-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Review extracted fields beside the document image and accept them (P2-07)

**Depends on.** P1-07, P2-03, P2-05.

**Files.**

- [ ] Create `apps/web/src/app/(app)/documents/[documentId]/review/page.tsx`, `apps/web/src/components/extraction/review-panel.tsx`, `apps/web/src/components/extraction/document-pager.tsx` and `apps/web/src/components/extraction/use-extraction-status.ts`.
- [ ] Create `packages/core/src/extraction/fields.ts`, `packages/core/src/extraction/confidence.ts`, `packages/core/src/extraction/acceptance.ts` and their `.test.ts` files.
- [ ] Create `apps/web/src/server/extraction/actions.ts` and `apps/web/src/server/extraction/actions.test.ts`.
- [ ] Create `supabase/migrations/20261007020400_extraction_acceptance.sql` and `supabase/tests/extraction_acceptance.test.sql`.
- [ ] Edit `playwright.config.ts`, `apps/web/messages/vi.json` and `apps/web/messages/en.json`.
- [ ] Create `e2e/extraction-review.spec.ts`.

**Build.**

- [ ] Add the `EXTRACTION_FIELDS` registry in `packages/core/src/extraction/fields.ts`, one descriptor per schema leaf. Each names the path, i18n label, input kind (`text`, `area`, `date`, `land_use_code`, `form`), whether it is required, and its target table and column. The review form renders from the registry with no per-field branches.
- [ ] Add `REVIEW_CONFIDENCE_THRESHOLD = 0.9` and `needsCheck(field)` in `confidence.ts`. The threshold matches AGENT.md §7.2's high-confidence line.
- [ ] Add `planCertificateAcceptance(extraction, decisions)` and `planUtilityBillAcceptance(extraction, decisions)` in `acceptance.ts`, pure functions returning an ordered write plan. Holders become parties, matched by normalized name plus `id_last4` before creating one tagged `owner`. Then come the certificate (keyed by `extraction_id`), parcels, structures and the property's `certificate_address_text`. Row ids are UUIDv5 of `extraction:<id>:<path>`, so running a plan twice upserts the same rows. Only accepted or edited fields enter the plan.
- [ ] Add a partial unique index on `certificates.extraction_id`, allow inserting a `document_extractions` row as `accepted` only when `model` is null (manual entry), and add `document_extractions` to the `supabase_realtime` publication, with pgTAP.
- [ ] Build the review page. On desktop the image sits left with page tabs and zoom and the fields sit right. On mobile the image is a collapsible top panel and each field's `Trang 2` link scrolls the image to its page. Opening a sensitive document here logs a `view`.
- [ ] Render each field with the P0-13 extraction field row. A field below the threshold carries the ochre marker and the word `kiểm tra lại`. `Đúng` accepts it in one tap, and `Sửa` opens the typed input. Areas parse decimal commas and land use codes pick from `land_use_codes`, with unknown codes kept and the `mã chưa có trong danh mục` hint. When the parcel area and the sum of purpose areas disagree, both show with a warning (DOMAIN-VN §2.1).
- [ ] Add server actions in `apps/web/src/server/extraction/actions.ts` on the user's session client. `saveExtractionReview(extractionId, decisions)` builds the plan, upserts each step, then sets the extraction `accepted` with `accepted_fields`, `reviewed_by` and `reviewed_at`. A retry after a partial failure converges on the same rows. `rejectExtraction` sets `rejected`. A document without a property asks for one before saving.
- [ ] Save `lease_v1` reviews as `accepted_fields` only, because `leases` arrives in Phase 3. Utility bills write `utility_accounts` through `planUtilityBillAcceptance`.
- [ ] Give `documents.ocr_text` its writer, which SPEC §5.5 lacks. Add an optional `full_text` field to `lease_v1` and `utility_bill_v1` in `packages/core/src/agent-schemas`, and have `saveExtractionReview` copy it into `documents.ocr_text` under the user's session for documents whose sensitivity is `normal`. Sensitive documents keep `ocr_text` null. Record the writer in SPEC §5.5 in this PR.
- [ ] Offer manual entry when the latest extraction is `failed`. The same field rows show empty beside the image, and saving inserts an `accepted` extraction with `model` null through the same plan.
- [ ] Add `useExtractionStatus(documentId)`, a Realtime subscription to `document_extractions` filtered by document. Before `needs_review` the page shows `Trợ lý đang đọc tài liệu.`, and when the worker heartbeat is older than 5 minutes it shows `Trợ lý ngoại tuyến từ <HH:mm>. Việc mới sẽ chạy khi máy hoạt động lại.` (AGENT.md §9).
- [ ] Link the vault status label and the document page to the review page.
- [ ] Add the worker in replay mode as a second `webServer` entry in `playwright.config.ts` (`ESTA_AGENT_MODE=replay pnpm agent:dev`).

**You see.**

- [ ] At 390x844, the review page for a freshly uploaded `gcn_2024` photo shows the image above the fields, and every field below 0.9 carries `kiểm tra lại`.
- [ ] After `Đúng` on every field and `Lưu`, the property's Pháp lý tab shows the certificate serial and parcel numbers from `truth.json`.
- [ ] Pressing `Lưu` twice leaves one certificate row for the extraction.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/extraction/acceptance.test.ts` gains a plan from the `gcn_2024` truth, identical ids across two runs, an edit overriding the extracted value, unaccepted fields left out, a holder matching an existing party, and no full ID in any planned row (DOC-6, D11).
- [ ] `fields.test.ts` asserts every leaf of `certificate_v1`, `lease_v1` and `utility_bill_v1` has a descriptor. `confidence.test.ts` asserts 0.9 is not flagged and 0.89 is.
- [ ] `apps/web/src/server/extraction/actions.test.ts` against local Supabase gains a double save leaving the same row counts, a save interrupted after the certificate step and retried converging, `audit_log` naming the user as actor, and a viewer refused.
- [ ] `supabase/tests/extraction_acceptance.test.sql` gains the unique index, the manual-entry insert rule and household isolation of the Realtime-published table. Run `pnpm db:test`.
- [ ] `e2e/extraction-review.spec.ts` uploads the `gcn_2024` photo, waits for `needs_review` in replay, accepts every field, edits `area_m2`, saves and asserts the business rows equal `truth.json`. It also runs the failed-extraction manual entry. Run `pnpm e2e e2e/extraction-review.spec.ts`.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/extraction-review.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk shows the extraction status label with no review page, so the lane uploads the `gcn_2024` photo at trunk and head as `me.lane1@demo.esta.test` at 390x844 light with the worker in replay, and gates the head review. Save `p2-07-review-mobile.png`. Pass when both sides reach `needs_review` and the head save puts the `truth.json` serial on the Pháp lý tab.
- [ ] Lane 2. Seed 3, review half. As `ryan.lane2@demo.esta.test` at 1440x900 dark, open the review for the `so_hong_pre2009` photo. Save `p2-07-low-confidence.png`. Pass when the count of `kiểm tra lại` markers equals the count of fields below 0.9 in the recording, and each marker shows shape and word.
- [ ] Lane 3. As `me.lane3@demo.esta.test` at 390x844 dark, edit `area_m2` to `125,5` and save. Save `p2-07-edit-area.png`. Pass when the parcel's `area_m2` reads `125.50` in Studio and `accepted_fields` marks the field as edited.
- [ ] Lane 4. As `ryan.lane4@demo.esta.test` at 390x844 light, press `Lưu`, switch offline before the response, switch online and press `Lưu` again. Save `p2-07-idempotent.png`. Pass when Studio shows one certificate for the extraction and the parcel count equals `truth.json`.
- [ ] Lane 5. As `me.lane5@demo.esta.test` at 1440x900 light, accept and save an extraction, then select the new certificate's `audit_log` rows. Save `p2-07-audit.png`. Pass when `actor_kind` is `user` with that user's id and no row for it has `actor_kind` `agent`.
- [ ] Lane 6. As `ryan.lane6@demo.esta.test` at 390x844 light, upload the blank-page fixture whose recording fails and open its review. Save `p2-07-manual-entry.png`. Pass when the empty field rows sit beside the image and saving creates a parcel and an `accepted` extraction with `model` null.
- [ ] Lane 7. As `me.lane7@demo.esta.test` at 1440x900 dark, stop the worker, upload a certificate, open its review, then start the worker. Save `p2-07-offline-then-ready.png`. Pass when the offline notice names the last heartbeat time and the fields appear without a reload after the worker starts.
- [ ] Lane 8. As `ryan.lane8@demo.esta.test` at 1440x900 light, review a certificate whose holder is `Nguyễn Thị Demo` with the seeded `id_last4`. Save `p2-07-holder-match.png`. Pass when the parties count is unchanged and `holder_party_ids` holds her party id.
- [ ] Lane 9. As `me.lane9@demo.esta.test` at 390x844 dark, upload a utility bill fixture for `q7` and accept it. Save `p2-07-utility.png`. Pass when the Q7 utility accounts list shows the `truth.json` customer code and provider.
- [ ] Lane 10. Seed 10 adapted to the PR. As `me.lane10@demo.esta.test` switch to English, text scale 130% and dark, then review the `gcn_2024` photo at 390x844. Save `p2-07-en-130-dark.png`. Pass when labels read in English, Vietnamese values keep their diacritics, and long holder names wrap without clipping.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT, CLS and initial route JS gzipped for the review route on a production build with the full seed plus one `needs_review` extraction, `saveExtractionReview` latency, and the delay from the status change to the fields rendering.
- [ ] Probe. Run Lighthouse 5 times at head. Time 20 saves at head. Time 10 Realtime updates at head.
- [ ] Baseline. Trunk has no review route, so record that and use absolute budgets. Trunk and head both run Lighthouse on the Tài liệu route to show the shared components did not regress.
- [ ] Rule. Fail when the review route exceeds LCP 2.5 s, TBT 200 ms, CLS 0.05 or 200 KB initial JS (SPEC §7.2), when save p95 exceeds 1 s, when Realtime p95 exceeds 2 s, or when the head Tài liệu route median LCP exceeds trunk by more than 10%.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/p2-07/p2-07-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of reviewing a certificate at 390x844, accepting fields in one tap, correcting one and saving, saved as `~/.claude/orchestrate/esta/media/p2-07/p2-07-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Add a property by certificate photo with the wizard and pass north-star steps 1 and 2 (P2-08)

**Depends on.** P0-06, P1-03, P1-05, P1-08, P2-07.

**Files.**

- [ ] Create `apps/web/src/app/(app)/properties/new/page.tsx` and `apps/web/src/components/property-wizard/` (`wizard-machine.ts`, `step-photo.tsx`, `step-review.tsx`, `step-owners.tsx`, `step-use.tsx`, `finish-checklist.tsx`, `review-ready-notice.tsx`).
- [ ] Create `apps/web/src/server/properties/wizard.ts` and `apps/web/src/server/properties/wizard.test.ts`.
- [ ] Create `packages/core/src/properties/owners-from-holders.ts` and its `.test.ts`.
- [ ] Create `e2e/northstar.spec.ts`, `e2e/property-wizard.spec.ts` and the root script `e2e:northstar`.
- [ ] Refresh `fixtures/agent-replay/extract_document/` and edit `docs/plan/STATUS.md`, `apps/web/messages/vi.json` and `apps/web/messages/en.json`.

**Build.**

- [ ] Run `/impeccable shape Add property wizard` and record the confirmed brief in the PR body before building.
- [ ] Add `wizardMachine` in `wizard-machine.ts` as a transition table over `photo`, `details`, `owners`, `use` and `finish`, with `review` reachable from any step once the extraction is `needs_review`. Skipping the photo removes `review` from the path.
- [ ] Build step 1. It asks `Bạn có ảnh sổ không?` with `Chụp ảnh`, `Chọn tệp`, `Chụp nhiều trang` and `Bỏ qua`, then asks the nickname and kind. `startPropertyWizard` creates the property with a client-generated id (a retry converges on one row), uploads through the P2-04 pipeline with the property set, and enqueues the extraction. The property exists from here, because accepting fields needs a property id.
- [ ] Show `ReviewReadyNotice` while the user works on later steps. Driven by `useExtractionStatus`, it reads `Trợ lý đã đọc xong sổ. Xem lại ngay` when the extraction is ready, or the offline notice when the worker is stale. The user never waits on the extraction.
- [ ] Build step 2 with the P2-07 `ReviewPanel` beside the photo. Accepting the parcel address fills `certificate_address_text` and calls `suggest_current_unit` (P0-06). The P1-05 address picker shows the suggestion as `Hiện nay`, listing every candidate for split wards, for the user to confirm.
- [ ] Add `ownersFromHolders(holders, parties)` in `owners-from-holders.ts`, a pure function. It proposes owner shares from accepted holders, matched to existing parties, split equally in basis points with the remainder on the first holder so the total is 10000, each with `named_on_certificate` true. Step 3 prefills from it and saves through the P1-07 ownership action. Without a review it starts empty with `Có thể điền từ ảnh sổ khi Trợ lý đọc xong.`
- [ ] Build step 4 with the use mode and, for rooming houses, a room count that creates `Phòng 1` to `Phòng n` through the P1-08 unit action. Leases show `Thêm hợp đồng sau` until Phase 3.
- [ ] Build the finish step with `scoreProperty` (P1-03), showing the score and every missing item linked to its field.
- [ ] Write `e2e/northstar.spec.ts` with one `test.step` per north-star step, steps 1 and 2 implemented on the `northstar` seed in replay with the clock at 2026-10-07 09:00. Step 1 signs Mẹ in at 390x844 with the 6-digit code from Inbucket. Step 2 runs the wizard with `fixtures/certificates/northstar-di-an/` as `Dãy trọ Dĩ An`, kind `rooming_house`. It continues to owners while the extraction runs, accepts parcel number, map sheet, area, land use purpose and address, edits `area_m2` to the `truth.json` value, and saves. Then it asserts the property shows the Bình Dương certificate address beside `Phường Dĩ An, Thành phố Hồ Chí Minh` (commune 25942, province 79). Add `pnpm e2e:northstar`.
- [ ] Refresh the extraction recordings with `pnpm agent:record --kind extract_document` (live, allowed), have Ryan review the diff, and record the replay `pnpm extraction:eval` summary against AGENT.md §7.2 in `docs/plan/STATUS.md`.
- [ ] Run `/impeccable harden` on the screen for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.

**You see.**

- [ ] `pnpm e2e:northstar` passes steps 1 and 2 on the `northstar` seed in replay, and the run prints the remaining steps as not yet implemented.
- [ ] The new property's header shows `Theo sổ` with `tỉnh Bình Dương` and `Hiện nay` with `Phường Dĩ An, Thành phố Hồ Chí Minh`.
- [ ] `ESTA_AGENT_MODE=replay pnpm --filter agent test` prints `schema-valid 100%`, required exact at least 90% and high-confidence precision at least 97% for the synthetic fixtures (Phase 2 exit, AGENT.md §7.2).
- [ ] The finish step lists the score and the missing items, each opening its field.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Golden tests in AGENT.md §7 for `extract_document` pass in replay mode with `ESTA_AGENT_MODE=replay pnpm --filter agent test`, with the refreshed recordings meeting the §7.2 targets on synthetic fixtures (Phase 2 exit, AGT-2).
- [ ] `packages/core/src/properties/owners-from-holders.test.ts` gains one holder at 10000 bp, a married couple at 5000 and 5000, three holders at 3334, 3333 and 3333, and an existing party matched by name and `id_last4` (PRP-3).
- [ ] `apps/web/src/server/properties/wizard.test.ts` gains `startPropertyWizard` called twice with one id leaving one property, one document and one extraction.
- [ ] `e2e/northstar.spec.ts` steps 1 and 2 pass with `pnpm e2e:northstar` (FND-1, PRP-7, DOC-6). `e2e/property-wizard.spec.ts` covers the skip path, the split ward choice and the room count. Run `pnpm e2e e2e/property-wizard.spec.ts`.
- [ ] Run `pnpm check` and `pnpm db:test`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/property-wizard.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk's `Thêm tài sản` opens the P1-05 form, so the lane creates a property by form at trunk and head and gates seed 3 at head, as `me.lane1@demo.esta.test` at 390x844 light adding the `gcn_2024` photo through the wizard with the worker in replay. Save `p2-08-seed3-finish.png`. Pass when the form path works on both sides and the head finish step shows a score with the certificate on the Pháp lý tab.
- [ ] Lane 2. North-star steps 1 and 2 on a separate slot reset with `pnpm db:reset:northstar`. As `me.lane2@demo.esta.test` at 390x844 light, sign in with the Inbucket code and add Dãy trọ Dĩ An from `northstar-di-an`, correcting the area. Save `p2-08-northstar.png`. Pass when the header shows `Theo sổ` with `tỉnh Bình Dương` and `Hiện nay` with `Phường Dĩ An, Thành phố Hồ Chí Minh`, and parcel number, map sheet, area and land use code equal `truth.json`.
- [ ] Lane 3. As `ryan.lane3@demo.esta.test` at 390x844 dark, take the photo and move to owners before the extraction finishes. Save `p2-08-continue-while-reading.png`. Pass when the owners step is open while the notice reads `Trợ lý đang đọc`, and the notice changes to `Trợ lý đã đọc xong sổ. Xem lại ngay` without a reload.
- [ ] Lane 4. As `me.lane4@demo.esta.test` at 1440x900 light, choose `Bỏ qua` and finish. Save `p2-08-skip.png`. Pass when the property exists with no document and the checklist lists the missing certificate photo.
- [ ] Lane 5. As `ryan.lane5@demo.esta.test` at 390x844 light, stop the worker, run the wizard with a photo to finish, then start the worker. Save `p2-08-offline.png`. Pass when the offline notice names the last heartbeat time, finish succeeds, and the review opens from the property after the worker starts.
- [ ] Lane 6. As `me.lane6@demo.esta.test` at 1440x900 dark, run the wizard with the `so_hong_pre2009` fixture whose address is in old `Quận 7`. Save `p2-08-split-ward.png`. Pass when the picker lists all four current wards and the saved `current_address` holds the chosen commune code.
- [ ] Lane 7. As `ryan.lane7@demo.esta.test` at 1440x900 dark, use the `gcn_2009_2024` fixture with two married holders. Save `p2-08-two-owners.png`. Pass when owners show 50% and 50%, both named on the certificate, with no ownership warning.
- [ ] Lane 8. As `me.lane8@demo.esta.test` at 390x844 light, set kind `rooming_house` and room count 8 in step 4. Save `p2-08-rooms.png`. Pass when the Cho thuê tab lists `Phòng 1` to `Phòng 8`.
- [ ] Lane 9. As `ryan.lane9@demo.esta.test` at 1440x900 light, leave the wizard after the owners step and open Tài sản. Save `p2-08-abandoned.png`. Pass when the property is listed with its completeness ring and its checklist links open the missing fields.
- [ ] Lane 10. Seed 10 adapted to the PR. As `me.lane10@demo.esta.test` switch to English, text scale 130% and dark, then run seed 3 at 390x844. Save `p2-08-en-130-dark.png`. Pass when every step reads in English, long Vietnamese addresses wrap without clipping, and the finish step shows the score.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT, CLS and initial route JS gzipped for `/properties/new` and the Tài sản list on a production build with the full seed, the time from upload to `needs_review` in replay, and the wall time of north-star steps 1 and 2.
- [ ] Probe. Run Lighthouse 5 times per side, interleaved, on the Tài sản list, and 5 times at head on the wizard. Run the north-star steps 5 times at head.
- [ ] Baseline. Trunk medians for the Tài sản list, a like-for-like page on both sides. Trunk has no wizard, so the wizard takes absolute budgets.
- [ ] Rule. Fail when the wizard exceeds LCP 2.5 s, TBT 200 ms, CLS 0.05 or 200 KB initial JS, when the Tài sản list median LCP exceeds trunk by more than 10%, when replay review readiness exceeds 10 s, or when north-star steps 1 and 2 exceed 90 s.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/p2-08/p2-08-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of north-star steps 1 and 2 at 390x844 through `pnpm dev:lan`, with the worker live as the gate demo, saved as `~/.claude/orchestrate/esta/media/p2-08/p2-08-review.mp4`.
- [ ] Post the screenshots, the video and the replay accuracy summary in chat, stop at merge-ready and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

Phase 3. The detailed sections for this phase are re-cut at phase start from `docs/plan/trail/slice-matrix.md` and `docs/plan/trail/pr-inventory.md`, which win where they conflict. The P3-01 section stays as reference for the PRs that take its tables.

## Add the leasing, invoicing, payment and statement schema (P3-01)

**Depends on.** P2-08, the parent, and P1-02 for `units` and `parties`.

**Files.**

- [ ] Create `supabase/migrations/20261007030100_leases.sql` with `leases`, `lease_amendments`, `lease_recurring_charges`, `meters` and `meter_readings`.
- [ ] Create `supabase/migrations/20261007030200_invoices.sql` with `bank_accounts`, `invoices`, `invoice_lines` and the `invoice_balances` view.
- [ ] Create `supabase/migrations/20261007030300_payments.sql` with `payments`, `payment_allocations` and `deposit_entries`.
- [ ] Create `supabase/migrations/20261007030400_statements.sql` with `statement_imports` and `statement_rows`.
- [ ] Create `supabase/tests/leases.test.sql`, `supabase/tests/invoices.test.sql`, `supabase/tests/payments.test.sql` and `supabase/tests/statements.test.sql`. Extend the P2-02 documents suite `supabase/tests/documents.test.sql`.
- [ ] Create `packages/core/src/lease/transitions.ts`, `packages/core/src/lease/transitions.test.ts` and `packages/core/src/schemas/lease.ts`.
- [ ] Create `supabase/seed/generator/leasing.ts` and extend `supabase/seed/generator/index.ts` to call it for every household.

**Build.**

- [ ] Write every SPEC §5.4 column for the tables above, with money as `bigint` VND, rates and escalation percents as integer basis points, and business dates as `date`. Add `check (amount_vnd > 0)` on `payments` and `payment_allocations`.
- [ ] Add `unique (meter_id, reading_month)` on `meter_readings`.
- [ ] Add `unique (lease_id, period_start)` on `invoices` and `unique (household_id, memo_code)` with `check (memo_code ~ '^[A-Z0-9]{8}$')`.
- [ ] Add `payments.idempotency_key uuid` with `unique (household_id, idempotency_key)`, so a retried save posts once (SPEC §7.4).
- [ ] Add `statement_rows.fingerprint text` with `unique (household_id, fingerprint)`, so re-importing a file posts nothing new (LSE-8). Store the column mapping on `statement_imports.column_mapping jsonb` keyed by `bank_account_id`. The latest committed import for an account is that bank's preset, so no preset table is needed.
- [ ] Export `LEASE_TRANSITIONS` from `packages/core/src/lease/transitions.ts` as a table of allowed `(from, event, to)` rows (`draft` to `active` on `activate`, `active` to `ended` on `expire`, `active` to `terminated` on `terminate`) and `transitionLease(lease, event)` returning the next status or a typed refusal.
- [ ] Enforce the same table in SQL with the `leases_status_guard` trigger. It rejects any other status change, requires `start_date`, `rent_vnd` and `tenant_party_id` for `active`, and requires `terminated_on` and `termination_reason` for `terminated`.
- [ ] Add `documents.lease_id uuid references leases(id) on delete restrict` with the index `documents_lease_id_idx` in `20261007030100_leases.sql`, since Phase 2 ran before `leases` existed. The `documents_lease_household_guard` trigger refuses a `lease_id` whose lease belongs to another household.
- [ ] Guard units against orphaned or moved leases in `20261007030100_leases.sql`. The `units_lease_guard` trigger refuses deleting a unit, soft deleting it, or changing its `property_id` when any lease of any status references it, raising `ESTA_UNIT_HAS_LEASES`. The `units_subdivide_guard` trigger refuses inserting a unit of kind other than `whole` into a property whose `whole` unit has an `active` lease, raising `ESTA_WHOLE_UNIT_LEASED` with the lease id. The web maps both codes to Vietnamese messages such as `Không thể chia nhỏ tài sản khi đang cho thuê nguyên căn.` P1-02's auto `whole` unit trigger stays unchanged.
- [ ] Create `invoice_balances` with `security_invoker = true`, giving `total_vnd` from `invoice_lines`, `allocated_vnd` from `payment_allocations`, `outstanding_vnd` and `payment_status` (`unpaid`, `partial`, `paid`, `overpaid`) per invoice.
- [ ] Enable RLS on every new table with policies through `private.is_member(household_id, 'viewer')` for select and `private.is_member(household_id, 'member')` for insert, update and delete. Attach the audit trigger from P0-02 to every new table.
- [ ] Extend the seed generator with every SPEC §9.3 lease, twelve months of invoices and payments, the Dĩ An meters and September readings, the deposits and the default receiving bank account, in every lane household. Ids are UUIDv5 from keys such as `seed:lease:di-an:phong-5`. Memo codes derive from the seed key over the 31-character alphabet without `0`, `O`, `1`, `I` and `L`. The `northstar` variant omits every Dĩ An lease, invoice, meter and payment.
- [ ] Export zod schemas `leaseTermsSchema`, `escalationSchema` and `amendmentChangesSchema` from `packages/core/src/schemas/lease.ts` and parse the jsonb columns with them at the web boundary.
- [ ] Run `pnpm db:types` and commit `packages/db/src/database.types.ts`.

**You see.**

- [ ] `pnpm db:reset` ends with the seed summary line listing `leases 11`, `active 9` for each of the eleven households.
- [ ] `select outstanding_vnd > 0 from invoice_balances` for the `di-an` Phòng 5 invoice due `2026-09-25` returns `t` in every household, and every other invoice due before `2026-10-07` returns `f`.
- [ ] `pnpm db:test` prints the new suites passing with household isolation and viewer read-only cases for all thirteen tables.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `supabase/tests/leases.test.sql`, `invoices.test.sql`, `payments.test.sql` and `statements.test.sql` prove that a member of household A cannot select, insert, update or delete household B rows, that a viewer cannot write, that a duplicate `(lease_id, period_start)` and a duplicate memo code fail, that `leases_status_guard` rejects `ended` to `active` and `draft` to `terminated`, that deleting, soft deleting or re-parenting a unit with an `ended` lease raises `ESTA_UNIT_HAS_LEASES`, that adding a `room` unit to a property whose `whole` unit has an `active` lease raises `ESTA_WHOLE_UNIT_LEASED` while adding one beside an `ended` lease succeeds, that `documents.test.sql` refuses a `lease_id` from another household and keeps household isolation and viewer read-only for documents with a `lease_id`, and that every insert writes an `audit_log` row (FND-2). Run `pnpm db:test`.
- [ ] `packages/core/src/lease/transitions.test.ts` covers every allowed transition and rejects every other pair of status and event (LSE-2). Run `pnpm check`.
- [ ] The FND-7 checksum script from P0-07 produces identical checksums over two `pnpm db:reset` runs, now including the thirteen new tables.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no leasing tables, so the lane opens the `di-an` property detail `Cho thuê` tab as `me.lane1@demo.esta.test` at 390x844, light, on both sides, and gates the head's added seed through Studio. Save `p3-01-units-regression.png`. Pass when both sides list the same eight units `Phòng 1` to `Phòng 8` and the head's Studio query `select status, count(*) from leases group by status` for household 1 returns `active 9` and `ended 2`.
- [ ] Lane 2. In Studio at 1440x900, dark, read `invoice_balances` for household 2 filtered to `di-an`. Save `p3-02-dian-balances.png`. Pass when the Phòng 5 invoice due `2026-09-25` has `outstanding_vnd` equal to its `total_vnd` and the six invoices due `2026-10-25` have status `issued` and `allocated_vnd` 0.
- [ ] Lane 3. In the Studio SQL editor, run a duplicate `invoices` insert for an existing `(lease_id, period_start)` of household 3 inside `begin` and `rollback`. Save `p3-01-guards.png`. Then, in a second `begin` and `rollback`, delete the `di-an` Phòng 7 unit and insert a `room` unit into `thu-duc`. Pass when Postgres reports the `invoices_lease_id_period_start_key` violation, `ESTA_UNIT_HAS_LEASES` and `ESTA_WHOLE_UNIT_LEASED`, and the invoice and unit counts are unchanged.
- [ ] Lane 4. In Studio, run `set local role authenticated` with `request.jwt.claims` set to `me.lane4@demo.esta.test`, then `select count(distinct household_id) from payments`, inside `begin` and `rollback`. Save `p3-01-rls-payments.png`. Pass when the count is 1 and the household is `Gia đình Demo 4`.
- [ ] Lane 5. In Studio, read `deposit_entries` for the `di-an` Phòng 7 lease and the `bien-hoa` lease of household 5. Save `p3-01-deposits.png`. Pass when Phòng 7 has one `received` row and nothing else, and `bien-hoa` has `received` and a `refunded` row on `2026-08-05` of equal amounts.
- [ ] Lane 6. In Studio, list payments for the Dĩ An tenant who pays in two transfers in household 6. Save `p3-01-split-transfers.png`. Pass when each month shows two `payments` rows whose allocations sum to that invoice's `total_vnd`.
- [ ] Lane 7. In Studio, run `select table_name, actor_kind, count(*) from audit_log where table_name in ('leases','invoices','payments') group by 1, 2` for household 7. Save `p3-01-audit.png`. Pass when each table has rows with `actor_kind` `system` and none with `user`.
- [ ] Lane 8. Run the FND-7 checksum script after `pnpm db:reset`, run `pnpm db:reset` again and rerun it, then show both outputs in the terminal. Save `p3-01-checksum.png`. Pass when both checksum lines are identical and list `leases`, `invoices` and `payments`.
- [ ] Lane 9. Run `pnpm db:reset:northstar`, then open Studio and count `leases` joined to the `di-an` units of household 9. Save `p3-01-northstar.png`. Pass when the count is 0 and the `q7`, `thu-duc` and `q1` leases exist.
- [ ] Lane 10. Sign in as `ryan.lane10@demo.esta.test` at 1440x900, English, text scale 130%, dark, and open the `di-an` property detail rent tab, then in Studio find which Dĩ An invoices are overdue on `2026-10-07`. Save `p3-01-seed10.png`. Pass when the tab renders all eight units without overflow and the query returns only Phòng 5.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `pnpm db:reset` wall time with ten lane households, and `EXPLAIN (ANALYZE)` time of `select * from invoice_balances where household_id = $1` on the full seed.
- [ ] Probe. Run `pnpm db:reset` 5 times at trunk and head, interleaved, and the `EXPLAIN (ANALYZE)` 5 times at head.
- [ ] Baseline. Trunk produces the reset time without leasing data. Trunk has no `invoice_balances`, so record that and take the head value as the first baseline.
- [ ] Rule. Fail when the head median reset exceeds the trunk median by more than 20 s, the budget for the added leasing seed, or exceeds 120 s in total, or when the `invoice_balances` query median exceeds 50 ms.

**Review gate.** None. P3-01 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Generate lease schedules as a pure function (P3-02)

**Depends on.** P3-01, the parent.

**Files.**

- [ ] Create `packages/core/src/schedule/types.ts`, `packages/core/src/schedule/generate.ts`, `packages/core/src/schedule/escalation.ts` and `packages/core/src/schedule/index.ts`.
- [ ] Create `packages/core/src/schedule/generate.test.ts`, `packages/core/src/schedule/generate.property.test.ts` and `packages/core/src/schedule/generate.bench.ts`.
- [ ] Create `apps/web/src/app/dev/core/sections/ScheduleSection.tsx` and register it on `/dev/core`.

**Build.**

- [ ] Define `LeaseTerms`, `Amendment` and `Period` in `packages/core/src/schedule/types.ts`. A `Period` has `start` and `end` as `IsoDate`, `dueDate`, `rentVnd` as `Vnd`, `prorated` and `coveredByPaidThrough`.
- [ ] Implement `generateSchedule(terms, amendments, until)` in `packages/core/src/schedule/generate.ts` for cycles of 1, 3, 6 and 12 months, anchors `lease_start` and `calendar_month`, `first_period_proration` `none` and `by_days`, `due_offset_days`, mid-cycle end dates and `paid_through_date`. It takes no clock. Callers pass `until`.
- [ ] Prorate by days with integer arithmetic as `rent × days ÷ days in the full period`, rounded half up to the đồng. The remainder never accumulates across periods.
- [ ] Implement `applyEscalation(rentVnd, escalation, periodStart, leaseStart)` in `packages/core/src/schedule/escalation.ts`. Percent values are basis points. Compound each step on the previous rent and round it half up to the nearest `rounding_vnd`, default 100,000.
- [ ] Apply an amendment only from its `effective_period_start`, which must equal a generated period start. `validateAmendment(schedule, amendment, asOf)` refuses a start that is not a period start or is on or before `asOf`.
- [ ] Add a `/dev/core` schedule section that shows the Dĩ An Phòng 3 schedule, the `q7` quarterly schedule and the LSE-3 canonical lease beside their expected periods.

**You see.**

- [ ] `/dev/core` shows the canonical LSE-3 lease (start `2026-07-15`, calendar anchor, paid through `2026-09-30`, as of `2026-10-07`) with an October period `01/10/2026` to `31/10/2026` due `01/10/2026` and every row marked `khớp`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/schedule/generate.test.ts` gains cases for each cycle and anchor, a 25th-day monthly anchor across February, by-days proration of a first calendar period, a 5% escalation every 12 months rounded to 100,000, an end date mid-cycle, `paid_through_date` skipping covered periods, an amendment from a future period start, and a refused amendment from a past start (LSE-2, LSE-3).
- [ ] `packages/core/src/schedule/generate.property.test.ts` uses fast-check with a fixed seed and 1,000 runs to prove that periods have no gaps or overlaps, that the total equals rent times months adjusted for proration, escalation and amendments, that periods before an amendment's start are identical with and without it, and that generating twice gives equal output (LSE-3).
- [ ] Run `pnpm check`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no schedule section, so the lane opens `/dev/core` at 390x844, light, on both sides and gates the head's new section. Save `p3-02-devcore-regression.png`. Pass when every section present on trunk reads the same on head and the head's schedule section shows no `lệch` row.
- [ ] Lane 2. Open `/dev/core` at 1440x900, dark, and read the LSE-3 canonical lease. Save `p3-02-lse3.png`. Pass when the first generated period is `01/10/2026` to `31/10/2026` due `01/10/2026` and no September period appears.
- [ ] Lane 3. Open the schedule section at 390x844, dark, for the Dĩ An Phòng 3 lease anchored on the 25th. Save `p3-02-anchor-25.png`. Pass when the periods read `25/09/2026` to `24/10/2026` and `25/10/2026` to `24/11/2026`, each due on its start.
- [ ] Lane 4. Read the `q7` quarterly schedule at 1440x900, light. Save `p3-02-quarterly.png`. Pass when periods start on `01/01`, `01/04`, `01/07` and `01/10` and every period ending on or before `31/12/2026` is marked covered by paid-through.
- [ ] Lane 5. Read the escalation example (100,000,000 rent quarterly, 5% every 12 months) at 390x844, light. Save `p3-02-escalation.png`. Pass when the first escalated period shows `105.000.000 ₫` and the next year shows `110.300.000 ₫`.
- [ ] Lane 6. Read the mid-cycle end example (monthly lease ending `2026-11-07`, calendar anchor) at 1440x900, dark. Save `p3-02-mid-end.png`. Pass when the last period is `01/11/2026` to `07/11/2026` with rent prorated over 7 of 30 days.
- [ ] Lane 7. Read the amendment example (rent change from `2026-12-01`) at 390x844, dark. Save `p3-02-amendment.png`. Pass when periods before `01/12/2026` keep the old rent and the refused example from `01/09/2026` shows its refusal reason.
- [ ] Lane 8. Read the annual `q1` lease from `2026-03-01` at 1440x900, light. Save `p3-02-annual.png`. Pass when one period `01/03/2026` to `28/02/2027` appears and is covered.
- [ ] Lane 9. Read the `thu-duc` lease ending `2026-11-01` at 390x844, light. Save `p3-02-thuduc.png`. Pass when the last period is the single day `01/11/2026` with a prorated amount and every section row reads `khớp`.
- [ ] Lane 10. Switch to English, text scale 130%, dark, at 390x844, and open the schedule section for the Dĩ An rooms with the overdue Phòng 5 period. Save `p3-02-seed10.png`. Pass when the section shows Phòng 5's `2026-09-25` period, amounts read in English format such as `3.5M ₫`, and no row overflows the viewport.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `generateSchedule` time per call for a 10-year monthly lease with three amendments and escalation, from `packages/core/src/schedule/generate.bench.ts`, and `pnpm check` wall time.
- [ ] Probe. Run the vitest bench 5 times at head, and `pnpm check` 5 times at trunk and head, interleaved.
- [ ] Baseline. Trunk has no schedule module, so record that and take the head bench as the first baseline. Trunk produces the `pnpm check` time.
- [ ] Rule. Fail when the bench median exceeds 1 ms per call, or when head `pnpm check` exceeds trunk by more than 15 s, the budget for the property tests.

**Review gate.** None. P3-02 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Allocate payments, derive payment status and track deposits (P3-03)

**Depends on.** P3-02, the parent, and P3-01 for `invoice_balances`.

**Files.**

- [ ] Create `packages/core/src/allocation/allocate.ts`, `packages/core/src/allocation/status.ts`, `packages/core/src/allocation/deposits.ts` and `packages/core/src/allocation/index.ts`.
- [ ] Create `packages/core/src/allocation/allocate.test.ts`, `packages/core/src/allocation/allocate.property.test.ts`, `packages/core/src/allocation/deposits.test.ts` and `packages/core/src/allocation/allocate.bench.ts`.
- [ ] Create `supabase/tests/invoice_balances_parity.test.sql` and `supabase/tests/fixtures/payment_status.csv`.
- [ ] Create `apps/web/src/app/dev/core/sections/AllocationSection.tsx` and register it on `/dev/core`.

**Build.**

- [ ] Implement `allocatePayment(amountVnd, openInvoices, override?)` in `packages/core/src/allocation/allocate.ts`. It allocates oldest due date first, then oldest period start, and returns `allocations` and `creditVnd`. `override` names invoice amounts explicitly and is checked against the payment amount.
- [ ] Implement `derivePaymentStatus(totalVnd, allocatedVnd)` in `packages/core/src/allocation/status.ts` returning `unpaid` when nothing is allocated, `partial` below the total, `paid` at the total and `overpaid` above it.
- [ ] Implement `deriveDepositLedger(entries)` in `packages/core/src/allocation/deposits.ts` returning running rows and `heldVnd`. A deduction or refund above the held balance is a typed refusal.
- [ ] Prove in `supabase/tests/invoice_balances_parity.test.sql` that `invoice_balances.payment_status` from P3-01 equals `derivePaymentStatus` for every seeded invoice, using expected rows the core test exports to `supabase/tests/fixtures/payment_status.csv`.
- [ ] Add a `/dev/core` allocation section with the two-transfer Dĩ An tenant, an overpayment that leaves credit, and the Phòng 7 deposit ledger.

**You see.**

- [ ] `/dev/core` shows a 5,000,000 payment against invoices of 3,500,000 and 3,500,000 allocating `3.500.000 ₫` then `1.500.000 ₫`, with status `paid` then `partial`, and every row marked `khớp`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/allocation/allocate.test.ts` gains cases for exact payment, partial, overpayment to credit, two partials summing to full, a manual override that skips the oldest invoice, and an override above the payment amount refused (LSE-7).
- [ ] `packages/core/src/allocation/allocate.property.test.ts` uses fast-check with a fixed seed and 1,000 runs to prove that allocations are positive, that allocations plus credit equal the payment, that no invoice receives more than its outstanding amount without an override, and that a later invoice receives money only when every older one is paid (LSE-7).
- [ ] `packages/core/src/allocation/deposits.test.ts` covers received, applied, deducted and refunded entries and a refund above the held balance refused (LSE-9).
- [ ] Run `pnpm check` and `pnpm db:test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has the schedule section and no allocation section, so the lane opens `/dev/core` at 390x844, light, on both sides. Save `p3-03-devcore-regression.png`. Pass when the schedule section reads the same on both sides and the head's allocation section has no `lệch` row.
- [ ] Lane 2. Open the allocation section at 1440x900, dark, and read the two-transfer tenant. Save `p3-03-two-transfers.png`. Pass when the first transfer shows status `partial` and the second shows `paid` with zero credit.
- [ ] Lane 3. Read the overpayment example at 390x844, dark. Save `p3-03-overpay.png`. Pass when the credit line equals the payment minus the outstanding amount and the invoice status is `paid`.
- [ ] Lane 4. Read the manual override example at 1440x900, light. Save `p3-03-override.png`. Pass when the newer invoice is paid, the older stays `unpaid`, and the refused override shows its reason.
- [ ] Lane 5. Read the Phòng 7 deposit ledger at 390x844, light. Save `p3-03-deposit-held.png`. Pass when the held balance equals the received amount and the refused over-refund shows its reason.
- [ ] Lane 6. In Studio at 1440x900, dark, run `select payment_status, count(*) from invoice_balances group by 1` for household 6. Save `p3-03-status-counts.png`. Pass when exactly one invoice is `unpaid` with a due date before `2026-10-07` and it is Phòng 5's.
- [ ] Lane 7. In Studio, compare `payment_status` for every invoice of household 7 against the parity test's expected rows. Save `p3-03-parity.png`. Pass when the parity query returns zero mismatches.
- [ ] Lane 8. Read the `bien-hoa` deposit ledger in the allocation section at 390x844, dark. Save `p3-03-bienhoa-deposit.png`. Pass when the held balance is `0 ₫` after the refund on `05/08/2026`.
- [ ] Lane 9. Sign in as `ryan.lane9@demo.esta.test` at 1440x900, light, and open the `di-an` property detail rent tab to confirm nothing regressed. Save `p3-03-rent-tab.png`. Pass when all eight units render and the console has no errors.
- [ ] Lane 10. Switch to English, text scale 130%, dark, at 390x844, and read the allocation for Dĩ An Phòng 5's overdue invoice. Save `p3-03-seed10.png`. Pass when the section shows Phòng 5 as `unpaid` with outstanding equal to its total, in English labels, with no overflow.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `allocatePayment` time per call across 120 open invoices from `packages/core/src/allocation/allocate.bench.ts`, and `EXPLAIN (ANALYZE)` time of the `invoice_balances` query on the full seed.
- [ ] Probe. Run the bench 5 times at head, and the query 5 times at trunk and head, interleaved.
- [ ] Baseline. Trunk has no allocation module, so record that and take the head bench as the first baseline. Trunk and head both produce the query time, since the view is unchanged.
- [ ] Rule. Fail when the bench median exceeds 0.5 ms per call, or when the head query median exceeds the trunk median by more than 10 ms or exceeds 50 ms.

**Review gate.** None. P3-03 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Generate and issue invoices from the daily cron and on activation (P3-04)

**Depends on.** P3-03, the parent, P3-02 for schedules, and P0-03 for the Clock and the cron skeleton.

**Files.**

- [ ] Create `packages/core/src/invoicing/plan.ts`, `packages/core/src/invoicing/memoCode.ts`, `packages/core/src/invoicing/trigger.ts` and their `.test.ts` files.
- [ ] Create `supabase/migrations/20261007030600_invoice_issue.sql` with `issue_due_invoices(p_household_id uuid, p_as_of date)`, `end_expired_leases(p_as_of date)` and `next_invoice_seq(p_property_id uuid, p_month date)`.
- [ ] Create `supabase/tests/invoice_issue.test.sql`.
- [ ] Create `apps/web/src/server/invoicing/runInvoicing.ts` and `apps/web/src/server/invoicing/runInvoicing.integration.test.ts`.
- [ ] Create `apps/web/src/server/cron/invoices.ts`, `apps/web/src/server/cron/leaseStatus.ts`, `apps/web/src/app/api/cron/invoices/route.ts` and `apps/web/src/app/api/cron/lease-status/route.ts`.
- [ ] Create `vercel.json` and extend `scripts/cron-run.ts` and `supabase/seed/generator/leasing.ts`.

**Build.**

- [ ] Implement `planInvoices({ leases, amendments, recurringCharges, readings, existing, asOf })` in `packages/core/src/invoicing/plan.ts`. It returns draft invoices with lines for the period containing `asOf` and every period starting within the next 35 days, skipping periods that end on or before `paid_through_date` and periods that already exist (SPEC §5.4).
- [ ] Build lines from a registry keyed by `invoice_lines.kind`. Rent comes from the schedule. Electricity and water come from consumption of month M on the invoice whose period starts in month M+1, priced from `meters.pricing`. Recurring charges come from `lease_recurring_charges`. Readings that arrive after that invoice is issued become an `adjustment` line on the next draft (LSE-4).
- [ ] Implement `triggerDate(invoice, lease, readingsComplete)` in `packages/core/src/invoicing/trigger.ts`. It returns the period start, or for `metered_by_owner` leases the earlier of the day every meter of the unit has last month's reading and the due date.
- [ ] Implement `generateMemoCode(random)` in `packages/core/src/invoicing/memoCode.ts` over the 31-character alphabet without `0`, `O`, `1`, `I` and `L`. `runInvoicing` retries on a unique violation up to 5 times.
- [ ] Implement `runInvoicing(client, { householdId, asOf })` in `apps/web/src/server/invoicing/runInvoicing.ts`. It reads with the given client, calls `planInvoices`, inserts drafts with `on conflict (lease_id, period_start) do nothing`, numbers them `{property_code}-{YYYYMM}-{seq}` through `next_invoice_seq`, then calls `issue_due_invoices`. It is idempotent. Server actions pass the user's session client. Cron passes the service client.
- [ ] Write `issue_due_invoices` and `end_expired_leases` in SQL taking `p_as_of`. They never call `now()` or `current_date`. `end_expired_leases` moves `active` leases whose `end_date` is before `p_as_of` to `ended`.
- [ ] Make `apps/web/src/server/cron/invoices.ts` and `leaseStatus.ts` reject requests without `Authorization: Bearer ${CRON_SECRET}`, read `asOf` from the injected Clock per request, create the service client with the `x-esta-actor: system:cron` header, and loop over households. The route files only import these handlers.
- [ ] Make the seed generator call `planInvoices` at the seed date, so the seed already holds every draft the cron would create, such as the `thu-duc` period of `2026-11-01`.
- [ ] Add `vercel.json` crons for invoices at `30 17 * * *` (00:30 Asia/Ho_Chi_Minh), lease status at `20 17 * * *` and the P0-03 keep-alive route. Make `pnpm cron:run` call all three with `CRON_SECRET`.

**You see.**

- [ ] `pnpm cron:run` prints `invoices drafted=0 issued=0 households=11` on the freshly reset full seed at `2026-10-07`, because the seed already holds every due invoice.
- [ ] After `pnpm clock:set 2026-11-02T09:00:00+07:00`, `pnpm cron:run` prints `lease-status ended=1` for each household's `thu-duc` lease and a positive `drafted` count. A second run prints `drafted=0 issued=0 ended=0`.
- [ ] `curl -X POST http://localhost:3000/api/cron/invoices` without the secret returns 401.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/invoicing/plan.test.ts` gains cases for the LSE-3 canonical activation, the 35-day horizon, `paid_through_date` skipping, a metered lease with incomplete readings staying `draft`, consumption billed on the next period, and a late reading becoming an adjustment (LSE-3, LSE-4).
- [ ] `packages/core/src/invoicing/memoCode.test.ts` checks length 8, the alphabet, and determinism under a seeded random source.
- [ ] `supabase/tests/invoice_issue.test.sql` proves `issue_due_invoices` issues only drafts whose trigger date is on or before `p_as_of`, never touches issued rows, and that `end_expired_leases` is a no-op on a second call.
- [ ] `apps/web/src/server/invoicing/runInvoicing.integration.test.ts` runs twice against local Supabase and asserts the second run inserts nothing (SPEC §7.4). It also asserts the cron route returns 401 without `CRON_SECRET`.
- [ ] Run `pnpm check` and `pnpm db:test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk runs only the keep-alive route, so the lane runs `pnpm cron:run` on both sides at `2026-10-07` and gates the head's invoice and lease-status routes. Save `p3-04-cron-regression.png` of both terminals. Pass when keep-alive succeeds on both sides and the head prints `drafted=0 issued=0` for household 1.
- [ ] Lane 2. Set the clock to `2026-11-02T09:00:00+07:00`, run `pnpm cron:run`, and read household 2's `leases` in Studio at 1440x900, dark. Save `p3-04-thuduc-ended.png`. Pass when the `thu-duc` lease status is `ended` and every other lease keeps its status.
- [ ] Lane 3. With the clock at `2026-11-02`, read household 3's Dĩ An drafts for the period starting `2026-11-25` in Studio. Save `p3-04-metered-drafts.png`. Pass when six drafts exist with status `draft`, because October readings are missing, and each has a `rent` line.
- [ ] Lane 4. Run `pnpm cron:run` twice at `2026-11-02` and compare `select count(*) from invoices` for household 4 after each run. Save `p3-04-idempotent.png`. Pass when both counts are equal and the second run prints `drafted=0 issued=0 ended=0`.
- [ ] Lane 5. Set the clock to `2026-12-31T09:00:00+07:00`, run `pnpm cron:run`, and read the `q7` invoices of household 5. Save `p3-04-q7-paid-through.png`. Pass when the period starting `2027-01-01` exists as a `draft`, and no new invoice exists for a period ending on or before `2026-12-31`.
- [ ] Lane 6. Call `curl -i -X POST http://localhost:<web port>/api/cron/invoices` without the header and screenshot the terminal. Save `p3-04-cron-401.png`. Pass when the status line reads `401`.
- [ ] Lane 7. After a cron run at `2026-11-02`, read `audit_log` rows for `invoices` in household 7. Save `p3-04-audit-cron.png`. Pass when the new rows carry actor `system:cron`.
- [ ] Lane 8. Read the memo codes of every invoice in household 8. Save `p3-04-memo-codes.png`. Pass when `select count(*) from invoices where memo_code !~ '^[A-HJKMNP-Z2-9]{8}$'` returns 0 and no code repeats.
- [ ] Lane 9. Sign in as `me.lane9@demo.esta.test` at 390x844, light, with the clock at `2026-11-02`, and open the `di-an` property detail rent tab. Save `p3-04-rent-tab.png`. Pass when the tab renders all eight units and the console has no errors.
- [ ] Lane 10. Sign in as `ryan.lane10@demo.esta.test` at 1440x900, English, text scale 130%, dark, run the cron at `2026-10-07`, and query which Dĩ An invoices are overdue. Save `p3-04-seed10.png`. Pass when the cron changes nothing, only Phòng 5 is overdue, and the app header shows the English date for `2026-10-07`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of `pnpm cron:run` across eleven households on the full seed at `2026-11-02`, first and second run, and `EXPLAIN (ANALYZE)` time of `issue_due_invoices` for one household.
- [ ] Probe. Reset and run 5 times at trunk and head, interleaved, timing each run.
- [ ] Baseline. Trunk produces the keep-alive-only run time. Trunk has no invoice routes, so the head invoice work gets an absolute budget.
- [ ] Rule. Fail when the head first run exceeds 10 s, the second run exceeds 3 s, `issue_due_invoices` exceeds 100 ms, or the keep-alive time regresses by more than 20% against trunk.

**Review gate.** None. P3-04 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Encode and decode VietQR payloads (P3-05)

**Depends on.** P3-04, the parent, and P0-06 for `bank_bins`.

**Files.**

- [ ] Create `packages/core/src/vietqr/tlv.ts`, `crc.ts`, `encode.ts`, `decode.ts`, `invoiceQr.ts`, `rules.ts` and `index.ts` under `packages/core/src/vietqr/`.
- [ ] Create `packages/core/src/vietqr/vectors.json` from `spikes/s4-vietqr/test/` on branch `spike/s4-vietqr` at `a7c9e76`, and `packages/core/src/vietqr/vietqr.test.ts`, `roundtrip.test.ts` and `vietqr.bench.ts`.
- [ ] Create `apps/web/src/app/dev/core/sections/VietQrSection.tsx` and register it on `/dev/core`.
- [ ] Update `docs/plan/STATUS.md`.

**Build.**

- [ ] Port the S4 encoder and decoder into `encodeVietQr({ bin, accountNo, amountVnd, purpose })` and `decodeVietQr(payload)`. Emit tags 00, 01, 38 (00 `A000000727`, 01.00 BIN, 01.01 account, 02 `QRIBFTTA`), 53 `704`, 54, 58 `VN`, 62.08 and 63 in that order, and no tags 52, 59 or 60.
- [ ] Set tag 01 to `12` with an amount and `11` without, labelled `[app rule]` in `rules.ts`. The decoder accepts either.
- [ ] Implement `crc16CcittFalse(bytes)` in `crc.ts` over every byte up to and including `6304`, as 4 uppercase hex digits zero-padded.
- [ ] Reject in the encoder a purpose longer than 25 characters, a tag 54 value that is zero, fractional or longer than 13 digits, and a non-ASCII account name. The decoder tolerates a longer purpose and reports a CRC mismatch as a typed error.
- [ ] Put the cap in `rules.ts` as `VIETQR_RULES.singleTransferCapVnd = 500_000_000`, labelled `[app rule]` with the NAPAS 247 note from S4 and pending Ryan's confirmation. `buildInvoiceQr({ account, outstandingVnd, memoCode })` in `invoiceQr.ts` returns `{ payload, amountInQr, splitNote }`. At or above the cap it omits tag 54, sets `amountInQr` to false and returns the split note key.
- [ ] Build the purpose as `ESTA {memo_code}` in `invoiceQr.ts` only.
- [ ] Add a `/dev/core` section that renders the canonical invoice QR with `qrcode`, decodes the rendered canvas with `jsQR`, and shows each vector's re-encode result.
- [ ] List the 500,000,000 cap under "Needs professional confirmation" in `docs/plan/STATUS.md` with the S4 source.

**You see.**

- [ ] `/dev/core` shows the 15,000,000 đồng invoice QR with memo `ESTA 7K2QX9MP`, the decoded fields beside it, `CRC khớp`, and `Đọc lại từ ảnh` equal to the payload.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/vietqr/vietqr.test.ts` gains the 6 published payloads re-encoding byte for byte, the 2 NAPAS card examples decoding, the 2 malformed samples rejected, a CRC whose value needs zero padding, tag 01 with and without amount, a 26-character purpose refused, and `buildInvoiceQr` at 499,999,999 (tag 54 present) and at 500,000,000 and 600,000,000 (tag 54 absent, split note set) (LSE-5).
- [ ] `packages/core/src/vietqr/roundtrip.test.ts` renders a payload to PNG with `qrcode`, reads it back with `jsQR`, and cross-checks fields with `vietnam-qr-pay` as a dev dependency (LSE-5).
- [ ] Run `pnpm check`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no VietQR section, so the lane opens `/dev/core` at 390x844, light, on both sides. Save `p3-05-devcore-regression.png`. Pass when the schedule and allocation sections read the same on both sides and the head's VietQR section has no `lệch` row.
- [ ] Lane 2. Read the canonical invoice QR at 1440x900, dark. Save `p3-05-canonical.png`. Pass when the decoded amount is `15.000.000 ₫`, the purpose is `ESTA 7K2QX9MP`, tag 01 is `12` and `Đọc lại từ ảnh` matches.
- [ ] Lane 3. Read the NAPAS §6.3.3 vector row at 390x844, dark. Save `p3-05-napas-vector.png`. Pass when the re-encoded payload equals the published string and the row reads `khớp`.
- [ ] Lane 4. Read the no-amount example at 1440x900, light. Save `p3-05-no-amount.png`. Pass when tag 01 is `11` and no tag 54 appears in the payload.
- [ ] Lane 5. Read the 600,000,000 đồng example at 390x844, light. Save `p3-05-cap.png`. Pass when the payload has no tag 54, the amount still shows as `600.000.000 ₫`, and the split note text is present.
- [ ] Lane 6. Read the 499,999,999 đồng example at 1440x900, dark. Save `p3-05-below-cap.png`. Pass when tag 54 reads `499999999`.
- [ ] Lane 7. Read the malformed samples at 390x844, dark. Save `p3-05-malformed.png`. Pass when both rows show a decode refusal naming the CRC or length fault.
- [ ] Lane 8. Read the zero-padded CRC example at 1440x900, light. Save `p3-05-crc-pad.png`. Pass when the CRC has four characters with a leading `0` and the row reads `khớp`.
- [ ] Lane 9. Read the long-purpose refusal example at 390x844, light. Save `p3-05-purpose-limit.png`. Pass when the encoder refusal names the 25-character limit.
- [ ] Lane 10. Switch to English, text scale 130%, dark, at 390x844, and read the QR for the Phòng 5 style overdue amount example. Save `p3-05-seed10.png`. Pass when the QR fits the viewport without overflow, the labels are English, and `Đọc lại từ ảnh` shows its English label with a match.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Encode plus decode time per payload from `vietqr.bench.ts`, and initial JS gzipped for `/dev/core` on a production build with `ESTA_ENV=test`.
- [ ] Probe. Run the bench 5 times at head, and build once per side reading the route size table.
- [ ] Baseline. Trunk has no VietQR module, so record that and take the head bench as the first baseline. Trunk produces the `/dev/core` size.
- [ ] Rule. Fail when encode plus decode exceeds 0.2 ms per payload, or when `/dev/core` initial JS grows by more than 30 KB gzipped against trunk. `qrcode` and `jsQR` load only in the VietQR section.

**Review gate.** None. P3-05 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Parse bank statements and match rows to invoices (P3-06)

**Depends on.** P3-05, the parent, and P3-01 for seeded invoices and memo codes.

**Files.**

- [ ] Create `packages/core/src/matching/amount.ts`, `date.ts`, `memo.ts`, `layouts.ts`, `decode.ts`, `match.ts` and `index.ts` under `packages/core/src/matching/`, with `.test.ts` files, `match.property.test.ts` and `match.bench.ts`.
- [ ] Create `fixtures/statements/generate.ts`, `fixtures/statements/layout-a.csv`, `fixtures/statements/layout-b.xlsx`, `fixtures/statements/layout-c.csv`, `fixtures/statements/invoices.json` and `fixtures/statements/<layout>.golden.json` for each layout.
- [ ] Create `apps/web/src/app/dev/core/sections/MatchingSection.tsx` and register it on `/dev/core`.

**Build.**

- [ ] Implement `parseStatementAmount(text)` in `amount.ts` for `1.500.000`, `1,500,000`, `1500000.00`, signed values and separate credit and debit columns. It returns `Vnd` or a typed refusal for fractional đồng.
- [ ] Implement `parseStatementDate(text)` in `date.ts` for `dd/MM/yyyy`, `dd/MM/yyyy HH:mm:ss` and `yyyy-MM-dd`, returning `IsoDate`.
- [ ] Describe the three layouts as data in `layouts.ts` (header row, column roles, amount style, date style). Implement `decodeStatementFile(bytes, mime)` in `decode.ts` with `papaparse` for CSV and `read-excel-file` for XLSX, returning rows of strings. It does no IO.
- [ ] Implement `findMemoCodes(description, issuedCodes)` in `memo.ts` per S4 (`spikes/s4-vietqr/src/memo.ts`). Uppercase, strip non-alphanumerics, check every `ESTA` occurrence, and keep a following 8-character candidate only when it is in `issuedCodes`. So `FIESTA` text never matches, and `CAFEFIESTAESTA7K2QX9MP` still finds `7K2QX9MP`.
- [ ] Implement `matchRows(rows, { invoices, tenants, issuedCodes })` in `match.ts`. A credit row with a memo code is `memo_match`. A row whose amount equals the outstanding amount of exactly one issued invoice, whose tenant's unaccented name appears in the description, and whose date is within 10 days of the due date is `suggested`. Two or more candidates leave the row `unmatched`. Debit rows are `ignored`. Each row gets `rowFingerprint(row)`, a SHA-256 over date, amount, bank reference and normalized description (LSE-8).
- [ ] Generate the three fixtures with `fixtures/statements/generate.ts` from the `full` seed's household `Gia đình Demo` invoices, exported to `invoices.json`, with a fixed RNG. It takes `--household N` to write the same statement for lane household N, whose memo codes differ. Each fixture holds memo rows with bank noise and deleted spaces, a `FIESTA` row, one suggested row, one ambiguous row, debit rows and one fractional amount.
- [ ] Add a `/dev/core` matching section that parses each fixture and shows match status beside the golden result.

**You see.**

- [ ] `/dev/core` shows all three fixtures with every row's status equal to its golden status, and the `FIESTA` row as `unmatched`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `amount.test.ts` and `date.test.ts` gain every DOMAIN-VN §9 statement example and the fractional refusal (FND-4).
- [ ] `memo.test.ts` gains the DOMAIN-VN §9 example `MBVCB.1234567.ESTA7K2QX9MP.CT TU 0903...`, a `FIESTA` false positive, two `ESTA` occurrences where only the second is issued, and a code that is not issued (LSE-8).
- [ ] `match.test.ts` compares each fixture with its `golden.json` exactly (LSE-8). `match.property.test.ts` uses fast-check with a fixed seed and 500 runs to prove that matching is deterministic, that a `memo_match` invoice always carries an issued code, and that the same rows always produce the same fingerprints.
- [ ] Run `pnpm check`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no matching section, so the lane opens `/dev/core` at 390x844, light, on both sides. Save `p3-06-devcore-regression.png`. Pass when the VietQR section reads the same on both sides and the head's matching section has no `lệch` row.
- [ ] Lane 2. Read layout A at 1440x900, dark. Save `p3-06-layout-a.png`. Pass when every memo row is `memo_match` with its invoice number and the counts equal `layout-a.golden.json`.
- [ ] Lane 3. Read layout B with credit and debit columns at 390x844, dark. Save `p3-06-layout-b.png`. Pass when debit rows are `ignored` and the rest equal the golden file.
- [ ] Lane 4. Read layout C with `yyyy-MM-dd` dates at 1440x900, light. Save `p3-06-layout-c.png`. Pass when dates render as `dd/MM/yyyy` and statuses equal the golden file.
- [ ] Lane 5. Read the `FIESTA` row at 390x844, light. Save `p3-06-fiesta.png`. Pass when it is `unmatched` and the row with `FIESTAESTA` plus an issued code is `memo_match`.
- [ ] Lane 6. Read the suggested row at 1440x900, dark. Save `p3-06-suggested.png`. Pass when it is `suggested` with one invoice and the tenant name highlighted.
- [ ] Lane 7. Read the ambiguous row at 390x844, dark. Save `p3-06-ambiguous.png`. Pass when it is `unmatched` and lists two candidate invoices.
- [ ] Lane 8. Read the fractional amount row at 1440x900, light. Save `p3-06-fractional.png`. Pass when the row shows the fractional refusal and is excluded from matching.
- [ ] Lane 9. Read the fingerprint column for layout A twice after a page reload at 390x844, light. Save `p3-06-fingerprint.png`. Pass when the fingerprints are identical across the reload.
- [ ] Lane 10. Switch to English, text scale 130%, dark, at 390x844, and find the Dĩ An rows in layout A. Save `p3-06-seed10.png`. Pass when the Phòng 5 rows are visible with English status labels and nothing overflows horizontally.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `matchRows` time for a 1,000-row statement against 500 issued invoices from `match.bench.ts`, and `decodeStatementFile` time for `layout-b.xlsx`.
- [ ] Probe. Run the bench 5 times at head.
- [ ] Baseline. Trunk has no matching module, so record that and take the head values as the first baseline.
- [ ] Rule. Fail when `matchRows` exceeds 50 ms or the XLSX decode exceeds 100 ms at the median.

**Review gate.** None. P3-06 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Add tenants and create and activate leases (P3-07)

**Depends on.** P3-06, the parent, P3-04 for `runInvoicing`, and P1-08 for the `Cho thuê` tab.

**Files.**

- [ ] Create `apps/web/src/app/(app)/properties/[propertyId]/leases/new/page.tsx`.
- [ ] Create `apps/web/src/components/leases/LeaseForm.tsx`, `TenantQuickAdd.tsx` and `ActivateLeaseDialog.tsx`.
- [ ] Create `apps/web/src/server/actions/leases.ts` and `apps/web/src/server/actions/leases.integration.test.ts`.
- [ ] Create `packages/core/src/lease/defaults.ts`, `packages/core/src/lease/defaults.test.ts`, `packages/core/src/lease/monthlyRent.ts`, `packages/core/src/lease/fromExtraction.ts` and `packages/core/src/lease/fromExtraction.test.ts`.
- [ ] Edit the P2-05 document view to add the lease entry point, and extend `supabase/seed/generator/leasing.ts`.
- [ ] Edit the units list on the `Cho thuê` tab from P1-08 and the monthly rent column of the properties list from P1-04.
- [ ] Create `e2e/leases.spec.ts`. Edit `docs/spec/DOMAIN-VN.md` §7 and `docs/plan/STATUS.md`.

**Build.**

- [ ] Export `LEASE_DEFAULTS` from `packages/core/src/lease/defaults.ts` as a table keyed by unit kind per DOMAIN-VN §7. A `room` gets a 1-month cycle, a deposit of 1 month and `metered_by_owner`. An apartment gets 1 month and 2 months. A `whole` house or `shop` gets 3 months and 2 months. Every default has `due_offset_days` 0 and `calendar_month`.
- [ ] Build `TenantQuickAdd` with name and phone only. `createTenant` stores a party tagged `tenant` with the phone from `normalizePhone` (LSE-1).
- [ ] Build `LeaseForm` with unit, tenant, start and end dates, rent through the money input, cycle, anchor, proration, deposit, escalation, utilities mode, tax payer and notice days. `createLease` saves a `draft` under the session client after zod parsing.
- [ ] Build `ActivateLeaseDialog` asking `Đã thu tiền đến hết ngày` with an optional date and `Đã nhận tiền cọc` with the deposit amount. `activateLease` sets `paid_through_date`, moves the lease to `active` through `transitionLease`, writes a `received` deposit entry when ticked, then calls `runInvoicing` with the session client and the Clock's date (LSE-2, LSE-3).
- [ ] Prefill the form from an accepted `lease_v1` extraction. A `lease_contract` document whose latest extraction is `accepted` shows `Tạo hợp đồng thuê từ tài liệu này`, which opens `/properties/[propertyId]/leases/new?fromDocument=<id>`. `leaseFieldsFromExtraction(acceptedFields)` in `fromExtraction.ts` parses `document_extractions.accepted_fields` with the `lease_v1` zod schema from P2-03 and maps tenant name and phone, dates, rent, cycle and deposit to form defaults. Each prefilled field carries the note `Từ hợp đồng đã quét`. Fields the user did not accept stay empty. `createLease` then sets `documents.lease_id` on the source document.
- [ ] Seed one synthetic `lease_contract` document for `di-an` Phòng 8 with an `accepted` `lease_v1` extraction in every household, so the prefill has a deterministic starting point. It has no `expires_on` and needs no review, so SPEC §9.3 facts hold.
- [ ] Map `ESTA_UNIT_HAS_LEASES` and `ESTA_WHOLE_UNIT_LEASED` from P3-01 and every activation refusal to Vietnamese messages in `vi.json` and `en.json`.
- [ ] Show each unit's active lease, tenant and status mark on the `Cho thuê` tab with `Thêm hợp đồng` on units without one.
- [ ] Implement `currentMonthlyRent(lease, amendments, asOf)` in `monthlyRent.ts` from the schedule and replace the Phase 1 rent placeholder on the properties list with the sum over active leases.
- [ ] Confirm the DOMAIN-VN §7 `[verify]` rows on notarization and temporary residence registration from thuvienphapluat.vn or luatvietnam.vn and record the source, or list them in `docs/plan/STATUS.md`. The form requires neither.

**You see.**

- [ ] Activating a lease that started `2026-08-01` with `Đã thu tiền đến hết ngày` `30/09/2026` shows the toast `Đã kích hoạt hợp đồng. Hóa đơn tháng 10 đã phát hành.` and an issued invoice due `01/10/2026` exists.
- [ ] The `di-an` row on the properties list shows the monthly rent of its six active leases in place of the placeholder.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/lease/fromExtraction.test.ts` covers a full accepted extraction, a partial one where unaccepted fields stay empty, and a payload that fails `lease_v1` parsing and yields no defaults.
- [ ] `packages/core/src/lease/defaults.test.ts` covers each unit kind. `monthlyRent` tests cover quarterly and annual leases and an escalated period.
- [ ] `apps/web/src/server/actions/leases.integration.test.ts` runs the LSE-3 canonical activation and asserts one issued invoice for October due `2026-10-01`, a second activation call that inserts nothing, and a refused activation without rent (LSE-2, LSE-3).
- [ ] `e2e/leases.spec.ts` covers quick-add with phone normalization, create from the seeded lease contract, activate and the unit tab update at 390 and 1440. Run `pnpm check`, `pnpm db:test` and `pnpm e2e e2e/leases.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/leases.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk lacks lease creation because the gated Phase 3 PRs land in the phase batch, so the lane opens the `di-an` `Cho thuê` tab as `me.lane1@demo.esta.test` at 390x844, light, on both sides and gates the head's lease marks. Save `p3-07-rent-tab-regression.png`. Pass when both sides list `Phòng 1` to `Phòng 8` and the head shows tenants on Phòng 1 to 6 and `Thêm hợp đồng` on Phòng 7 and 8.
- [ ] Lane 2. As `me.lane2@demo.esta.test` at 390x844, light, add a lease on `di-an` Phòng 8 with a quick-added tenant `Lê Văn Demo`, phone `0903 123 456`, start `07/10/2026`, rent `3tr5`, and activate with no paid-through date. Save `p3-07-new-room-lease.png`. Pass when Phòng 8 shows `Lê Văn Demo` with an active mark and Studio shows an issued invoice for `2026-10-07` to `2026-11-06` with a `3500000` rent line.
- [ ] Lane 3. As `ryan.lane3@demo.esta.test` at 1440x900, dark, add a quarterly lease on `bien-hoa` starting `01/08/2026` with a calendar anchor and activate with `Đã thu tiền đến hết ngày` `30/09/2026`. Save `p3-07-lse3.png`. Pass when the toast reads `Đã kích hoạt hợp đồng. Hóa đơn tháng 10 đã phát hành.` and Studio shows one issued invoice for the period starting `2026-10-01` due `2026-10-01`.
- [ ] Lane 4. As `me.lane4@demo.esta.test` at 390x844, dark, open the new lease form on `di-an` Phòng 8, then on `bien-hoa`. Save `p3-07-defaults.png`. Pass when Phòng 8 prefills `1 tháng` and `Điện nước theo đồng hồ`, and `bien-hoa` prefills `3 tháng`.
- [ ] Lane 5. As `ryan.lane5@demo.esta.test` at 1440x900, light, save a draft without rent and press `Kích hoạt`. Save `p3-07-activate-refused.png`. Pass when the dialog shows the Vietnamese refusal naming the missing rent and the lease stays `Nháp`.
- [ ] Lane 6. As `me.lane6@demo.esta.test` at 390x844, light, open the seeded Phòng 8 lease contract in `Tài liệu`, tap `Tạo hợp đồng thuê từ tài liệu này`, and save. Save `p3-07-from-extraction.png`. Pass when tenant, rent, start date and deposit equal the extraction's `accepted_fields` in Studio, each carries `Từ hợp đồng đã quét`, and the document's `lease_id` equals the new lease's id.
- [ ] Lane 7. As `ryan.lane7@demo.esta.test` at 1440x900, dark, open the properties list. Save `p3-07-list-rent.png`. Pass when every rental property shows a monthly rent figure, `bien-hoa` shows none, and the `di-an` figure equals the sum Studio computes for its six active leases.
- [ ] Lane 8. As `me.lane8@demo.esta.test` at 390x844, dark, save a lease on Phòng 7 as draft without activating. Save `p3-07-draft.png`. Pass when Phòng 7 shows the `Nháp` mark and Studio shows no invoice for that lease.
- [ ] Lane 9. As `ryan.lane9@demo.esta.test` at 1440x900, light, try to add a `Phòng` unit to `thu-duc`. Save `p3-07-subdivide-refused.png`. Pass when the form shows `Không thể chia nhỏ tài sản khi đang cho thuê nguyên căn.` and no unit is added.
- [ ] Lane 10. As `me.lane10@demo.esta.test` at 390x844, English, text scale 130%, dark, open the `di-an` rent tab and find which rooms are overdue, then start a new lease on Phòng 8. Save `p3-07-seed10.png`. Pass when Phòng 5's row carries the overdue mark, the form fields stack without clipping, and every label is English.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS for the new lease route and the properties list, and initial route JS gzipped, on a production build (`pnpm build && pnpm start`) with the full seed. Also `activateLease` server time.
- [ ] Probe. 5 interleaved Lighthouse runs per side on the properties list, 5 runs at head on the new lease route, and 5 timed activations at head.
- [ ] Baseline. Trunk produces the properties list values. Trunk has no lease route, so the head route gets the absolute budget.
- [ ] Rule. Fail when any route exceeds LCP 2.5 s, TBT 200 ms, CLS 0.05 or 200 KB initial JS (SPEC §7.2), when the properties list LCP regresses by more than 10% against trunk, or when activation exceeds 1.5 s.

**Review gate.** The operator reviews before merge.

- [ ] Copy each lane screenshot to `~/.claude/orchestrate/esta/media/p3-07/p3-07-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of quick-adding a tenant and activating the LSE-3 lease at 390x844, saved as `~/.claude/orchestrate/esta/media/p3-07/p3-07-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Show lease detail and amend, terminate and renew leases (P3-08)

**Depends on.** P3-07, the parent, and P2-05 for lease documents.

**Files.**

- [ ] Create `apps/web/src/app/(app)/leases/[leaseId]/page.tsx`.
- [ ] Create `apps/web/src/components/leases/LeaseTerms.tsx`, `PeriodTimeline.tsx`, `DepositLedger.tsx`, `AmendLeaseSheet.tsx`, `TerminateLeaseDialog.tsx` and `RenewLeaseSheet.tsx`.
- [ ] Edit `apps/web/src/server/actions/leases.ts` and `leases.integration.test.ts`.
- [ ] Create `e2e/lease-detail.spec.ts`.

**Build.**

- [ ] Run `/impeccable shape` for Lease detail and record the confirmed brief in the PR body before building.
- [ ] Build `LeaseTerms` with tenant, unit, rent, cycle, deposit, escalation, utilities mode and tax payer, showing `Bên thuê nộp thay` for `tenant_withholds`.
- [ ] Build `PeriodTimeline` from `generateSchedule` joined to `invoice_balances`. Each period shows dates, amount and a status mark (`Đã thu`, `Thu một phần`, `Quá hạn 12 ngày`, `Chưa đến hạn`, `Nháp`, `Đã thu trước`).
- [ ] Build `DepositLedger` from `deriveDepositLedger` with the held balance, and a documents list of `documents` with this `lease_id` with the empty state action `Tải hợp đồng lên`.
- [ ] Build `AmendLeaseSheet` offering only future period starts from `validateAmendment`. `amendLease` writes `lease_amendments`, deletes drafts from the effective start, and calls `runInvoicing`. Issued invoices never change (LSE-2).
- [ ] Build `TerminateLeaseDialog` with date and reason and the confirm text `Kết thúc hợp đồng Phòng 3 từ ngày 31/10/2026?` naming the unit and date. `terminateLease` moves the lease to `terminated` and deletes drafts whose period starts after the date.
- [ ] Build `RenewLeaseSheet` with an increase in percent and a live preview rounded half up to 100.000 ₫. `renewLease` creates and activates a new lease starting the day after the old end, linked by `renewal_of_lease_id`, and calls `runInvoicing` (SPEC §9.4 seed 7).
- [ ] Run `/impeccable harden` on the screen for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.

**You see.**

- [ ] The Dĩ An Phòng 5 lease detail shows the September period with `Quá hạn 12 ngày` and the October period with `Chưa đến hạn`.
- [ ] Renewing `thu-duc` with `5` shows a new lease from `02/11/2026` whose rent is the old rent times 1.05 rounded to 100.000 ₫.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `leases.integration.test.ts` gains an amendment that leaves every issued invoice byte-identical, a termination that removes later drafts only, a renewal linked to its source, and a terminate refused on an `ended` lease (LSE-2).
- [ ] `e2e/lease-detail.spec.ts` covers the timeline, amend, terminate and renew at 390 and 1440. Run `pnpm check`, `pnpm db:test` and `pnpm e2e e2e/lease-detail.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/lease-detail.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk lacks lease detail because the gated Phase 3 PRs land in the phase batch, so the lane opens the `di-an` `Cho thuê` tab as `me.lane1@demo.esta.test` at 390x844, light, on both sides and gates the head's link into the Phòng 5 lease. Save `p3-08-lease-regression.png`. Pass when both sides list the eight units and the head's Phòng 5 lease detail shows `Quá hạn 12 ngày` on the September period.
- [ ] Lane 2. As `me.lane2@demo.esta.test` at 390x844, light, open the Dĩ An Phòng 5 lease. Save `p3-08-phong5.png`. Pass when the September period shows `Quá hạn 12 ngày`, the October period due `25/10/2026` shows `Chưa đến hạn`, and earlier periods show `Đã thu`.
- [ ] Lane 3. SPEC §9.4 seed 7. As `ryan.lane3@demo.esta.test` at 1440x900, dark, renew the `thu-duc` lease with `5`. Save `p3-08-renew.png`. Pass when the new lease starts `02/11/2026`, Studio shows `renewal_of_lease_id` set to the old lease, and its `rent_vnd` equals the old rent times 1.05 rounded half up to 100,000.
- [ ] Lane 4. As `me.lane4@demo.esta.test` at 390x844, dark, terminate the Phòng 3 lease from `31/10/2026` with a reason. Save `p3-08-terminate.png`. Pass when the dialog reads `Kết thúc hợp đồng Phòng 3 từ ngày 31/10/2026?`, the lease shows the terminated mark, and Studio shows the issued October invoice unchanged.
- [ ] Lane 5. As `ryan.lane5@demo.esta.test` at 1440x900, light, amend the Phòng 2 rent from `25/11/2026`. Save `p3-08-amend.png`. Pass when the timeline shows the new rent from `25/11/2026`, and Studio's `total_vnd` for the issued `2026-10-25` invoice equals its value before the change.
- [ ] Lane 6. As `me.lane6@demo.esta.test` at 390x844, light, open the amendment sheet on Phòng 2. Save `p3-08-amend-starts.png`. Pass when the start picker lists only period starts after `07/10/2026`.
- [ ] Lane 7. As `ryan.lane7@demo.esta.test` at 1440x900, dark, open the ended Phòng 7 lease. Save `p3-08-phong7-deposit.png`. Pass when the deposit ledger shows one `received` row and a held balance equal to it, and no terminate action is offered.
- [ ] Lane 8. As `me.lane8@demo.esta.test` at 390x844, dark, open the `q7` lease. Save `p3-08-q7.png`. Pass when periods through `31/12/2026` read `Đã thu trước` and the terms show `Bên thuê nộp thay`.
- [ ] Lane 9. As `ryan.lane9@demo.esta.test` at 1440x900, light, open the new lease from lane 2's scenario or any lease with no documents. Save `p3-08-docs-empty.png`. Pass when the documents block shows one action `Tải hợp đồng lên`.
- [ ] Lane 10. As `me.lane10@demo.esta.test` at 390x844, English, text scale 130%, dark, open the Phòng 5 lease to find what is overdue. Save `p3-08-seed10.png`. Pass when the September period reads overdue 12 days in English and every timeline row wraps without clipping.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS, and initial route JS gzipped, for the Phòng 5 lease detail on a production build with the full seed.
- [ ] Probe. 5 runs at head, and 5 interleaved runs per side on the property detail route the lease is reached from.
- [ ] Baseline. Trunk produces the property detail values. Trunk has no lease detail route, so the head route gets the absolute budget.
- [ ] Rule. Fail when lease detail exceeds LCP 2.5 s, TBT 200 ms, CLS 0.05 or 200 KB initial JS (SPEC §7.2), or when property detail LCP regresses by more than 10% against trunk.

**Review gate.** The operator reviews before merge.

- [ ] Copy each lane screenshot to `~/.claude/orchestrate/esta/media/p3-08/p3-08-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of renewing the `thu-duc` lease by 5% and terminating Phòng 3, saved as `~/.claude/orchestrate/esta/media/p3-08/p3-08-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Build the collections board for a chosen month (P3-09)

**Depends on.** P3-08, the parent, and P3-03 for payment status.

**Files.**

- [ ] Create `supabase/migrations/20261007030700_collections.sql` with `collection_candidates(p_month date)` and `supabase/tests/collections.test.sql`.
- [ ] Create `packages/core/src/collections/group.ts` and `packages/core/src/collections/group.test.ts`.
- [ ] Create `apps/web/src/app/(app)/collections/page.tsx`, replacing the P0-14 placeholder.
- [ ] Create `apps/web/src/components/collections/CollectionsBoard.tsx`, `MonthSelector.tsx` and `rowActions.ts`.
- [ ] Create `e2e/collections.spec.ts`.

**Build.**

- [ ] Run `/impeccable shape` for Thu tiền and record the confirmed brief in the PR body before building.
- [ ] Write `collection_candidates(p_month)` as a `security invoker` SQL function returning issued invoices whose due date falls in `p_month`, plus every earlier issued invoice with `outstanding_vnd > 0`, joined to unit, tenant and `invoice_balances`. It takes no as-of date because it does not depend on one.
- [ ] Implement `groupCollections(rows, month, asOf)` in `group.ts`. `Đã thu` holds `paid` and `overpaid`. Unpaid or partial rows go to `Quá hạn` with days when due before `asOf`, to `Đến hạn` when due on `asOf`, and to `Chưa đến hạn` otherwise. A row from an earlier month carries `từ tháng 9` with its month (LSE-10).
- [ ] Build `CollectionsBoard` with the month selector defaulting to the Clock's month through `?month=2026-10`, the four groups in the order `Quá hạn`, `Đến hạn`, `Chưa đến hạn`, `Đã thu`, a count and total per group, and rows with unit, tenant, outstanding amount and due date or `quá hạn 12 ngày`. Rows use the P0-13 collections row.
- [ ] Define `COLLECTION_ROW_ACTIONS` in `rowActions.ts` as a registry. This PR registers `Xem hợp đồng`. P3-10, P3-11 and P3-13 register `Ghi nhận`, `Mã QR` and `Nhắc qua Zalo`.
- [ ] Show the empty state `Không có hóa đơn nào trong tháng 12/2024.` for a month with no rows.
- [ ] Run `/impeccable harden` on the screen for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.

**You see.**

- [ ] `/collections` on the full seed at `2026-10-07` shows `Quá hạn` with Dĩ An `Phòng 5`, `quá hạn 12 ngày` and `từ tháng 9`, and `Chưa đến hạn` with six Dĩ An rows due `25/10/2026` (LSE-10).

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/collections/group.test.ts` gains the full-seed October board, the September board, a due-today row, a partial row overdue, and a carry-over from two months back (LSE-10).
- [ ] `supabase/tests/collections.test.sql` proves `collection_candidates` excludes drafts and voided invoices and returns no other household's rows.
- [ ] `e2e/collections.spec.ts` asserts the October board at 390 and 1440. Run `pnpm check`, `pnpm db:test` and `pnpm e2e e2e/collections.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/collections.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk serves the P0-14 `Thu tiền` placeholder, so the lane opens `/collections` as `me.lane1@demo.esta.test` at 390x844, light, on both sides and gates the head's board. Save `p3-09-collections-regression.png`. Pass when trunk shows the placeholder without console errors and the head shows `Phòng 5` under `Quá hạn` with `quá hạn 12 ngày`.
- [ ] Lane 2. SPEC §9.4 seed 1, first half. As `me.lane2@demo.esta.test` at 390x844, light, find which Dĩ An rooms are overdue for October. Save `p3-09-october.png`. Pass when `Quá hạn` holds only `Phòng 5` with `từ tháng 9`, and `Chưa đến hạn` holds six Dĩ An rows due `25/10/2026`.
- [ ] Lane 3. As `ryan.lane3@demo.esta.test` at 1440x900, dark, choose September 2026. Save `p3-09-september.png`. Pass when `Phòng 5` is under `Quá hạn` without a carry marker and the other five Dĩ An rows are under `Đã thu`.
- [ ] Lane 4. Set the clock to `2026-10-25T09:00:00+07:00` and, as `me.lane4@demo.esta.test` at 390x844, dark, open October. Save `p3-09-due-today.png`. Pass when the six Dĩ An rows due `25/10/2026` are under `Đến hạn` and `Phòng 5` reads `quá hạn 30 ngày`.
- [ ] Lane 5. As `ryan.lane5@demo.esta.test` at 1440x900, light, open the month in which the two-transfer tenant last paid. Save `p3-09-two-transfers.png`. Pass when that tenant's row is under `Đã thu` with the full amount.
- [ ] Lane 6. As `me.lane6@demo.esta.test` at 390x844, light, tap `Xem hợp đồng` on `Phòng 5`. Save `p3-09-to-lease.png`. Pass when the Phòng 5 lease detail opens with its September period marked `Quá hạn 12 ngày`.
- [ ] Lane 7. As `ryan.lane7@demo.esta.test` at 1440x900, dark, with compact density, scroll the board. Save `p3-09-desktop-compact.png`. Pass when the table header stays visible, amounts are right-aligned with tabular figures, and every status shows a shape and a word.
- [ ] Lane 8. As `me.lane8@demo.esta.test` at 390x844, dark, choose December 2024. Save `p3-09-empty.png`. Pass when the board shows `Không có hóa đơn nào trong tháng 12/2024.` and nothing else.
- [ ] Lane 9. As `ryan.lane9@demo.esta.test` at 1440x900, light, read the `Chưa đến hạn` total for October. Save `p3-09-group-total.png`. Pass when it equals the Studio sum of `outstanding_vnd` for the six invoices due `2026-10-25`.
- [ ] Lane 10. SPEC §9.4 seed 10 on seed 1. As `me.lane10@demo.esta.test` at 390x844, English, text scale 130%, dark, find which Dĩ An rooms are overdue. Save `p3-09-seed10.png`. Pass when `Phòng 5` sits in the English overdue group with 12 days, and no row text truncates without wrapping.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS, and initial route JS gzipped, for `/collections` on a production build (`pnpm build && pnpm start`) with the full seed. Also `EXPLAIN (ANALYZE)` time of `collection_candidates('2026-10-01')`.
- [ ] Probe. 5 interleaved Lighthouse runs per side, and 5 query runs at head.
- [ ] Baseline. Trunk produces the values for the placeholder route. The board is new work, so it gets the SPEC §7.2 absolute budget and no ratio against the placeholder.
- [ ] Rule. Fail when head `/collections` exceeds LCP 2.5 s, TBT 200 ms, CLS 0.05 or 200 KB initial JS (SPEC §7.2), or when the query exceeds 50 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy each lane screenshot to `~/.claude/orchestrate/esta/media/p3-09/p3-09-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of finding Phòng 5 overdue in October and switching to September at 390x844, saved as `~/.claude/orchestrate/esta/media/p3-09/p3-09-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Record payments from a sheet in three taps (P3-10)

**Depends on.** P3-09, the parent, and P3-03 for allocation.

**Files.**

- [ ] Create `supabase/migrations/20261007030800_record_payment.sql` with `record_payment(p_payment jsonb, p_allocations jsonb)` and `apply_deposit(p_lease_id uuid, p_invoice_id uuid, p_amount_vnd bigint, p_on_date date, p_idempotency_key uuid)`, and `supabase/tests/record_payment.test.sql`.
- [ ] Create `apps/web/src/components/payments/RecordPaymentSheet.tsx` and `apps/web/src/components/leases/DepositActions.tsx`.
- [ ] Create `apps/web/src/server/actions/payments.ts`, `apps/web/src/server/actions/deposits.ts` and `apps/web/src/server/actions/payments.integration.test.ts`.
- [ ] Edit `apps/web/src/components/collections/rowActions.ts` and `apps/web/src/components/leases/DepositLedger.tsx`.
- [ ] Create `e2e/record-payment.spec.ts`.

**Build.**

- [ ] Run `/impeccable shape` for the Record payment sheet and record the confirmed brief in the PR body before building.
- [ ] Register `Ghi nhận` in `COLLECTION_ROW_ACTIONS`. It opens `RecordPaymentSheet` with the amount prefilled to the outstanding total of the row's invoice and every older unpaid invoice of the same lease, in a large money input that accepts `3tr5` with the parsed amount shown live.
- [ ] Add the method toggle `Tiền mặt` and `Chuyển khoản`, the date defaulting to the Clock's date as `07/10/2026`, and `Lưu`. The path from the row is `Ghi nhận`, `Tiền mặt`, `Lưu`, three taps (SPEC §9.4 seed 2).
- [ ] Add `Chọn hóa đơn` for a manual allocation override, and an inline note when the amount exceeds the outstanding total that names the tenant credit.
- [ ] Implement `recordPayment` in `payments.ts`. It parses input with zod, computes allocations with `allocatePayment`, and calls `record_payment` with a client-generated `idempotency_key`. The SQL inserts the payment and its allocations in one transaction, and a repeated key returns the existing payment (SPEC §7.4).
- [ ] Show the toast `Đã ghi nhận 3.500.000 ₫ từ Phòng 3. Hoàn tác`. `undoPayment(paymentId)` deletes the payment and its allocations under the session client. The audit log keeps both rows.
- [ ] Build `DepositActions` on the lease detail for `Nhận cọc`, `Trừ cọc vào hóa đơn`, `Khấu trừ cọc` and `Hoàn cọc`. Applying a deposit calls `apply_deposit`, which creates a `deposit` payment, its allocation and the `applied` entry in one transaction. Every action checks `deriveDepositLedger` first (LSE-9).
- [ ] Run `/impeccable harden` on the screen for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.

**You see.**

- [ ] From the October board, `Ghi nhận` on `Phòng 3`, `Tiền mặt`, `Lưu` moves the row to `Đã thu` and shows `Đã ghi nhận 3.500.000 ₫ từ Phòng 3. Hoàn tác` with the room's real amount.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `supabase/tests/record_payment.test.sql` proves that `record_payment` refuses allocations above the payment amount, writes nothing on a failed allocation, returns the same payment for a repeated key, and refuses another household's invoice. It also proves `apply_deposit` refuses an amount above the held balance (LSE-7, LSE-9).
- [ ] `payments.integration.test.ts` covers a full cash payment, a partial transfer, an overpayment with credit, undo, and each deposit action (LSE-7, LSE-9).
- [ ] `e2e/record-payment.spec.ts` counts taps from the row to the saved payment and asserts 3. Run `pnpm check`, `pnpm db:test` and `pnpm e2e e2e/record-payment.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/record-payment.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk serves the `Thu tiền` placeholder because the gated board lands in the phase batch, so the lane opens `/collections` as `me.lane1@demo.esta.test` at 390x844, light, on both sides and gates the head's payment on `Phòng 5`. Save `p3-10-payment-regression.png`. Pass when trunk shows the placeholder and the head moves `Phòng 5` to `Đã thu` after `Ghi nhận`, `Tiền mặt`, `Lưu`.
- [ ] Lane 2. SPEC §9.4 seed 2. As `me.lane2@demo.esta.test` at 390x844, light, record a cash payment for `Phòng 5` from the October board with the prefilled amount. Save `p3-10-seed2.png`. Pass when the driver logs exactly 3 taps from the row to the toast, the toast names `Phòng 5`, and Studio shows one `cash` payment equal to the September outstanding amount.
- [ ] Lane 3. Mom test task. As `me.lane3@demo.esta.test` at 390x844, dark, record a cash payment for `Phòng 3`. Save `p3-10-phong3.png`. Pass when the prefilled amount equals Phòng 3's October outstanding amount and the row moves from `Chưa đến hạn` to `Đã thu`.
- [ ] Lane 4. As `ryan.lane4@demo.esta.test` at 1440x900, dark, record a payment for `Phòng 3` and tap `Hoàn tác`. Save `p3-10-undo.png`. Pass when the row returns to `Chưa đến hạn` and Studio shows no remaining payment for that invoice.
- [ ] Lane 5. As `me.lane5@demo.esta.test` at 390x844, light, type `3tr5` for `Phòng 4` with `Chuyển khoản` when the outstanding amount is larger. Save `p3-10-partial.png`. Pass when the field preview reads `3.500.000 ₫` and the row shows `Thu một phần` with the remainder.
- [ ] Lane 6. As `ryan.lane6@demo.esta.test` at 1440x900, light, record more than the outstanding amount for `Phòng 2`. Save `p3-10-overpay.png`. Pass when the sheet names the credit before saving and Studio's allocation equals the outstanding amount with the rest unallocated.
- [ ] Lane 7. As `me.lane7@demo.esta.test` at 390x844, dark, open the ended Phòng 7 lease and tap `Hoàn cọc` for the full held amount. Save `p3-10-refund.png`. Pass when the ledger shows a `refunded` row and the held balance reads `0 ₫`.
- [ ] Lane 8. As `ryan.lane8@demo.esta.test` at 1440x900, dark, apply part of Phòng 5's deposit to its September invoice with `Trừ cọc vào hóa đơn`. Save `p3-10-apply-deposit.png`. Pass when Studio shows a `deposit` payment, its allocation and an `applied` entry with equal amounts, and the held balance drops by that amount.
- [ ] Lane 9. As `me.lane9@demo.esta.test` at 390x844, light, tap `Lưu` twice in quick succession on `Phòng 6`. Save `p3-10-double-tap.png`. Pass when Studio shows exactly one payment for the invoice.
- [ ] Lane 10. SPEC §9.4 seed 10 on seed 2. As `me.lane10@demo.esta.test` at 390x844, English, text scale 130%, dark, record a cash payment for `Phòng 5` in 3 taps. Save `p3-10-seed10.png`. Pass when the sheet's large amount fits the viewport without clipping, the save button stays reachable without scrolling, and the toast reads in English.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS, and initial route JS gzipped, for `/collections` on a production build with the full seed, plus the time from `Lưu` to the toast.
- [ ] Probe. 5 interleaved Lighthouse runs per side, and 5 timed saves at head.
- [ ] Baseline. Trunk produces the placeholder route values. The sheet is new work with an absolute budget.
- [ ] Rule. Fail when head `/collections` exceeds LCP 2.5 s, TBT 200 ms, CLS 0.05 or 200 KB initial JS (SPEC §7.2), or when the save-to-toast median exceeds 1 s.

**Review gate.** The operator reviews before merge.

- [ ] Copy each lane screenshot to `~/.claude/orchestrate/esta/media/p3-10/p3-10-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of seed 2 in three taps and an undo at 390x844, saved as `~/.claude/orchestrate/esta/media/p3-10/p3-10-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Show invoices with VietQR and print or share them (P3-11)

**Depends on.** P3-10, the parent, and P3-05 for `buildInvoiceQr`.

**Files.**

- [ ] Create `apps/web/src/app/(app)/invoices/[invoiceId]/page.tsx` and `apps/web/src/app/(app)/invoices/[invoiceId]/print.css`.
- [ ] Create `apps/web/src/components/invoices/InvoiceView.tsx` and `VoidInvoiceDialog.tsx`, and wire the P0-13 QR sheet.
- [ ] Create `apps/web/src/server/actions/invoices.ts` and `apps/web/src/server/actions/invoices.integration.test.ts`.
- [ ] Create `scripts/decode-qr.ts`.
- [ ] Edit `apps/web/src/components/collections/rowActions.ts`.
- [ ] Create `e2e/invoices.spec.ts`.

**Build.**

- [ ] Build `InvoiceView` with number, period, due date, status, lines, total, allocated and outstanding amounts.
- [ ] Register `Mã QR` in `COLLECTION_ROW_ACTIONS`. It opens the QR sheet for an issued invoice with `buildInvoiceQr` over the default `bank_accounts` row and the outstanding amount, showing the amount, memo `ESTA {memo_code}`, the bank short name from `bank_bins` and the account name (LSE-5).
- [ ] At or above 500,000,000 đồng, show the QR without an amount, the amount in words and figures, and the note `Số tiền từ 500 triệu đồng trở lên. Mã QR không kèm số tiền, hãy chia thành nhiều lần chuyển.` labelled `Giả định` per the P3-05 rule.
- [ ] Add `Lưu ảnh`, which renders the QR with amount and memo to a PNG named `hoa-don-{number}.png` in the browser. `qrcode` loads only when the sheet opens.
- [ ] Add `Phát hành` on drafts through `issueInvoice`, and `Hủy hóa đơn` with a required reason through `voidInvoice`, confirming with `Hủy hóa đơn {number}?`. A voided invoice shows no QR. `planInvoices` treats a voided period as existing, so it is not regenerated.
- [ ] Add an A5 print layout in `print.css` and an `In` button.
- [ ] Write `scripts/decode-qr.ts`, which prints the decoded VietQR fields of a PNG with `jsQR` and `decodeVietQr`.

**You see.**

- [ ] `Mã QR` on `Phòng 5` shows a QR, `ESTA` with the invoice's memo code, the bank short name, the account name and the outstanding amount, and `pnpm tsx scripts/decode-qr.ts` on the saved image prints the same fields.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `invoices.integration.test.ts` covers issuing a draft, refusing to issue twice, voiding with a reason, refusing a void without one, and a voided period that `runInvoicing` does not recreate (LSE-5).
- [ ] `e2e/invoices.spec.ts` decodes the saved QR image and asserts amount, memo and CRC, and asserts the split note at 600,000,000. Run `pnpm check`, `pnpm db:test` and `pnpm e2e e2e/invoices.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/invoices.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no invoice view because the gated Phase 3 PRs land in the phase batch, so the lane opens `/collections` as `me.lane1@demo.esta.test` at 390x844, light, on both sides and gates the head's QR for `Phòng 5`. Save `p3-11-qr-regression.png`. Pass when trunk shows the placeholder and the head QR sheet shows Phòng 5's outstanding amount.
- [ ] Lane 2. As `me.lane2@demo.esta.test` at 390x844, light, open `Mã QR` on `Phòng 5`. Save `p3-11-qr-sheet.png`. Pass when the memo reads `ESTA` plus the `memo_code` Studio shows, and the amount equals `outstanding_vnd`.
- [ ] Lane 3. As `ryan.lane3@demo.esta.test` at 1440x900, dark, tap `Lưu ảnh` on Phòng 5 and run `pnpm tsx scripts/decode-qr.ts` on the download. Save `p3-11-decode.png` of the terminal. Pass when the decoded BIN, account, amount and purpose match the sheet and the CRC check passes.
- [ ] Lane 4. As `me.lane4@demo.esta.test` at 390x844, dark, open the `thu-duc` draft for `01/11/2026` and tap `Phát hành`. Save `p3-11-issue.png`. Pass when the status becomes issued and the QR action appears.
- [ ] Lane 5. As `ryan.lane5@demo.esta.test` at 1440x900, light, void the Phòng 6 October invoice with a reason. Save `p3-11-void.png`. Pass when the dialog reads `Hủy hóa đơn` with the invoice number, the invoice shows `Đã hủy` without a QR, and a following `pnpm cron:run` creates nothing for that period.
- [ ] Lane 6. As `me.lane6@demo.esta.test` at 390x844, light, add an annual lease on `bien-hoa` at `600tr` through the P3-07 form, activate it, and open its QR. Save `p3-11-cap.png`. Pass when the QR sheet shows `600.000.000 ₫`, the split note with `Giả định`, and the decoded payload has no tag 54.
- [ ] Lane 7. As `ryan.lane7@demo.esta.test` at 1440x900, light, open the Phòng 3 October invoice with print media emulated by the driver. Save `p3-11-print.png`. Pass when the page fits one A5 sheet with lines and total and hides navigation.
- [ ] Lane 8. As `me.lane8@demo.esta.test` at 390x844, dark, record `1tr` on `Phòng 4` and open its QR. Save `p3-11-partial-qr.png`. Pass when the QR amount equals the invoice total minus 1,000,000.
- [ ] Lane 9. As `ryan.lane9@demo.esta.test` at 1440x900, dark, open a Dĩ An October invoice. Save `p3-11-lines.png`. Pass when it lists `rent`, `electricity` and `water` lines from the September readings and the total equals their sum in Studio.
- [ ] Lane 10. As `me.lane10@demo.esta.test` at 390x844, English, text scale 130%, dark, find the overdue Dĩ An room and open its QR. Save `p3-11-seed10.png`. Pass when the QR stays fully visible and at least 240 px wide, labels are English, and the memo still reads `ESTA` plus the code.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS, and initial route JS gzipped, for the Phòng 5 invoice route and `/collections` on a production build with the full seed, plus time from `Mã QR` to the rendered QR.
- [ ] Probe. 5 interleaved runs per side on `/collections`, 5 runs at head on the invoice route, and 5 timed QR opens.
- [ ] Baseline. Trunk produces the `/collections` placeholder values. The invoice route is new and gets the absolute budget.
- [ ] Rule. Fail when either head route exceeds LCP 2.5 s, TBT 200 ms, CLS 0.05 or 200 KB initial JS (SPEC §7.2), or when the QR open median exceeds 500 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy each lane screenshot to `~/.claude/orchestrate/esta/media/p3-11/p3-11-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of opening the Phòng 5 QR, saving the image and voiding an invoice, saved as `~/.claude/orchestrate/esta/media/p3-11/p3-11-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Generate A5 receipts as PDF and a Zalo-sized PNG (P3-12)

**Depends on.** P3-11, the parent, and P0-11 for the fonts.

**Files.**

- [ ] Create `apps/web/src/app/api/invoices/[invoiceId]/receipt/route.ts`.
- [ ] Create `apps/web/src/server/receipts/pdf.ts`, `apps/web/src/server/receipts/png.tsx`, `apps/web/src/server/receipts/pdf.test.ts` and `apps/web/src/server/receipts/fonts/` with static Source Sans 3 and Source Serif 4 instances from `spikes/s7-receipt/` on branch `spike/s7-receipt` at `8548686`, with their OFL file.
- [ ] Create `packages/core/src/receipt/model.ts`, `packages/core/src/format/words.ts` and their `.test.ts` files.
- [ ] Edit `apps/web/next.config.ts` and `apps/web/src/components/invoices/InvoiceView.tsx`.
- [ ] Create `scripts/function-size.ts` and `scripts/receipt-text.ts`. Edit `docs/spec/DOMAIN-VN.md` §9.
- [ ] Create `e2e/receipts.spec.ts`.

**Build.**

- [ ] Implement `formatVndWords(vnd)` in `words.ts` and add its rules to DOMAIN-VN §9 as `[app rule]`. It uses `nghìn`, `linh` for a zero tens digit, `mốt` and `lăm` after a tens word, `bốn` never `tư`, and ends with `đồng`.
- [ ] Implement `buildReceiptModel({ household, invoice, lines, tenant, allocations, qr })` in `model.ts`. It NFC-normalizes every string and holds the title `Biên nhận tiền thuê`, the household header from `household_settings.invoicing`, tenant, unit, period, lines, total, total in words, amount received, and the VietQR payload when outstanding is above 0.
- [ ] Render the A5 PDF (419.528 × 595.276 pt) in `pdf.ts` with pdf-lib and @pdf-lib/fontkit using the static instances. Render a 1080 × 1527 px PNG in `png.tsx` with satori and @resvg/resvg-js with `loadSystemFonts: false`.
- [ ] Serve both from the route handler with `runtime = 'nodejs'` and `?format=pdf` or `?format=png`. It reads the invoice with the session client, so another household's id returns 404.
- [ ] Add `satori` to `serverExternalPackages` and the fonts directory to `outputFileTracingIncludes` from `process.cwd()` in `next.config.ts`.
- [ ] Add `Biên nhận PDF` and `Ảnh gửi Zalo` to `InvoiceView`.
- [ ] Write `scripts/function-size.ts`, which reads the route's `.nft.json` after `next build` and prints its traced size, and `scripts/receipt-text.ts`, which prints a PDF's text with pdfjs-dist.

**You see.**

- [ ] `Biên nhận PDF` on a Phòng 3 invoice opens an A5 PDF titled `Biên nhận tiền thuê` with the tenant's full name, the lines, the total and the total in words.
- [ ] `pnpm tsx scripts/function-size.ts` prints the receipt route size below 50 MB.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/format/words.test.ts` gains `15000000` as `Mười lăm triệu đồng`, `3500000` as `Ba triệu năm trăm nghìn đồng`, `21000000` as `Hai mươi mốt triệu đồng`, `1005000` as `Một triệu không trăm linh năm nghìn đồng` and `0` as `Không đồng`.
- [ ] `apps/web/src/server/receipts/pdf.test.ts` extracts text with pdfjs-dist and finds the fixture tenant `Đặng Thị Hường Demo` in NFC (LSE-6). `model.test.ts` covers paid and unpaid invoices.
- [ ] `e2e/receipts.spec.ts` downloads both formats and checks the PDF page size and the PNG dimensions. Run `pnpm check` and `pnpm e2e e2e/receipts.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/receipts.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no receipts because the gated Phase 3 PRs land in the phase batch, so the lane opens `/collections` as `me.lane1@demo.esta.test` at 390x844, light, on both sides and gates the head's Phòng 5 receipt PDF. Save `p3-12-receipt-regression.png`. Pass when trunk shows the placeholder and the head PDF shows `Biên nhận tiền thuê` with Phòng 5's tenant name.
- [ ] Lane 2. As `me.lane2@demo.esta.test` at 390x844, light, open `Biên nhận PDF` for the Phòng 3 October invoice. Save `p3-12-pdf.png`. Pass when the title, tenant name with every diacritic, lines, total and words render with no missing glyph boxes.
- [ ] Lane 3. As `ryan.lane3@demo.esta.test` at 1440x900, dark, open `Ảnh gửi Zalo` for the same invoice. Save `p3-12-png.png`. Pass when the image is 1080 × 1527 px and shows the QR and memo.
- [ ] Lane 4. As `me.lane4@demo.esta.test` at 390x844, dark, open the Phòng 3 receipt and compare its words line with `formatVndWords` of the Studio total. Save `p3-12-words.png`. Pass when both strings are identical.
- [ ] Lane 5. As `ryan.lane5@demo.esta.test` at 1440x900, light, open the receipt for a paid September Dĩ An invoice. Save `p3-12-paid.png`. Pass when it shows the received amount equal to the total and no QR.
- [ ] Lane 6. As `me.lane6@demo.esta.test` at 390x844, light, add a Phòng 8 lease for `Tôn Nữ Thị Phương Hoàng Demo` and open its receipt PNG. Save `p3-12-long-name.png`. Pass when the name wraps inside the margin with no clipping.
- [ ] Lane 7. As `ryan.lane7@demo.esta.test`, download the Phòng 5 PDF and run `pnpm tsx scripts/receipt-text.ts` on it at 1440x900, dark. Save `p3-12-text.png` of the terminal. Pass when the output contains the tenant's name in NFC exactly as Studio stores it (LSE-6).
- [ ] Lane 8. As `me.lane8@demo.esta.test`, request the receipt URL of an invoice id from household 9 at 390x844, dark. Save `p3-12-other-household.png`. Pass when the response is 404 and no PDF downloads.
- [ ] Lane 9. Run `pnpm build` and `pnpm tsx scripts/function-size.ts` at 1440x900, light, in the terminal. Save `p3-12-size.png`. Pass when the receipt route prints below 50 MB uncompressed.
- [ ] Lane 10. As `me.lane10@demo.esta.test` at 390x844, English, text scale 130%, dark, find the overdue Dĩ An room and open its receipt. Save `p3-12-seed10.png`. Pass when the buttons read in English and the receipt itself stays in Vietnamese with the title `Biên nhận tiền thuê`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Receipt route response time for PDF and PNG, cold and warm, on a production build, the traced function size, and `next build` wall time.
- [ ] Probe. 5 warm requests per format at head after one cold request, and `next build` 5 times at trunk and head, interleaved.
- [ ] Baseline. Trunk produces the build time. Trunk has no receipt route, so the route gets an absolute budget from S7 (44 ms PDF and 48 ms PNG warm, 11.56 MB traced).
- [ ] Rule. Fail when a warm median exceeds 500 ms, a cold request exceeds 3 s, the traced size exceeds 50 MB, or head build time exceeds trunk by more than 30 s.

**Review gate.** The operator reviews before merge.

- [ ] Copy each lane screenshot to `~/.claude/orchestrate/esta/media/p3-12/p3-12-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of opening the Phòng 3 receipt PDF and PNG on a phone viewport, saved as `~/.claude/orchestrate/esta/media/p3-12/p3-12-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Draft polite reminders and open Zalo with the tenant's phone (P3-13)

**Depends on.** P3-12, the parent, and P0-04 for `phoneForZaloLink`.

**Files.**

- [ ] Create `packages/core/src/reminder/templates.ts` and `packages/core/src/reminder/templates.test.ts`.
- [ ] Create `supabase/migrations/20261007030900_invoice_share_token.sql` with `invoices.share_token` and `invoice_qr_by_token(p_token text)`, and `supabase/tests/invoice_share_token.test.sql`.
- [ ] Create `apps/web/src/app/q/[token]/route.ts` and `apps/web/src/components/collections/ReminderSheet.tsx`.
- [ ] Edit `apps/web/src/components/collections/rowActions.ts`, `docs/spec/DOMAIN-VN.md` §9 and `docs/plan/STATUS.md`.
- [ ] Create `e2e/reminders.spec.ts`.

**Build.**

- [ ] Export `REMINDER_TEMPLATES` from `templates.ts` keyed by `due_soon`, `due_today` and `overdue`, and `draftReminder({ situation, tenantName, unitLabel, period, amountVnd, overdueDays, qrUrl })`. Each template is polite and neutral, greets `Anh/chị` with the tenant's given name, the last word of the full name, and formats money and dates per DOMAIN-VN §9 (LSE-11).
- [ ] Add `share_token`, 22 base64url characters from 128 random bits, set when an invoice issues and cleared when it is voided. Write `invoice_qr_by_token(p_token)` as `security definer` granted to `anon`, returning only BIN, account number, account name, outstanding amount and memo code of an issued invoice. No service role key enters the web app.
- [ ] Serve `/q/[token]` as a PNG of the invoice QR with amount and memo and nothing about the tenant. An unknown or cleared token returns 404.
- [ ] Register `Nhắc qua Zalo` in `COLLECTION_ROW_ACTIONS`. `ReminderSheet` shows the draft, `Sao chép lời nhắc` copying it to the clipboard, and `Mở Zalo` linking to `https://zalo.me/{phone}` with `phoneForZaloLink`. Without a phone, `Mở Zalo` is disabled with `Chưa có số điện thoại`.
- [ ] Confirm the DOMAIN-VN §9 Zalo link format from Zalo's own documentation and record the source, or label it `Giả định` in the sheet and list it in `docs/plan/STATUS.md`.

**You see.**

- [ ] On the October board, `Nhắc qua Zalo` on `Phòng 5` then `Sao chép lời nhắc` puts a Vietnamese message on the clipboard that names the tenant, `Phòng 5`, the September period, the outstanding amount, `quá hạn 12 ngày` and a `/q/` link.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `templates.test.ts` asserts the exact text of each situation for a fixed input, and that no template contains an exclamation mark (LSE-11).
- [ ] `invoice_share_token.test.sql` proves `anon` gets only the listed columns for an issued token, nothing for a voided or draft invoice, and cannot select `invoices` directly.
- [ ] `e2e/reminders.spec.ts` asserts the copied text with clipboard permissions and the `Mở Zalo` href (LSE-11). Run `pnpm check`, `pnpm db:test` and `pnpm e2e e2e/reminders.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/reminders.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no reminders because the gated Phase 3 PRs land in the phase batch, so the lane runs SPEC §9.4 seed 1 as `me.lane1@demo.esta.test` at 390x844, light, on both sides and gates the head's copied text. Save `p3-13-seed1-regression.png`. Pass when trunk shows the placeholder and the head clipboard holds the `Phòng 5` overdue reminder.
- [ ] Lane 2. SPEC §9.4 seed 1. As `me.lane2@demo.esta.test` at 390x844, light, find the overdue Dĩ An room and copy its reminder. Save `p3-13-copy.png`. Pass when the clipboard text read by the driver equals `draftReminder` for Phòng 5's tenant, amount and `quá hạn 12 ngày`.
- [ ] Lane 3. As `ryan.lane3@demo.esta.test` at 1440x900, dark, read the `Mở Zalo` link on `Phòng 5` without following it. Save `p3-13-zalo-href.png`. Pass when the href is `https://zalo.me/` followed by the tenant's phone in local format starting with `0`. Never open the link or send a message.
- [ ] Lane 4. As `me.lane4@demo.esta.test` at 390x844, dark, copy the reminder for `Phòng 3`, not yet due. Save `p3-13-due-soon.png`. Pass when the text names the due date `25/10/2026` and contains no overdue wording.
- [ ] Lane 5. In a signed-out browser context at 390x844, light, open the `/q/` link from lane 2's message and save the image, then run `pnpm tsx scripts/decode-qr.ts` on it. Save `p3-13-public-qr.png`. Pass when the PNG decodes to Phòng 5's amount and memo and the page shows no tenant name.
- [ ] Lane 6. As `ryan.lane6@demo.esta.test` at 1440x900, light, void the Phòng 6 October invoice, then open its old `/q/` link. Save `p3-13-voided-token.png`. Pass when the link returns 404.
- [ ] Lane 7. As `me.lane7@demo.esta.test` at 390x844, dark, add a lease on Phòng 8 for a tenant without a phone and open its reminder. Save `p3-13-no-phone.png`. Pass when `Mở Zalo` is disabled with `Chưa có số điện thoại` and copying still works.
- [ ] Lane 8. As `ryan.lane8@demo.esta.test` at 1440x900, dark, open the reminder sheet for the tenant with the longest name. Save `p3-13-desktop.png`. Pass when the draft wraps inside the sheet and both actions have visible text labels.
- [ ] Lane 9. In Studio at 1440x900, light, list `share_token` values for household 9, then request `/q/` with a random 22-character token. Save `p3-13-token.png`. Pass when every issued invoice has a unique 22-character token, drafts have none, and the random token returns 404.
- [ ] Lane 10. SPEC §9.4 seed 10. As `me.lane10@demo.esta.test` at 390x844, English, text scale 130%, dark, find the overdue Dĩ An room and copy its reminder. Save `p3-13-seed10.png`. Pass when the UI is English, the copied reminder is Vietnamese, and the sheet's actions stay visible without clipping.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS, and initial route JS gzipped, for `/collections` on a production build with the full seed, plus `/q/[token]` response time.
- [ ] Probe. 5 interleaved Lighthouse runs per side, and 5 warm `/q/` requests at head.
- [ ] Baseline. Trunk produces the `/collections` placeholder values. The `/q/` route is new and gets an absolute budget.
- [ ] Rule. Fail when head `/collections` exceeds LCP 2.5 s, TBT 200 ms, CLS 0.05 or 200 KB initial JS (SPEC §7.2), or when the `/q/` warm median exceeds 300 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy each lane screenshot to `~/.claude/orchestrate/esta/media/p3-13/p3-13-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of seed 1 from the board to the copied reminder at 390x844, saved as `~/.claude/orchestrate/esta/media/p3-13/p3-13-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Enter monthly meter readings for every room on one screen (P3-14)

**Depends on.** P3-13, the parent, and P3-04 for metered invoice lines.

**Files.**

- [ ] Create `apps/web/src/app/(app)/properties/[propertyId]/meters/page.tsx`.
- [ ] Create `apps/web/src/components/meters/MeterEntryList.tsx` and `MeterRow.tsx`.
- [ ] Create `apps/web/src/server/actions/meters.ts` and `apps/web/src/server/actions/meters.integration.test.ts`.
- [ ] Create `packages/core/src/meters/consumption.ts`, `packages/core/src/meters/anomaly.ts` and their `.test.ts` files.
- [ ] Edit the `Cho thuê` tab from P1-08, `docs/spec/DOMAIN-VN.md` §7 and `docs/plan/STATUS.md`.
- [ ] Create `e2e/meters.spec.ts`.

**Build.**

- [ ] Run `/impeccable shape` for Meter entry and record the confirmed brief in the PR body before building.
- [ ] Implement `consumption(previous, current)` in `consumption.ts`, refusing a reading below the previous one with a typed error, and `isAnomalous(history, value)` in `anomaly.ts`, true above 3 times the median of the last 6 months (LSE-4).
- [ ] Build the page with one row per room and meter kind, the reading month defaulting to the month before the Clock's month, the previous reading beside each input, `inputMode="numeric"`, and the anomaly warning inline as `Cao gấp 3 lần mức thường` with the median. A warning never blocks saving.
- [ ] Add `Nhập chỉ số` on the `Cho thuê` tab of a property with meters.
- [ ] Implement `saveReadings` in `meters.ts`. It upserts `meter_readings` on `(meter_id, reading_month)` with `read_on` from the Clock, then calls `runInvoicing` with the session client, so drafts gain utility lines and issue once every meter of the unit is read. A reading changed after its invoice issued becomes an `adjustment` line on the next draft through `planInvoices` (LSE-4).
- [ ] Show the remaining count as `Còn 4 phòng chưa nhập` until every meter has a reading for the month.
- [ ] Confirm the DOMAIN-VN §7 `[verify]` electricity resale rule from a source and show a neutral note linking to it, or label the note `Giả định` and list it in `docs/plan/STATUS.md`.
- [ ] Run `/impeccable harden` on the screen for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.

**You see.**

- [ ] At `2026-11-02`, entering October readings for all eight Dĩ An rooms and saving issues the six invoices for the period starting `2026-11-25` with `electricity` and `water` lines.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `consumption.test.ts` and `anomaly.test.ts` cover a normal reading, a lower reading refused, a value at exactly 3 times the median, one above, and fewer than 6 months of history (LSE-4).
- [ ] `meters.integration.test.ts` covers complete readings issuing drafts, partial readings leaving drafts as `draft`, and a late reading producing an adjustment on the next draft while the issued invoice stays unchanged (LSE-4).
- [ ] `e2e/meters.spec.ts` enters eight rooms at 390 and 1440 (LSE-4). Run `pnpm check`, `pnpm db:test` and `pnpm e2e e2e/meters.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/meters.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no meter entry because the gated Phase 3 PRs land in the phase batch, so the lane opens the `di-an` `Cho thuê` tab as `me.lane1@demo.esta.test` at 390x844, light, on both sides and gates the head's meter page. Save `p3-14-meters-regression.png`. Pass when both sides list the eight units and the head's `Nhập chỉ số` opens September readings dated `03/10/2026` for every room.
- [ ] Lane 2. SPEC §9.4 seed 5. Set the clock to `2026-11-02T09:00:00+07:00` and run `pnpm cron:run`. As `me.lane2@demo.esta.test` at 390x844, light, enter October readings for all eight rooms and save. Save `p3-14-seed5.png`. Pass when the page reads complete and Studio shows six issued invoices for the period starting `2026-11-25`, each with `electricity` and `water` lines priced from the meter pricing.
- [ ] Lane 3. At `2026-11-02`, as `ryan.lane3@demo.esta.test` at 1440x900, dark, enter a Phòng 2 electricity reading ten times its usual consumption. Save `p3-14-anomaly.png`. Pass when the row shows `Cao gấp 3 lần mức thường` with the median and saving still succeeds.
- [ ] Lane 4. At `2026-11-02`, as `me.lane4@demo.esta.test` at 390x844, dark, enter a Phòng 4 reading below September's. Save `p3-14-lower-refused.png`. Pass when the row shows the Vietnamese refusal and nothing saves for that meter.
- [ ] Lane 5. At `2026-10-07`, as `ryan.lane5@demo.esta.test` at 1440x900, light, raise Phòng 3's September electricity reading by 10 and save, then set the clock to `2026-11-02` and run `pnpm cron:run`. Save `p3-14-late-adjustment.png`. Pass when the issued `2026-10-25` invoice total is unchanged and the `2026-11-25` draft has an `adjustment` line of 10 units times the price.
- [ ] Lane 6. At `2026-11-02`, as `me.lane6@demo.esta.test` at 390x844, light, focus a reading input. Save `p3-14-keypad.png`. Pass when the input has `inputmode="numeric"`, the previous reading shows beside it, and the row is at least 44 px tall.
- [ ] Lane 7. At `2026-11-02`, as `ryan.lane7@demo.esta.test` at 1440x900, dark, enter readings for vacant Phòng 7 and Phòng 8. Save `p3-14-vacant.png`. Pass when both save and Studio shows no invoice for either room.
- [ ] Lane 8. At `2026-11-02`, as `me.lane8@demo.esta.test` at 1440x900, light, view all rooms. Save `p3-14-desktop.png`. Pass when all eight rooms with both meters fit one screen without horizontal scroll.
- [ ] Lane 9. At `2026-11-02`, as `ryan.lane9@demo.esta.test` at 390x844, dark, enter readings for four rooms and save. Save `p3-14-partial.png`. Pass when the page reads `Còn 4 phòng chưa nhập` and Studio shows the `2026-11-25` invoices still `draft`.
- [ ] Lane 10. SPEC §9.4 seed 10 on seed 5. At `2026-11-02`, as `me.lane10@demo.esta.test` at 390x844, English, text scale 130%, dark, enter readings for all eight rooms. Save `p3-14-seed10.png`. Pass when each row keeps its label, previous reading and input visible without clipping and the save completes.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS, and initial route JS gzipped, for the Dĩ An meter page and the property detail on a production build with the full seed, plus `saveReadings` time for eight rooms including `runInvoicing`.
- [ ] Probe. 5 interleaved runs per side on property detail, 5 runs at head on the meter page, and 5 timed saves.
- [ ] Baseline. Trunk produces the property detail values. The meter page is new and gets the absolute budget.
- [ ] Rule. Fail when the meter page exceeds LCP 2.5 s, TBT 200 ms, CLS 0.05 or 200 KB initial JS (SPEC §7.2), property detail LCP regresses by more than 10% against trunk, or a save exceeds 2 s.

**Review gate.** The operator reviews before merge.

- [ ] Copy each lane screenshot to `~/.claude/orchestrate/esta/media/p3-14/p3-14-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of seed 5 at 390x844, entering eight rooms and seeing the invoices issue, saved as `~/.claude/orchestrate/esta/media/p3-14/p3-14-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Import bank statements, commit matches and confirm suggestions in bulk (P3-15)

**Depends on.** P3-14, the parent, P3-06 for matching and P3-10 for payment writes.

**Files.**

- [ ] Create `apps/web/src/app/(app)/collections/import/page.tsx`.
- [ ] Create `apps/web/src/components/statements/StatementUpload.tsx`, `ColumnMapping.tsx` and `ImportPreview.tsx`.
- [ ] Create `apps/web/src/server/actions/statements.ts` and `apps/web/src/server/actions/statements.integration.test.ts`.
- [ ] Create `supabase/migrations/20261007031000_commit_statement_import.sql` with `commit_statement_import(p_import_id uuid, p_confirmed_row_ids uuid[])` and `supabase/tests/commit_statement_import.test.sql`.
- [ ] Edit `apps/web/src/components/collections/CollectionsBoard.tsx` to add `Nhập sao kê` for admins.
- [ ] Create `e2e/statement-import.spec.ts`.

**Build.**

- [ ] Build `StatementUpload` for CSV and XLSX with the receiving account picker. The browser decodes the file with `decodeStatementFile` through a dynamic import, so the file never passes through a server function body and the collections bundle stays small.
- [ ] Build `ColumnMapping`, prefilled from the latest committed import's `column_mapping` for the same `bank_account_id`. Saving the import stores the mapping, so the next import from that bank skips this step (LSE-8).
- [ ] Implement `createStatementImport` in `statements.ts`. It parses rows with zod, loads issued invoices and memo codes with the session client, runs `matchRows`, and inserts `statement_imports` and `statement_rows`. A row whose fingerprint already exists keeps the existing row and shows as `Đã ghi sổ`.
- [ ] Build `ImportPreview` with counts and filters for `Khớp mã`, `Gợi ý`, `Chưa khớp`, `Bỏ qua` and `Đã ghi sổ`, each row showing the matched invoice, and a select-all for `Gợi ý` rows.
- [ ] Write `commit_statement_import` to post every `memo_match` row and every confirmed `suggested` row as a `bank_transfer` payment with `source` `statement_import`, allocate to the matched invoice first and the rest by `allocatePayment` order, mark rows `posted`, and set the import `committed`, in one transaction. Posted rows never post again (SPEC §7.4).
- [ ] Add `Xác nhận gợi ý` for selected rows after commit, through the same function.

**You see.**

- [ ] Importing a layout A statement generated for the lane household and pressing `Ghi sổ` posts every `Khớp mã` row, and the October board shows those rooms under `Đã thu`.
- [ ] Importing the same file again shows every row as `Đã ghi sổ` and posts nothing.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `commit_statement_import.test.sql` proves that only `memo_match` and confirmed rows post, that a second commit posts nothing, that another household's import is refused, and that a viewer cannot commit (LSE-8, FND-2).
- [ ] `statements.integration.test.ts` imports each of the three fixtures for a test household, compares statuses with the golden files, commits, re-imports and asserts zero new payments (LSE-8).
- [ ] `e2e/statement-import.spec.ts` covers upload, mapping, preview, commit and bulk confirm at 1440 and 390. Run `pnpm check`, `pnpm db:test` and `pnpm e2e e2e/statement-import.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/statement-import.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe. Each lane writes its statement with `pnpm tsx fixtures/statements/generate.ts --household <n>`.

- [ ] Lane 1. Regression lane against trunk. Trunk has no import because the gated Phase 3 PRs land in the phase batch, so the lane opens `/collections` as `ryan.lane1@demo.esta.test` at 1440x900, light, on both sides and gates the head's import and commit. Save `p3-15-import-regression.png`. Pass when trunk shows the placeholder and the head posts every `Khớp mã` row of layout A.
- [ ] Lane 2. SPEC §9.4 seed 6. As `ryan.lane2@demo.esta.test` at 1440x900, light, import layout A, map columns, commit, then select all `Gợi ý` rows and confirm. Save `p3-15-seed6.png`. Pass when the preview counts equal the golden file, Studio shows one `statement_import` payment per posted row, and the confirmed suggestion's invoice is paid.
- [ ] Lane 3. As `ryan.lane3@demo.esta.test` at 1440x900, dark, import and commit layout A, then import the same file again. Save `p3-15-reimport.png`. Pass when every row reads `Đã ghi sổ` and Studio's payment count is unchanged.
- [ ] Lane 4. As `ryan.lane4@demo.esta.test` at 1440x900, light, commit one layout B import, then start a second layout B import for the same account. Save `p3-15-preset.png`. Pass when the second import skips mapping with the saved columns.
- [ ] Lane 5. As `me.lane5@demo.esta.test` at 390x844, dark, import layout B from XLSX. Save `p3-15-mobile-xlsx.png`. Pass when the preview renders stacked rows without horizontal scroll and debit rows read `Bỏ qua`.
- [ ] Lane 6. As `ryan.lane6@demo.esta.test` at 1440x900, dark, import layout C and find the `FIESTA` row. Save `p3-15-fiesta.png`. Pass when it reads `Chưa khớp` and does not post on commit.
- [ ] Lane 7. As `me.lane7@demo.esta.test` at 390x844, light, import layout A and open the ambiguous row. Save `p3-15-ambiguous.png`. Pass when it reads `Chưa khớp`, names two candidate invoices, and has no confirm action.
- [ ] Lane 8. As `ryan.lane8@demo.esta.test` at 1440x900, light, commit layout A and open the October board. Save `p3-15-board-after.png`. Pass when every room paid by a posted row sits under `Đã thu`.
- [ ] Lane 9. As `ryan.lane9@demo.esta.test` at 1440x900, dark, press `Ghi sổ` twice in quick succession. Save `p3-15-double-commit.png`. Pass when Studio shows each row posted once.
- [ ] Lane 10. As `ryan.lane10@demo.esta.test` at 390x844, English, text scale 130%, dark, find the overdue Dĩ An room on the board, then import layout A. Save `p3-15-seed10.png`. Pass when the preview labels are English, amounts keep tabular alignment, and nothing clips.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS, and initial route JS gzipped, for `/collections` and `/collections/import` on a production build with the full seed, plus preview time and commit time for a 1,000-row generated statement.
- [ ] Probe. 5 interleaved runs per side on `/collections`, 5 runs at head on the import route, and 5 timed previews and commits.
- [ ] Baseline. Trunk produces the `/collections` placeholder values. The import is new and gets an absolute budget.
- [ ] Rule. Fail when either head route exceeds LCP 2.5 s, TBT 200 ms, CLS 0.05 or 200 KB initial JS (SPEC §7.2), or when the 1,000-row preview exceeds 3 s or the commit exceeds 5 s.

**Review gate.** The operator reviews before merge.

- [ ] Copy each lane screenshot to `~/.claude/orchestrate/esta/media/p3-15/p3-15-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of seed 6 at 1440x900, from upload to bulk confirm, saved as `~/.claude/orchestrate/esta/media/p3-15/p3-15-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Build Home with today's list and this month's collection (P3-16)

**Depends on.** P3-15, the parent, P3-09 for grouping and P1-09 for the map.

**Files.**

- [ ] Create `packages/core/src/today/rules.ts` and `packages/core/src/today/rules.test.ts`.
- [ ] Create `apps/web/src/server/queries/home.ts`.
- [ ] Edit `apps/web/src/app/(app)/page.tsx`, replacing the P0-14 placeholder.
- [ ] Create `apps/web/src/components/home/TodayList.tsx`, `MonthCollection.tsx` and `HomeMapStrip.tsx`.
- [ ] Create `e2e/home.spec.ts`.

**Build.**

- [ ] Run `/impeccable shape` for Tổng quan and record the confirmed brief in the PR body before building.
- [ ] Export `TODAY_RULES` from `rules.ts` as a registry of pure rules over a snapshot at `asOf`, each with an id, a priority and one action. `overdue_invoice` offers `Ghi nhận`, `due_today` offers `Ghi nhận`, `lease_ending` within 30 days without a renewal offers `Gia hạn`, `document_expiring` within 30 days offers `Xem tài liệu`, `extraction_waiting` offers `Xem lại`, and `meters_missing` after the 5th of the month offers `Nhập chỉ số`. `todayItems(snapshot, asOf)` sorts by priority then date and caps at 7.
- [ ] Build the snapshot in `home.ts` with the session client and the Clock's date.
- [ ] Build `TodayList` under `Cần làm hôm nay`, each item with one labelled action that opens the payment sheet, the renew sheet, the document, the review or the meter page. Above 7 items, add `Xem tất cả ở Thu tiền`. With no items, show `Hôm nay không có việc cần làm.`
- [ ] Build `MonthCollection` with the large figure `Đã thu X / Y` from `groupCollections` for the Clock's month, a thin progress rule, and counts per group with status marks.
- [ ] Render `HomeMapStrip` only at 1024 px and wider, loading MapLibre through a dynamic import.
- [ ] Leave typed slots for the Phase 5 brief note and the Phase 4 portfolio figure that render nothing until those PRs fill them.
- [ ] Run `/impeccable harden` on the screen for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.

**You see.**

- [ ] Home on the full seed at `2026-10-07` shows `Thứ Tư, 07/10/2026`, then `Cần làm hôm nay` with three items, `Phòng 5` with `Ghi nhận`, the `thu-duc` lease with `Gia hạn`, and the `q7` insurance document with `Xem tài liệu`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/today/rules.test.ts` gains the full-seed set at `2026-10-07`, the cap at `2026-10-25` where nine candidates yield seven items, a renewed lease excluded, and an empty snapshot.
- [ ] `e2e/home.spec.ts` asserts the three items and the figure at 390 and 1440. Run `pnpm check` and `pnpm e2e e2e/home.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/home.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk serves the P0-14 Home placeholder with the Clock's date line, so the lane opens `/` as `me.lane1@demo.esta.test` at 390x844, light, on both sides. Save `p3-16-home-regression.png`. Pass when both sides show `Thứ Tư, 07/10/2026` and the head adds `Cần làm hôm nay` with three items.
- [ ] Lane 2. As `me.lane2@demo.esta.test` at 390x844, light, read Home. Save `p3-16-today.png`. Pass when the items are `Phòng 5` with `Ghi nhận`, `thu-duc` with `Gia hạn` and the `q7` insurance with `Xem tài liệu`, each action labelled in text.
- [ ] Lane 3. As `me.lane3@demo.esta.test` at 390x844, dark, tap `Ghi nhận` on `Phòng 5`, then `Tiền mặt` and `Lưu`. Save `p3-16-pay-from-home.png`. Pass when the item leaves the list and Studio shows one new payment.
- [ ] Lane 4. As `ryan.lane4@demo.esta.test` at 1440x900, dark, read the October figure. Save `p3-16-figure.png`. Pass when `Đã thu X / Y` matches the Studio sums of allocated and total amounts for invoices due in October, and the group counts match the board.
- [ ] Lane 5. As `me.lane5@demo.esta.test` at 390x844, light, tap `Gia hạn` on `thu-duc`. Save `p3-16-renew.png`. Pass when the lease detail opens with the renew sheet ready.
- [ ] Lane 6. Set the clock to `2026-10-25T09:00:00+07:00`. As `ryan.lane6@demo.esta.test` at 1440x900, light, read Home. Save `p3-16-cap.png`. Pass when the list shows seven items and `Xem tất cả ở Thu tiền`.
- [ ] Lane 7. As `ryan.lane7@demo.esta.test` at 1440x900, light, read Home, then resize to 390x844. Save `p3-16-map-strip.png`. Pass when the map strip shows the pinned properties at 1440 and the network log has no MapLibre request at 390.
- [ ] Lane 8. As `me.lane8@demo.esta.test` at 390x844, dark, inspect the DOM below the figure. Save `p3-16-slots.png`. Pass when no empty brief or portfolio box renders.
- [ ] Lane 9. As `ryan.lane9@demo.esta.test` at 390x844, light, load Home with the network set offline by the driver. Save `p3-16-offline.png`. Pass when Home shows `Chưa tải được. Kiểm tra kết nối mạng rồi thử lại.` and no raw error.
- [ ] Lane 10. SPEC §9.4 seed 10 on seed 1. As `me.lane10@demo.esta.test` at 390x844, English, text scale 130%, dark, find the overdue Dĩ An room from Home. Save `p3-16-seed10.png`. Pass when the `Phòng 5` item reads in English with its action and the figure wraps without clipping.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS, and initial route JS gzipped, for `/` on a production build (`pnpm build && pnpm start`) with the full seed.
- [ ] Probe. 5 interleaved runs per side.
- [ ] Baseline. Trunk produces the placeholder Home values. The new Home gets the SPEC §7.2 absolute budget and no ratio against the placeholder.
- [ ] Rule. Fail when head `/` exceeds LCP 2.5 s, TBT 200 ms, CLS 0.05 or 200 KB initial JS (SPEC §7.2).

**Review gate.** The operator reviews before merge.

- [ ] Copy each lane screenshot to `~/.claude/orchestrate/esta/media/p3-16/p3-16-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of Home at 390x844, recording Phòng 5's payment from the list, saved as `~/.claude/orchestrate/esta/media/p3-16/p3-16-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Pass FND-8, north-star steps 3 to 6 and the Mom test (P3-17)

**Depends on.** P3-16, the parent, and every PR from P3-01 to P3-15.

**Files.**

- [ ] Edit `e2e/northstar.spec.ts` and create `e2e/support/statementFromTemplate.ts` and `fixtures/statements/northstar-template.csv`.
- [ ] Create `e2e/fnd8.spec.ts`.
- [ ] Create `scripts/gate-vietqr.ts` and add `ESTA_GATE_BANK_BIN`, `ESTA_GATE_ACCOUNT_NO` and `ESTA_GATE_ACCOUNT_NAME` without values to `.env.example`.
- [ ] Create `docs/plan/mom-test.md`. Edit `docs/plan/STATUS.md`.
- [ ] Edit the components under `apps/web/src/components/home/`, `collections/`, `documents/` and the properties list and detail that the FND-8 run finds at fault.

**Build.**

- [ ] Write north-star steps 3 to 6 in `e2e/northstar.spec.ts` on the `northstar` seed with the worker in replay mode, after steps 1 and 2. Step 3 adds eight rooms to `Dãy trọ Dĩ An` and six monthly calendar-anchored leases with deposits, each started months ago and activated with `Đã thu tiền đến hết ngày` `30/09/2026`, one ending `2026-11-07`. Step 4 asserts six issued October invoices for `01/10/2026` to `31/10/2026` due `01/10/2026`, each with a QR and a receipt image. Step 5 has Ryan import the October statement and commit, three memo matches post, he confirms one suggestion, and Mẹ records one cash payment. Step 6 asserts the October board shows the last room `quá hạn 6 ngày` and copies its reminder.
- [ ] Implement `statementFromTemplate(template, invoices)` in `e2e/support/statementFromTemplate.ts`. It fills the template's memo and amount placeholders from the invoices created in step 4 at test time, with three memo rows, one name-and-amount row, a `FIESTA` row and debit noise.
- [ ] Write `e2e/fnd8.spec.ts` at text scale 130 and 390 px for Home, Properties list, Property detail, Collections and Documents. It fails when any element's `scrollWidth` exceeds its `clientWidth` without an ellipsis affordance, or when the page scrolls horizontally (FND-8). Fix every failure it finds.
- [ ] Run the fast-check suites for schedule, allocation and matching with 10,000 runs each under `FAST_CHECK_NUM_RUNS=10000` and record the seed and result in the PR body.
- [ ] Write `scripts/gate-vietqr.ts`. It reads the operator's receiving account from `.env.local`, which stays gitignored, and writes a VietQR for 10,000 đồng with memo `ESTA GATEQRVN` to `/tmp/esta-gate-vietqr.png`. No account detail enters the repo, a screenshot or the PR body.
- [ ] Operator item at the gate. The operator scans `/tmp/esta-gate-vietqr.png` and one in-app invoice QR with two banking apps, checks that each app fills the account, amount and memo, and cancels without transferring. Record only the app names and the result in `docs/plan/STATUS.md`. This box stops at merge-ready.
- [ ] Operator item at the gate. Write `docs/plan/mom-test.md` with the four SPEC §10.1 tasks, a timer column, a pass column and a failures list. The operator runs the Mom test on `pnpm dev:lan` with the full seed and records results there. Each failure becomes a fix before any Phase 4 PR merges. This box stops at merge-ready.

**You see.**

- [ ] `pnpm e2e:northstar` passes steps 1 to 6 on the `northstar` seed in replay mode.
- [ ] `pnpm e2e e2e/fnd8.spec.ts` passes on all five screens at text scale 130 and 390 px (FND-8).
- [ ] `docs/plan/STATUS.md` records two banking apps that scanned the code, and `docs/plan/mom-test.md` records all four tasks under two minutes (SPEC §10.1).

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Run `pnpm check` with the property tests for schedule, allocation and matching green (Phase 3 exit), plus the 10,000-run pass recorded above.
- [ ] Run `pnpm db:test`, `pnpm e2e e2e/fnd8.spec.ts` and `pnpm e2e:northstar`.
- [ ] Run `pnpm e2e` for every Phase 3 spec, `e2e/leases.spec.ts` through `e2e/home.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/fnd8.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has north-star steps 1 and 2 only, so the lane runs `pnpm e2e:northstar` on both sides and gates the head's steps 3 to 6. Save `p3-17-northstar-regression.png` of both reports. Pass when steps 1 and 2 pass on both sides and the head passes steps 3 to 6.
- [ ] Lane 2. North-star step 3 by hand on `pnpm db:reset:northstar`. As `me.lane2@demo.esta.test` at 390x844, light, add the eight rooms and six leases to `Dãy trọ Dĩ An` after steps 1 and 2. Save `p3-17-step3.png`. Pass when the `Cho thuê` tab shows six active leases, one ending `07/11/2026`, and two empty rooms.
- [ ] Lane 3. North-star step 4 on `pnpm db:reset:northstar`, after the lane drives steps 1 to 3 for household 3. As `me.lane3@demo.esta.test` at 390x844, dark, open each October invoice's QR and receipt image. Save `p3-17-step4.png`. Pass when six issued invoices due `01/10/2026` exist and each opens a QR and a PNG receipt.
- [ ] Lane 4. North-star step 5 on `pnpm db:reset:northstar`, after the lane drives steps 1 to 4 for household 4. As `ryan.lane4@demo.esta.test` at 1440x900, dark, import the statement from `statementFromTemplate`, commit and confirm the suggestion, then as `me.lane4@demo.esta.test` record one cash payment. Save `p3-17-step5.png`. Pass when three rows post by memo, one by confirmation, one cash payment exists, and one room stays unpaid.
- [ ] Lane 5. North-star step 6 on `pnpm db:reset:northstar`, after the lane drives steps 1 to 5 for household 5. As `me.lane5@demo.esta.test` at 390x844, light, open the October board and copy the reminder for the unpaid room. Save `p3-17-step6.png`. Pass when the room reads `quá hạn 6 ngày` and the clipboard holds its Vietnamese reminder.
- [ ] Lane 6. FND-8 on Home and Collections. As `me.lane6@demo.esta.test` at 390x844, text scale 130%, light. Save `p3-17-fnd8-home-collections.png`. Pass when neither page scrolls horizontally and no text truncates without an affordance.
- [ ] Lane 7. FND-8 on the Properties list and Property detail. As `me.lane7@demo.esta.test` at 390x844, text scale 130%, dark. Save `p3-17-fnd8-properties.png`. Pass when the `long-an` and `di-an` rows and the `di-an` header with both addresses wrap fully.
- [ ] Lane 8. FND-8 on Documents. As `me.lane8@demo.esta.test` at 390x844, text scale 130%, light, search `bao loc so`. Save `p3-17-fnd8-documents.png`. Pass when `Sổ hồng Bảo Lộc` shows and nothing clips.
- [ ] Lane 9. Mom test rehearsal by an agent. As `me.lane9@demo.esta.test` at 390x844, light, run the four SPEC §10.1 tasks and time each. Save `p3-17-mom-rehearsal.png`. Pass when each task finishes in under two minutes of driver time with no dead end. The operator still runs the real Mom test.
- [ ] Lane 10. SPEC §9.4 seed 10. As `me.lane10@demo.esta.test` at 390x844, English, text scale 130%, dark, find the overdue Dĩ An room and copy the reminder. Save `p3-17-seed10.png`. Pass when the flow completes in English and the copied reminder is Vietnamese.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS, and initial JS gzipped, for Home and Collections on a production build with the full seed, plus `pnpm e2e:northstar` wall time.
- [ ] Probe. 5 interleaved Lighthouse runs per side, and 3 interleaved north-star runs per side.
- [ ] Baseline. Trunk produces placeholder Home and Collections values and the steps 1 and 2 run time. Steps 3 to 6 are new work with an absolute budget.
- [ ] Rule. Fail when head Home or Collections exceeds LCP 2.5 s, INP proxy TBT 200 ms, CLS 0.05 or 200 KB initial JS (SPEC §7.2), or when the head north-star run exceeds trunk's by more than 4 minutes.

**Review gate.** The operator reviews before merge.

- [ ] Copy each lane screenshot to `~/.claude/orchestrate/esta/media/p3-17/p3-17-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of north-star steps 3 to 6 at 390x844, saved as `~/.claude/orchestrate/esta/media/p3-17/p3-17-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click, the operator's two-app VietQR scan, and the operator's Mom test record in `docs/plan/mom-test.md`.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

Phase 4. The detailed sections for this phase are re-cut at phase start from `docs/plan/trail/slice-matrix.md` and `docs/plan/trail/pr-inventory.md`, which win where they conflict.

## Compute the owner tax position from versioned rules (P4-01)

**Depends on.** P0-06, P3-02, P3-17.

**Files.**

- [ ] Create `packages/core/src/tax/rules.ts`, `packages/core/src/tax/attribute.ts`, `packages/core/src/tax/position.ts`, `packages/core/src/tax/notes.ts` and `packages/core/src/tax/index.ts`.
- [ ] Create `packages/core/src/tax/rules.test.ts`, `packages/core/src/tax/attribute.test.ts`, `packages/core/src/tax/position.test.ts`, `packages/core/src/tax/position.property.test.ts` and `packages/core/src/tax/position.bench.ts`.
- [ ] Create `packages/db/src/tax/toTaxInputs.ts` and `supabase/seed/generator/test/tax-band.test.ts`.
- [ ] Create `apps/web/src/app/dev/core/sections/tax.tsx` and register it in `apps/web/src/app/dev/core/page.tsx`.
- [ ] Edit `docs/spec/DOMAIN-VN.md` §5 and `docs/plan/STATUS.md`.

**Build.**

- [ ] Define `TaxRuleSet` and parse `tax_rules` rows with `taxRuleRowSchema` (zod) in `packages/core/src/tax/rules.ts`. Unknown `vat_base` or `pit_base` values fail the parse. `selectTaxRule(rules, year)` returns `{ kind: 'rule', rule }` for the row with the latest `effective_from` on or before 31 December of `year` whose `effective_to` is null or on or after 1 January, else `{ kind: 'no_rule', year }`.
- [ ] Define `RevenuePeriod` (`leaseId`, `propertyId`, `start`, `end`, `amountVnd`, `taxPayer`, `declaringPartyId`, `active`) in `packages/core/src/tax/attribute.ts`. Inputs are periods, not leases, so E4's single 24-month prepayment is expressible without a billing cycle of 24.
- [ ] Add `splitAmountByDays(amountVnd, period, cuts)` in `attribute.ts`. It splits one period's amount across day segments with the largest remainder method, ties going to the earlier segment, so the parts always sum to the amount in exact `Vnd`.
- [ ] Add `attributeRevenue({ periods, shares, year, asOf })` in `attribute.ts`. It pro-rates every period by days into the year, splits accrued (1 January to `asOf` inclusive) from the contracted remainder (`asOf` + 1 to 31 December, active leases only), gives the whole lease to `declaringPartyId` when set, else splits by `share_bp` with the largest remainder method. Shares that sum below 10000 bp leave the rest in `unattributedVnd` instead of inflating anyone's revenue.
- [ ] Add `periodsFromSchedule(schedule, lease)` in `attribute.ts` as the adapter from the P3-02 `generateSchedule` output. It keeps periods on or before `paid_through_date` (revenue accrues even when no invoice is generated), stops ended and terminated leases at `end_date` or `terminated_on`, and takes rent and recurring charges only. Metered utility lines are excluded.
- [ ] Add `computeTaxPosition({ rule, attribution, otherBusinessRevenueVnd })` in `packages/core/src/tax/position.ts` returning `TaxPosition` with `accruedVnd`, `projectedVnd`, `thresholdTotalVnd` (projected rental plus other business revenue), `thresholdVnd`, `remainingToThresholdVnd` (never below 0), `progressBp`, `overThreshold` (strictly above the threshold), `selfDeclaredVnd` (projected minus withheld), `withheldLeases`, `vatEstimateVnd`, `pitEstimateVnd`, `noteKeys`, `sourceCitation` and `ruleNote`. VAT is `vat_rate_bp` of self-declared revenue when over. PIT is `pit_rate_bp` of self-declared revenue above `threshold_vnd`, so the 500M deduction applies to rental revenue first. Basis-point products round half up to whole đồng.
- [ ] Add the `TAX_NOTES` registry in `packages/core/src/tax/notes.ts` with keys `estimate_disclaimer` (`Ước tính, không phải tư vấn thuế`), `pit_effective_date` (`Giả định`, shows the rule's `note`), `co_owner_split` (`Giả định`), `deduction_split` (`hỏi kế toán về cách trừ 500 triệu`, active when other business revenue is above 0) and `utility_excluded` (`Giả định`). `computeTaxPosition` returns the active keys, so the P4-04 card and the Phase 5 `tax_position` tool and W7 render the same set.
- [ ] Add `toTaxInputs(rows)` in `packages/db/src/tax/toTaxInputs.ts`, a pure mapper from table row shapes (leases, amendments, recurring charges, ownership shares, `tax_rules`) to core inputs. It has no IO, so the seed test and the P4-04 loader share it.
- [ ] Add the `/dev/core` tax section. It lists E1 to E7 with computed VAT, PIT and revenue beside the DOMAIN-VN §5 values and a match mark, then the seed owners of the viewer's household with accrued and projected 2026 revenue. `?taxAsOf=<iso>` and `?taxYear=<yyyy>` override the section's inputs only and never touch the shared test clock.
- [ ] Record the rounding rule and the utility exclusion as `[app rule]` rows in DOMAIN-VN §5. Add a `Needs professional confirmation` list to `docs/plan/STATUS.md` with the PIT effective date, co-owner attribution, the 500M deduction split and the utility exclusion, each with the label the UI shows.
- [ ] If `tax-band.test.ts` fails, change only the `q1` annual rent in the generator (Mẹ owns `q1` outright, so Ryan's figure and every other property stay put) and record the old and new rent in the PR body.

**You see.**

- [ ] `/dev/core#tax` shows seven rows E1 to E7, each with computed revenue, VAT and PIT equal to DOMAIN-VN §5 and a match mark. E7 reads `22.500.000 ₫` VAT, `0 ₫` PIT and the `hỏi kế toán về cách trừ 500 triệu` note.
- [ ] The seed owners block shows Nguyễn Thị Demo with projected 2026 revenue between `400.000.000 ₫` and `499.999.999 ₫` and Trần Minh Demo below `400.000.000 ₫`.
- [ ] `docs/plan/STATUS.md` lists the four `Needs professional confirmation` items with their UI labels.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/tax/position.test.ts` gains E1 to E7 exactly as DOMAIN-VN §5 (FIN-3), revenue of exactly `500000000` paying nothing, `500000001` paying VAT, and `no_rule` for 2025.
- [ ] `packages/core/src/tax/attribute.test.ts` gains a quarterly period straddling 31 December, a 2028 leap-year period, accrued inclusive of the as-of day, a declaring party override, the E5 50/50 split, shares summing to 9000 bp leaving `unattributedVnd`, and a lease paid through 2026-12-31 still accruing.
- [ ] `packages/core/src/tax/position.property.test.ts` (fast-check) proves owner revenue plus `unattributedVnd` equals the in-year sum of period amounts, accrued never exceeds projected, VAT and PIT are 0 whenever the threshold total is at or below the threshold, and both estimates never decrease as revenue grows.
- [ ] `packages/core/src/tax/rules.test.ts` parses the seeded DOMAIN-VN §5 row and rejects an unknown `pit_base`.
- [ ] `supabase/seed/generator/test/tax-band.test.ts` runs `toTaxInputs` and `computeTaxPosition` over the generator's in-memory `full` rows at 2026-10-07 and asserts Mẹ's projected 2026 revenue is between 400,000,000 and 499,999,999 and Ryan's is below 400,000,000 (SPEC §9.3, AGENT.md §7.1 W7).
- [ ] Run `pnpm check`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no tax module, so the lane runs seed 1 (Mẹ opens Thu tiền, finds Dĩ An Phòng 5) at trunk and head, then gates the head `/dev/core#tax` section, as `me.lane1@demo.esta.test` at 390x844 light. Save `p4-01-regression-devcore.png`. Pass when both sides show Phòng 5 under `Quá hạn` with `quá hạn 12 ngày` and the head tax section shows seven match marks.
- [ ] Lane 2. As `ryan.lane2@demo.esta.test` at 1440x900 light, open `/dev/core#tax` and read the E2 and E3 rows. Save `p4-01-e2-e3.png`. Pass when E2 reads `30.000.000 ₫` VAT and `5.000.000 ₫` PIT and E3 reads `45.000.000 ₫` VAT and `20.000.000 ₫` PIT.
- [ ] Lane 3. As `me.lane3@demo.esta.test` at 390x844 dark, open `/dev/core#tax` and read the seed owners block. Save `p4-01-seed-owners.png`. Pass when Nguyễn Thị Demo's projected figure lies between `400.000.000 ₫` and `499.999.999 ₫`, Trần Minh Demo's is below `400.000.000 ₫`, and both match `tax-band.test.ts` output in the CI log.
- [ ] Lane 4. As `ryan.lane4@demo.esta.test` at 1440x900 dark, open Supabase Studio at the slot's Studio port, run a read-only select on `tax_rules`, then open `/dev/core#tax`. Save `p4-01-rule-source.png`. Pass when the section's source line equals the row's `source_citation` and the `pit_effective_date` note shows the row's `note` with `Giả định`.
- [ ] Lane 5. As `me.lane5@demo.esta.test` at 1440x900 light, open `/dev/core?taxAsOf=2026-12-31#tax`. Save `p4-01-year-end.png`. Pass when every seed owner's accrued figure equals the projected figure, while `pnpm clock:set` still reports 2026-10-07 09:00.
- [ ] Lane 6. As `ryan.lane6@demo.esta.test` at 390x844 light, open `/dev/core#tax` and read E5 and E4. Save `p4-01-e4-e5.png`. Pass when E5 shows `400.000.000 ₫` for each owner with `0 ₫` VAT and PIT, and E4 shows `450.000.000 ₫` for 2026.
- [ ] Lane 7. As `me.lane7@demo.esta.test` at 1440x900 dark, open `/dev/core#tax` and expand Nguyễn Thị Demo's per-lease rows. Save `p4-01-withheld.png`. Pass when the Nhà phố Q7 lease is marked `Bên thuê nộp thay`, counts in `thresholdTotalVnd` and is absent from `selfDeclaredVnd`.
- [ ] Lane 8. As `ryan.lane8@demo.esta.test` at 390x844 dark, open `/dev/core?taxYear=2025#tax`. Save `p4-01-no-rule.png`. Pass when the seed owners block shows the `no_rule` state for 2025 and no VAT or PIT figure.
- [ ] Lane 9. As `ryan.lane9@demo.esta.test` at 1440x900 light, open Home and Thu tiền at trunk and head. Save `p4-01-home-unchanged.png`. Pass when `Đã thu X / Y` on Home reads the same figure on both sides and the console has no errors.
- [ ] Lane 10. As `me.lane10@demo.esta.test` switch to English, text scale 130% and dark, repeat seed 1 on Collections, then open `/dev/core#tax`. Save `p4-01-en-130-dark.png`. Pass when Phòng 5 shows the English overdue mark with `12` days, the tax section rows wrap without clipped figures, and the seven match marks remain.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Cold `pnpm check` wall time on both sides, and the `position.bench.ts` mean for `computeTaxPosition` over the full-seed household and over a synthetic 1,000-lease portfolio.
- [ ] Probe. Run `pnpm check` 5 times at trunk and head, interleaved. Run the bench 5 times at head.
- [ ] Baseline. Trunk median `pnpm check` time. Trunk has no tax module, so the bench takes an absolute budget.
- [ ] Rule. Fail when head `pnpm check` median exceeds trunk median by more than 15% or 60 s, when the full-seed bench exceeds 5 ms, or when the 1,000-lease bench exceeds 100 ms.

**Review gate.** None. P4-01 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Record expenses with receipts from the property page or a photo (P4-02)

**Depends on.** P1-06, P2-04, P4-01.

**Files.**

- [ ] Create `supabase/migrations/20261007040100_expenses.sql` and `supabase/tests/expenses.test.sql`.
- [ ] Create `packages/core/src/expenses/categories.ts`, `packages/core/src/expenses/schema.ts` and `packages/core/src/expenses/schema.test.ts`.
- [ ] Create `apps/web/src/server/expenses/actions.ts` and `apps/web/src/server/expenses/actions.test.ts`.
- [ ] Create `apps/web/src/components/expenses/expense-sheet.tsx`, `apps/web/src/components/expenses/expense-list.tsx` and `apps/web/src/app/(app)/properties/[propertyId]/finance/page.tsx`.
- [ ] Edit `supabase/seed/generator/` for expenses, `apps/web/messages/vi.json`, `apps/web/messages/en.json` and `packages/db` generated types.
- [ ] Create `e2e/expenses.spec.ts` and `fixtures/receipts/demo-receipt-q7.jpg` (synthetic, "Demo" vendor).

**Build.**

- [ ] Add `expenses` per SPEC §5.4 with soft delete (`deleted_at`), `amount_vnd bigint check (amount_vnd > 0)`, the category enum, foreign keys to `properties`, `parties` and `documents` in the same household, RLS through `private.is_member(household_id, 'member')` for writes and `'viewer'` for reads, and the audit trigger.
- [ ] Add `EXPENSE_CATEGORIES` in `packages/core/src/expenses/categories.ts` as a registry of the ten SPEC categories with an i18n key and a sort order each. The form, the ledger and the reports read this registry.
- [ ] Add `expenseInputSchema` (zod) in `packages/core/src/expenses/schema.ts`. `amountVnd` comes from `parseVndInput` and must be a positive `Vnd`. `paidOn` is an `IsoDate` that defaults to the Clock's business date.
- [ ] Add server actions `createExpense`, `updateExpense`, `deleteExpense` and `restoreExpense` in `apps/web/src/server/expenses/actions.ts` on the user's session client. `createExpense` takes a client-generated id so a retried submit converges on one row. Delete sets `deleted_at` and the toast offers `Hoàn tác`, which calls `restoreExpense`.
- [ ] Build `ExpenseSheet` with the money input (live preview), category chips, date input, vendor picker with quick-add of a party tagged `contractor`, note, and an optional receipt. On mobile it is a bottom sheet. It has five fields, so it stays a sheet per DESIGN-BRIEF §5.3.
- [ ] Add the receipt photo path. `Chụp hoá đơn` opens the camera input, uploads through the P2-04 signed upload flow as a `documents` row with category `invoice_receipt` and the property set, then opens `ExpenseSheet` with `document_id` linked and the photo beside the fields. No extraction runs, and the amount is typed by the user.
- [ ] Put `Thêm chi phí` and `Chụp hoá đơn` on the property header and on the Thu chi tab, and list the property's expenses for the selected year on the Thu chi tab (`expense-list.tsx`) newest first with category, vendor, amount and receipt link.
- [ ] Extend the seed generator with 12 months of expenses per SPEC §9.3 in every household, including repairs on `q7`, a `land_tax` row on `bao-loc` and a `management_fee` on `thu-duc`, each with a UUIDv5 from `seed:expense:<property>:<yyyy-mm>:<n>`. Record Q7's 2026 repair total in the generator README for AGENT.md §7.4 question 7.

**You see.**

- [ ] On Nhà phố Q7 at 390x844, `Thêm chi phí` opens a sheet. Typing `2tr5`, choosing `Sửa chữa` and saving adds a row `Sửa chữa 2.500.000 ₫ 07/10/2026` and the toast `Đã ghi nhận chi phí 2.500.000 ₫. Hoàn tác`.
- [ ] `Chụp hoá đơn` with the fixture photo produces an expense row with a receipt link that opens the signed photo view.
- [ ] `pnpm db:test` prints the `expenses` isolation and viewer read-only cases as passing.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `supabase/tests/expenses.test.sql` gains household A versus B select, insert, update and delete denial, viewer write denial, the positive-amount check, cross-household `vendor_party_id` rejection, and one audit row per write with the user as actor (FND-2).
- [ ] `packages/core/src/expenses/schema.test.ts` gains `3tr5`, `0`, a negative amount, a fractional đồng and the Clock date default.
- [ ] `apps/web/src/server/expenses/actions.test.ts` gains a retried `createExpense` with the same id producing one row, and delete then restore returning the row.
- [ ] The FND-7 checksum script covers `expenses` and two resets match.
- [ ] Run `pnpm check`, `pnpm db:test` and `pnpm e2e e2e/expenses.spec.ts` (FIN-1).
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] Run `/impeccable harden` on the screen for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/expenses.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Mẹ opens Nhà phố Q7 and records a 2.500.000 ₫ repair. Trunk has no expenses, so the lane records the trunk Thu chi placeholder and gates the head flow, as `me.lane1@demo.esta.test` at 390x844 light. Save `p4-02-regression-add.png`. Pass when the head row reads `Sửa chữa 2.500.000 ₫ 07/10/2026` and a read-only SQL count of lane 1's `q7` expenses rose by exactly 1.
- [ ] Lane 2. As `me.lane2@demo.esta.test` at 390x844 light, tap `Chụp hoá đơn` on Nhà phố Q7 with the camera input fed `fixtures/receipts/demo-receipt-q7.jpg`, enter `850k`, save. Save `p4-02-receipt-photo.png`. Pass when the row shows `850.000 ₫` with a receipt link and SQL shows one `invoice_receipt` document on `q7` linked by `document_id`.
- [ ] Lane 3. As `ryan.lane3@demo.esta.test` at 1440x900 dark, type `3,5tr` in the amount field. Save `p4-02-shorthand.png`. Pass when the live preview under the field reads `3.500.000 ₫` before saving.
- [ ] Lane 4. As `me.lane4@demo.esta.test` at 390x844 dark, quick-add vendor `Thợ điện Demo Phường Tân Đông Hiệp` from the sheet and save an electrical repair. Save `p4-02-vendor.png`. Pass when the row shows the full vendor name wrapped, not clipped, and SQL shows the party with tag `contractor`.
- [ ] Lane 5. As `ryan.lane5@demo.esta.test` at 1440x900 light, delete a seeded `q7` repair, then tap `Hoàn tác`. Save `p4-02-undo.png`. Pass when the row is back in the list and its `deleted_at` is null.
- [ ] Lane 6. As `me.lane6@demo.esta.test` at 390x844 light, try to save with amount `0`. Save `p4-02-invalid.png`. Pass when the sheet shows a Vietnamese inline error on the amount field and the expense count is unchanged.
- [ ] Lane 7. As `ryan.lane7@demo.esta.test` at 1440x900 dark in compact density, open Nhà phố Q7 Thu chi for 2026. Save `p4-02-seed-list.png`. Pass when the sum of the `Sửa chữa` rows on screen equals the Q7 2026 repair total in the generator README.
- [ ] Lane 8. As `me.lane8@demo.esta.test` at 390x844 light, edit a seeded expense's amount to `1tr2` and its category to `Bảo trì`. Save `p4-02-edit.png`. Pass when the row shows `1.200.000 ₫` under `Bảo trì` and `audit_log` has an update row with lane 8 Mẹ as actor.
- [ ] Lane 9. As `ryan.lane9@demo.esta.test` at 1440x900 light, set the browser offline and save an expense. Save `p4-02-offline.png`. Pass when the sheet keeps the entered values and shows `Chưa lưu được. Kiểm tra kết nối mạng rồi thử lại.` and no row was written.
- [ ] Lane 10. As `me.lane10@demo.esta.test` switch to English, text scale 130% and dark, repeat seed 1, then add a repair on Nhà phố Q7. Save `p4-02-en-130-dark.png`. Pass when Phòng 5 shows the English overdue mark with `12` days and the expense sheet labels and the saved row render in English with no clipped text.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT as the INP proxy, CLS and initial route JS gzipped for the property detail route of `q7` on a production build (`pnpm build && pnpm start`) with the full seed.
- [ ] Probe. 5 interleaved runs per side at trunk and head on the same route and seed.
- [ ] Baseline. Trunk medians for the property detail route, which exists at trunk with the Thu chi placeholder.
- [ ] Rule. Fail when a head median exceeds the trunk median by more than 10%, or when the head breaks SPEC §7.2 (LCP 2.5 s, TBT 200 ms, CLS 0.05, 200 KB initial JS).

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/p4-02/p4-02-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of Mẹ adding a repair by typing and by receipt photo at 390x844, saved as `~/.claude/orchestrate/esta/media/p4-02/p4-02-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Show the property ledger by month and export it (P4-03)

**Depends on.** P3-03, P4-02.

**Files.**

- [ ] Create `supabase/migrations/20261007040200_allocation_facts.sql` and `supabase/tests/allocation_facts.test.sql`.
- [ ] Create `packages/core/src/ledger/buildLedger.ts`, `packages/core/src/ledger/buildLedger.test.ts` and `packages/core/src/ledger/buildLedger.property.test.ts`.
- [ ] Create `packages/core/src/export/table.ts`, `packages/core/src/export/csv.ts` and `packages/core/src/export/csv.test.ts`.
- [ ] Create `packages/db/src/queries/ledger.ts` and `apps/web/src/server/export/xlsx.ts`.
- [ ] Create `apps/web/src/app/api/export/ledger/route.ts` and `apps/web/src/components/ledger/ledger-table.tsx`, and edit `apps/web/src/app/(app)/properties/[propertyId]/finance/page.tsx`.
- [ ] Create `e2e/ledger.spec.ts` and edit `apps/web/messages/vi.json` and `apps/web/messages/en.json`.

**Build.**

- [ ] Add the view `allocation_facts` with `security_invoker = true`, joining `payment_allocations` to `payments`, `invoices`, `leases`, `units` and `properties`, exposing `household_id`, `property_id`, `unit_id`, `lease_id`, `invoice_id`, `payment_id`, `received_on`, `method` and `amount_vnd`. The ledger, the reports and the Phase 5 `ledger` tool read income only from this view.
- [ ] Add `buildLedger({ allocations, expenses, from, to })` in `packages/core/src/ledger/buildLedger.ts` returning `Ledger` with one row per month (income, expenses by `EXPENSE_CATEGORIES`, NOI as income minus expenses) and totals. Income is allocations by payment `received_on`. Deposit receipts are not income. A deposit applied to an invoice is income on its application date, because SPEC §5.4 records it as a `deposit` payment with an allocation.
- [ ] Add `loadLedgerInputs(client, { propertyId, from, to })` in `packages/db/src/queries/ledger.ts` on the user's session client, with `from` and `to` as explicit parameters and no `now()`.
- [ ] Add `ExportTable` (`columns`, `rows`, `totals`, each cell a `Vnd`, `IsoDate` or text) in `packages/core/src/export/table.ts` and `ledgerToExportTable(ledger, locale)`. The screen, CSV and XLSX all render one `ExportTable`, so their totals cannot drift.
- [ ] Add `toCsv(table)` in `packages/core/src/export/csv.ts` with a UTF-8 BOM, NFC text, RFC 4180 quoting and integer amounts.
- [ ] Add `toXlsx(table)` in `apps/web/src/server/export/xlsx.ts` with `exceljs`, integer cells formatted `#,##0`, NFC text and a totals row.
- [ ] Add `GET /api/export/ledger?propertyId=&year=&format=csv|xlsx` in the Node runtime on the user's session client, with the file name `<property_code>-thu-chi-<year>.<ext>`.
- [ ] Build the Thu chi tab with a year selector, a month table (sticky header, tabular figures right-aligned, mobile stacked rows with amounts on the right), category totals, the NOI line and the export buttons `Tải CSV` and `Tải Excel`. `?month=2026-10` scrolls to and marks that month, which is the link target for AGENT.md §7.4 question 1. The P4-02 expense list stays below the table.

**You see.**

- [ ] Dãy trọ Dĩ An Thu chi for 2026 shows October income equal to the read-only SQL sum of `allocation_facts.amount_vnd` for `di-an` with `received_on` in October 2026.
- [ ] Each month's NOI equals that month's income minus its expenses, and the year NOI equals the sum of the months.
- [ ] `Tải Excel` downloads `Q7-thu-chi-2026.xlsx` whose totals row equals the screen totals.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/ledger/buildLedger.test.ts` gains a month with no rows, two partial transfers in one month, an applied deposit counted on its date, a received deposit not counted, and an allocation received in September for an October invoice landing in September (FIN-2).
- [ ] `packages/core/src/ledger/buildLedger.property.test.ts` (fast-check) proves ledger income over any range equals the sum of input allocations in that range and the year NOI equals the sum of month NOI.
- [ ] `packages/core/src/export/csv.test.ts` gains the BOM, a Vietnamese name with combining marks normalized to NFC, a comma inside a description, and totals equal to `ExportTable.totals`.
- [ ] `supabase/tests/allocation_facts.test.sql` gains household A versus B isolation through the view and viewer read access (FND-2).
- [ ] Run `pnpm check`, `pnpm db:test` and `pnpm e2e e2e/ledger.spec.ts`. The spec reads the downloaded XLSX with `exceljs` and compares its totals row to the screen totals.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] Run `/impeccable harden` on the screen for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/ledger.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Mẹ opens Dãy trọ Dĩ An Thu chi for October 2026. Trunk shows only the P4-02 expense list, so the lane records it and gates the head ledger, as `me.lane1@demo.esta.test` at 390x844 light. Save `p4-03-regression-di-an.png`. Pass when the head October income equals the read-only SQL sum over `allocation_facts` for lane 1 `di-an` in October 2026 and the trunk expense rows still show at head.
- [ ] Lane 2. As `ryan.lane2@demo.esta.test` at 1440x900 light, open Nhà phố Q7 Thu chi for 2026. Save `p4-03-q7-year.png`. Pass when every month's NOI equals income minus expenses on screen and the `Sửa chữa` category total equals the SQL sum of lane 2 `q7` repair expenses in 2026.
- [ ] Lane 3. As `me.lane3@demo.esta.test` at 390x844 dark, open Căn hộ Thủ Đức Thu chi. Save `p4-03-stacked-mobile.png`. Pass when months render as stacked rows with amounts right-aligned in tabular figures and nothing scrolls horizontally.
- [ ] Lane 4. As `ryan.lane4@demo.esta.test` at 1440x900 dark, open `/properties/<di-an id>/finance?month=2026-10`. Save `p4-03-month-link.png`. Pass when October is scrolled into view and marked, and the URL survives a reload with the same mark.
- [ ] Lane 5. As `ryan.lane5@demo.esta.test` at 1440x900 light, tap `Tải CSV` on Dãy trọ Dĩ An. Save `p4-03-csv.png` with the file opened in a text view beside the screen. Pass when the file starts with the UTF-8 BOM, tenant and category names keep their diacritics, and the totals line equals the screen totals.
- [ ] Lane 6. As `ryan.lane6@demo.esta.test` at 1440x900 dark, tap `Tải Excel` on Nhà phố Q7 and read the totals row with a one-line `exceljs` script. Save `p4-03-xlsx.png`. Pass when every totals cell equals the screen total for its column.
- [ ] Lane 7. As `me.lane7@demo.esta.test` at 390x844 light, open Dãy trọ Dĩ An for the month holding the two partial transfers of the split-paying tenant. Save `p4-03-partial.png`. Pass when the month's income includes both transfers and equals the SQL sum for that month.
- [ ] Lane 8. As `me.lane8@demo.esta.test` at 390x844 dark, open Đất vườn Long An Thu chi for 2026. Save `p4-03-empty.png`. Pass when the screen shows an empty state in Vietnamese with one action `Thêm chi phí` and no zero-filled table.
- [ ] Lane 9. As `ryan.lane9@demo.esta.test` at 1440x900 light, switch the year to 2025 on Dãy trọ Dĩ An. Save `p4-03-year-2025.png`. Pass when months before the first seeded payment show `0 ₫` and the 2025 income total equals the SQL sum for 2025.
- [ ] Lane 10. As `me.lane10@demo.esta.test` switch to English, text scale 130% and dark, repeat seed 1, then open Dãy trọ Dĩ An's ledger. Save `p4-03-en-130-dark.png`. Pass when Phòng 5 shows the English overdue mark with `12` days and the ledger headers are English with no clipped figures.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT as the INP proxy, CLS and initial route JS gzipped for the `di-an` Thu chi route on a production build with the full seed, plus `EXPLAIN (ANALYZE)` time of the ledger query for `di-an` over 2026, plus XLSX export response time.
- [ ] Probe. 5 interleaved Lighthouse runs per side, 5 `EXPLAIN (ANALYZE)` runs and 5 export requests at head.
- [ ] Baseline. Trunk medians for the same route, which exists at trunk with the expense list. Trunk has no ledger query or export, so those take absolute budgets.
- [ ] Rule. Fail when a head Lighthouse median exceeds trunk by more than 10% or breaks SPEC §7.2, when the ledger query exceeds 50 ms, or when the XLSX export exceeds 1 s.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/p4-03/p4-03-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of the Dĩ An ledger at 390x844 and the XLSX export at 1440x900, saved as `~/.claude/orchestrate/esta/media/p4-03/p4-03-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Show each owner's tax card against the 500 million threshold (P4-04)

**Depends on.** P4-01, P4-03.

**Files.**

- [ ] Create `supabase/migrations/20261007040300_owner_tax_inputs.sql` and `supabase/tests/owner_tax_inputs.test.sql`.
- [ ] Create `packages/db/src/queries/taxInputs.ts`, `packages/db/src/queries/taxInputs.test.ts` and `apps/web/src/server/tax/actions.ts`.
- [ ] Create `apps/web/src/app/(app)/reports/tax/page.tsx`, `apps/web/src/components/tax/tax-card.tsx`, `apps/web/src/components/tax/threshold-rule.tsx` and `apps/web/src/components/tax/other-revenue-form.tsx`.
- [ ] Edit `apps/web/src/app/(app)/reports/page.tsx` to link the card, `apps/web/messages/vi.json`, `apps/web/messages/en.json` and `supabase/seed/generator/` for `owner_tax_inputs`.
- [ ] Create `e2e/tax-card.spec.ts`.

**Build.**

- [ ] Run `/impeccable shape` for the tax card and record the confirmed brief in the PR body before building. P4-05 places the shipped card inside Báo cáo.
- [ ] Add `owner_tax_inputs` per SPEC §5.4 with `unique (household_id, party_id, year)`, `other_business_revenue_vnd bigint not null default 0 check (>= 0)`, RLS through `private.is_member(household_id, 'member')` for writes and `'viewer'` for reads, and the audit trigger.
- [ ] Add `loadTaxInputs(client, { householdId, partyId, year, asOf })` in `packages/db/src/queries/taxInputs.ts`. It reads leases, amendments, recurring charges, ownership shares, `tax_rules` and `owner_tax_inputs`, then maps them with the P4-01 `toTaxInputs`. The Phase 5 `tax_position` tool and W7 import this loader.
- [ ] Add `saveOtherBusinessRevenue` in `apps/web/src/server/tax/actions.ts` as an upsert on `(party_id, year)` on the user's session client, so a retried save converges.
- [ ] Build `/reports/tax` with the card for the signed-in member's linked owner party by default and an owner switcher for the other owner parties. A year selector defaults to the Clock's year.
- [ ] Build `TaxCard` with the projected full-year figure as the large figure, `ThresholdRule` (a thin progress rule with the percent in words, never color alone), `Còn X đến ngưỡng 500 triệu`, accrued revenue `Đã ghi nhận đến 07/10/2026`, estimated VAT and PIT, a per-lease breakdown linking each lease to its detail, a separate `Bên thuê nộp thay` group, and the `TAX_NOTES` keys returned by `computeTaxPosition`. `Ước tính, không phải tư vấn thuế` with the rule's `source_citation` sits under every figure group. Each `Giả định` note shows the rule's note text.
- [ ] Build `OtherRevenueForm` (`Doanh thu kinh doanh khác`) with the money input. Saving recomputes the card and shows the `hỏi kế toán về cách trừ 500 triệu` note when the value is above 0.
- [ ] Render the `no_rule` result as `Chưa có quy tắc thuế cho năm <year>` with no figures.
- [ ] Extend the seed generator with one `owner_tax_inputs` row per owner party for 2026 at `0` in every household, so the W7 golden set in AGENT.md §7.1 holds.

**You see.**

- [ ] As Mẹ on the full seed, `/reports/tax` shows Nguyễn Thị Demo's projected 2026 revenue between `400.000.000 ₫` and `499.999.999 ₫`, a threshold rule between 80% and 100%, `0 ₫` VAT and `0 ₫` PIT, and `Ước tính, không phải tư vấn thuế` with the source citation.
- [ ] The `Bên thuê nộp thay` group lists the Nhà phố Q7 lease with its projected amount.
- [ ] Entering `200tr` as other business revenue shows a non-zero VAT estimate, `0 ₫` PIT and the `hỏi kế toán về cách trừ 500 triệu` note.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `supabase/tests/owner_tax_inputs.test.sql` gains household A versus B isolation for every verb, viewer write denial, the non-negative check, the unique `(party_id, year)` and one audit row per write (FND-2).
- [ ] `packages/db/src/queries/taxInputs.test.ts` runs against local Supabase on the full seed and asserts `loadTaxInputs` plus `computeTaxPosition` equals the P4-01 `tax-band.test.ts` figures for both owners (FIN-3).
- [ ] `e2e/tax-card.spec.ts` covers seed 8 (Mẹ reads threshold progress), the withheld group, the other revenue round trip and the 2025 `no_rule` state.
- [ ] Run `pnpm check`, `pnpm db:test` and `pnpm e2e e2e/tax-card.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] Run `/impeccable harden` on the screen for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/tax-card.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Seed 8, Mẹ opens her tax card and reads threshold progress, as `me.lane1@demo.esta.test` at 390x844 light. Trunk has no card, so the lane records the trunk Báo cáo placeholder and gates the head card. Save `p4-04-regression-seed8.png`. Pass when the head card shows a projected figure between `400.000.000 ₫` and `499.999.999 ₫` equal to the `/dev/core#tax` figure for lane 1, the remaining figure equals `500.000.000 ₫` minus it, and VAT and PIT read `0 ₫`.
- [ ] Lane 2. As `ryan.lane2@demo.esta.test` at 1440x900 dark, open his own card. Save `p4-04-ryan-card.png`. Pass when the projected figure is below `400.000.000 ₫`, Căn hộ Thủ Đức and Kho Biên Hòa appear at 50% shares, and the `co_owner_split` note carries `Giả định`.
- [ ] Lane 3. As `me.lane3@demo.esta.test` at 390x844 dark, open the `Bên thuê nộp thay` group. Save `p4-04-withheld.png`. Pass when it lists the Nhà phố Q7 lease and the VAT and PIT estimates do not change when the group is expanded.
- [ ] Lane 4. As `me.lane4@demo.esta.test` at 1440x900 light, enter `200tr` in `Doanh thu kinh doanh khác` and save. Save `p4-04-other-revenue.png`. Pass when VAT equals 5% of the card's self-declared figure rounded half up, PIT reads `0 ₫`, the `hỏi kế toán về cách trừ 500 triệu` note shows, and SQL shows one lane 4 `owner_tax_inputs` row with `200000000`.
- [ ] Lane 5. As `me.lane5@demo.esta.test` at 390x844 light, save `200tr` twice, then set it back to `0`. Save `p4-04-other-revenue-reset.png`. Pass when SQL shows exactly one row for 2026 at `0` and the card matches lane 1's values for the same seed.
- [ ] Lane 6. As `ryan.lane6@demo.esta.test` at 1440x900 dark, switch the year to 2025. Save `p4-04-no-rule.png`. Pass when the card reads `Chưa có quy tắc thuế cho năm 2025` and shows no VAT or PIT figure.
- [ ] Lane 7. As `me.lane7@demo.esta.test` at 390x844 light, read the accrued line and the `pit_effective_date` note. Save `p4-04-accrued-note.png`. Pass when the accrued line reads `Đã ghi nhận đến 07/10/2026` with a figure not above the projected figure, and the note shows the `tax_rules` row's note text with `Giả định`.
- [ ] Lane 8. As `ryan.lane8@demo.esta.test` at 1440x900 light, tap the Dãy trọ Dĩ An Phòng 3 lease row in Mẹ's breakdown. Save `p4-04-lease-link.png`. Pass when the P3-08 lease detail for that lease opens.
- [ ] Lane 9. As `me.lane9@demo.esta.test` at 390x844 light with text scale 130%, open her card. Save `p4-04-scale-130-vi.png`. Pass when the large figure, threshold rule and disclaimer wrap without truncation and no element scrolls horizontally.
- [ ] Lane 10. As `me.lane10@demo.esta.test` switch to English, text scale 130% and dark, repeat seed 1, then open the tax card. Save `p4-04-en-130-dark.png`. Pass when Phòng 5 shows the English overdue mark with `12` days and the card shows English labels with the same figures as lane 1.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT as the INP proxy, CLS and initial route JS gzipped on a production build with the full seed for Home and Collections on both sides and for `/reports/tax` at head, plus server time of `loadTaxInputs` and `computeTaxPosition` for Mẹ.
- [ ] Probe. 5 interleaved Lighthouse runs per side per route and 5 server timings at head from the route's `Server-Timing` header.
- [ ] Baseline. Trunk medians for Home and Collections. Trunk has no `/reports/tax`, so it takes the SPEC §7.2 budgets.
- [ ] Rule. Fail when Home or Collections at head exceeds its trunk median by more than 10% or breaks SPEC §7.2, when `/reports/tax` breaks SPEC §7.2, or when the tax server time exceeds 300 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/p4-04/p4-04-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of Mẹ opening her tax card at 390x844 and reading threshold progress, then entering other business revenue, saved as `~/.claude/orchestrate/esta/media/p4-04/p4-04-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Build reports with XLSX and PDF export (P4-05)

**Depends on.** P1-02, P3-12, P4-04.

**Files.**

- [ ] Create `packages/core/src/reports/rentRoll.ts`, `collections.ts`, `propertyPnl.ts`, `ownerSummary.ts`, `occupancy.ts`, `portfolio.ts`, `invariants.ts` and `index.ts` under `packages/core/src/reports/`, each with a `.test.ts`.
- [ ] Create `packages/db/src/queries/reportSnapshot.ts` and `packages/db/src/queries/reportSnapshot.test.ts`.
- [ ] Create `apps/web/src/server/export/pdf-table.ts` and `apps/web/src/app/api/export/report/route.ts`.
- [ ] Create `apps/web/src/components/reports/report-table.tsx` and `apps/web/src/components/reports/report-picker.tsx`, and edit `apps/web/src/app/(app)/reports/page.tsx`.
- [ ] Create `apps/web/src/app/dev/core/sections/reports.tsx`, `e2e/reports.spec.ts`, and edit `apps/web/messages/vi.json` and `apps/web/messages/en.json`.

**Build.**

- [ ] Run `/impeccable shape Báo cáo` and record the confirmed brief in the PR body before building. The shipped P4-04 tax card is a fixed input to the brief.
- [ ] Add `loadReportSnapshot(client, { from, to, asOf })` in `packages/db/src/queries/reportSnapshot.ts` returning leases, units, invoices, `allocation_facts`, expenses, ownership shares, valuations and tax inputs for the household, with every date passed in and no `now()`.
- [ ] Add pure report builders in `packages/core/src/reports/`, each returning an `ExportTable` from P4-03. `rentRoll(snapshot, asOf)` lists active leases with unit, tenant, rent, cycle, paid through, next due, deposit held and end date. `monthlyCollections(snapshot, from, to)` groups issued invoices by due month with billed, collected and outstanding. `propertyPnl(snapshot, year)` reuses `buildLedger` per property. `ownerSummary(snapshot, year, asOf)` gives each owner's attributed revenue from `computeTaxPosition`, income and expenses by ownership share, and the tax estimates. `occupancy(snapshot, from, to)` gives occupied and vacant days per unit with vacancy counted from the last lease end or `available_from` as in AGENT.md §5.3 W4. `portfolioSummary(snapshot, asOf)` gives each property's latest valuation with date and method, contracted annual rent and `grossYieldBp`.
- [ ] Add `latestValuation(valuations, asOf)` and `grossYieldBp(annualRentVnd, valueVnd)` in `packages/core/src/reports/portfolio.ts`. P4-06 reuses both on the property page and Home.
- [ ] Add `checkReportInvariants(snapshot, tables)` in `packages/core/src/reports/invariants.ts`. It proves P&L income for every property and month equals the sum of `allocation_facts.amount_vnd` with `received_on` in that month, and every table's totals row equals the sum of its rows. `/dev/core#reports` shows the result per month.
- [ ] Add `toPdfTable(table, header)` in `apps/web/src/server/export/pdf-table.ts` on the S7 approach (`spike/s7-receipt`, 8548686). It uses pdf-lib with @pdf-lib/fontkit, the P3-12 static Source Sans 3 and Source Serif 4 instances, NFC text, A4 landscape pages with repeated headers and a totals row on the last page.
- [ ] Add `GET /api/export/report?kind=&from=&to=&format=xlsx|pdf` in the Node runtime on the user's session client. It renders the same `ExportTable` the screen shows, through `toXlsx` or `toPdfTable`.
- [ ] Build Báo cáo with a report picker (Thuế, Lãi lỗ theo tài sản, Danh sách thuê, Thu tiền theo tháng, Tỷ lệ lấp đầy, Danh mục tài sản), a period selector, `ReportTable` (sticky header, tabular figures, mobile stacked rows) and the export buttons `Tải Excel` and `Tải PDF`. Every estimated value shows `Ước tính` with its date and method. No chart library loads.

**You see.**

- [ ] Báo cáo at 1440x900 shows the property P&L for 2026 with one row per property and a totals row, and `/dev/core#reports` shows every invariant month as passing.
- [ ] Tỷ lệ lấp đầy to 07/10/2026 shows Kho Biên Hòa with `70` vacancy days and Dãy trọ Dĩ An Phòng 8 with `67`.
- [ ] `Tải PDF` on the owner annual summary downloads a PDF whose extracted text contains `Nguyễn Thị Demo` with correct diacritics and the screen's totals.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/reports/*.test.ts` gain rent roll excluding ended and terminated leases, collections carrying an unpaid September invoice, occupancy for a never-leased unit from `available_from`, gross yield `650` bp from a 65,000,000 rent on a 1,000,000,000 value, `latestValuation` picking the newest `as_of` not after the as-of date, and `checkReportInvariants` failing on a tampered total (FIN-4, FIN-5).
- [ ] `packages/db/src/queries/reportSnapshot.test.ts` runs against local Supabase on the full seed and asserts `checkReportInvariants` passes for every month from 2025-10 to 2026-10 and every property.
- [ ] `e2e/reports.spec.ts` downloads the P&L XLSX and the owner summary PDF, reads them with `exceljs` and `pdfjs-dist`, and asserts their totals equal the screen totals.
- [ ] Run `pnpm check`, `pnpm db:test` and `pnpm e2e e2e/reports.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] Run `/impeccable harden` on the screen for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/reports.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Ryan opens Báo cáo from the avatar menu and then the tax card, as `ryan.lane1@demo.esta.test` at 1440x900 light. Trunk has the P4-04 card and a placeholder index, so the lane gates the card at both sides and the head P&L. Save `p4-05-regression-pnl.png`. Pass when the tax card figures match on both sides and every head P&L income cell equals the SQL sum of `allocation_facts` for that property in 2026.
- [ ] Lane 2. As `me.lane2@demo.esta.test` at 390x844 light, open Danh sách thuê. Save `p4-05-rent-roll.png`. Pass when the row count equals the SQL count of lane 2 active leases, Phòng 7 is absent, and Căn hộ Thủ Đức shows end date `01/11/2026`.
- [ ] Lane 3. As `ryan.lane3@demo.esta.test` at 1440x900 dark, open Thu tiền theo tháng for October 2026. Save `p4-05-collections.png`. Pass when October's collected figure equals the SQL sum of allocations to invoices due in October and Phòng 5's September invoice shows as outstanding.
- [ ] Lane 4. As `me.lane4@demo.esta.test` at 390x844 dark, open Tỷ lệ lấp đầy to 07/10/2026. Save `p4-05-occupancy.png`. Pass when Kho Biên Hòa shows `70` vacancy days and Phòng 8 shows `67`.
- [ ] Lane 5. As `ryan.lane5@demo.esta.test` at 1440x900 light, open Danh mục tài sản. Save `p4-05-portfolio.png`. Pass when Mặt bằng Quận 1's gross yield equals its contracted annual rent over its latest valuation in basis points from SQL, formatted like `6,5%`, beside `Ước tính` with the valuation date and method.
- [ ] Lane 6. As `ryan.lane6@demo.esta.test` at 1440x900 dark, export the P&L as XLSX and read its totals row with `exceljs`. Save `p4-05-xlsx.png`. Pass when every totals cell equals the screen totals row.
- [ ] Lane 7. As `me.lane7@demo.esta.test` at 1440x900 light, export the owner annual summary as PDF and extract its text with `pdfjs-dist`. Save `p4-05-pdf.png`. Pass when the text contains `Nguyễn Thị Demo` with correct diacritics and the totals equal the screen.
- [ ] Lane 8. As `me.lane8@demo.esta.test` at 390x844 dark, open the owner annual summary for 2026. Save `p4-05-owner-summary.png`. Pass when Nguyễn Thị Demo's attributed revenue equals the projected figure on her P4-04 tax card.
- [ ] Lane 9. As `ryan.lane9@demo.esta.test` at 390x844 light, set the browser offline and tap `Tải PDF`. Save `p4-05-offline.png`. Pass when the screen shows `Chưa tải được. Kiểm tra kết nối mạng rồi thử lại.` and the report table stays visible.
- [ ] Lane 10. As `me.lane10@demo.esta.test` switch to English, text scale 130% and dark, repeat seed 1, then open Reports. Save `p4-05-en-130-dark.png`. Pass when Phòng 5 shows the English overdue mark with `12` days and the report picker and table headers are English with no clipped text.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT as the INP proxy, CLS and initial route JS gzipped for `/reports` and Home on a production build with the full seed, plus P&L XLSX and owner summary PDF response times, plus the traced size of the export function.
- [ ] Probe. 5 interleaved Lighthouse runs per side per route, 5 export requests per format at head, and the `next build` output trace for the export route.
- [ ] Baseline. Trunk medians for `/reports` (the placeholder index) and Home. Trunk has no report export, so exports take absolute budgets.
- [ ] Rule. Fail when Home at head exceeds its trunk median by more than 10%, when `/reports` breaks SPEC §7.2, when XLSX exceeds 1 s or PDF exceeds 1.5 s warm, or when the traced function exceeds 50 MB uncompressed against Vercel's 250 MB limit (S7).

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/p4-05/p4-05-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of Báo cáo at 1440x900 moving through each report and exporting XLSX and PDF, saved as `~/.claude/orchestrate/esta/media/p4-05/p4-05-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Record valuations, complete the seed generator and pass north-star step 8 (P4-06)

**Depends on.** P3-16, P4-05.

**Files.**

- [ ] Create `packages/core/src/valuations/schema.ts`, `packages/core/src/valuations/age.ts` and their `.test.ts` files.
- [ ] Create `apps/web/src/server/valuations/actions.ts`, `apps/web/src/components/valuations/valuation-block.tsx`, `apps/web/src/components/valuations/valuation-sheet.tsx` and `apps/web/src/components/home/portfolio-figure.tsx`.
- [ ] Edit `apps/web/src/app/(app)/properties/[propertyId]/page.tsx`, `apps/web/src/app/(app)/page.tsx`, `apps/web/messages/vi.json` and `apps/web/messages/en.json`.
- [ ] Create `scripts/seed-coverage.ts` and `supabase/seed/generator/test/seed-facts.test.ts`, and edit `supabase/seed/generator/` and the FND-7 checksum script.
- [ ] Edit `e2e/northstar.spec.ts`, create `e2e/valuations.spec.ts`, and edit `docs/plan/STATUS.md`.

**Build.**

- [ ] Add `valuationInputSchema` (zod) in `packages/core/src/valuations/schema.ts`. `valueVnd` is a positive `Vnd` from `parseVndInput`, `method` is one of the four SPEC methods, `sourceUrl` must be `https:`, and `asOf` is an `IsoDate` not after the Clock's date.
- [ ] Add `valuationAge(asOf, today)` in `packages/core/src/valuations/age.ts` returning whole months and days for `cách đây N tháng` copy.
- [ ] Add `createValuation` and `deleteValuation` in `apps/web/src/server/valuations/actions.ts` on the user's session client, with a client-generated id for idempotent retries and undo on delete.
- [ ] Build `ValuationBlock` on the property Tổng quan tab with the latest value in the figure face, `Ước tính`, its date, method, age and source link, the gross yield from P4-05 `grossYieldBp` reading `Lợi suất gộp 6,5%, theo ước tính ngày 01/07/2026`, a history list, and `Thêm định giá` opening `ValuationSheet`.
- [ ] Fill the Home portfolio slot from P3-16 with `PortfolioFigure`. It shows the sum of `latestValuation` per property, labelled `Ước tính` with the oldest included valuation date and the count of properties without one.
- [ ] Add `scripts/seed-coverage.ts`. It lists every table in `supabase/migrations/` and fails when the `full` generator writes no rows for a business table in any household. Runtime-only tables (`audit_log`, `document_access_log`, `agent_runs`, `worker_heartbeats`, `test_clock`) sit in an allowlist with a reason each. Run it in `pnpm check`.
- [ ] Fill every gap `seed-coverage.ts` and `seed-facts.test.ts` report in the generator, then extend the FND-7 checksum script to every business table present at this head.
- [ ] Add north-star step 8 to `e2e/northstar.spec.ts`. After steps 1 to 6, advance the test clock to 2026-10-08 07:05, open Mẹ's tax card and assert the threshold rule, accrued and projected figures, VAT and PIT estimates and the disclaimer. The expected projected figure comes from `computeTaxPosition` over the leases the spec created in step 3 plus the `northstar` seed, both known at test time. Steps 7 and 9 stay `test.fixme` until P5-10.
- [ ] Record the Phase 4 exit evidence in `docs/plan/STATUS.md` with the checksum value, the E1 to E7 run and the north-star run id.

**You see.**

- [ ] `/dev/core#tax` shows E1 to E7 all matching (Phase 4 exit, tax worked examples exact).
- [ ] `/dev/core#reports` shows every invariant month passing (Phase 4 exit, report invariants hold).
- [ ] Two `pnpm db:reset` runs print the same checksum over every business table (Phase 4 exit, FND-7).
- [ ] `pnpm e2e:northstar` passes steps 1 to 6 and 8 with 7 and 9 marked fixme (Phase 4 exit, north-star step 8).
- [ ] Home shows the portfolio figure labelled `Ước tính` with a date, and adding a valuation on Mặt bằng Quận 1 changes both the figure and the property's gross yield.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/valuations/schema.test.ts` gains an `http:` source refused, a future `asOf` refused, and `1ty2` parsed to 1,200,000,000 (FIN-5).
- [ ] `packages/core/src/valuations/age.test.ts` gains month boundaries, the 31st to the 30th, and a same-day valuation.
- [ ] `supabase/seed/generator/test/seed-facts.test.ts` asserts each SPEC §9.3 fact on the `full` rows, including lease end dates, Phòng 5's unpaid invoice, Phòng 7's held deposit, Phòng 8's `available_from`, Kho Biên Hòa's refund on 2026-08-05, the `q7` insurance expiry, valuations for every property, 12 months of invoices and payments, and the ownership splits.
- [ ] `scripts/seed-coverage.ts` exits 0 and the FND-7 checksum matches across two resets of the `full` and `northstar` variants.
- [ ] Run `pnpm check`, `pnpm db:test`, `pnpm e2e e2e/valuations.spec.ts` and `pnpm e2e:northstar`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] Run `/impeccable harden` on the screen for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/valuations.spec.ts` and `e2e/northstar.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Mẹ opens Home, then seed 8 on her tax card, as `me.lane1@demo.esta.test` at 390x844 light. Trunk has an empty portfolio slot, so the lane gates the tax card at both sides and the head portfolio figure. Save `p4-06-regression-home.png`. Pass when the tax card figures match on both sides and the head portfolio figure equals the SQL sum of the latest valuation per lane 1 property.
- [ ] Lane 2. As `ryan.lane2@demo.esta.test` at 1440x900 light, add a `broker_quote` valuation of `9ty5` dated 07/10/2026 with an `https:` source on Mặt bằng Quận 1. Save `p4-06-add-valuation.png`. Pass when the block shows `9,5 tỷ`, `Ước tính`, `07/10/2026`, and the gross yield line names that date and equals annual rent over 9,500,000,000 in basis points.
- [ ] Lane 3. As `me.lane3@demo.esta.test` at 390x844 dark, open Đất Bảo Lộc. Save `p4-06-valuation-age.png`. Pass when the age text equals the whole months between the seeded latest `as_of` from SQL and 07/10/2026.
- [ ] Lane 4. As `ryan.lane4@demo.esta.test` at 1440x900 dark, try a source `http://example.com` in the valuation sheet. Save `p4-06-https-only.png`. Pass when the sheet shows a Vietnamese inline error on the source field and no row was written.
- [ ] Lane 5. As `me.lane5@demo.esta.test` at 1440x900 light, open Home. Save `p4-06-home-desktop.png`. Pass when the portfolio figure, `Đã thu X / Y` and `Cần làm hôm nay` all render, the figure carries `Ước tính` with a date, and the console has no errors.
- [ ] Lane 6. In its own slot, run `pnpm db:reset:northstar` then `pnpm e2e:northstar`, as the spec's Mẹ at 390x844 light. Save `p4-06-northstar-step8.png` from the step 8 trace. Pass when steps 1 to 6 and 8 pass, steps 7 and 9 report fixme, and the step 8 screenshot shows the threshold rule and `Ước tính, không phải tư vấn thuế`.
- [ ] Lane 7. In its own slot, run `pnpm db:reset` twice and the checksum script after each. Save `p4-06-checksum.png` as a capture of the terminal. Pass when both checksums are identical and the script lists every business table including `expenses`, `owner_tax_inputs` and `valuations`.
- [ ] Lane 8. As `ryan.lane8@demo.esta.test` at 1440x900 dark, open `/dev/core#tax`. Save `p4-06-tax-exit.png`. Pass when E1 to E7 all show match marks.
- [ ] Lane 9. As `ryan.lane9@demo.esta.test` at 390x844 dark, open `/dev/core#reports`. Save `p4-06-invariants-exit.png`. Pass when every month from 2025-10 to 2026-10 shows the invariant as passing for every property.
- [ ] Lane 10. As `me.lane10@demo.esta.test` switch to English, text scale 130% and dark, repeat seed 1, then open Home. Save `p4-06-en-130-dark.png`. Pass when Phòng 5 shows the English overdue mark with `12` days and the portfolio figure reads in English with its estimate label and date, unclipped.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT as the INP proxy, CLS and initial route JS gzipped for Home and Collections on a production build with the full seed, plus `pnpm db:reset` wall time.
- [ ] Probe. 5 interleaved Lighthouse runs per side per route and 5 interleaved `pnpm db:reset` runs per side.
- [ ] Baseline. Trunk medians for Home, Collections and `pnpm db:reset`, all of which exist at trunk.
- [ ] Rule. Fail when Home or Collections at head exceeds its trunk median by more than 10% or breaks SPEC §7.2 (LCP 2.5 s, TBT 200 ms, CLS 0.05, 200 KB initial JS), or when `pnpm db:reset` at head exceeds trunk by more than 25% or 120 s.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/p4-06/p4-06-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of Mẹ reading the Home portfolio figure, adding a valuation and opening her tax card at 390x844, saved as `~/.claude/orchestrate/esta/media/p4-06/p4-06-review.mp4`.
- [ ] Post the screenshots and the video in chat with the Phase 4 exit evidence, stop at merge-ready and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

Phase 5. The detailed sections for this phase are re-cut at phase start from `docs/plan/trail/slice-matrix.md` and `docs/plan/trail/pr-inventory.md`, which win where they conflict. The P5-01 section stays as reference for the PRs that take its tables and tools.

## Add the remaining agent tables and the household-bound read tools (P5-01)

**Depends on.** P0-15, P2-03, P4-06.

**Files.**

- [ ] Create `supabase/migrations/20261007000500_agent_research_conversations.sql` with `research_topics`, `research_items`, `conversations`, `messages` and `notifications` per AGENT.md §10, RLS, audit triggers and indexes.
- [ ] Create `supabase/tests/agent_research_conversations.test.sql`.
- [ ] Create `apps/agent/src/tools/read/` with one file per read tool, `apps/agent/src/tools/display.ts`, `apps/agent/src/tools/byKind.ts` and `apps/agent/src/tools/server.ts`.
- [ ] Create `apps/agent/scripts/tool.ts` and the root script `pnpm agent:tool`.
- [ ] Create `apps/agent/test/tools/isolation.test.ts`, `apps/agent/test/tools/aggregates.test.ts` and `apps/agent/test/tools/tools.bench.ts`.
- [ ] Extend `supabase/seed/generator/` with the five new tables.

**Build.**

- [ ] Name the data shape first. A `ReadTool<I, O>` in `apps/agent/src/tools/types.ts` is `{ name, description, input: ZodSchema<I>, run(ctx: ToolContext, input: I): Promise<O> }`, where `ToolContext` holds `householdId`, `asOf: IsoDate`, `locale` and the service-role client. The household id lives only in the closure. No tool input schema accepts a household id.
- [ ] Write `research_topics`, `research_items` (unique `(household_id, url_normalized)`), `conversations`, `messages` (`status` check `streaming | done | error`) and `notifications` (`channel` check `inapp | email | push`, `status` check `queued | sent | failed | skipped`, unique `(user_id, agent_item_id, channel)`). Every table gets RLS through `private.is_member(household_id, min_role)` and the audit trigger. `notifications` adds `user_id = auth.uid()` to its select policy. Members get no insert, update or delete policy on `research_*` and `notifications`. Members insert their own `conversations` and user-role `messages` only.
- [ ] Implement every AGENT.md §4 read tool except `watch_facts` (P5-02 adds it with the rules) in `apps/agent/src/tools/read/`. Covered tools are `portfolio_overview`, `list_properties`, `get_property`, `property_metrics`, `list_leases`, `get_lease`, `collections`, `ledger`, `tax_position`, `payment_behavior`, `search_documents`, `get_document_text`, `recent_items` and `research_topics`. Each calls the query modules the web screens already use in `packages/db/src/queries/` with `p_as_of` from the job Clock, so the board and the tool cannot disagree. `tax_position` calls `packages/core/src/tax`. `property_metrics` returns `gross_yield_bp` with the valuation used.
- [ ] Add `withDisplay()` in `apps/agent/src/tools/display.ts`. It walks a tool result and adds `<field>_display` (and `<field>_compact_display` for money) for every `Vnd`, basis-point, area, date and day-count field through `packages/core/src/format` in the household locale. Tool code never formats by hand.
- [ ] Make `search_documents` return titles, categories, ids and property only, and make `get_document_text` return `{ error: 'sensitive' }` for `sensitivity = 'sensitive'` (DOC-5 tool part).
- [ ] Encode the AGENT.md §3 tools column as data in `apps/agent/src/tools/byKind.ts` (`TOOLS_BY_KIND`). `buildEstaServer(job)` in `apps/agent/src/tools/server.ts` builds the per-job in-process MCP server with `alwaysLoad: true` and passes only that kind's tools, per S1 (`spike/s1-agent-sdk`, 83c56e0).
- [ ] Add `pnpm agent:tool <name> --household <seed key> --args <json>` in `apps/agent/scripts/tool.ts`. It runs one tool for one household, prints the JSON and writes it to `/tmp/swarm-<pr-id>/tool-<name>.json`. It refuses when `ESTA_ENV=production`. Add the command to the CLAUDE.md commands table.
- [ ] Register the five tables in the seed generator with zero rows in every household, so the FND-7 checksum covers them from this PR on.

**You see.**

- [ ] `pnpm agent:tool collections --household lane2 --args '{"month":"2026-10"}'` prints Phòng 5 of `di-an` in `overdue` with `days_overdue: 12` and `days_overdue_display` `quá hạn 12 ngày`.
- [ ] `pnpm agent:tool get_document_text --household lane2 --args '{"id":"<bao-loc certificate id>"}'` prints `{"error":"sensitive"}`.
- [ ] `pnpm db:test` lists the new suite with every isolation and viewer case passing.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/agent/test/tools/isolation.test.ts` calls every tool in `TOOLS_BY_KIND` with a job for household A and asserts that no id, name or memo code of household B appears in the output (AGENT.md §4, FND-2).
- [ ] `apps/agent/test/tools/aggregates.test.ts` gains cases comparing each tool on the `full` seed at 2026-10-07 with SQL ground truth. Cases cover the October collections totals, `di-an` October ledger income, Mẹ's 2026 `tax_position`, `bao-loc` mortgage bank, `q1` gross yield in bp, leases ending within 60 days (`thu-duc` only, 25 days) and held deposits total.
- [ ] `apps/agent/test/tools/display.test.ts` gains cases for `gross_yield_bp: 650` giving `6,5%`, `15500000` giving `15.500.000 ₫` and `15,5 tr`, and an English household giving `15.5M ₫`.
- [ ] `supabase/tests/agent_research_conversations.test.sql` proves household isolation for select, insert, update and delete on all five tables, viewer read-only, and that a member sees only their own `notifications`. Run `pnpm db:test`.
- [ ] `get_document_text` refuses a sensitive document in `apps/agent/test/tools/sensitive.test.ts` (DOC-5).
- [ ] Run `pnpm check`.
- [ ] Golden tests in AGENT.md §7 for `ping` pass in replay mode with `ESTA_AGENT_MODE=replay pnpm --filter agent test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. At trunk and at head, ryan.lane1 enqueues `ping` from `/dev/agent` at 1440x900 light with the worker in replay. Trunk has no other read tools, so the lane also gates head running `pnpm agent:tool portfolio_overview --household lane1`. Save `p5-01-regression-ping.png`. Pass when the `ping` run reads `done` with the same `household_info` result on both sides and the head command prints 7 properties.
- [ ] Lane 2. me.lane2 opens the October collections board at 390x844 light, then the lane runs `pnpm agent:tool collections` for lane2 and October. Save `p5-01-collections-vs-board.png`. Pass when every overdue, not-due and paid row on the board has a tool row with the same amount and Phòng 5 shows 12 days in both.
- [ ] Lane 3. me.lane3 opens the `di-an` Thu chi tab at 1440x900 dark, then the lane runs `pnpm agent:tool ledger` for `di-an` from 2026-10-01 to 2026-10-31. Save `p5-01-ledger-vs-tab.png`. Pass when the October income figure on the tab equals the tool's `income_total_display`.
- [ ] Lane 4. me.lane4 opens her tax card at 390x844 dark, then the lane runs `pnpm agent:tool tax_position` for Nguyễn Thị Demo and 2026. Save `p5-01-tax-vs-card.png`. Pass when accrued, projected and remaining-to-threshold match the card value for value.
- [ ] Lane 5. me.lane5 opens the `bao-loc` Pháp lý tab at 1440x900 light, then the lane runs `pnpm agent:tool get_property` for `bao-loc`. Save `p5-01-mortgage-vs-legal.png`. Pass when the certificate status is `mortgaged` and the bank name and amount equal the tab.
- [ ] Lane 6. ryan.lane6 opens the portfolio summary report at 1440x900 light, then the lane runs `pnpm agent:tool property_metrics` for `q1` and 2026. Save `p5-01-yield-vs-report.png`. Pass when `gross_yield_display` equals the report's gross yield for Mặt bằng Quận 1 and the valuation date matches.
- [ ] Lane 7. me.lane7 opens the Thủ Đức lease detail at 390x844 light, then the lane runs `pnpm agent:tool list_leases --args '{"ending_within_days":60}'` for lane7. Save `p5-01-leases-ending.png`. Pass when the output holds exactly one lease, `thu-duc`, with `days_until_end: 25` and the end date `01/11/2026` shown on the lease page.
- [ ] Lane 8. The lane runs `pnpm agent:tool get_property` for household lane8 with the id of a lane9 property, then opens Supabase Studio at the slot's Studio port at 1440x900 dark. Save `p5-01-cross-household.png`. Pass when the tool prints `{"error":"not_found"}` and Studio shows that id exists in household lane9.
- [ ] Lane 9. In Studio at 1440x900 light, the lane runs the RLS probe as me.lane9 (`set role authenticated` with her JWT claims) against `messages`, `research_items` and `notifications` of household lane10. Save `p5-01-rls-probe.png`. Pass when every select returns 0 rows and every insert fails with an RLS error.
- [ ] Lane 10. SPEC §9.4 seed 10 adapted. me.lane10 switches to English, text scale 130% and dark at 390x844, opens the collections board to find the overdue Dĩ An room and copies its reminder, then the lane runs `pnpm agent:tool collections` for lane10. Save `p5-01-seed10-english.png`. Pass when the English board shows Phòng 5 `Overdue 12 days` with no clipped text and the tool's canonical amount equals the board amount.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. p95 wall time per read tool on the `full` seed with 10 lane households, `EXPLAIN (ANALYZE)` time of the `collections`, `ledger` and `tax_position` queries, and `pnpm db:reset` wall time.
- [ ] Probe. Run `apps/agent/test/tools/tools.bench.ts` with 50 iterations per tool and `pnpm db:reset` 5 times, interleaved at trunk and head.
- [ ] Baseline. Trunk has only `household_info`, so compare that tool and `pnpm db:reset` across sides and take head values for the new tools as the first baseline.
- [ ] Rule. Fail when any tool's p95 exceeds 150 ms, `household_info` p95 grows more than 10% over trunk, or `pnpm db:reset` grows more than 10% over trunk.

**Review gate.** None. P5-01 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Encode watch rules W1 to W11 and match the golden fact set (P5-02)

**Depends on.** P5-01.

**Files.**

- [ ] Create `apps/agent/test/golden/watch-2026-10-07.json` and `apps/agent/test/golden/watch.test.ts` in the first commit.
- [ ] Create `packages/core/src/watch/types.ts`, `packages/core/src/watch/registry.ts`, `packages/core/src/watch/rules/` (one file per rule, `w01-overdue.ts` to `w11-low-completeness.ts`) and `packages/core/src/watch/watch.test.ts`.
- [ ] Create `packages/db/src/queries/watchSnapshot.ts` and `apps/agent/src/tools/read/watchFacts.ts`.
- [ ] Create `packages/core/src/watch/fixtures/full-2026-10-07.snapshot.json` and `packages/core/src/watch/watch.bench.ts`.
- [ ] Add the watch section to `apps/web/src/app/dev/core/` and `e2e/dev-core.spec.ts`.

**Build.**

- [ ] Write `apps/agent/test/golden/watch-2026-10-07.json` from the AGENT.md §7.1 table before any rule exists. It lists the eight expected `(rule_id, subject_key, severity)` triples with subject keys as seed keys (`invoice:di-an:phong-5:2026-09-25`, `lease:thu-duc`, `unit:bien-hoa:whole`, `unit:di-an:phong-8`, `document:q7:insurance`, `lease:di-an:phong-7`, `party:nguyen-thi-demo:2026`, `property:long-an`) and the must-not-fire list. Commit it with `watch.test.ts` failing.
- [ ] Name the data shape. `WatchSnapshot` in `packages/core/src/watch/types.ts` holds `asOf: IsoDate` plus the invoices with allocated totals, leases, units with `available_from`, deposits held, documents with `expires_on`, meters and readings, owner tax positions, extractions and completeness scores. `WatchFact` is `{ ruleId, subjectKey, severity: 'info' | 'watch' | 'action', numbers }`.
- [ ] Encode W1 to W11 as a registry in `packages/core/src/watch/registry.ts` (`WATCH_RULES: readonly WatchRule[]`), one pure function per rule over `WatchSnapshot`, with thresholds as data on each entry (7, 3, 60 and 30, 30 and 90, 30 and 7, 14, 80% and 100%, day 5, 90%, 3 days, 60%). `evaluateWatch(snapshot)` runs the registry. W7 `action` fires once per year and W11 keeps the single lowest property.
- [ ] Build the snapshot in `packages/db/src/queries/watchSnapshot.ts` (`loadWatchSnapshot(client, householdId, asOf)`) with SQL that takes `p_as_of` and never calls `now()`. It reuses `packages/core/src/tax` for W7 and `packages/core/src/completeness` for W11.
- [ ] Add the `watch_facts(as_of)` tool in `apps/agent/src/tools/read/watchFacts.ts`. It returns facts with `_display` numbers through `withDisplay()` and joins `TOOLS_BY_KIND` for `portfolio_watch`, `morning_brief`, `weekly_review` and `ask`.
- [ ] Add a `/dev/core` watch section that evaluates the committed snapshot fixture at an `as_of` date input (default 2026-10-07) and shows each fact beside the golden expectation, with a `khớp` or `lệch` mark per row.
- [ ] Move Home's `Cần làm hôm nay` onto the watch registry and delete `packages/core/src/today` from P3-16 in this PR, so one set of rules feeds Home, the brief and the inbox (migrate callers, then delete the old module). `e2e/home.spec.ts` keeps passing with the same seeded items.

**You see.**

- [ ] `ESTA_AGENT_MODE=replay pnpm --filter agent test watch` prints 8 facts matched, 0 missing, 0 extra.
- [ ] `/dev/core` watch section at 2026-10-07 lists 8 rows, each marked `khớp`.
- [ ] `pnpm agent:tool watch_facts --household lane1 --args '{"as_of":"2026-10-07"}'` prints the same 8 triples.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/agent/test/golden/watch.test.ts` asserts set equality on `(rule_id, subject_key, severity)` against `watch-2026-10-07.json` on the `full` seed with the clock at 2026-10-07 07:00, and asserts each must-not-fire case from AGENT.md §7.1 is absent (AGT-3, DOC-7).
- [ ] `packages/core/src/watch/watch.test.ts` gains boundary cases per rule. W1 at 7 and 8 days, W2 at 3 and 4 days, W3 at 30, 31, 60 and 61 days and with a renewal present, W4 at 30, 31, 90 and 91 days, W5 at 7 and 30 days, W6 at 14 and 15 days, W7 at 79.99% and 80% and the once-per-year rule, W8 on day 5 and day 6, W9 with one and two short invoices, W10 at 3 and 4 days, and W11 with two low properties.
- [ ] Golden tests in AGENT.md §7 for `portfolio_watch` facts pass in replay mode with `ESTA_AGENT_MODE=replay pnpm --filter agent test`.
- [ ] Run `pnpm check`, then `pnpm e2e e2e/dev-core.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/dev-core.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no watch rules, so the lane opens `/dev/core` at trunk to record the missing section and gates head's watch section at 2026-10-07 at 1440x900 light as ryan.lane1. Save `p5-02-regression-watch.png`. Pass when trunk's other `/dev/core` sections render unchanged at head and head lists exactly 8 facts, all `khớp`.
- [ ] Lane 2. ryan.lane2 sets the watch section `as_of` to 2026-10-02 at 390x844 light. Save `p5-02-w1-seven-days.png`. Pass when W1 for Phòng 5 shows severity `watch` with `quá hạn 7 ngày`.
- [ ] Lane 3. ryan.lane3 sets `as_of` to 2026-10-08 at 1440x900 dark. Save `p5-02-w3-next-day.png`. Pass when W1 shows 13 days `action` and W3 `thu-duc` shows 24 days `action`.
- [ ] Lane 4. me.lane4 records a cash payment for Phòng 5's full outstanding amount from the collections board at 390x844 dark, then the lane runs `pnpm agent:tool watch_facts` for lane4. Save `p5-02-w1-cleared.png`. Pass when the board moves Phòng 5 to `Đã thu` and the tool output has no W1 fact.
- [ ] Lane 5. The lane runs `pnpm agent:tool watch_facts` for lane5 and opens Studio at 1440x900 light on `deposit_entries` for `bien-hoa`. Save `p5-02-w6-not-fired.png`. Pass when Studio shows the `refunded` entry on 2026-08-05 and the output has W6 only for `di-an` Phòng 7.
- [ ] Lane 6. ryan.lane6 sets `as_of` to 2026-11-06 at 390x844 dark. Save `p5-02-w8-november.png`. Pass when W8 lists one `action` fact per meter of leased rooms Phòng 1 to 6 and none for Phòng 7 or 8.
- [ ] Lane 7. me.lane7 opens her tax card at 390x844 light, then the lane runs `pnpm agent:tool watch_facts` for lane7. Save `p5-02-w7-vs-card.png`. Pass when the W7 fact is `watch`, its projected revenue display equals the card's projected figure, and no W7 fact names Trần Minh Demo.
- [ ] Lane 8. me.lane8 opens the `long-an` property header at 1440x900 dark. Save `p5-02-w11-long-an.png`. Pass when the header score is below 60% and the tool output has exactly one W11 fact, for `long-an`, severity `info`.
- [ ] Lane 9. ryan.lane9 sets `as_of` to 2026-10-28 at 390x844 dark. Save `p5-02-w4-ninety-one.png`. Pass when W4 `bien-hoa` shows 91 days with severity `action` and W4 `di-an` Phòng 8 shows 88 days `watch`.
- [ ] Lane 10. SPEC §9.4 seed 10 adapted. ryan.lane10 switches to English, text scale 130% and dark at 390x844, finds the overdue Dĩ An room on the collections board and copies its reminder, then opens the `/dev/core` watch section. Save `p5-02-seed10-english.png`. Pass when the board shows Phòng 5 `Overdue 12 days`, the W1 fact shows 12 days, and no label overflows.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `evaluateWatch` time on the full-seed snapshot (vitest bench), `loadWatchSnapshot` wall time, and `EXPLAIN (ANALYZE)` of the snapshot SQL for one household on the `full` seed with 10 lane households.
- [ ] Probe. Run `packages/core/src/watch/watch.bench.ts` and 20 snapshot loads per side, interleaved, at trunk and head.
- [ ] Baseline. Trunk has no watch code, so record that and take head values as the first baseline. Compare `/dev/core` initial JS across sides because both serve the page.
- [ ] Rule. Fail when `evaluateWatch` exceeds 5 ms, `loadWatchSnapshot` exceeds 250 ms, or `/dev/core` initial JS grows more than 10% over trunk.

**Review gate.** None. P5-02 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Guard numbers in agent output and run portfolio_watch (P5-03)

**Depends on.** P5-02.

**Files.**

- [ ] Create `packages/core/src/guard/extractNumbers.ts`, `packages/core/src/guard/normalize.ts`, `packages/core/src/guard/checkNumbers.ts`, `packages/core/src/guard/guard.test.ts` and `packages/core/src/guard/guard.bench.ts`.
- [ ] Create `packages/core/src/agent-schedule/planDailyJobs.ts` and its test.
- [ ] Create `apps/agent/src/replay/canonicalize.ts` and `apps/agent/src/replay/placeholders.ts`, replacing the P0-15 skeleton hashing.
- [ ] Create `apps/agent/src/tools/write/createItem.ts`, `apps/agent/src/jobs/portfolioWatch.ts` and `packages/core/src/agent-schemas/portfolioWatch.ts`.
- [ ] Create `fixtures/agent-replay/portfolio_watch/` and `fixtures/agent-replay-cases/guard-violation/`.
- [ ] Add the items list to `apps/web/src/app/dev/agent/` and `e2e/dev-agent.spec.ts`.

**Build.**

- [ ] Name the data shape. `CanonicalNumber` in `packages/core/src/guard/normalize.ts` is a tagged union of `{ kind: 'amount', vnd }`, `{ kind: 'ratio', bp }`, `{ kind: 'date', iso }` and `{ kind: 'count', value }`. Percent and basis points both normalize to `bp`, so `6,5%` equals `650`.
- [ ] Implement `extractNumbers(text, locale)` for Vietnamese and English forms (`3,5 tr`, `1,2 tỷ`, `15.000.000 ₫`, `850 nghìn`, `3.5M ₫`, `6,5%`, `07/10/2026`, `12 ngày`, `Phòng 5`) and `collectAllowed(toolResults, context)` over raw fields, `_display` strings and numbers inside labels, plus the injected date and household name. `checkNumbers(text, allowed)` returns the offending substrings.
- [ ] Run the guard inside the write path. `create_item` in `apps/agent/src/tools/write/createItem.ts` checks `title` and `body_md` against the run's allowed set. A first violation returns an `is_error` tool result naming the numbers, which is the repair turn. A second violation fails the job and writes an `info` item with audience `operator` holding the offending text. Mẹ never sees it.
- [ ] Complete replay canonicalization per AGENT.md §8. UUIDs become `<id:n>`, memo codes `<memo:n>`, and the household name `<household>`, so the ten lane households replay one recording. Outputs map placeholders back to the current run's values. `ESTA_REPLAY_DIR` overrides the recording root for named cases. A missing recording fails with the hash and the `pnpm agent:record` hint.
- [ ] Write the `portfolio_watch` job in `apps/agent/src/jobs/portfolioWatch.ts` with tools `watch_facts` and `create_item` only (S1 `tools` per kind and the `PreToolUse` path hook), `maxTurns` 6 and a 3 minute timeout. Validate the output with `packages/core/src/agent-schemas/portfolioWatch.ts`. Reject any item whose `related` facts are not in this run's facts, and require every `action` fact to be covered. Dedupe keys are `watch:{rule_id}:{subject_key}:{local_date}` per action item and `watch_digest:{local_date}` for the grouped item.
- [ ] Encode the AGENT.md §3 schedule as data next to each job handler (`schedule: { daily: '06:40' }`). `planDailyJobs(registry, lastTickAt, now)` in `packages/core/src/agent-schedule/planDailyJobs.ts` returns today's missing jobs in schedule order with idempotency keys `{kind}:{household_id}:{local_date}`, backfilling only today. The scheduler in `apps/agent/src/scheduler/` inserts them with `on conflict do nothing`.
- [ ] Add an items list to `/dev/agent` read through the session client (RLS applies). It shows kind, severity, audience, title, dedupe key, and a `link ok` check per `esta://` link.
- [ ] Run `pnpm agent:record` once for `portfolio_watch` on the `full` seed at 2026-10-07 06:40 and commit the recording. Ryan reviews the recording diff like code.

**You see.**

- [ ] With the clock at 2026-10-07 06:45 and the worker in replay, `/dev/agent` shows a `portfolio_watch` run `done` and 4 new items, three `action` (W1 Phòng 5, W3 `thu-duc`, W6 Phòng 7) and one grouped item covering the two W4 facts, W5, W7 and W11.
- [ ] With `ESTA_REPLAY_DIR=fixtures/agent-replay-cases/guard-violation`, the run reads `failed` with error `number_guard`, and ryan's `/dev/agent` items list shows one `operator` item containing the offending text.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/guard/guard.test.ts` gains cases for every AGENT.md §6.3 format, `vi` and `en` thousands separators (`1.500` and `1,500`), percent and bp equality, a date written as `7/10` and as `07/10/2026`, `Phòng 5` allowed by its label, the household name `Gia đình Demo 3` allowed by context, and an invented `13 ngày` rejected.
- [ ] `packages/core/src/agent-schedule/planDailyJobs.test.ts` gains cases for a late start at 07:30 (jobs come back in schedule order), a restart after jobs exist (nothing new), and a day change (only the new day).
- [ ] `apps/agent/test/replay.test.ts` gains cases proving two lane households hash to one recording and that placeholders map back to each household's ids.
- [ ] `apps/agent/test/jobs/portfolioWatch.test.ts` covers the happy path, an added fact rejected, an uncovered action fact rejected, one guard repair turn that then passes, two violations failing the job with an operator item, and a rerun creating no duplicate items.
- [ ] Golden tests in AGENT.md §7 for `portfolio_watch` pass in replay mode with `ESTA_AGENT_MODE=replay pnpm --filter agent test`.
- [ ] Run `pnpm check`, then `pnpm e2e e2e/dev-agent.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/dev-agent.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. At trunk and head, ryan.lane1 enqueues `ping` from `/dev/agent` at 1440x900 light with the worker in replay. Trunk has no `portfolio_watch`, so the lane then gates head with the clock at 2026-10-07 06:45. Save `p5-03-regression-watch-run.png`. Pass when `ping` reads `done` on both sides and head shows the `portfolio_watch` run `done` with 4 items (3 `action`, 1 grouped).
- [ ] Lane 2. ryan.lane2 enqueues `portfolio_watch` again for the same day from `/dev/agent` at 390x844 light. Save `p5-03-rerun-no-dupes.png`. Pass when the second enqueue is refused by the idempotency key or completes with 0 new items, and the items list still has 4 rows.
- [ ] Lane 3. On its own slot with `ESTA_REPLAY_DIR=fixtures/agent-replay-cases/guard-violation`, ryan.lane3 runs `portfolio_watch` from `/dev/agent` at 1440x900 dark. Save `p5-03-guard-operator.png`. Pass when the run reads `failed` with `number_guard` and one `operator` item shows the offending number.
- [ ] Lane 4. On the lane 3 slot, me.lane4 opens `/dev/agent` items at 390x844 dark. Save `p5-03-guard-hidden-from-me.png`. Pass when no `operator` item appears and Studio confirms the item exists for that household.
- [ ] Lane 5. On its own slot, the lane stops the worker, sets the clock to 2026-10-08 07:30 and restarts it, and ryan.lane5 opens `/dev/agent` at 1440x900 light. Save `p5-03-backfill-today.png`. Pass when one `portfolio_watch` job exists with key `portfolio_watch:<household id>:2026-10-08` and no extra 2026-10-07 job was inserted.
- [ ] Lane 6. ryan.lane6 opens the grouped item in `/dev/agent` at 390x844 light. Save `p5-03-links-resolve.png`. Pass when every `esta://` link shows `link ok` and the item names `bien-hoa` 70 days and Phòng 8 67 days.
- [ ] Lane 7. The lane queries `agent_items` for household lane7 in Studio at 1440x900 dark. Save `p5-03-w1-item-text.png`. Pass when the W1 item body contains `quá hạn 12 ngày` and the outstanding amount equal to the collections board for Phòng 5.
- [ ] Lane 8. The lane runs `portfolio_watch` for lane8 and lane9 and opens `agent_runs` in Studio at 1440x900 light. Save `p5-03-shared-recording.png`. Pass when both runs read `agent_mode = replay` and the worker log names the same recording file for both.
- [ ] Lane 9. On its own slot with `ESTA_REPLAY_DIR` pointing at an empty directory, ryan.lane9 runs `portfolio_watch` at 390x844 dark. Save `p5-03-missing-recording.png`. Pass when the job error contains `missing recording`, the input hash and `pnpm agent:record`.
- [ ] Lane 10. SPEC §9.4 seed 10 adapted. ryan.lane10 switches to English, text scale 130% and dark at 390x844, finds the overdue Dĩ An room on the collections board, copies its reminder, then opens `/dev/agent` items. Save `p5-03-seed10-english.png`. Pass when the board shows Phòng 5 `Overdue 12 days`, the W1 item names Phòng 5 and 12 days, and no row clips text.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `checkNumbers` time on a 300-token text against 2,000 allowed values (vitest bench), `portfolio_watch` job wall time in replay, and scheduler tick time.
- [ ] Probe. Run `packages/core/src/guard/guard.bench.ts`, 10 replay runs of `portfolio_watch` and 20 scheduler ticks per side, interleaved, at trunk and head.
- [ ] Baseline. Trunk has no guard and no `portfolio_watch`, so compare scheduler tick time across sides and record head values for the rest as the first baseline.
- [ ] Rule. Fail when `checkNumbers` exceeds 5 ms, `portfolio_watch` in replay exceeds 10 s, or the scheduler tick grows more than 20% over trunk.

**Review gate.** None. P5-03 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Write the morning brief and show it in the Trợ lý inbox and on Home (P5-04)

**Depends on.** P5-03, P3-16.

**Files.**

- [ ] Create `apps/agent/src/jobs/morningBrief.ts`, `packages/core/src/agent-schemas/brief.ts` and `fixtures/agent-replay/morning_brief/`.
- [ ] Create `packages/core/src/links/estaUri.ts` and `apps/web/src/components/assistant/AgentMarkdown.tsx`.
- [ ] Create `apps/web/src/app/(app)/assistant/page.tsx` (Hộp thư tab, replacing the P0-14 placeholder), `apps/web/src/app/(app)/assistant/actions.ts` and `apps/web/src/components/assistant/WorkerStatus.tsx`.
- [ ] Edit the Home brief slot in `apps/web/src/app/(app)/page.tsx` and the app shell layout for the offline banner.
- [ ] Create `apps/agent/test/golden/brief.test.ts` and `e2e/assistant-inbox.spec.ts`. Add keys to `apps/web/messages/vi.json` and `en.json`.

**Build.**

- [ ] Run `/impeccable shape Trợ lý` and record the confirmed brief in the PR body before building. The brief covers all three tabs (Hộp thư, Thị trường, Hỏi) and the Home brief note, and holds DESIGN-BRIEF §5.5 (monogram, time stamp, linked numbers, no sparkle icons, no chat bubbles on Home, no typing animation).
- [ ] Name the data shape. `BriefV1` in `packages/core/src/agent-schemas/brief.ts` is `{ summary, todo: Line[] (max 5), watch: Line[] (max 5), market: MarketLine[] (max 3), missing_inputs: string[] }`. `renderBriefMarkdown(brief)` writes the sections in fixed order, and the schema rejects output above 300 whitespace-separated tokens.
- [ ] Write the `morning_brief` job with tools `watch_facts`, `recent_items` and `create_item`, `maxTurns` 6, a 3 minute timeout and schedule `07:00`. On claim, when the same day's `research_scan` or `portfolio_watch` job is queued or running, the job sets `run_after` 5 minutes later, up to 3 times, then proceeds and adds one `missing_inputs` line. A kind that is not registered yet counts as absent, not pending.
- [ ] Parse `esta://{type}/{id}` with `parseEstaUri()` in `packages/core/src/links/estaUri.ts` into a typed route (property, unit, lease, invoice, document, party, ledger). The job rejects a brief whose link does not resolve to an existing record of the household.
- [ ] Render agent Markdown with `AgentMarkdown` using an allowlist (paragraphs, lists, bold, links). Only `https:` and `esta://` links survive, `esta://` becomes an in-app link and raw HTML renders as text (SPEC §7.1).
- [ ] Build the Hộp thư tab from the P0-13 assistant note and citation chip composites. It lists the brief first, then alerts and proposals by time with the Trợ lý monogram and `HH:mm` stamp. Each item has `Đã đọc` and `Ẩn` text buttons. `Ẩn` sets `dismissed` with an undo toast `Đã ẩn ghi chú. Hoàn tác`. Server actions use the session client.
- [ ] Fill the Home brief slot from P3-16 with today's brief summary line and `Xem hộp thư`. When no brief exists yet the slot shows `Trợ lý chưa viết ghi chú hôm nay.`.
- [ ] Add `WorkerStatus` showing `Trợ lý chạy lúc 07:00` from the last finished run, and an app-wide banner `Trợ lý ngoại tuyến từ 07:05. Việc mới sẽ chạy khi máy hoạt động lại.` when the newest heartbeat is older than 5 minutes by the Clock.
- [ ] Run `pnpm agent:record` for `morning_brief` on the `full` seed at 2026-10-07 07:00 and commit the recording.
- [ ] Run `/impeccable harden` on the screen for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.

**You see.**

- [ ] At 2026-10-07 07:05, me.lane2 on Trợ lý Hộp thư sees the brief with `Cần làm` listing Phòng 5 `quá hạn 12 ngày`, the Thủ Đức lease ending in 25 days and Phòng 7's held deposit, then `Theo dõi`, and no `Thị trường` section yet.
- [ ] Home shows the brief summary line under `Cần làm hôm nay` with `Xem hộp thư`, and the status line reads `Trợ lý chạy lúc 07:00`.
- [ ] With the worker stopped and the clock 15 minutes later, every app page shows the offline banner.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/agent/test/golden/brief.test.ts` asserts the guard passes, the brief is at most 300 tokens, every link resolves, and the section order snapshot matches, not the wording (AGENT.md §7.3, AGT-4).
- [ ] `apps/agent/test/jobs/morningBrief.test.ts` gains cases for rescheduling while `portfolio_watch` is queued, proceeding after 3 reschedules with a missing-input line, and proceeding at once when `research_scan` is not registered.
- [ ] `packages/core/src/links/estaUri.test.ts` gains cases for each record type, an unknown type and a malformed id. `AgentMarkdown.test.tsx` gains cases for raw `<script>`, `javascript:` and `http:` links.
- [ ] Golden tests in AGENT.md §7 for `morning_brief` pass in replay mode with `ESTA_AGENT_MODE=replay pnpm --filter agent test`.
- [ ] Run `pnpm check`, then `pnpm e2e e2e/assistant-inbox.spec.ts` and `pnpm e2e e2e/home.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/assistant-inbox.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. me.lane1 opens Home at 390x844 light with the clock at 2026-10-07 07:05 and the worker in replay, at trunk and at head. Trunk has no brief, so the lane gates the brief note head adds. Save `p5-04-regression-home.png`. Pass when `Cần làm hôm nay` lists the same items in the same order on both sides and head adds the brief summary line with `Xem hộp thư`.
- [ ] Lane 2. SPEC §9.4 seed 9, first half. me.lane2 opens Trợ lý Hộp thư at 390x844 light and reads the brief. Save `p5-04-brief-mobile-light.png`. Pass when the sections read `Cần làm` then `Theo dõi`, `Cần làm` names Phòng 5 `quá hạn 12 ngày`, Căn hộ Thủ Đức 25 days and Phòng 7's deposit, and the page has no sparkle icon and no chat bubble.
- [ ] Lane 3. me.lane3 taps the Phòng 5 link in the brief at 1440x900 dark. Save `p5-04-brief-link.png`. Pass when the app opens the Phòng 5 invoice inside the app with the amount the brief showed.
- [ ] Lane 4. me.lane4 taps `Ẩn` on the grouped watch note at 390x844 dark, then `Hoàn tác`. Save `p5-04-dismiss-undo.png`. Pass when the toast reads `Đã ẩn ghi chú. Hoàn tác` and the note returns with status `new` in Studio.
- [ ] Lane 5. On its own slot, the lane stops the worker and sets the clock to 2026-10-07 07:20, and me.lane5 opens Home at 1440x900 light. Save `p5-04-offline-banner.png`. Pass when the banner reads `Trợ lý ngoại tuyến từ 07:05. Việc mới sẽ chạy khi máy hoạt động lại.` and the page has no console errors.
- [ ] Lane 6. ryan.lane6 opens Trợ lý at 1440x900 light. Save `p5-04-status-line.png`. Pass when the status line reads `Trợ lý chạy lúc 07:00` on Trợ lý and on Home.
- [ ] Lane 7. On its own slot, the worker starts with only `morning_brief` claimable while a `portfolio_watch` job sits queued, and the lane steps the clock 07:00, 07:05, 07:10, 07:15 and 07:20. ryan.lane7 opens `/dev/agent` and the brief at 390x844 dark. Save `p5-04-brief-dependency.png`. Pass when the brief job shows 3 reschedules 5 minutes apart and the brief carries one line naming the missing input.
- [ ] Lane 8. On its own slot with `ESTA_REPLAY_DIR=fixtures/agent-replay-cases/brief-html`, me.lane8 opens the brief at 1440x900 dark. Save `p5-04-sanitized.png`. Pass when the injected `<b onclick>` text renders literally, the `http:` link is plain text, and the DOM has no `script` element inside the note.
- [ ] Lane 9. ryan.lane9 sets compact density and opens Hộp thư at 1440x900 light, moving focus with the keyboard only. Save `p5-04-keyboard.png`. Pass when Tab reaches `Đã đọc` and `Ẩn` on every item in order with a visible focus ring and every item shows a time stamp.
- [ ] Lane 10. SPEC §9.4 seed 10 adapted. me.lane10 switches to English, text scale 130% and dark at 390x844, opens the Trợ lý inbox, follows the Phòng 5 link to the collections board and copies the reminder. Save `p5-04-seed10-english.png`. Pass when the inbox chrome is English, no text clips, and the board shows Phòng 5 `Overdue 12 days` with the reminder copied.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT, CLS and initial route JS gzipped for Home and Trợ lý on a production build (`pnpm build && pnpm start`) with the `full` seed, and `morning_brief` replay wall time.
- [ ] Probe. Run 5 interleaved Lighthouse runs per side per route and 10 replay runs of `morning_brief` on head.
- [ ] Baseline. Trunk serves Home and a Trợ lý placeholder, so compare both routes across sides. Trunk has no `morning_brief`, so record its head time as the first baseline.
- [ ] Rule. Fail when Home misses SPEC §7.2 (LCP 2.5 s, INP proxy TBT 200 ms, CLS 0.05) or its median LCP grows more than 10% over trunk, when Trợ lý initial JS exceeds 200 KB gzipped, or when `morning_brief` in replay exceeds 10 s.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/P5-04/P5-04-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of Mẹ's brief on Home, the Hộp thư tab, a link tap and the offline banner, saved as `~/.claude/orchestrate/esta/media/P5-04/P5-04-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Scan for market and legal news and show it under Thị trường (P5-05)

**Depends on.** P5-04.

**Files.**

- [ ] Create `supabase/migrations/20261007000600_research_dedupe.sql` with `pg_trgm`, a trigram index on `research_items.title_vi` and `research_title_similar(p_household_id, p_title, p_since)`.
- [ ] Create `packages/core/src/research/topics.ts`, `packages/core/src/research/nationalTopics.ts`, `packages/core/src/research/normalizeUrl.ts`, `packages/core/src/research/keepRule.ts` and their tests.
- [ ] Create `apps/agent/src/jobs/researchScan.ts`, `apps/agent/src/tools/write/addResearchItem.ts`, `packages/core/src/agent-schemas/research.ts` and `fixtures/agent-replay/research_scan/`.
- [ ] Create `apps/web/src/app/(app)/assistant/market/page.tsx` and `e2e/assistant-market.spec.ts`. Extend `supabase/tests/agent_research_conversations.test.sql` and the seed generator.

**Build.**

- [ ] Name the data shape. `ResearchTopic` is `{ label, query_templates, province_codes, property_ids, source: 'auto' }`. `deriveResearchTopics(properties, adminUnits, legacyMap)` in `packages/core/src/research/topics.ts` returns one topic per province and commune held, using current and legacy names (Bình Dương for `di-an`, Long An for `long-an`), plus the national topics stored as data in `nationalTopics.ts`.
- [ ] Extend the seed generator to write the derived `research_topics` for every household with the same function.
- [ ] Write the `research_scan` job with the AGENT.md §3 tools, `maxTurns` 30, a 10 minute timeout and schedule `06:00`. The S1 `PreToolUse` hook counts `WebSearch` and `WebFetch` calls and denies calls past the caps in `household_settings.agent` (default 12 and 8). In replay, search and fetch results come from the recording and CI makes no network call.
- [ ] Implement `add_research_item` in `apps/agent/src/tools/write/addResearchItem.ts`. It normalizes the URL with `normalizeUrl()`, applies `keepRule()` (published since the last successful run, or within 7 days on the first run, or a rule effective within 60 days), drops duplicates by URL or `research_title_similar` above 0.6 over 30 days, checks `summary_vi` at most 60 tokens, and runs the number guard.
- [ ] Write one `research_scan_empty` item `Không có tin đáng chú ý cho các khu vực của gia đình hôm nay.` when a run keeps nothing. A source that fails to fetch is dropped and the run continues.
- [ ] Feed `morning_brief` up to 3 items with relevance at least 0.6 into `market`, each with a citation chip. Re-record the `morning_brief` recording.
- [ ] Build the Thị trường tab. It lists items newest first with title, `why_it_matters_vi`, numbered citation chips showing source name and `dd/mm/yyyy`, a property filter, and a read-only `Chủ đề theo dõi` list of topics with no edit control.
- [ ] Run `/impeccable harden` on the Thị trường tab for long Vietnamese titles and source names, 130% text scale, empty, loading, error and offline states.

**You see.**

- [ ] At 2026-10-07 07:05, Thị trường for me.lane2 lists the replayed items, each with at least one citation chip and a date.
- [ ] The brief gains a `Thị trường` section with at most 3 items, each with a source chip.
- [ ] A replayed empty run shows `Không có tin đáng chú ý cho các khu vực của gia đình hôm nay.`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/research/topics.test.ts` gains cases for the seven seed properties giving TP. Hồ Chí Minh, Đồng Nai, Tây Ninh and Lâm Đồng topics with the legacy names Bình Dương and Long An, and the national topics present once.
- [ ] `normalizeUrl.test.ts` gains cases for tracking parameters, `www.`, trailing slash and fragment. `keepRule.test.ts` gains cases for 7 days on the first run and a rule effective in 59 and 61 days.
- [ ] `apps/agent/test/jobs/researchScan.test.ts` covers caps denied by the hook, an unreachable source dropped, URL and title duplicates dropped, the empty item, and related property ids that exist (AGT-5).
- [ ] `supabase/tests/agent_research_conversations.test.sql` gains a case for `research_title_similar` scoped to one household. Run `pnpm db:test`.
- [ ] Golden tests in AGENT.md §7 for `research_scan` and `morning_brief` pass in replay mode with `ESTA_AGENT_MODE=replay pnpm --filter agent test`.
- [ ] Run `pnpm check`, then `pnpm e2e e2e/assistant-market.spec.ts` and `pnpm e2e e2e/assistant-inbox.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/assistant-market.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. me.lane1 reads the brief in Hộp thư at 390x844 light with the clock at 2026-10-07 07:05, at trunk and head. Trunk has no research, so the lane gates the section head adds. Save `p5-05-regression-brief.png`. Pass when `Cần làm` and `Theo dõi` hold the same lines on both sides and head adds `Thị trường` with 1 to 3 items, each with a source chip.
- [ ] Lane 2. me.lane2 opens Thị trường at 1440x900 light and taps the first citation chip. Save `p5-05-market-desktop.png`. Pass when every item shows a source name and a `dd/mm/yyyy` date and the chip opens the recorded `https:` URL in a new tab.
- [ ] Lane 3. me.lane3 filters Thị trường by Dãy trọ Dĩ An at 390x844 dark. Save `p5-05-filter-di-an.png`. Pass when every listed item names Dĩ An or TP. Hồ Chí Minh in its reason line and the count drops below the unfiltered count.
- [ ] Lane 4. On its own slot with `ESTA_REPLAY_DIR=fixtures/agent-replay-cases/research-empty`, me.lane4 opens Thị trường at 1440x900 dark. Save `p5-05-empty-item.png`. Pass when the only new item reads `Không có tin đáng chú ý cho các khu vực của gia đình hôm nay.`.
- [ ] Lane 5. ryan.lane5 triggers a second `research_scan` for the same day from `/dev/agent` at 390x844 light. Save `p5-05-no-duplicates.png`. Pass when the run reads `done` and the Thị trường item count is unchanged.
- [ ] Lane 6. me.lane6 opens `Chủ đề theo dõi` at 1440x900 light. Save `p5-05-topics.png`. Pass when topics name TP. Hồ Chí Minh with Bình Dương, Tây Ninh with Long An, Đồng Nai and Lâm Đồng, and no edit, add or delete control appears.
- [ ] Lane 7. On its own slot with `ESTA_REPLAY_DIR=fixtures/agent-replay-cases/research-over-cap`, ryan.lane7 runs `research_scan` and opens its run in `/dev/agent` at 390x844 dark. Save `p5-05-caps.png`. Pass when the run shows 12 `WebSearch` and 8 `WebFetch` calls allowed and the extra calls listed as denied.
- [ ] Lane 8. The lane queries `research_items` for household lane8 in Studio at 1440x900 dark. Save `p5-05-summary-length.png`. Pass when every `summary_vi` has at most 60 whitespace-separated tokens and every `related_property_ids` entry exists in `properties`.
- [ ] Lane 9. me.lane9 sets text scale 130% and opens Thị trường at 390x844 light. Save `p5-05-scale-130.png`. Pass when long titles wrap without truncation and citation chips stay at least 44 px tall.
- [ ] Lane 10. SPEC §9.4 seed 10 adapted. me.lane10 switches to English, text scale 130% and dark at 390x844, opens Thị trường, then finds the overdue Dĩ An room on the collections board and copies the reminder. Save `p5-05-seed10-english.png`. Pass when the tab chrome is English, chips show dates as `07/10/2026`, and the board shows Phòng 5 `Overdue 12 days`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT, CLS and initial JS gzipped for the Thị trường route on a production build with the `full` seed, `research_scan` replay wall time, and `EXPLAIN (ANALYZE)` of `research_title_similar`.
- [ ] Probe. Run 5 interleaved Lighthouse runs per side, 10 replay runs of `research_scan` and 20 dedupe queries on head.
- [ ] Baseline. Trunk serves the Trợ lý route without the tab, so compare Trợ lý across sides and take head values for the tab, the job and the query as the first baseline.
- [ ] Rule. Fail when Thị trường initial JS exceeds 200 KB gzipped or LCP exceeds 2.5 s, Trợ lý LCP grows more than 10% over trunk, `research_scan` in replay exceeds 20 s, or the dedupe query exceeds 50 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/P5-05/P5-05-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of the brief's market section, the Thị trường tab, the property filter and a citation chip opening its source, saved as `~/.claude/orchestrate/esta/media/P5-05/P5-05-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Approve or dismiss proposals and execute approvals under the user's session (P5-06)

**Depends on.** P5-04, P3-08, P3-13.

**Files.**

- [ ] Create `supabase/migrations/20261007000700_tasks.sql` with `tasks` per SPEC §5.5, unique `agent_item_id`, RLS and the audit trigger, and `supabase/tests/tasks.test.sql`.
- [ ] Create `packages/core/src/proposals/registry.ts` with one zod schema per type and `packages/core/src/proposals/proposals.test.ts`.
- [ ] Create `apps/agent/src/tools/write/createProposal.ts` and `apps/agent/scripts/propose.ts` with the root script `pnpm agent:propose`.
- [ ] Create `apps/web/src/server/proposals/approve.ts` and `apps/web/src/server/proposals/handlers/` with one file per type.
- [ ] Create `packages/db/src/queries/tasks.ts`, `apps/web/src/app/(app)/assistant/tasks/actions.ts` and `apps/web/src/components/assistant/TaskList.tsx`.
- [ ] Edit the Hộp thư tab and the Home today list registry from P3-16. Create `e2e/assistant-proposals.spec.ts`, `e2e/tasks.spec.ts` and `fixtures/proposals/`.

**Build.**

- [ ] Name the data shape. `PROPOSAL_TYPES` in `packages/core/src/proposals/registry.ts` maps `create_task`, `draft_reminder`, `suggest_lease_renewal`, `suggest_rent_change` and `flag_data_issue` to `{ params: ZodSchema, confirm: 'none' | 'names_object' }`. `suggest_rent_change` params require `effective_period_start` to be a future period start with no issued invoice.
- [ ] Implement `create_proposal` with the number guard. It rejects unknown types and invalid params with a tool error and writes an `agent_items` row with kind `proposal` and a dedupe key.
- [ ] Write `approveProposal(itemId)` in `apps/web/src/server/proposals/approve.ts` as a server action on the user's session client. A conditional update moves status from `new` or `read` to `approved` with `decided_by` and `decided_at`, and only the caller that wins it runs the type's handler. Every handler write carries `agent_item_id` under a unique constraint, so a retry converges.
- [ ] Write the handlers. `create_task` and `flag_data_issue` insert a `tasks` row with `source = 'agent_proposal'`. `draft_reminder` opens the P3-13 reminder sheet with the drafted text and writes nothing else. `suggest_lease_renewal` creates a `draft` renewal lease linked by `renewal_of_lease_id`. `suggest_rent_change` inserts a `lease_amendments` row from the validated period start. A handler whose subject changed since the proposal (a terminated lease, an issued period) marks the item `failed` and shows `Đề xuất này không còn áp dụng.`.
- [ ] Render proposal cards from the P0-13 composite with `Đồng ý` and `Bỏ qua`. Types with `names_object` confirm in words first, for example `Tăng tiền thuê Phòng 2 lên 3.800.000 ₫ từ 25/11/2026?`. `Bỏ qua` sets `dismissed` with undo. Viewers see the card without buttons.
- [ ] Add a minimal task list. `TaskList` sits at the top of Hộp thư under `Việc cần làm` and lists open tasks by `due_on` with property, due date and a `Xong` text button that sets `done` with an undo toast. Writes go through the session client.
- [ ] Register open tasks due today or earlier as a source in the Home `Cần làm hôm nay` registry, so an approved task due today shows there too.
- [ ] Add `pnpm agent:propose --household <seed key> --type <type> --params <file>` in `apps/agent/scripts/propose.ts`. It calls the real `create_proposal` handler so lanes can seed proposals. It refuses when `ESTA_ENV=production`. Add the command to the CLAUDE.md commands table.
- [ ] Extend the seed generator with one `done` task with `source = 'user'` per household (seed key `seed:task:<household>:q7-insurance-call`), so the FND-7 checksum covers `tasks` without changing Home's seeded today list.

**You see.**

- [ ] me.lane2 taps `Đồng ý` on a `create_task` proposal due today. The task appears under `Việc cần làm` in Hộp thư and under `Cần làm hôm nay` on Home.
- [ ] Tapping `Xong` on the task removes it from both lists and Studio shows `status = 'done'`.
- [ ] `audit_log` shows the new `tasks` row and the `agent_items` status change with `actor_kind = 'user'` and her user id.
- [ ] A second approval of the same item creates no second task.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/proposals/proposals.test.ts` gains a valid and an invalid params case per type, an unknown type, and a rent change dated on an issued period.
- [ ] `apps/web/src/server/proposals/approve.test.ts` runs against local Supabase. It covers each handler, two concurrent approvals giving one effect, a dismissed item refusing approval, a stale subject marking `failed`, and a viewer rejected by RLS (AGT-6).
- [ ] `supabase/tests/tasks.test.sql` proves household isolation for select, insert, update and delete, viewer read-only, the `status` and `source` checks, unique `agent_item_id`, and an audit row per write. Run `pnpm db:test`.
- [ ] `e2e/tasks.spec.ts` covers an approved task in `Việc cần làm` and on Home, `Xong` with undo, and a task due tomorrow absent from Home.
- [ ] Golden tests in AGENT.md §7 for `create_proposal` validation pass in replay mode with `ESTA_AGENT_MODE=replay pnpm --filter agent test`.
- [ ] Run `pnpm check`, then `pnpm e2e e2e/assistant-proposals.spec.ts`, `pnpm e2e e2e/tasks.spec.ts` and `pnpm e2e e2e/home.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/assistant-proposals.spec.ts` and `e2e/tasks.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe. Each lane seeds its proposal with `pnpm agent:propose` from `fixtures/proposals/`, with the clock at 2026-10-07 07:05.

- [ ] Lane 1. Regression lane against trunk. SPEC §9.4 seed 9. me.lane1 reads the brief in Hộp thư at 390x844 light at trunk and head. Trunk cannot approve, so the lane gates head approving the `create_task` proposal `Gọi người thuê Phòng 5`. Save `p5-06-regression-seed9.png`. Pass when the brief reads the same on both sides, and on head the card shows `Đã đồng ý` and the task appears under `Việc cần làm` and on Home.
- [ ] Lane 2. me.lane2 approves `suggest_lease_renewal` for `thu-duc` at 1440x900 light. Save `p5-06-renewal-confirm.png`. Pass when the confirm names Căn hộ Thủ Đức and the new rent, and the lease page then shows a draft renewal linked to the old lease.
- [ ] Lane 3. me.lane3 approves `suggest_rent_change` for `di-an` Phòng 2 at 390x844 dark. Save `p5-06-rent-change.png`. Pass when the confirm reads `Tăng tiền thuê Phòng 2 lên 3.800.000 ₫ từ 25/11/2026?` and the lease shows an amendment from `25/11/2026` while the issued 2026-10-25 invoice is unchanged.
- [ ] Lane 4. me.lane4 approves `draft_reminder` for Phòng 5 at 1440x900 dark. Save `p5-06-reminder.png`. Pass when the reminder sheet opens with the drafted text, the copy button copies it, and no business row changed in Studio.
- [ ] Lane 5. me.lane5 taps `Bỏ qua` on a `flag_data_issue` proposal at 390x844 light. Save `p5-06-dismiss.png`. Pass when the item reads dismissed with an undo toast and `audit_log` shows only the `agent_items` update.
- [ ] Lane 6. After me.lane6 approves a `create_task` proposal, the lane opens `audit_log` in Studio at 1440x900 light. Save `p5-06-audit-actor.png`. Pass when the `tasks` insert and the `agent_items` update both show `actor_kind = 'user'` and her user id, and no row shows `agent:`.
- [ ] Lane 7. me.lane7 opens the same proposal in two tabs at 390x844 dark and taps `Đồng ý` in both. Save `p5-06-double-approve.png`. Pass when Studio shows exactly one `tasks` row with that `agent_item_id` and the second tab shows `Đã đồng ý`.
- [ ] Lane 8. The lane runs `pnpm agent:propose --type sell_property` for lane8, then ryan.lane8 opens `/dev/agent` items at 1440x900 light. Save `p5-06-unknown-type.png`. Pass when the command exits non-zero with the zod error and the item count is unchanged.
- [ ] Lane 9. ryan.lane9 terminates the Phòng 3 lease, then me.lane9 approves a `suggest_rent_change` for Phòng 3 at 1440x900 dark. Save `p5-06-stale.png`. Pass when the card shows `Đề xuất này không còn áp dụng.`, the item reads `failed`, and no amendment exists.
- [ ] Lane 10. SPEC §9.4 seed 10 adapted. me.lane10 switches to English, text scale 130% and dark at 390x844, approves a `create_task` proposal, then finds the overdue Dĩ An room and copies the reminder. Save `p5-06-seed10-english.png`. Pass when the buttons read `Approve` and `Dismiss` without clipping, the task appears on Home, and the board shows Phòng 5 `Overdue 12 days`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Server time of `approveProposal` per type, and Lighthouse mobile LCP, TBT, CLS and initial JS gzipped for Trợ lý and Home on a production build with the `full` seed.
- [ ] Probe. Run 20 approvals per type on head and 5 interleaved Lighthouse runs per side per route.
- [ ] Baseline. Trunk has no approvals, so take head approval times as the first baseline. Trunk serves both routes, so compare them across sides.
- [ ] Rule. Fail when p95 approval exceeds 500 ms, Home misses SPEC §7.2, or either route's initial JS grows more than 10% over trunk or exceeds 200 KB gzipped.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/P5-06/P5-06-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of seed 9 on a phone viewport, reading the brief, approving one proposal and seeing the task on Home, saved as `~/.claude/orchestrate/esta/media/P5-06/P5-06-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Ask the assistant questions and stream exact answers (P5-07)

**Depends on.** P5-06.

**Files.**

- [ ] Create `apps/agent/src/jobs/ask.ts`, `apps/agent/src/jobs/askStream.ts` and `fixtures/agent-replay/ask/`.
- [ ] Create `apps/agent/test/golden/ask.test.ts` and `apps/agent/test/golden/ask-ground-truth.sql`.
- [ ] Create `apps/web/src/app/(app)/assistant/ask/page.tsx`, `apps/web/src/app/(app)/assistant/ask/[conversationId]/page.tsx`, `apps/web/src/app/(app)/assistant/ask/actions.ts` and `apps/web/src/components/assistant/AnswerStream.tsx`.
- [ ] Create `e2e/assistant-ask.spec.ts`.

**Build.**

- [ ] Name the data shape. A conversation is `conversations` with `sdk_session_id`. A turn is a user `messages` row plus one assistant row whose `status` moves `streaming` to `done` or `error`, with `refs` holding the resolved `esta://` targets.
- [ ] Write `sendQuestion(conversationId, text)` as a server action on the session client. It inserts the user message and enqueues `ask` with key `ask:{message_id}`.
- [ ] Write the `ask` job with all read tools and `create_proposal`, `maxTurns` 15, a 2 minute timeout, the routine model, and the deep model when an operator ticks `Suy nghĩ kỹ hơn`. `cwd` is `conversations/{conversation_id}` under `ESTA_AGENT_HOME`. The job resumes `sdk_session_id` and stores the new one. Output language follows the question.
- [ ] Stream in `apps/agent/src/jobs/askStream.ts`. The worker buffers model text to sentence boundaries, runs the number guard on each sentence against the tool results so far, and appends passing sentences to the assistant row at most every 300 ms. A violating sentence stops the stream, the repair turn replaces the row content, and a second violation sets `error` with the operator item from P5-03.
- [ ] Render the Hỏi tab as a plain conversation page, not chat bubbles. It subscribes to the assistant row through Realtime and renders `AgentMarkdown` with GFM tables enabled for answers that are lists. `esta://` links open in-app. Streaming text appears without a typing animation, and a static `Trợ lý đang trả lời` line shows until the first sentence.
- [ ] Run `pnpm agent:record` for the ten AGENT.md §7.4 questions plus the lane follow-up and missing-data questions, and commit the recordings.
- [ ] Run `/impeccable harden` on the Hỏi tab for long Vietnamese questions and answers, 130% text scale, empty, loading, error and offline states.

**You see.**

- [ ] me.lane2 asks `Tháng này thu được bao nhiêu từ Dĩ An?` and the answer shows the October income amount with a link to the `di-an` ledger.
- [ ] `Which tenant paid late most often this year?` gets an English answer naming one tenant with a count.
- [ ] The first sentence appears within 10 seconds of send with the worker online.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/agent/test/golden/ask.test.ts` runs the ten AGENT.md §7.4 questions on the `full` seed at 2026-10-07 07:00. It asserts every number equals `ask-ground-truth.sql` after guard normalization and every link resolves (AGT-7).
- [ ] `apps/agent/test/jobs/askStream.test.ts` gains cases for sentence buffering, a violating sentence held back, a repair that replaces content, and a second violation setting `error`.
- [ ] `apps/agent/test/jobs/ask.test.ts` gains cases for resuming a session, a new conversation without a session, an English question, and a missing-data question that answers without any number outside tool results.
- [ ] Golden tests in AGENT.md §7 for `ask` pass in replay mode with `ESTA_AGENT_MODE=replay pnpm --filter agent test`.
- [ ] Run `pnpm check`, then `pnpm e2e e2e/assistant-ask.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/assistant-ask.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe. The worker runs in replay.

- [ ] Lane 1. Regression lane against trunk. me.lane1 opens Hỏi at 390x844 light at trunk and head. Trunk shows the placeholder, so the lane gates head asking `Tháng này thu được bao nhiêu từ Dĩ An?`. Save `p5-07-regression-q1.png`. Pass when the answer amount equals the `di-an` Thu chi tab's October income and its link opens that ledger.
- [ ] Lane 2. me.lane2 asks `Phòng nào ở Dĩ An đang quá hạn đóng tiền?` at 1440x900 light. Save `p5-07-q2-overdue.png`. Pass when the answer names Phòng 5 only with 12 days and links to its invoice.
- [ ] Lane 3. ryan.lane3 asks `Hợp đồng nào hết hạn trong 60 ngày tới?` at 1440x900 dark. Save `p5-07-q3-table.png`. Pass when the answer renders a table with one row, Căn hộ Thủ Đức, end date `01/11/2026`.
- [ ] Lane 4. me.lane4 asks question 5 about her revenue and the 500 million threshold at 390x844 dark. Save `p5-07-q5-tax.png`. Pass when accrued, projected and remaining amounts equal her tax card.
- [ ] Lane 5. me.lane5 asks `Sổ đất Bảo Lộc có đang thế chấp không, ở ngân hàng nào?` at 390x844 light. Save `p5-07-q8-mortgage.png`. Pass when the answer says it is mortgaged and names the bank shown on the Pháp lý tab.
- [ ] Lane 6. ryan.lane6 asks `Which tenant paid late most often this year?` at 1440x900 light. Save `p5-07-q10-english.png`. Pass when the answer is in English and the tenant and count equal `payment_behavior` from `pnpm agent:tool`.
- [ ] Lane 7. me.lane7 asks question 1, then `Còn tháng 9 thì sao?` at 390x844 dark. Save `p5-07-follow-up.png`. Pass when the second answer gives the September amount equal to the ledger and Studio shows the same conversation with an updated `sdk_session_id`.
- [ ] Lane 8. ryan.lane8 sends question 2 at 1440x900 dark and records time to first text. Save `p5-07-stream.png`. Pass when the first sentence appears within 10 s, the row ends `done`, and no animated dots or blinking caret render.
- [ ] Lane 9. me.lane9 asks `Giá thị trường của Đất Bảo Lộc hiện nay là bao nhiêu?` at 390x844 light. Save `p5-07-missing-data.png`. Pass when the answer says the app has no current market price, gives no estimate, and passes the guard.
- [ ] Lane 10. SPEC §9.4 seed 10 adapted. me.lane10 switches to English, text scale 130% and dark at 390x844, asks `Which rooms in Dĩ An are overdue?`, follows the link to the collections board and copies the reminder. Save `p5-07-seed10-english.png`. Pass when the answer is in English naming Phòng 5 with 12 days and no text clips.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from send to first visible sentence, time to `done`, and Lighthouse mobile LCP, TBT, CLS and initial JS gzipped for the Hỏi route on a production build with the `full` seed.
- [ ] Probe. Send each golden question 5 times on head with the worker online in replay, and run 5 interleaved Lighthouse runs per side.
- [ ] Baseline. Trunk serves the Trợ lý route without Hỏi, so compare Trợ lý across sides and take Hỏi and streaming values as the first baseline.
- [ ] Rule. Fail when any first visible sentence takes over 10 s (AGENT.md §5.6), Hỏi initial JS exceeds 200 KB gzipped, or Trợ lý LCP grows more than 10% over trunk.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/P5-07/P5-07-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of asking question 1, the answer streaming in, a follow-up and the ledger link, saved as `~/.claude/orchestrate/esta/media/P5-07/P5-07-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Run the weekly review, enforce caps and show agent diagnostics to operators (P5-08)

**Depends on.** P5-07.

**Files.**

- [ ] Create `apps/agent/src/jobs/weeklyReview.ts`, `packages/core/src/agent-schemas/weeklyReview.ts` and `fixtures/agent-replay/weekly_review/`.
- [ ] Create `packages/core/src/agent-limits/caps.ts`, `packages/core/src/agent-limits/backoff.ts` and their tests.
- [ ] Create `apps/web/src/app/(app)/assistant/diagnostics/page.tsx` and `apps/web/src/app/(app)/assistant/actions/retry.ts`.
- [ ] Create `apps/agent/test/crash.test.ts` and `e2e/assistant-diagnostics.spec.ts`.

**Build.**

- [ ] Write `weekly_review` with the deep model from `ESTA_MODEL_DEEP`, all read tools, `WebSearch`, `WebFetch`, `create_item` and `create_proposal`, `maxTurns` 25, a 10 minute timeout, schedule `Sunday 08:00` and key `weekly_review:{household_id}:{iso_week}`. It covers last week's collections against expected, the next 30 days, vacancy, notable expenses, the tax position change and up to 3 proposals.
- [ ] Reject a `suggest_rent_change` from `weekly_review` whose citations are not URLs fetched in this run or stored `research_items`.
- [ ] Encode daily caps as data. `capFor(kind, settings)` in `packages/core/src/agent-limits/caps.ts` reads `household_settings.agent` with defaults extract 30, ask 60, research 2 and weekly 1. The runner defers a job over its cap to the next local midnight. An `ask` over cap writes `Hôm nay Trợ lý đã trả lời đủ câu hỏi. Câu hỏi này sẽ được trả lời vào ngày mai.` into the assistant row.
- [ ] Classify SDK results. A result with `is_error: true` and a usage-limit cause reschedules with the 1, 5 and 25 minute backoff in `backoff.ts` and sets the heartbeat state `usage_limited`, so the status line reads `Trợ lý tạm dừng do hết hạn mức sử dụng`. A 401 surfaces to operators as an auth error (S1).
- [ ] After the last attempt fails, write an `info` item with a `Thử lại` button that admins see. `retryJob(itemId)` enqueues a fresh job with key `{original key}:retry:{n}`.
- [ ] Build the operator-only diagnostics page. It shows auth mode and agent mode from the latest heartbeat, the last 20 runs with status, turns and duration, failed guards, and usage and cost by kind for 7 days from `agent_runs`. Non-operators get `notFound()` and the avatar menu hides the link.
- [ ] Write `apps/agent/test/crash.test.ts`. It spawns the worker, sends SIGKILL after the first `create_item` of a `portfolio_watch` run, advances the clock past the kind's timeout plus 2 minutes, restarts the worker, and asserts every item exists once (AGT-1).
- [ ] Run `pnpm agent:record` for `weekly_review` on the `full` seed at 2026-10-11 08:00 and commit the recording.

**You see.**

- [ ] With the clock at 2026-10-11 08:05, Hộp thư shows one weekly review note and up to 3 proposals.
- [ ] Ryan's diagnostics page lists the last runs and a 7-day usage table by kind. Mẹ's avatar menu has no diagnostics link.
- [ ] `pnpm --filter agent test crash` passes with items counted once.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/agent-limits/caps.test.ts` gains cases for defaults, an override, the cap reached exactly and a next-day reset. `backoff.test.ts` covers attempts 1 to 3 and give-up.
- [ ] `apps/agent/test/jobs/weeklyReview.test.ts` gains cases for at most 3 proposals, an uncited rent proposal rejected, and the ISO-week key preventing a second run (AGT-8).
- [ ] `apps/agent/test/runner.test.ts` gains cases for a usage-limit result rescheduled, an auth `is_error` failing with an operator item, and the failed-job item after 3 attempts.
- [ ] `apps/agent/test/crash.test.ts` proves effects exactly once after a mid-job kill (AGT-1).
- [ ] Golden tests in AGENT.md §7 for `weekly_review` pass in replay mode with `ESTA_AGENT_MODE=replay pnpm --filter agent test`.
- [ ] Run `pnpm check`, then `pnpm e2e e2e/assistant-diagnostics.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/assistant-diagnostics.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe. Lanes that move the clock run on their own slot.

- [ ] Lane 1. Regression lane against trunk. ryan.lane1 runs `portfolio_watch` from `/dev/agent` at 1440x900 light with the clock at 2026-10-07 06:45, at trunk and head. Trunk has no weekly review, so the lane then gates head at 2026-10-11 08:05 on its own slot. Save `p5-08-regression-weekly.png`. Pass when both sides create the same 4 watch items, caps block nothing, and head shows one `weekly_review` run `done`.
- [ ] Lane 2. On its own slot at 2026-10-11 08:05, me.lane2 opens Hộp thư at 1440x900 light. Save `p5-08-weekly-note.png`. Pass when the weekly note shows last week's collected and expected amounts equal to the collections board and at most 3 proposals.
- [ ] Lane 3. The lane sets the `ask` cap to 2 for household lane3 in Studio, and me.lane3 asks 3 questions at 390x844 light. Save `p5-08-ask-cap.png`. Pass when the third answer row reads `Hôm nay Trợ lý đã trả lời đủ câu hỏi. Câu hỏi này sẽ được trả lời vào ngày mai.` and its job `run_after` is the next local midnight.
- [ ] Lane 4. On its own slot with `ESTA_REPLAY_DIR=fixtures/agent-replay-cases/usage-limit`, me.lane4 opens Home at 390x844 dark after a `morning_brief` run. Save `p5-08-usage-limit.png`. Pass when the status line reads `Trợ lý tạm dừng do hết hạn mức sử dụng` and the job shows `run_after` 1 minute later.
- [ ] Lane 5. On its own slot with `ESTA_REPLAY_DIR=fixtures/agent-replay-cases/always-fail`, ryan.lane5 opens Hộp thư at 1440x900 dark after 3 attempts, then taps `Thử lại` with the normal recordings restored. Save `p5-08-retry.png`. Pass when the failed item shows `Thử lại` and the retry job ends `done` with key suffix `:retry:1`.
- [ ] Lane 6. ryan.lane6 opens diagnostics at 1440x900 light. Save `p5-08-diagnostics.png`. Pass when the page shows agent mode `replay`, the last runs with durations, and a 7-day usage table by kind.
- [ ] Lane 7. me.lane7 opens the avatar menu, then the diagnostics URL directly, at 390x844 light. Save `p5-08-diagnostics-hidden.png`. Pass when the menu has no diagnostics entry and the URL shows the not-found page.
- [ ] Lane 8. On its own slot, the lane kills the worker after the first `create_item` of `portfolio_watch`, advances the clock 6 minutes and restarts it, and ryan.lane8 opens `/dev/agent` at 1440x900 dark. Save `p5-08-crash-once.png`. Pass when the job reads `done` with 2 attempts and the items list holds exactly 4 watch items.
- [ ] Lane 9. On its own slot at 2026-10-11 08:05, me.lane9 opens a weekly rent proposal at 390x844 dark. Save `p5-08-weekly-citations.png`. Pass when the proposal shows citation chips whose URLs exist in `research_items` or the run's fetch log.
- [ ] Lane 10. SPEC §9.4 seed 10 adapted. ryan.lane10 switches to English, text scale 130% and dark at 390x844, opens diagnostics and the status line, then finds the overdue Dĩ An room and copies the reminder. Save `p5-08-seed10-english.png`. Pass when diagnostics tables stack without horizontal scroll and the board shows Phòng 5 `Overdue 12 days`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. `claim_agent_job` time with cap checks on the `full` seed with 10 lane households, `weekly_review` replay wall time, and Lighthouse mobile LCP and initial JS gzipped for diagnostics on a production build.
- [ ] Probe. Run 100 claims per side interleaved at trunk and head, 5 replay runs of `weekly_review`, and 5 Lighthouse runs on head.
- [ ] Baseline. Trunk claims without caps, so compare claim time across sides. Trunk has no weekly review or diagnostics, so take head values as the first baseline.
- [ ] Rule. Fail when p95 claim time grows more than 20% over trunk or exceeds 20 ms, `weekly_review` in replay exceeds 30 s, or diagnostics initial JS exceeds 200 KB gzipped.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/P5-08/P5-08-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of the weekly note, the usage-limit status line, a `Thử lại` retry and the operator diagnostics page, saved as `~/.claude/orchestrate/esta/media/P5-08/P5-08-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Email the morning brief and action items through SMTP (P5-09)

**Depends on.** P5-08.

**Files.**

- [ ] Create `packages/core/src/notify/recipients.ts`, `packages/core/src/email/briefEmail.ts`, `packages/core/src/email/actionEmail.ts` and their tests.
- [ ] Create `apps/agent/src/notify/deliver.ts` and `apps/agent/src/notify/smtp.ts`.
- [ ] Create `e2e/email-brief.spec.ts` and extend `supabase/seed/generator/` with `notification_preferences` defaults.
- [ ] Edit `.env.example` and SPEC §8 for `ESTA_APP_URL`.

**Build.**

- [ ] Name the data shape. `recipientsFor(item, members, preferences, sentToday)` in `packages/core/src/notify/recipients.ts` returns `{ memberId, channel, status: 'queued' | 'skipped' }[]`. It honours kinds, severities and `daily_cap` per member, skips `operator` items for non-operators, and covers only `brief` items and `action` items (PLT-4).
- [ ] Render emails as pure functions. `renderBriefEmail(brief, locale, appUrl)` returns `{ subject, html, text }` with subject `Ghi chú buổi sáng 07/10/2026`, the brief sections, NFC-normalized text, the same link allowlist as `AgentMarkdown`, and `esta://` links rewritten to `ESTA_APP_URL` paths. `renderActionEmail` does the same for one action item. Chrome follows the member locale. Body text stays in the household locale.
- [ ] Deliver from the worker. After a job commits and on every scheduler tick, `deliverPending()` inserts `notifications` rows with `on conflict do nothing` on `(user_id, agent_item_id, channel)`, sends `queued` email rows through nodemailer to `SMTP_URL`, and sets `sent`, or `failed` with the error for a retry on the next tick.
- [ ] Refuse to start delivery when `EMAIL_TRANSPORT` is not `smtp` outside production, so development mail only reaches Inbucket. The production sender is an operator item at the Phase 6 gate. This PR configures no real sender and sends nothing to real addresses.
- [ ] Add `ESTA_APP_URL` to `.env.example`, the zod env schemas of web and agent, and the SPEC §8 table in this PR.
- [ ] Seed `notification_preferences` for every lane member with email on for `brief` and `action` and `daily_cap` 10.

**You see.**

- [ ] After the 2026-10-07 07:00 brief, Inbucket shows `Ghi chú buổi sáng 07/10/2026` in the me.lane2 mailbox with correct diacritics.
- [ ] The same mailbox holds one email per `action` item (Phòng 5, Thủ Đức lease, Phòng 7 deposit).
- [ ] Restarting the worker sends no second copy.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/notify/recipients.test.ts` gains cases for kinds and severities filtering, the daily cap reached, an operator item to a non-operator, and a `watch` item not emailed.
- [ ] `packages/core/src/email/briefEmail.test.ts` gains snapshot cases for the HTML and text parts, NFC normalization of `Hường`, an `esta://` link rewritten to `ESTA_APP_URL`, and a stripped `javascript:` link.
- [ ] `apps/agent/test/notify/deliver.test.ts` runs against local Supabase and Inbucket. It covers a send, a rerun with no duplicate, an SMTP failure marked `failed` and retried, and a cap skip (PLT-4).
- [ ] Golden tests in AGENT.md §7 for `morning_brief` pass in replay mode with `ESTA_AGENT_MODE=replay pnpm --filter agent test`.
- [ ] Run `pnpm check`, `pnpm db:test`, then `pnpm e2e e2e/email-brief.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe. The worker runs in replay with the clock at 2026-10-07 07:05.

- [ ] Lane 1. Regression lane against trunk. The lane signs me.lane1 in at trunk and head and opens her Inbucket mailbox at 1440x900 light. Trunk sends no brief email, so the lane gates head's brief email. Save `p5-09-regression-mailbox.png`. Pass when the sign-in code arrives on both sides and head adds `Ghi chú buổi sáng 07/10/2026`.
- [ ] Lane 2. The lane opens the me.lane2 brief email HTML in Inbucket at 390x844 light. Save `p5-09-brief-html-mobile.png`. Pass when `Phòng 5`, `quá hạn 12 ngày` and `Căn hộ Thủ Đức` render with correct diacritics and the sections read `Cần làm`, `Theo dõi`, `Thị trường` in order.
- [ ] Lane 3. The lane opens the plain text part of the me.lane3 brief at 1440x900 light. Save `p5-09-brief-text.png`. Pass when the text part holds the same section headings and amounts as the HTML part.
- [ ] Lane 4. The lane opens the me.lane4 mailbox at 1440x900 light. Save `p5-09-action-emails.png`. Pass when exactly three action emails exist, for Phòng 5, the Thủ Đức lease and Phòng 7's deposit, and none for watch or info items.
- [ ] Lane 5. The lane sets ryan.lane5 email preferences to `brief` only in Studio before the 07:00 run, then opens his mailbox at 390x844 light. Save `p5-09-preferences.png`. Pass when he has the brief email and no action emails.
- [ ] Lane 6. The lane sets me.lane6 `daily_cap` to 2, then opens her mailbox and `notifications` in Studio at 1440x900 light. Save `p5-09-daily-cap.png`. Pass when 2 emails arrived and the remaining rows read `skipped`.
- [ ] Lane 7. The lane restarts the worker twice and opens the me.lane7 mailbox at 1440x900 light. Save `p5-09-no-duplicates.png`. Pass when the brief email count stays 1.
- [ ] Lane 8. me.lane8 taps the Phòng 5 link in her brief email at 390x844 dark. Save `p5-09-email-link.png`. Pass when the browser opens the app at the Phòng 5 invoice after sign-in.
- [ ] Lane 9. On its own slot, the lane stops Inbucket before 07:00, starts it at 07:10, and opens `notifications` for lane9 in Studio, then the mailbox, at 390x844 light. Save `p5-09-smtp-retry.png`. Pass when rows read `failed` with an SMTP error first and the email arrives after Inbucket returns with rows reading `sent`.
- [ ] Lane 10. SPEC §9.4 seed 10 adapted. me.lane10 sets her language to English, text scale 130% and dark at 390x844, opens her brief email from Inbucket, follows its Phòng 5 link, and copies the reminder. Save `p5-09-seed10-english.png`. Pass when the email chrome is English, the body names Phòng 5 with 12 days, and the board shows `Overdue 12 days`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from the brief item commit to its arrival in Inbucket, and `renderBriefEmail` time (vitest bench).
- [ ] Probe. Run 10 brief jobs for 10 lane households on head and read Inbucket arrival times, and run the render bench 1,000 times.
- [ ] Baseline. Trunk sends no notifications, so record that and take head values as the first baseline. Compare `morning_brief` replay wall time across sides to show delivery adds nothing to the job.
- [ ] Rule. Fail when any brief email arrives more than 60 s after commit, a render exceeds 20 ms, or `morning_brief` wall time grows more than 10% over trunk.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/P5-09/P5-09-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of the brief email in Inbucket at phone width, its text part and a link opening the app, saved as `~/.claude/orchestrate/esta/media/P5-09/P5-09-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Pass the live run and north-star steps 7 and 9 (P5-10)

**Depends on.** P5-09.

**Files.**

- [ ] Edit `e2e/northstar.spec.ts` to add steps 7 and 9.
- [ ] Create `fixtures/agent-replay/northstar/` recordings for the 2026-10-08 jobs and the step 9 question.
- [ ] Create `scripts/live-run.ts` with the root script `pnpm agent:live-run`.
- [ ] Create `docs/plan/trail/phase-5-live-run.md` and the per-job output files under `docs/plan/trail/phase-5/`.
- [ ] Edit `docs/plan/STATUS.md` and AGENT.md where the live run disagrees with it.

**Build.**

- [ ] Add north-star steps 7 and 9 to `e2e/northstar.spec.ts` on the `northstar` seed in replay. After step 6 the test sets the clock to 2026-10-08 07:05 with `pnpm clock:set`, waits for the worker to backfill `research_scan`, `portfolio_watch` and `morning_brief` in schedule order, and asserts step 7. Then Ryan asks `Tháng này thu được bao nhiêu từ Dĩ An?` and the test asserts step 9 against SQL ground truth.
- [ ] Record the northstar replay with `pnpm agent:record`. Placeholders map the records created in steps 2 to 6 back to the current run's ids.
- [ ] Write `pnpm agent:live-run` in `scripts/live-run.ts`. It runs every job kind once in `live` mode on the `full` seed with the frozen clock (AGENT.md §7.6) and checks watch facts against §7.1, the brief against §7.3, the ten Ask questions against §7.4, research against §7.5 (every source URL returns 200 at check time) and extraction against §7.2. It writes outputs, `agent_runs` usage and cost to `docs/plan/trail/phase-5/`. It uses Ryan's subscription token from `apps/agent/.env.local` and refuses `ESTA_ENV=production`.
- [ ] Run the live run once locally. Record the pass table, total `total_cost_usd` and any deviation in `docs/plan/trail/phase-5-live-run.md`, with no real family data.
- [ ] Record in `docs/plan/STATUS.md` the Phase 5 results, slipped P2 items, and every `[verify]` item still labelled.
- [ ] Assemble the Phase 5 gate package with the brief in the inbox, the brief email, one approval with its audit rows, an Ask answer with its ledger link, the operator diagnostics, and the live-run table.

**You see.**

- [ ] `pnpm e2e:northstar` passes steps 1 to 9 in replay. Step 7's brief lists the unpaid room `quá hạn 7 ngày`, the lease ending in 30 days and one market item with a source link. Step 9's answer shows the exact amount with a link to the Dĩ An ledger.
- [ ] `docs/plan/trail/phase-5-live-run.md` shows watch facts equal to §7.1, the brief passing §7.3, 10 of 10 Ask questions equal to ground truth, research passing §7.5 and extraction meeting §7.2.
- [ ] The 2026-10-07 brief email renders in Inbucket with correct Vietnamese, and an approved proposal's rows in `audit_log` show the approving user as actor.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Golden tests in AGENT.md §7 for every job kind pass in replay mode with `ESTA_AGENT_MODE=replay pnpm --filter agent test`. The watch set is exact (AGT-3) and the ten Ask questions are exact (AGT-7).
- [ ] Run `pnpm e2e e2e/northstar.spec.ts` and `pnpm e2e:northstar` in replay, with steps 7 and 9 passing.
- [ ] Run `pnpm e2e e2e/assistant-proposals.spec.ts` and `pnpm e2e e2e/email-brief.spec.ts` for approval audit (AGT-6) and the brief email (PLT-4).
- [ ] Run `pnpm check` and `pnpm db:test`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/northstar.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe. North-star lanes run on their own slot on the `northstar` seed.

- [ ] Lane 1. Regression lane against trunk. On the `northstar` seed, the lane runs north-star steps 1 to 6 as me.lane1 at 390x844 light at trunk and head. Trunk lacks steps 7 and 9, so the lane gates head's step 7 brief at 2026-10-08 07:05. Save `p5-10-regression-northstar.png`. Pass when steps 1 to 6 pass on both sides and head's brief lists the unpaid room `quá hạn 7 ngày`.
- [ ] Lane 2. North-star step 7. me.lane2 opens the brief at 390x844 light after the clock moves to 2026-10-08 07:05. Save `p5-10-step7-brief.png`. Pass when the brief lists the unpaid room overdue 7 days, the lease ending 2026-11-07 in 30 days, and one `Thị trường` item whose chip opens its source.
- [ ] Lane 3. North-star step 9. ryan.lane3 asks `Tháng này thu được bao nhiêu từ Dĩ An?` at 1440x900 light. Save `p5-10-step9-ask.png`. Pass when the amount equals the sum of October allocations for Dãy trọ Dĩ An in Studio and the link opens its ledger.
- [ ] Lane 4. ryan.lane4 opens the `/dev/core` watch section and runs `pnpm agent:tool watch_facts` on the `full` seed at 2026-10-07 at 1440x900 dark. Save `p5-10-golden-watch.png`. Pass when both list exactly the 8 golden facts and nothing else.
- [ ] Lane 5. The lane opens `docs/plan/trail/phase-5-live-run.md` rendered in the browser at 1440x900 light. Save `p5-10-live-run-table.png`. Pass when the table shows 10 of 10 Ask questions equal, the watch set equal, the brief passing, research URLs at 200 and the extraction targets met.
- [ ] Lane 6. The lane opens the me.lane6 brief email for 2026-10-07 in Inbucket at 390x844 light. Save `p5-10-brief-email.png`. Pass when the Vietnamese renders correctly and the sections match the in-app brief.
- [ ] Lane 7. me.lane7 approves one proposal at 390x844 dark, then the lane opens `audit_log` in Studio. Save `p5-10-approval-audit.png`. Pass when every row written by the approval shows `actor_kind = 'user'` with her user id.
- [ ] Lane 8. SPEC §9.4 seed 9. me.lane8 reads the morning brief and approves one proposal at 390x844 light. Save `p5-10-seed9-phone.png`. Pass when she completes both within 2 minutes, with no operator item or guard text visible to her.
- [ ] Lane 9. ryan.lane9 opens diagnostics after the live run at 1440x900 dark. Save `p5-10-diagnostics-live.png`. Pass when every job kind shows one `live` run with `subscription` auth mode, and none exceeded its AGENT.md §3 timeout.
- [ ] Lane 10. SPEC §9.4 seed 10 adapted. me.lane10 switches to English, text scale 130% and dark at 390x844, reads the brief, asks `Which rooms in Dĩ An are overdue?`, follows the link and copies the reminder. Save `p5-10-seed10-english.png`. Pass when no text clips, the answer names Phòng 5 with 12 days, and the reminder is copied.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of north-star steps 1 to 6 and of steps 7 to 9 in replay, live-run wall time per job kind, and live-run total cost.
- [ ] Probe. Run `pnpm e2e:northstar` 5 times per side interleaved at trunk and head, timing each step group, and run the live run once.
- [ ] Baseline. Trunk runs steps 1 to 6 only, so compare that group across sides and take steps 7 to 9 and the live run as the first baseline.
- [ ] Rule. Fail when steps 1 to 6 grow more than 10% over trunk, steps 7 to 9 exceed 120 s in replay, or any live job exceeds its AGENT.md §3 timeout.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/P5-10/P5-10-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of north-star steps 7 and 9 on a phone viewport, the brief email in Inbucket, and one approval with its audit rows, saved as `~/.claude/orchestrate/esta/media/P5-10/P5-10-review.mp4`.
- [ ] Post the screenshots, the video and the live-run table in chat, stop at merge-ready, and wait for the operator's click on the Phase 5 batch.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

Phase 6. The detailed sections for this phase are re-cut at phase start from `docs/plan/trail/slice-matrix.md` and `docs/plan/trail/pr-inventory.md`, which win where they conflict.

## Build settings for household, members, bank accounts, notifications and the assistant (P6-01)

**Depends on.** P5-10.

**Files.**

- [ ] Create `apps/web/src/app/settings/page.tsx`, `apps/web/src/app/settings/sections.ts` and one component per section under `apps/web/src/app/settings/_sections/` (`household.tsx`, `members.tsx`, `bank-accounts.tsx`, `notifications.tsx`, `assistant.tsx`, `display.tsx`).
- [ ] Create `apps/web/src/app/settings/actions.ts` with the server actions for every section.
- [ ] Create `supabase/migrations/20261007000100_settings_guards.sql` and `supabase/tests/settings_guards.test.sql`.
- [ ] Create `packages/core/src/bank/accountName.ts` and `packages/core/src/bank/accountName.test.ts`.
- [ ] Create `e2e/settings.spec.ts`. Edit `apps/web/messages/vi.json` and `apps/web/messages/en.json`.

**Build.**

- [ ] Run `/impeccable shape Cài đặt` and record the confirmed brief in the PR body before building.
- [ ] Define `SETTINGS_SECTIONS` in `apps/web/src/app/settings/sections.ts` as a registry of `{ id, titleKey, minRole, operatorOnly, component }` for `household`, `members`, `bank-accounts`, `notifications`, `assistant`, `display`, in that order. The page renders the registry filtered by the member's role and `is_operator`. No per-section role conditionals live in the page.
- [ ] Household section. Edit `households.name` and `household_settings.invoicing.receipt_header`. Show the timezone `Asia/Ho_Chi_Minh` as read-only text.
- [ ] Members section. List members with display name, email, role and invite state. Invite by email with a role through the P0-09 invite path. Change role, resend an unclaimed invite, and remove a member behind a confirm dialog that names the person, for example `Xóa Trần Minh Demo khỏi hộ gia đình?`.
- [ ] In `20261007000100_settings_guards.sql`, add trigger `household_members_keep_one_admin` that rejects any update or delete leaving a household with zero claimed admins, with SQLSTATE `ES001`. The action maps `ES001` to `Hộ gia đình cần ít nhất một quản trị viên.`.
- [ ] Bank accounts section. List `bank_accounts` with bank short name, masked account number and default mark. Add and edit with a BIN picker searching `bank_bins` short and full names through `esta_unaccent`. Normalize the holder name with `normalizeAccountName()` in `packages/core/src/bank/accountName.ts` (strip diacritics, đ to D, collapse spaces, uppercase ASCII) and show the stored form live under the field.
- [ ] Add SQL function `set_default_bank_account(p_id uuid)` in the same migration that clears and sets `is_default` in one statement under the caller's RLS, plus a partial unique index on `(household_id) where is_default` when P3-01 did not already add one.
- [ ] Notifications section. Per member and channel (`inapp`, `email`), toggle the kinds `brief` and `action` and set `daily_cap` on `notification_preferences`. Each member edits only their own rows. Move any interim preference control from P5-09 into this section and delete the old one.
- [ ] Assistant section. Every member sees the P5-04 worker status line and the read-only `research_topics` list with label, provinces and source. Operators also see the P5-08 diagnostics block (auth mode, last runs, usage by kind for 7 days) rendered from the existing component, moved here and deleted from its old place.
- [ ] Display section. Language, text scale `100 | 115 | 130`, density and theme, reusing the P0-14 member settings controls. The avatar menu keeps its language toggle and gains a `Cài đặt` link to this page.
- [ ] Run `/impeccable harden` on the screen for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.

**You see.**

- [ ] Signed in as `me.lane1@demo.esta.test` at 390x844, `Cài đặt` lists `Hộ gia đình`, `Thành viên`, `Tài khoản nhận tiền`, `Thông báo`, `Trợ lý`, `Hiển thị` and no diagnostics block.
- [ ] Signed in as `ryan.lane1@demo.esta.test`, the `Trợ lý` section shows `Chế độ xác thực` with the value `subscription` and a 7-day usage table by job kind.
- [ ] Typing `Nguyễn Thị Demo` as the account holder shows `NGUYEN THI DEMO` under the field, and the saved row has that value.
- [ ] Demoting the last remaining admin shows `Hộ gia đình cần ít nhất một quản trị viên.` and the role is unchanged in SQL.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/bank/accountName.test.ts` covers `Nguyễn Thị Demo`, `Đặng Thị Hường`, double spaces, and an already uppercase ASCII name (PLT-1). Run `pnpm check`.
- [ ] `supabase/tests/settings_guards.test.sql` proves the last-admin trigger on update and delete, `set_default_bank_account` leaves exactly one default, a member of household A cannot call it for household B, a viewer cannot write any settings table, and a member cannot edit another member's `notification_preferences` (FND-2). Run `pnpm db:test`.
- [ ] `e2e/settings.spec.ts` covers section visibility for admin, viewer and operator, the bank account add and default flow, an invite claimed by a new email in Inbucket, and the last-admin error. Run `pnpm e2e e2e/settings.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/settings.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. At trunk and head, as Mẹ in lane household 1 at 390x844 light, set text scale 130 from the avatar menu and open Home. Trunk has only the P0-14 placeholder at `/settings`, so the lane records that and gates the head page listing the six sections. Save `p6-01-regression-textscale.png`. Pass when Home renders at 130% on both sides with no clipped text and the head `/settings` shows all six section titles.
- [ ] Lane 2. Mẹ in lane household 2 at 390x844 light opens `Cài đặt`. Save `p6-01-me-mobile-light.png`. Pass when the six section titles show, the DOM has no `Chẩn đoán` text, and every control has a visible text label.
- [ ] Lane 3. Ryan in lane household 3 at 1440x900 dark opens the `Trợ lý` section with the worker running in replay mode. Save `p6-01-ryan-assistant-dark.png`. Pass when the auth mode reads `subscription`, the last runs list shows `morning_brief` and `portfolio_watch`, and the usage table has one row per job kind that ran in the last 7 days per `agent_runs`.
- [ ] Lane 4. Ryan in lane household 4 at 1440x900 light adds a bank account by typing `vietcom` in the BIN picker, enters `Trần Minh Demo` as the holder and sets it as default, then opens the QR sheet for Dĩ An Phòng 5 on `Thu tiền`. Save `p6-01-bank-default-qr.png`. Pass when the QR sheet shows Vietcombank and `TRAN MINH DEMO`, and SQL shows exactly one `is_default` row for household 4.
- [ ] Lane 5. Mẹ in lane household 5 at 390x844 dark invites `co.lane5@demo.esta.test` as a viewer, then the lane signs in as that email with the code from Inbucket. Save `p6-01-invite-viewer.png`. Pass when the invitee lands on Home of `Gia đình Demo 5` with role `viewer` in SQL and `Cài đặt` shows no edit buttons.
- [ ] Lane 6. Ryan in lane household 6 at 390x844 light demotes Mẹ to `member`, then tries to demote himself. Save `p6-01-last-admin.png`. Pass when the error reads `Hộ gia đình cần ít nhất một quản trị viên.` and SQL shows Ryan still `admin`.
- [ ] Lane 7. Mẹ in lane household 7 at 1440x900 light turns off email for `brief`, then the lane sets the clock to 2026-10-08 07:05 and lets the worker run `morning_brief` in replay. Save `p6-01-notify-off.png`. Pass when the brief appears in the in-app inbox and Inbucket holds no brief email for `me.lane7@demo.esta.test` while Ryan's arrives.
- [ ] Lane 8. Ryan in lane household 8 at 390x844 dark renames the household to `Gia đình Demo Nguyễn Thị Phương Thảo Hường Bảo Lộc` and sets text scale 130. Save `p6-01-long-name-130.png`. Pass when the name wraps without truncation in the header and the settings page, and no element overflows the 390 px viewport per `document.documentElement.scrollWidth`.
- [ ] Lane 9. Ryan in lane household 9 at 1440x900 dark opens `Trợ lý` in settings, then the lane stops the worker and advances the clock 10 minutes. Save `p6-01-topics-offline.png`. Pass when the research topics list shows the auto topics for the portfolio provinces with no edit control, and the status line turns into the offline notice that starts `Trợ lý ngoại tuyến từ`.
- [ ] Lane 10. SPEC §9.4 seed 10 adapted. Mẹ in lane household 10 at 390x844 switches to English, text scale 130% and dark from `Cài đặt`, reloads, then repeats seed 1 on Collections. Save `p6-01-seed10-english.png`. Pass when the settings persist after reload, the board shows Dĩ An Phòng 5 under Overdue with 12 days, and the reminder copy succeeds.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS for `/settings` and Home, and initial route JS gzipped for both, on a production build (`pnpm build && pnpm start`) with the full seed.
- [ ] Probe. 5 interleaved Lighthouse runs per side at trunk and head, signed in as `ryan.lane1@demo.esta.test`, and one `next build` route table per side.
- [ ] Baseline. Trunk serves the P0-14 placeholder at `/settings`, so record its values and add the absolute budget for the head page. Home is the same scenario on both sides.
- [ ] Rule. Fail when head `/settings` median LCP exceeds 2.5 s, TBT exceeds 200 ms, CLS exceeds 0.05, or initial JS exceeds 200 KB gzipped (SPEC §7.2), or when Home initial JS grows more than 5 KB over trunk.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/p6-01/p6-01-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of Mẹ opening `Cài đặt` on a phone and Ryan adding a bank account, saved as `~/.claude/orchestrate/esta/media/p6-01/p6-01-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Export all data as a ZIP and back it up nightly (P6-02)

**Depends on.** P6-01.

**Files.**

- [ ] Create `packages/core/src/export/tables.ts`, `packages/core/src/export/csv.ts`, `packages/core/src/export/manifest.ts` and their tests.
- [ ] Create `packages/db/src/export/writeExport.ts` and `packages/db/src/export/partyExport.ts`.
- [ ] Create `apps/web/src/app/api/export/route.ts`, `apps/web/src/app/api/export/party/[partyId]/route.ts` and `apps/web/src/app/settings/_sections/data.tsx`.
- [ ] Create `apps/agent/src/jobs/backup_export.ts`, `scripts/import-export.ts` and `scripts/row-counts.ts`.
- [ ] Create `supabase/migrations/20261007000200_exports_bucket_and_party_redaction.sql` and `supabase/tests/exports.test.sql`.
- [ ] Create `e2e/export.spec.ts`. Edit `.env.example`, `apps/web/src/server/env.ts`, `package.json` (`db:reset:empty`), `docs/spec/DOMAIN-VN.md` §8 and `docs/plan/STATUS.md`.

**Build.**

- [ ] Define `EXPORT_TABLES` in `packages/core/src/export/tables.ts` as an ordered registry of every household table with its columns and foreign key parents, so import order is data. A unit test fails when a migration adds a household table that the registry lacks, by comparing against `packages/db` generated types.
- [ ] Write `toCsv()` in `packages/core/src/export/csv.ts` with RFC 4180 quoting, UTF-8 with BOM for Excel, money as plain integers, and `buildManifest()` in `manifest.ts` with schema version, export date from the Clock, household id, and row counts per table.
- [ ] Write `writeExport(client, householdId, sink)` in `packages/db/src/export/writeExport.ts`. It reads each registry table through the given client, writes `tables/<name>.json` and `tables/<name>.csv`, streams every storage object under `{household_id}/` into `files/`, and writes `manifest.json`. The sink is a streaming ZIP writer (fflate `Zip`) for the web and a directory writer for the backup.
- [ ] Make `apps/web/src/app/api/export/route.ts` a Node runtime POST handler for admins. It calls `writeExport` with the user's session client, so RLS scopes the export to the household. It uploads the ZIP to the private `exports` bucket at `{household_id}/{export_id}.zip` and returns a signed URL with `ESTA_SIGNED_URL_TTL_SECONDS`. When the archive passes `ESTA_EXPORT_PART_MB` (default 45, under the 50 MB free-plan object limit), it starts `{export_id}-part-2.zip` and the manifest lists every part.
- [ ] Log one `document_access_log` row with action `download` per document included in an export.
- [ ] In `20261007000200_exports_bucket_and_party_redaction.sql`, create the `exports` bucket with storage policies that allow only household admins to read `{household_id}/*`, and SQL function `redact_party(p_party_id uuid, p_as_of date)`.
- [ ] `redact_party` refuses with SQLSTATE `ES002` while the party has an active lease or a held deposit as of `p_as_of`. Otherwise it replaces `full_name` with `Đã xóa`, clears `short_name`, `phone`, `zalo_phone`, `email`, `id_last4`, `address_text` and `notes`, and deletes the party's `id_card` documents and their storage objects. Leases, invoices and payments stay so totals do not change. This is an `[app rule]` under DOMAIN-VN §8. Record it there and list it in `docs/plan/STATUS.md` under "Needs professional confirmation".
- [ ] Per-party export in `packages/db/src/export/partyExport.ts` writes the party row and every lease, invoice, payment, deposit entry and document linked to it. The party page gains `Xuất dữ liệu của người này` and `Xóa thông tin cá nhân`, the second behind a confirm dialog naming the party.
- [ ] Settings gains a `Dữ liệu` section registered in `SETTINGS_SECTIONS` for admins, with `Xuất toàn bộ dữ liệu`, progress text, and the signed links when ready.
- [ ] `apps/agent/src/jobs/backup_export.ts` runs at 02:00 per AGENT.md §3 with the service-role client filtered by household id, writes to `ESTA_BACKUP_DIR/{household_id}/{local_date}/`, deletes backup folders older than 30 days, and deletes objects in the `exports` bucket older than 24 hours. The idempotency key is `backup_export:{household_id}:{local_date}`.
- [ ] `scripts/import-export.ts <zip or dir>` loads an export into the slot's database over `SUPABASE_DB_URL` in one transaction with `session_replication_role = replica`, so audit triggers add no rows. It sets `household_members.user_id` to null and keeps `invited_email`, so each member reclaims the row at first sign-in, and re-uploads `files/` with the service role. `scripts/row-counts.ts` compares the manifest with live counts.
- [ ] Add `pnpm db:reset:empty`, which applies migrations and reference data with no household rows.

**You see.**

- [ ] As Ryan, `Xuất toàn bộ dữ liệu` shows `Đang chuẩn bị tệp...` and then a link reading `Tải tệp ZIP (hết hạn sau 5 phút)`.
- [ ] `unzip -l` on the download lists `manifest.json`, a JSON and a CSV file per registry table, and `files/` with every document of the household.
- [ ] `scripts/row-counts.ts` after `pnpm db:reset:empty` and `scripts/import-export.ts` prints `all tables match` with zero differences.
- [ ] Deleting the personal data of the Kho Biên Hòa tenant shows the party as `Đã xóa`, and the July report totals are unchanged.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/export/tables.test.ts` proves the registry covers every household table and orders parents first. `csv.test.ts` covers commas, quotes, newlines, Vietnamese diacritics and the BOM. `manifest.test.ts` covers counts and the Clock date (PLT-2). Run `pnpm check`.
- [ ] `supabase/tests/exports.test.sql` proves a member of household A cannot read household B's `exports` objects, a non-admin cannot read any export, `redact_party` refuses for an active lease and for a held deposit, and a viewer cannot call it (FND-2). Run `pnpm db:test`.
- [ ] `apps/agent/test/backup_export.test.ts` proves a rerun on the same date writes no second folder, 31 dated folders shrink to 30, and exports older than 24 hours are deleted (PLT-3).
- [ ] `e2e/export.spec.ts` covers the full export round trip into an empty slot-9 database with `pnpm db:reset:empty`, the multi-part split with `ESTA_EXPORT_PART_MB=1`, per-party export, and the redaction refusal and success. Run `pnpm e2e e2e/export.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/export.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no export, so the lane records that and gates the head flow. Ryan in lane household 1 at 1440x900 light exports, downloads, and runs `scripts/row-counts.ts` against the manifest. Save `p6-02-export-link.png`. Pass when the link appears and every manifest count equals the SQL count for household 1.
- [ ] Lane 2. The lane imports lane household 2's export into a slot-9 stack after `pnpm db:reset:empty` and opens Supabase Studio at the slot's Studio port. Save `p6-02-reimport-studio.png`. Pass when `scripts/row-counts.ts` prints `all tables match` and `audit_log` holds exactly the exported rows.
- [ ] Lane 3. Mẹ in lane household 3 at 390x844 light exports from her phone. Save `p6-02-me-export-mobile.png`. Pass when the progress text and the link render inside the viewport with 44 px targets and the link opens a ZIP.
- [ ] Lane 4. The lane invites a viewer into lane household 4, signs in as the viewer at 390x844 dark, and posts to `/api/export` directly. Save `p6-02-viewer-denied.png`. Pass when `Cài đặt` shows no `Dữ liệu` section and the POST returns 403.
- [ ] Lane 5. Ryan in lane household 5 exports at 1440x900 dark, and the lane greps every JSON file for the other nine lane household ids. Save `p6-02-isolation.png`. Pass when the grep finds zero foreign household ids and `files/` holds only paths under household 5.
- [ ] Lane 6. The lane seeds 31 dated folders under `ESTA_BACKUP_DIR` for household 6, sets the clock to 2026-10-08 02:00, and runs `backup_export` from `/dev/agent`. Save `p6-02-backup-retention.png`. Pass when the folder `2026-10-08` exists with a manifest and exactly 30 dated folders remain.
- [ ] Lane 7. Ryan in lane household 7 at 1440x900 light exports the data of the Dĩ An Phòng 3 tenant. Save `p6-02-party-export.png`. Pass when the ZIP holds that party's leases, invoices and payments and no other tenant name appears in any file.
- [ ] Lane 8. Ryan in lane household 8 at 390x844 light tries to delete the personal data of the Phòng 7 tenant, then of the Kho Biên Hòa tenant. Save `p6-02-redact.png`. Pass when the first attempt shows the held-deposit refusal, the second shows `Đã xóa` on the party, and the collections and report totals match their values before the deletion.
- [ ] Lane 9. Ryan in lane household 9 exports at 1440x900 dark, and the lane counts `document_access_log` rows. Save `p6-02-access-log.png`. Pass when the new `download` rows equal the number of documents in `files/`, sensitive ones included.
- [ ] Lane 10. SPEC §9.4 seed 10 adapted. Ryan in lane household 10 at 390x844 in English, text scale 130% and dark exports from Settings, then repeats seed 1. Save `p6-02-seed10-english.png`. Pass when the Data section labels render in English without truncation, the link opens a ZIP, and Collections still shows Dĩ An Phòng 5 overdue 12 days.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time from `Xuất toàn bộ dữ liệu` to a ready link for one full-seed household on a production build, ZIP size, `backup_export` job wall time, and initial JS gzipped for `/settings`.
- [ ] Probe. 5 runs of the export and of `backup_export` on lane households 1 to 5 at head. One `next build` route table at trunk and head.
- [ ] Baseline. Trunk has no export or backup, so record that and add absolute budgets for the work the diff adds. `/settings` JS is the same route on both sides.
- [ ] Rule. Fail when the export median exceeds 20 s, `backup_export` exceeds its 20 minute timeout or 60 s on the full seed, or `/settings` initial JS grows past 200 KB gzipped (SPEC §7.2).

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/p6-02/p6-02-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of an export, its download, and the redaction confirm dialog, saved as `~/.claude/orchestrate/esta/media/p6-02/p6-02-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Design first-run onboarding and every empty state (P6-03)

**Depends on.** P6-02.

**Files.**

- [ ] Create `packages/core/src/onboarding/firstRun.ts` and `packages/core/src/onboarding/firstRun.test.ts`.
- [ ] Create `apps/web/src/components/first-run-checklist.tsx` and `apps/web/src/app/empty-states.ts`.
- [ ] Create `supabase/migrations/20261007000300_onboarding_setting.sql` and `supabase/tests/onboarding_setting.test.sql`.
- [ ] Create `e2e/first-run.spec.ts` and `e2e/empty-states.spec.ts`. Edit `apps/web/messages/vi.json`, `apps/web/messages/en.json` and every route that renders a list.

**Build.**

- [ ] Run `/impeccable onboard` across every surface and record the agreed first-run path and empty-state copy in the PR body before building.
- [ ] Define `FIRST_RUN_STEPS` in `packages/core/src/onboarding/firstRun.ts` as a registry of `{ id, titleKey, href, isDone(snapshot) }` for `add-property`, `add-bank-account` and `invite-member`. `firstRunState(snapshot)` returns the steps with done flags and `visible`, which is false once every step is done or the household dismissed the checklist. Completion is derived from data, never stored.
- [ ] Add `household_settings.onboarding jsonb not null default '{}'` in `20261007000300_onboarding_setting.sql`, holding only `dismissed_at`. Existing RLS on `household_settings` covers it. Extend the seed generator so lane households write `{}`.
- [ ] Render `FirstRunChecklist` at the top of Home for a household where `visible` is true, titled `Bắt đầu với Esta`, with one row per step and one action each. `Ẩn hướng dẫn` hides it with an undo toast.
- [ ] Define `EMPTY_STATES` in `apps/web/src/app/empty-states.ts` as a registry keyed by surface (Home, Tài sản, each property tab, Thu tiền, Tài liệu, Trợ lý tabs, Báo cáo, lease detail, meter entry, statement import, settings sections). Each entry has one message key and exactly one primary action. Every list route renders the P0-12 `EmptyState` from this registry.
- [ ] Write the copy in the DESIGN-BRIEF §3 voice, for example `Chưa có tài sản nào. Thêm tài sản đầu tiên bằng ảnh sổ hoặc nhập tay.` for Tài sản and `Trợ lý sẽ để lại ghi chú đầu tiên vào sáng mai lúc 07:00.` for the Hộp thư tab.
- [ ] Give every empty surface a distinct error state that reads `Chưa tải được. Kiểm tra kết nối mạng rồi thử lại.` with a retry action, so an empty list and a failed load never look the same.

**You see.**

- [ ] A new email signs in, creates `Gia đình Demo Mới`, and lands on Home with `Bắt đầu với Esta` and three steps, none done.
- [ ] After adding one property, Home shows the `add-property` step done and two remaining.
- [ ] Every route in a new household shows one empty-state message and exactly one primary button, and `e2e/empty-states.spec.ts` prints the count of routes checked.
- [ ] A full-seed household shows no first-run checklist on Home.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `packages/core/src/onboarding/firstRun.test.ts` covers an empty household, each step done alone, all done, and dismissed. Run `pnpm check`.
- [ ] `supabase/tests/onboarding_setting.test.sql` proves household isolation and that a viewer cannot write `onboarding` (FND-2). Run `pnpm db:test`.
- [ ] `e2e/first-run.spec.ts` covers sign-up through all three steps and the dismiss with undo. `e2e/empty-states.spec.ts` visits every `EMPTY_STATES` surface in a new household and asserts one message and one primary action. A test fails when a list route has no registry entry. Run `pnpm e2e e2e/first-run.spec.ts` and `pnpm e2e e2e/empty-states.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/empty-states.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. At trunk and head, `new.lane1@demo.esta.test` signs in at 390x844 light, creates a household and lands on Home. Trunk has no checklist, so the lane gates the shared end state and the head checklist. Save `p6-03-regression-firstrun.png`. Pass when both sides reach Home of the new household and the head shows `Bắt đầu với Esta` with three steps.
- [ ] Lane 2. `new.lane2@demo.esta.test` at 390x844 light follows `add-property` and adds a property by certificate photo with extraction in replay (SPEC §9.4 seed 3). Save `p6-03-first-property.png`. Pass when Home shows the step done and the property detail shows both addresses.
- [ ] Lane 3. `new.lane3@demo.esta.test` at 1440x900 dark follows `add-bank-account`, adds an account in `Cài đặt`, and returns. Save `p6-03-first-bank.png`. Pass when the step shows done and SQL has one default `bank_accounts` row.
- [ ] Lane 4. `new.lane4@demo.esta.test` at 390x844 dark follows `invite-member` and invites `co.lane4@demo.esta.test`. Save `p6-03-first-invite.png`. Pass when the step shows done and Inbucket holds the invite email in Vietnamese.
- [ ] Lane 5. `new.lane5@demo.esta.test` at 390x844 light opens every list route in the new household. Save `p6-03-empty-sweep.png` as a contact sheet. Pass when each route shows one message and one primary button and no route shows a raw table header with zero rows.
- [ ] Lane 6. `new.lane6@demo.esta.test` at 1440x900 light taps `Ẩn hướng dẫn`, taps undo, hides it again, and reloads. Save `p6-03-dismiss.png`. Pass when the checklist returns after undo, stays hidden after reload, and `household_settings.onboarding` has `dismissed_at`.
- [ ] Lane 7. Mẹ in full-seed lane household 7 at 390x844 light opens Home. Save `p6-03-seeded-home.png`. Pass when Home shows no `Bắt đầu với Esta` and the collection figure renders as at trunk.
- [ ] Lane 8. `new.lane8@demo.esta.test` at 1440x900 dark opens `Trợ lý` with the worker running. Save `p6-03-assistant-empty.png`. Pass when `Hộp thư` shows `Trợ lý sẽ để lại ghi chú đầu tiên vào sáng mai lúc 07:00.` and the status line shows the last heartbeat.
- [ ] Lane 9. `new.lane9@demo.esta.test` at 390x844 dark opens `Tài sản` with the network set offline in the browser. Save `p6-03-offline-empty.png`. Pass when the screen shows the error state with `Thử lại` and not the empty-state message.
- [ ] Lane 10. SPEC §9.4 seed 10 adapted. `new.lane10@demo.esta.test` at 390x844 in English, text scale 130% and dark sees the checklist and three empty states, then Mẹ of lane household 10 repeats seed 1. Save `p6-03-seed10-english.png`. Pass when the English copy wraps without truncation and Collections shows Dĩ An Phòng 5 overdue 12 days.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS and initial route JS gzipped for Home on a production build, for a new household and for a full-seed household.
- [ ] Probe. 5 interleaved runs per side at trunk and head for each household kind, and one `next build` route table per side.
- [ ] Baseline. Trunk Home for both household kinds is the same scenario as head. The checklist is diff-added, so the new-household run also has an absolute budget.
- [ ] Rule. Fail when head Home LCP exceeds 2.5 s, TBT exceeds 200 ms, CLS exceeds 0.05, or initial JS exceeds 200 KB gzipped (SPEC §7.2), or when the full-seed Home LCP median regresses more than 10% over trunk.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/p6-03/p6-03-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of a new household from sign-in to all three steps done, saved as `~/.claude/orchestrate/esta/media/p6-03/p6-03-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Harden and polish every surface to zero detector findings (P6-04)

**Depends on.** P6-03.

**Files.**

- [ ] Create `e2e/routes.ts`, `e2e/routes.test.ts`, `e2e/a11y-all.spec.ts` and `scripts/screens-all.ts`.
- [ ] Edit components and routes under `apps/web/src` that the passes below flag, and `apps/web/messages/vi.json` and `en.json` for copy fixes.

**Build.**

- [ ] Define `APP_ROUTES` in `e2e/routes.ts` as the single list of every non-dev route with its seed parameters (property seed key, lease, month, tab). `e2e/routes.test.ts` fails when a `page.tsx` under `apps/web/src/app` outside `dev/` has no entry.
- [ ] Run `/impeccable critique` on every route in `APP_ROUTES` and fix every high and medium point.
- [ ] Run `/impeccable audit` on every route and fix every high-severity point.
- [ ] Run `/impeccable harden` on every route for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.
- [ ] Run `/impeccable polish` on every route and record the before and after screenshots of each changed route.
- [ ] Write `scripts/screens-all.ts`, which drives `APP_ROUTES` through the verify skill at 390x844 and 1440x900 in Vietnamese, light and dark, and writes `/tmp/swarm-p6-04/screens/<route>-<width>-<theme>.png` plus an index page.
- [ ] Make `e2e/a11y-all.spec.ts` run axe on every `APP_ROUTES` entry at both widths and both themes.
- [ ] Bring `pnpm design:detect` over all of `apps/web` to zero findings. Record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and list it in the PR body.

**You see.**

- [ ] `pnpm design:detect` prints zero findings for `apps/web` and exits 0.
- [ ] `pnpm e2e e2e/a11y-all.spec.ts` reports zero serious or critical issues on every route at both widths and themes.
- [ ] The screens index under `/tmp/swarm-p6-04/screens/` shows four images per route with no clipped text, no horizontal scroll, and no English in the Vietnamese shots.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `e2e/routes.test.ts` covers registry completeness. Every unit test touched by a fix still passes. Run `pnpm check`.
- [ ] Run `pnpm e2e` for the full suite, since the passes touch shared components.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/a11y-all.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. SPEC §9.4 seed 1 at trunk and head. Mẹ in lane household 1 at 390x844 light finds the overdue Dĩ An rooms and copies the reminder. Save `p6-04-seed1-overdue.png`. Pass when both sides show Phòng 5 overdue 12 days with the same copied text, and head shows no layout shift or contrast issue that `/impeccable audit` flagged at trunk.
- [ ] Lane 2. Seed 2. Mẹ in lane household 2 at 390x844 dark records a cash payment from the collections row with the prefilled amount. Save `p6-04-seed2-cash.png`. Pass when the payment saves in at most 3 taps after the row opens and the toast reads `Đã ghi nhận` with the amount and `Hoàn tác`.
- [ ] Lane 3. Seed 3. Mẹ in lane household 3 at 1440x900 light adds a property by certificate photo with extraction in replay and accepts it. Save `p6-04-seed3-wizard.png`. Pass when the property shows the certificate address next to the current address and the completeness checklist shows.
- [ ] Lane 4. Seed 4. Mẹ in lane household 4 at 390x844 light types `bao loc so` in `Tài liệu`. Save `p6-04-seed4-search.png`. Pass when the Bảo Lộc certificate is the first result, blurred until tapped, and an access log row exists after opening it.
- [ ] Lane 5. Seed 5. Mẹ in lane household 5 at 390x844 dark enters readings for all 8 Dĩ An rooms. Save `p6-04-seed5-meters.png`. Pass when every input keeps its label at 390 px, the numeric keypad opens, and the next drafts show the new consumption lines.
- [ ] Lane 6. Seed 6. Ryan in lane household 6 at 1440x900 dark imports a statement fixture, commits, and confirms the suggestions in bulk. Save `p6-04-seed6-import.png`. Pass when memo matches post on commit, suggestions post after the bulk confirm, and a re-import posts nothing.
- [ ] Lane 7. Seed 7. Ryan in lane household 7 at 1440x900 light renews the Thủ Đức lease with a 5% increase. Save `p6-04-seed7-renew.png`. Pass when the new lease rent equals the old rent times 1.05 rounded per the escalation rule and the old lease reads `ended` on its end date.
- [ ] Lane 8. Seed 8. Mẹ in lane household 8 at 390x844 light opens her tax card. Save `p6-04-seed8-tax.png`. Pass when the projected revenue is between 400,000,000 and 499,999,999 VND, the threshold progress shows, and `Ước tính, không phải tư vấn thuế` is visible.
- [ ] Lane 9. Seed 9. Mẹ in lane household 9 at 390x844 dark, with the clock at 2026-10-08 07:05 and the worker in replay, reads the morning brief and approves one proposal. Save `p6-04-seed9-brief.png`. Pass when the brief lists Phòng 5 overdue and the lease ending, and `audit_log` names Mẹ as the actor of the approved change.
- [ ] Lane 10. Seed 10. Mẹ in lane household 10 at 390x844 switches to English, text scale 130% and dark, and repeats seed 1. Save `p6-04-seed10-english.png`. Pass when no text truncates without an affordance, Phòng 5 shows overdue 12 days in English, and the reminder copies.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS for Home and Collections, and initial JS gzipped for every route in `APP_ROUTES`, on a production build with the full seed.
- [ ] Probe. 5 interleaved Lighthouse runs per side at trunk and head for Home and Collections, and one `next build` route table per side.
- [ ] Baseline. Trunk and head serve the same routes, so trunk values are the baseline for every route.
- [ ] Rule. Fail when any route's initial JS grows more than 5 KB gzipped over trunk or passes 200 KB, or when Home or Collections pass LCP 2.5 s, TBT 200 ms or CLS 0.05 (SPEC §7.2).

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots and the screens index to `~/.claude/orchestrate/esta/media/p6-04/p6-04-review-<slug>.png`.
- [ ] Record a 30 to 60 second video walking Home, Collections, a property and Documents on a phone after polish, saved as `~/.claude/orchestrate/esta/media/p6-04/p6-04-review.mp4`.
- [ ] Post the screenshots and the video in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Set security headers and the CSP and meet performance budgets (P6-05)

**Depends on.** P6-04.

**Files.**

- [ ] Create `apps/web/src/middleware.ts` (or extend the existing one) and `apps/web/src/server/security/csp.ts` with `csp.test.ts`.
- [ ] Edit `apps/web/next.config.ts` for static security headers.
- [ ] Create `scripts/perf/bulk-rows.ts`, `scripts/perf/lighthouse.ts` and `scripts/perf/upload-throttled.ts`.
- [ ] Create `e2e/security-headers.spec.ts` and `e2e/perf-lists.spec.ts`.

**Build.**

- [ ] Write `buildCsp({ nonce, supabaseUrl, tileHost })` in `apps/web/src/server/security/csp.ts` as data, one directive per key. `default-src 'self'`. `script-src 'self' 'nonce-<n>' 'strict-dynamic'`. `connect-src 'self'` plus the Supabase https and wss origins and the tile host. `img-src 'self' blob: data:` plus the Supabase origin and the tile host. `worker-src 'self' blob:` for MapLibre. `font-src 'self'` because fonts are self-hosted. `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`.
- [ ] In `apps/web/src/middleware.ts`, generate a nonce per request, set `Content-Security-Policy` from `buildCsp`, and pass the nonce to the root layout for Next.js scripts.
- [ ] In `next.config.ts`, set `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(self), geolocation=(), microphone=()`.
- [ ] `scripts/perf/bulk-rows.ts` adds 1,000 synthetic `Demo` properties, 1,000 documents and 1,000 issued invoices to lane household 5 with the service role, keyed by seed keys so a rerun converges.
- [ ] `scripts/perf/lighthouse.ts` runs Lighthouse mobile on Home and Collections against `pnpm build && pnpm start` signed in as a lane member, 5 runs, and prints medians. `scripts/perf/upload-throttled.ts` uploads a 10 MB fixture at 10 Mbps through CDP throttling and records progress events.
- [ ] Fix every budget miss at its root (code splitting, lazy MapLibre and chart imports, server rendering of the first viewport) and record each fix with its before and after numbers in the PR body.

**You see.**

- [ ] `curl -sI http://localhost:3000/` on a production build shows `content-security-policy` with a nonce and the five static headers.
- [ ] Opening Tài sản map view, a signed document, and Trợ lý `Hỏi` logs zero CSP violations in the console.
- [ ] `scripts/perf/lighthouse.ts` prints medians for Home and Collections within SPEC §7.2.
- [ ] The 10 MB upload at 10 Mbps shows progress and completes with a client thumbnail.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/web/src/server/security/csp.test.ts` covers each directive, the nonce, a Supabase URL with a port, and that no directive allows `'unsafe-inline'` or `'unsafe-eval'` for scripts. Run `pnpm check`.
- [ ] `e2e/security-headers.spec.ts` asserts every header on `/`, `/settings` and an API route, and fails on any `securitypolicyviolation` event across `APP_ROUTES`. Run `pnpm e2e e2e/security-headers.spec.ts`.
- [ ] `e2e/perf-lists.spec.ts` scrolls the 1,000-row Tài sản, Tài liệu and Thu tiền lists and asserts the rendered row count stays under 100. Run `pnpm e2e e2e/perf-lists.spec.ts`.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/security-headers.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. SPEC §9.4 seed 1 on a production build at trunk and head. Mẹ in lane household 1 at 390x844 light finds the overdue Dĩ An rooms and copies the reminder. Save `p6-05-seed1-csp.png`. Pass when both sides show Phòng 5 overdue 12 days, and the head response carries the CSP and the console shows zero violations.
- [ ] Lane 2. Ryan in lane household 2 at 1440x900 light opens Home with the desktop map strip. Save `p6-05-home-map-strip.png`. Pass when the OpenFreeMap tiles render and zero CSP violations are logged.
- [ ] Lane 3. Mẹ in lane household 3 at 390x844 dark opens the Tài sản map view and drags a pin. Save `p6-05-map-worker.png`. Pass when the map renders through its blob worker, the pin saves, and zero CSP violations are logged.
- [ ] Lane 4. Mẹ in lane household 4 at 390x844 light uploads the 10 MB fixture with the network throttled to 10 Mbps. Save `p6-05-upload-throttled.png`. Pass when the progress indicator advances, the client thumbnail shows, and the document appears in `Tài liệu`.
- [ ] Lane 5. Ryan in lane household 5 at 1440x900 dark, after `scripts/perf/bulk-rows.ts`, scrolls the 1,000-row Tài sản list and types `demo 999` in search. Save `p6-05-1000-rows.png`. Pass when the matching row shows, scrolling stays responsive, and fewer than 100 rows are in the DOM.
- [ ] Lane 6. Ryan in lane household 6 at 1440x900 dark asks `Tháng này thu được bao nhiêu từ Dĩ An?` in `Hỏi` with the worker in replay. Save `p6-05-ask-realtime.png`. Pass when the answer streams over the Realtime wss connection and zero CSP violations are logged.
- [ ] Lane 7. Mẹ in lane household 7 at 390x844 light opens a Dĩ An invoice QR sheet and saves the receipt PNG and PDF. Save `p6-05-receipt-qr.png`. Pass when the QR and the receipt render and both downloads open.
- [ ] Lane 8. Mẹ in lane household 8 at 390x844 light runs seed 4 and opens the Bảo Lộc certificate. Save `p6-05-signed-view.png`. Pass when the signed Storage image loads under `img-src` and zero CSP violations are logged.
- [ ] Lane 9. Ryan in lane household 9 at 390x844 dark runs `scripts/perf/lighthouse.ts` on Collections and captures the report summary. Save `p6-05-lighthouse-collections.png`. Pass when the median LCP is at most 2.5 s, TBT at most 200 ms, and CLS at most 0.05.
- [ ] Lane 10. SPEC §9.4 seed 10 adapted. Mẹ in lane household 10 at 390x844 in English, text scale 130% and dark repeats seed 1 on the production build. Save `p6-05-seed10-english.png`. Pass when Phòng 5 shows overdue 12 days in English, the reminder copies, and zero CSP violations are logged.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS for Home and Collections, initial JS gzipped per route, INP proxy while scrolling the 1,000-row lists, and 10 MB upload wall time at 10 Mbps, on a production build with the full seed.
- [ ] Probe. 5 interleaved runs per side at trunk and head for each metric, the same bulk rows on both sides, and one `next build` route table per side.
- [ ] Baseline. Trunk and head run the same scenarios, so trunk values are the baseline. The CSP and middleware are diff-added and get the absolute budgets below.
- [ ] Rule. Fail when head misses any SPEC §7.2 budget (LCP 2.5 s, INP 200 ms through TBT, CLS 0.05, 200 KB initial JS per route, interactive 1,000-row lists, 10 MB upload completes with progress), or when the middleware adds more than 20 ms median TTFB over trunk.

**Review gate.** None. P6-05 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root squash-merges with `gh pr merge --squash --match-head-commit <verified head>` once every PR below it has merged.

## Write the deploy runbook, dry-run it and pass the full north-star on a production build (P6-06)

**Depends on.** P6-05.

**Files.**

- [ ] Create `docs/plan/DEPLOY.md` and `docs/plan/trail/deploy-dry-run.md`.
- [ ] Create `apps/agent/launchd/vn.esta.agent.plist`, `scripts/check-env.ts` and `scripts/smoke.ts`.
- [ ] Edit `e2e/playwright.config.ts` for a production-build mode, `scripts/dev-lan.ts` for `--prod`, and `package.json`.
- [ ] Edit `docs/plan/STATUS.md` and `docs/plan/mom-test.md`.

**Build.**

- [ ] Write `docs/plan/DEPLOY.md` as a numbered how-to. It covers the Supabase cloud project in Singapore (`ap-southeast-1`), `supabase link`, `supabase db push`, `supabase config push` for auth settings (6-digit OTP, session length), and storage buckets from migrations. It also covers the Vercel project in `sin1` with `vercel.json` regions and crons, and every SPEC §8 environment variable per environment (`preview` and `production`) with where its value comes from.
- [ ] DEPLOY.md also covers the Google OAuth client and its redirect URIs with the `ESTA_GOOGLE_AUTH=on` switch, production email sender choices with the SMTP variables, the worker under launchd per AGENT.md §2.4 with Energy settings and `caffeinate -s`, rollback steps, and when to move to a paid Supabase plan (paused project, database near 500 MB, storage near 1 GB, or a single export part above the object limit). Each step names who acts. Every cloud step is marked `Ryan` per CLAUDE.md "Stop and ask Ryan".
- [ ] Write `scripts/check-env.ts --target <preview|production> <env file>`, which parses the file with the zod schema from `apps/web/src/server/env.ts` and the agent's schema. It fails on a missing variable, on `ESTA_FROZEN_NOW` set for production, or on a service role key in a `NEXT_PUBLIC_` variable.
- [ ] Write `scripts/smoke.ts <base-url>`, which checks the security headers, `/dev` returns 404, `/api/test/clock` returns 404 when `ESTA_ENV=production`, the sign-in page renders `Đăng nhập`, and each cron route returns 401 without `CRON_SECRET`.
- [ ] Dry-run DEPLOY.md against the local stack with these steps in order. Run `pnpm db:reset:northstar`, a local production build with `NODE_ENV=production` and `ESTA_ENV=test`, `scripts/check-env.ts`, `scripts/smoke.ts`, `pnpm cron:run` against the build, and the worker loaded from `apps/agent/launchd/vn.esta.agent.plist` pointing at local Supabase. Record each step's command and output in `docs/plan/trail/deploy-dry-run.md` and fix the runbook wherever a step failed.
- [ ] Add a production-build mode to `e2e/playwright.config.ts` (`ESTA_E2E_BUILD=prod`) whose web server runs `pnpm build && pnpm start` with `ESTA_ENV=test`. `pnpm e2e:northstar` in that mode runs all nine steps on the `northstar` seed with agent jobs in replay.
- [ ] Re-run the P6-05 budget probe and `pnpm design:detect` on the final build and record the numbers in STATUS.md.
- [ ] Re-check the help center article on Agent SDK use under a subscription per AGENT.md §2.5 and record the date and the finding in `docs/plan/STATUS.md`. If the terms changed, stop and raise it with Ryan, since D5 is a locked decision.
- [ ] Repeat the Mom test per SPEC §10.1 on the final build through `pnpm dev:lan --prod` with seeded data. This is an operator step. Ryan runs it with Mẹ and records each task's time and any failure in `docs/plan/mom-test.md`. Each failure becomes a fix in this PR before merge.
- [ ] Bring `docs/plan/STATUS.md` up to date with what shipped, what slipped, every `[app rule]` labelled `Ước tính` or `Giả định`, and the Phase 6 exit evidence.

**You see.**

- [ ] `ESTA_E2E_BUILD=prod pnpm e2e:northstar` prints 9 of 9 steps passed on the production build against local Supabase.
- [ ] `scripts/smoke.ts http://localhost:3000` prints `smoke ok` with every check listed.
- [ ] `docs/plan/trail/deploy-dry-run.md` has one entry per DEPLOY.md step with its output and no step marked failed.
- [ ] `docs/plan/mom-test.md` shows all four tasks under two minutes on the final build, and STATUS.md shows the AGENT.md §2.5 re-check date.
- [ ] `pnpm design:detect` prints zero findings, and the budget medians in STATUS.md meet SPEC §7.2.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `scripts/check-env.test.ts` covers a complete preview file, a missing `CRON_SECRET`, a frozen clock in production, and a leaked service role key. `scripts/smoke.test.ts` runs against a stub server for each failing check. Run `pnpm check`.
- [ ] Run `pnpm db:test` on a fresh reset to prove every migration applies in order, as the cloud push will.
- [ ] Run `ESTA_E2E_BUILD=prod pnpm e2e:northstar` and the full `pnpm e2e` suite on the production build. Every acceptance id from FND-1 to PLT-4 that has a spec passes.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/a11y-all.spec.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. SPEC §9.4 seed 1 on a local production build at trunk and head. Mẹ in lane household 1 at 390x844 light finds the overdue Dĩ An rooms and copies the reminder. Save `p6-06-seed1-prod.png`. Pass when both sides show Phòng 5 overdue 12 days with identical reminder text and head `scripts/smoke.ts` prints `smoke ok`.
- [ ] Lane 2. Seed 2 on the production build. Mẹ in lane household 2 at 390x844 dark records a cash payment for Phòng 3 from the collections row. Save `p6-06-seed2-cash.png`. Pass when the payment saves in at most 3 taps after the row opens and the board moves Phòng 3 to `Đã thu`.
- [ ] Lane 3. Seed 3 on the production build. Mẹ in lane household 3 at 1440x900 light adds a property by certificate photo with extraction in replay. Save `p6-06-seed3-wizard.png`. Pass when the extracted parcel number and area show on the Pháp lý tab after acceptance.
- [ ] Lane 4. Seed 4 on the production build. Mẹ in lane household 4 at 390x844 light types `bao loc so`. Save `p6-06-seed4-search.png`. Pass when the Bảo Lộc certificate is first and opens through a signed URL that fails after the TTL.
- [ ] Lane 5. Seed 5 on the production build. Mẹ in lane household 5 at 390x844 dark enters readings for 8 rooms. Save `p6-06-seed5-meters.png`. Pass when the next Dĩ An drafts show the new electricity and water lines.
- [ ] Lane 6. Seed 6 on the production build. Ryan in lane household 6 at 1440x900 dark imports a statement, commits, and confirms suggestions in bulk. Save `p6-06-seed6-import.png`. Pass when the posted payment count equals memo matches plus confirmed suggestions and a re-import posts zero.
- [ ] Lane 7. Seed 7 on the production build. Ryan in lane household 7 at 1440x900 light renews Thủ Đức with a 5% increase, then runs `pnpm cron:run` with the clock at 2026-11-02. Save `p6-06-seed7-renew.png`. Pass when the old lease reads `ended`, the new one is `active`, and its first invoice carries the increased rent.
- [ ] Lane 8. Seed 8 on the production build. Mẹ in lane household 8 at 390x844 light opens her tax card. Save `p6-06-seed8-tax.png`. Pass when threshold progress and the estimate show with the disclaimer and the rule source.
- [ ] Lane 9. Seed 9 on the production build. The worker runs from the runbook's launchd plist in replay. The lane sets the clock to 2026-10-08 07:05, and Mẹ in lane household 9 at 390x844 dark reads the brief and approves one proposal. Save `p6-06-seed9-launchd-brief.png`. Pass when `launchctl list` shows `vn.esta.agent`, the brief lists Phòng 5 overdue 13 days, and `audit_log` names Mẹ as the approval actor.
- [ ] Lane 10. Seed 10 on the production build. Mẹ in lane household 10 at 390x844 switches to English, text scale 130% and dark, and repeats seed 1. Save `p6-06-seed10-english.png`. Pass when the board reads in English with no truncation and the reminder copies.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS for Home and Collections, initial JS per route, and `ESTA_E2E_BUILD=prod pnpm e2e:northstar` wall time on the final production build with the full seed.
- [ ] Probe. 5 interleaved runs per side at trunk and head, and the north-star run 3 times per side.
- [ ] Baseline. Trunk (P6-05 merged) and head run the same scenarios. The production-build e2e mode is diff-added, so the head run also has an absolute budget.
- [ ] Rule. Fail when any SPEC §7.2 budget is missed, when any route's initial JS grows over trunk, or when the production-build north-star exceeds 10 minutes.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/p6-06/p6-06-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of the production-build north-star run and the Mom test summary, saved as `~/.claude/orchestrate/esta/media/p6-06/p6-06-review.mp4`.
- [ ] Post the screenshots, the video and the Phase 6 exit evidence (north-star, budgets, detector, dry-run trail, Mom test) in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Set up the cloud project and deploy preview and production with the operator (P6-07)

**Depends on.** P6-06.

**Files.**

- [ ] Edit `vercel.json` (regions `sin1`, crons), `.env.example` and `docs/plan/DEPLOY.md` with each step's date and result.
- [ ] Create `scripts/lane-otp.ts` and `scripts/lane-otp.test.ts`.
- [ ] Edit `docs/plan/STATUS.md` and `.claude/skills/verify/SKILL.md` with a preview target.

**Build.**

- [ ] Load the `supabase` skill before any `supabase` CLI call and the Vercel platform skill before any `vercel` CLI call. The build stops at each operator step below and waits for Ryan. The PR itself stops at merge-ready.
- [ ] Operator step 1. Ryan creates two Supabase projects in Singapore, `esta-preview` for synthetic data and `esta-prod` for the family. The agent then runs `supabase link`, `supabase db push` and `supabase config push` per DEPLOY.md, first on `esta-preview`.
- [ ] Operator step 2. The agent seeds `esta-preview` with the `full` seed and 10 lane households through the generator. Production gets no seed. Real family data never enters `esta-preview`.
- [ ] Operator step 3. Ryan creates the Vercel project in `sin1` and connects the repository. The agent sets preview variables from `esta-preview` with `ESTA_ENV=preview` and production variables from `esta-prod` with `ESTA_ENV=production`, and runs `scripts/check-env.ts` on both.
- [ ] Operator step 4. Ryan creates the Google OAuth client with the preview and production redirect URIs and enables the Google provider in both Supabase projects. The agent sets `ESTA_GOOGLE_AUTH=on`.
- [ ] Operator step 5. Ryan picks and creates the production email sender (a paid service needs his approval) and sets the SMTP variables on `esta-prod` and Vercel production. Ryan sends the first real email, a sign-in code to his own address.
- [ ] Operator step 6. Ryan approves the preview deploy. The agent deploys, runs `scripts/smoke.ts <preview-url>`, and runs the live lanes below. The lanes run against the preview deploy only after Ryan creates it.
- [ ] Write `scripts/lane-otp.ts <email>`, which gets a 6-digit code through `auth.admin.generateLink` on `esta-preview` so lanes sign in without sending email. It refuses unless `ESTA_ENV=preview` and the project ref equals `ESTA_PREVIEW_PROJECT_REF`.
- [ ] Operator step 7. If more than 7 days passed since the AGENT.md §2.5 date in STATUS.md, re-check the terms and record the new date. Then Ryan approves the production deploy, the agent runs `scripts/smoke.ts <production-url>`, and Ryan signs in on his phone and Mẹ's.
- [ ] Operator step 8. Ryan points the worker at `esta-prod` in `apps/agent/.env.local`, reloads the launchd agent, and enqueues one `ping`. The agent confirms the heartbeat in `Cài đặt` and records the step in DEPLOY.md.

**You see.**

- [ ] `scripts/smoke.ts <preview-url>` and `scripts/smoke.ts <production-url>` both print `smoke ok`.
- [ ] The Vercel project shows region `sin1` and the three cron jobs from `vercel.json`.
- [ ] On production, Ryan's `Cài đặt` shows the worker status line with a heartbeat under 2 minutes old, auth mode `subscription`, and one `ping` run.
- [ ] `docs/plan/DEPLOY.md` shows every operator step with its date and who acted.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `scripts/lane-otp.test.ts` covers the refusal for `ESTA_ENV=production`, the refusal for a mismatched project ref, and code retrieval against a stub. A `vercel.json` test asserts region `sin1` and that each cron path exists under `apps/web/src/app/api/cron/`. Run `pnpm check`.
- [ ] Run `pnpm db:test` locally and `supabase db push --dry-run` on both projects, which list zero pending migrations after the push.
- [ ] Run `pnpm e2e e2e/security-headers.spec.ts` against the preview URL.
- [ ] Run `pnpm design:detect` with zero findings, or record each accepted exception with `npx impeccable ignores add-value <rule> <value> --reason "<reason>"` and cite it in the PR body.
- [ ] Run `/impeccable critique` on the touched surfaces and fix every high-severity point.
- [ ] axe reports zero serious or critical issues on the touched routes in `e2e/a11y-all.spec.ts` run against the preview URL.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no cloud deploy, so the lane runs SPEC §9.4 seed 1 on the trunk local production build and on the preview deploy. Mẹ of lane household 1 signs in with a code from `scripts/lane-otp.ts` at 390x844 light. Save `p6-07-seed1-preview.png`. Pass when both show Phòng 5 overdue 12 days with identical reminder text.
- [ ] Lane 2. Without signing in, the lane runs `scripts/smoke.ts` against the production URL and opens the sign-in page at 390x844 light. Save `p6-07-prod-signin.png`. Pass when the smoke prints `smoke ok`, `/dev` returns 404, and the page shows the email field and the Google button.
- [ ] Lane 3. On preview at 1440x900 dark, the lane clicks the Google button and stops at the Google consent page. Save `p6-07-google-redirect.png`. Pass when the URL host is `accounts.google.com` with the preview client id and the Supabase callback as `redirect_uri`.
- [ ] Lane 4. Seed 4 on preview. Mẹ in lane household 4 at 390x844 light types `bao loc so` and opens the certificate. Save `p6-07-seed4-storage.png`. Pass when the image loads from the `esta-preview` Storage host through a signed URL and an access log row exists.
- [ ] Lane 5. Seed 5 on preview. Mẹ in lane household 5 at 390x844 dark enters readings for 8 rooms. Save `p6-07-seed5-meters.png`. Pass when the next drafts update on preview.
- [ ] Lane 6. Seed 6 on preview. Ryan in lane household 6 at 1440x900 light imports a statement and confirms suggestions in bulk. Save `p6-07-seed6-import.png`. Pass when the posted count matches the fixture's golden result.
- [ ] Lane 7. On preview, the lane calls each cron route with and without `CRON_SECRET`, then Ryan in lane household 7 at 1440x900 light renews Thủ Đức with 5% (seed 7). Save `p6-07-seed7-cron.png`. Pass when the routes return 401 without the secret and 200 with it, and the renewed lease shows the increased rent.
- [ ] Lane 8. Seed 8 on preview. Mẹ in lane household 8 at 390x844 light opens her tax card. Save `p6-07-seed8-tax.png`. Pass when the figures equal the local production build values for the same household.
- [ ] Lane 9. Seed 9 on preview. The worker points at `esta-preview` in replay, the clock is 2026-10-08 07:05, and Mẹ in lane household 9 at 390x844 dark reads the brief and approves one proposal. Save `p6-07-seed9-brief.png`. Pass when the brief arrives over Realtime and `audit_log` on `esta-preview` names Mẹ as the actor.
- [ ] Lane 10. Seed 10 on preview. Mẹ in lane household 10 at 390x844 switches to English, text scale 130% and dark, and repeats seed 1. Save `p6-07-seed10-english.png`. Pass when the board reads in English without truncation and the reminder copies.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lighthouse mobile LCP, TBT and CLS for Home and Collections, and TTFB of `/`, on the preview deploy and on the trunk local production build, both with the full seed.
- [ ] Probe. 5 interleaved runs per side from the same machine, signed in as lane household 1.
- [ ] Baseline. Trunk is a local production build and head is the Vercel preview, which are unlike hosts. Record both and compare each against the absolute budgets only, never as a ratio.
- [ ] Rule. Fail when the preview misses SPEC §7.2 on Home or Collections (LCP 2.5 s, TBT 200 ms, CLS 0.05) or when the preview TTFB median for `/` exceeds 800 ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane screenshots to `~/.claude/orchestrate/esta/media/p6-07/p6-07-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of the preview deploy on a phone from sign-in to the collections board, saved as `~/.claude/orchestrate/esta/media/p6-07/p6-07-review.mp4`.
- [ ] Post the screenshots, the video and the DEPLOY.md step log in chat, stop at merge-ready, and wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] `docs/plan/STATUS.md` lists what shipped, what slipped and why, every item needing professional confirmation, and the dates the subscription terms were re-checked.
- [ ] Every P2 item that slipped is listed in `docs/plan/STATUS.md` per SPEC §4.
- [ ] The decision trail is audited against the transcript and reviewed by a model from a different family, per `skills/show-me-your-work/SKILL.md`.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

Every spike ran as a throwaway prototype on its own branch of `github.com/ngducn/esta`. Each branch holds a `REPORT.md` with the commands that reproduce it. No spike branch merges.

### S1 proves the worker runs on the subscription token

Branch `spike/s1-agent-sdk` at `83c56e0`, report `spikes/s1-agent-sdk/REPORT.md`, captures in `spikes/s1-agent-sdk/out/`.

The Claude Agent SDK 0.3.291 ran a live job on `CLAUDE_CODE_OAUTH_TOKEN` from `apps/agent/.env.local` with `apiKeySource=none`. The in-process MCP server `esta` answered `household_info`, the model transcribed a synthetic certificate image from the job directory exactly, and a read of `/etc/hosts` was denied. The run took 4 turns and cost 0.0144 USD (`out/live-hook.txt`). A missing token file stops the script with exit 2. A bogus token with a decoy `ANTHROPIC_API_KEY` fails with `401 OAuth access token is invalid` (`out/neg-b.txt`). An empty `CLAUDE_CONFIG_DIR` hides Ryan's logged-in keychain credentials (`out/neg-c.txt`). The `claude -p` fallback is not needed.

The spike found a hole in AGENT.md §2.2. Listing `Read` in `allowedTools` approves it before `canUseTool` runs, and the live model read `/etc/hosts` (`out/live-allowlist.txt`). A `PreToolUse` hook plus a `tools` list per job kind closes it. P0-15 builds the worker that way and corrects AGENT.md §2.2.

### S2 picks Source Sans 3 and Source Serif 4

Branch `spike/s2-fonts` at `31dd4a6`, report `spikes/s2-fonts/REPORT.md`, coverage output `spikes/s2-fonts/coverage-output.txt`, screenshots `spikes/s2-fonts/shots/<pair>-<theme>-<viewport>.png`.

All six candidate families cover all 68 code points of the glyph test string at every tested weight. Be Vietnam Pro and Fraunces have no tabular figures, so they fail the S2 check. Source Serif 4 has explicit `tnum` and `lnum` and an optical size axis, and renders `3.500.000 ₫` and `Đặng Thị Hường` cleanly at 32 and 44 px. Source Sans 3 sets tabular digits by default. The root inspected `ss3-ss4-light-390x844.png` and `ss3-ss4-dark-1440x900.png` and confirmed the diacritics stack correctly and the amount column aligns. `coverage.mjs` becomes `pnpm glyphs:check` in P0-11.

### S3 picks the NSO catalog and conversion table

Branch `spike/s3-admin-units` at `1945c64`, report `spikes/s3-admin-units/REPORT.md`, pinned downloads in `spikes/s3-admin-units/fetch.sh`.

The NSO catalog service gives 34 province-level units (25 provinces and 9 cities after the 2026 upgrades) and 3,321 commune-level units (709 wards, 2,599 communes, 13 special zones), matching Decision 19/2025/QĐ-TTg. The NSO conversion table maps 10,571 old commune rows to current communes by code, and every link resolves in both directions. An independent MIT dataset agrees on 10,561 of 10,565 pairs. All five DOMAIN-VN §4 lookups resolve to the expected province. Phường 2 of Tân An needs one curated row because it merged on 1 December 2024, before the table's baseline. The license basis is that legal and administrative documents are excluded from copyright under Article 15 of the IP Law. Ryan approves the source and that reading at this plan review. P0-06 builds the import.

### S4 confirms the VietQR payload and the BIN list source

Branch `spike/s4-vietqr` at `a7c9e76`, report `spikes/s4-vietqr/REPORT.md`, tests in `spikes/s4-vietqr/test/`, BIN snapshots in `spikes/s4-vietqr/data/`.

The DOMAIN-VN §10 payload is correct in substance. A pure encoder and decoder reproduce six published payloads byte for byte, including the NAPAS specification's own §6.3.3 example, decode two NAPAS card examples, and reject two malformed published samples. The independent `vietnam-qr-pay` library parses Esta's invoice payload to the same fields. A synthetic invoice for 15,000,000 đồng with memo `ESTA 7K2QX9MP` renders to a PNG and scans back to the same payload (`out/roundtrip.json`). 27 tests pass, and breaking the CRC padding or tag 01 makes them fail. The spike tightened five details in DOMAIN-VN §10. Tag 01 `12` is an app rule, the 25-character purpose limit is mandatory, the CRC is zero-padded, tag 54 has a 13-character cap, and NAPAS 247 caps a single transfer below 500,000,000 VND. Memo matching must check candidates against issued codes, because `FIESTA` contains `ESTA`. The NAPAS VietQR portal is the BIN source, with 74 entries. The VietQR.io mirror agrees on all 64 shared BINs but carries stale names after the 2026 Sacombank rename. P0-06 seeds BINs from the committed NAPAS snapshot, and P3-05 builds `packages/core/src/vietqr` from the spike.

### S7 generates the receipt PDF and PNG inside a Vercel function

Branch `spike/s7-receipt` at `8548686`, report `spikes/s7-receipt/REPORT.md`, outputs in `spikes/s7-receipt/out/`.

pdf-lib with @pdf-lib/fontkit renders the A5 receipt PDF, and satori with @resvg/resvg-js renders the Zalo PNG. pdfjs-dist extracts `Đặng Thị Hường` with correct diacritics from the PDF served by a Next.js route handler (`out/route-extract.txt`). The traced function is 11.56 MB uncompressed and 4.95 MB zipped against Vercel's documented 250 MB limit (`out/bundle-sizes.txt`, limit from https://vercel.com/docs/functions/limitations fetched 2026-10-06). The root inspected `out/receipt-b-pdflib-page1.png`. P3-12 builds receipts this way with the S2 fonts.

### Questions that stay unproven

- Certificate extraction accuracy is unmeasured until S5 runs as P2-01.
- Google Maps short-link resolution and its SSRF guards are unproven until S6 runs as P1-01.
- No banking app has scanned an Esta VietQR code. The operator scans it with two apps at the Phase 3 gate.
- The S7 size is an nft trace estimate, not a Vercel deploy, and Lambda cold start is not measured. P3-12 rechecks the size, and P6-07 measures the deployed function.
- The lifetime of the subscription token is unknown. P0-15 surfaces a 401 to operators as an auth error.

## Appendix B. Alternatives rejected

- **Be Vietnam Pro as the UI face.** The brief named it first, but its digits are proportional and it has no `tnum`, so amounts would not align in tables. Source Sans 3 replaces it. P0-11 updates DESIGN-BRIEF §5.1 to match.
- **Newsreader and Fraunces as the figure face.** Fraunces has no tabular figures. Newsreader passes but has lining figures only by default and looked weaker than Source Serif 4 at hero sizes.
- **@react-pdf/renderer for receipts.** It works, but its traced route is 18.76 MB against 11.56 MB for pdf-lib, with twice the files.
- **Headless Chromium for receipts.** `@sparticuz/chromium` alone is about 70 MB unpacked, which is 6 to 10 times the chosen route.
- **The `claude -p` subprocess fallback for the worker.** S1 proved the SDK path on subscription auth, so the fallback adds a second runtime for no gain.
- **Gating tools with `allowedTools` and `canUseTool` as AGENT.md §2.2 described.** S1 showed it lets the model read outside the job directory.
- **Open-source admin unit datasets as the seed source.** They all derive their codes from the NSO and add a license question and a lag. thanglequoc/vietnamese-provinces-database (MIT) stays the fallback if the NSO service disappears. provinces.open-api.vn is a runtime dependency, so it was ruled out.
- **Autopilot-full as the execution playbook.** The operator wants review before landing, and the phases are sequenced, so autopilot-stack fits. The operator's grant to merge non-gated PRs keeps the stack moving.
- **One shared database for all ten lanes.** Lanes that write would collide. Ten identical lane households isolated by RLS, plus `ESTA_SLOT` port offsets for concurrent stacks, let lanes write freely without serializing.
- **A dev page per core module.** One `/dev/core` page with a section per module gives core-only PRs a real surface for live lanes with less code. It is absent in production builds.
- **Folding every schema into its first UI PR.** Schema PRs with RLS and pgTAP stay separate so the security review reads them alone and they merge before the gated UI batch.
- **A separate exit PR for every phase.** Phases 0, 3 and 5 keep one because their exit checks span many surfaces. In Phases 1, 2, 4 and 6 the exit predicate rides on the phase's last feature PR.

## Appendix C. Risks

- **AGENT.md §2.2 contradicts S1.** The spec's tool gating lets the model read outside the job directory. P0-15 resolves it in AGENT.md and builds the hook. Watch that every later job kind sets its own `tools` list.
- **DESIGN-BRIEF §5.1 contradicts S2.** The brief names Be Vietnam Pro first. P0-11 records Source Sans 3 in DESIGN.md and updates the brief in the same PR.
- **DOMAIN-VN §4 is out of date.** It says 28 provinces and 6 cities, but three provinces became cities in 2026, giving 25 and 9. P0-06 updates the text with the S3 sources. `admin_units.kind` must come from the catalog, never from code.
- **The seed table in SPEC §9.3 says `bien-hoa` is in Đồng Nai.** It now sits in Thành phố Đồng Nai with the same code. P0-07 seeds the current name, and the SPEC wording stays correct.
- **SPEC FND-2 says a viewer writes nothing, but FND-8 lets every member set display preferences.** P0-14 adds `update_my_display_settings`, limited to the caller's own language, text scale, density and theme, and records the exception in SPEC FND-2.
- **SPEC §5.7 gives `audit_log` no household column.** P0-02 copies `household_id` from the audited row so members can read their own history under RLS, and updates SPEC §5.7. P1-06 depends on it.
- **AGENT.md §10 gives `agent_jobs` no place for a job's output.** P0-15 adds `agent_jobs.result jsonb` and updates AGENT.md §10.
- **SPEC §5.5 gives `documents.ocr_text` no writer.** P2-07 copies an optional `full_text` from accepted lease and utility bill extractions for non-sensitive documents, and records the writer in SPEC §5.5.
- **AGENT.md §6.2 allows no Markdown tables, but DESIGN-BRIEF §5.5 wants tables in Ask answers.** P5-07 allows tables in Ask answers only and updates AGENT.md §6.2.
- **AGENT.md §6.3 guards text before it is written, but §5.6 streams partial text.** P5-07 guards each sentence before appending it and records the rule in AGENT.md §5.6.
- **SPEC §8 lacks two variables the plan needs.** P5-09 adds `ESTA_APP_URL` for links in emails, and P6-02 adds `ESTA_EXPORT_PART_MB` because the Supabase free plan caps one object at 50 MB. Each PR updates SPEC §8 and `.env.example`.
- **SPEC PRP-5 does not say what the short-link resolver fetches at the end of the chain.** P1-01 follows redirects on the short hosts only, stops at a Google Maps target without fetching it, and rewords PRP-5.
- **Preview deploys need somewhere to write demo data.** P6-07 proposes a second free Supabase project for preview, while SPEC D4 names one project. Ryan decides at P6-07, since cloud projects are his items.
- **No Vercel platform skill is installed.** P6-07 installs one before its first `vercel` call, as poteto-mode requires for managed platforms.
- **Two `[app rule]` choices await professional confirmation.** P4-01 leaves metered electricity and water out of taxable revenue, and P6-02's per-party delete clears a person's details while keeping their leases and payments. Both are labelled and listed in STATUS.md.
- **P3-13 adds an unauthenticated route.** `/q/[token]` serves a tenant the QR image for one invoice through a `security definer` function granted to `anon`, because LSE-11 asks for a QR image link. Tokens are unguessable and expire, and the page shows only the amount, memo, bank and account name. The data-safety audit lane reviews P3-13, and P6-05's headers and CSP cover the route.
- **New households have no receiving bank account until P6-01.** Only seeded households show a QR before Settings ships.
- **Growth intent meets subscription auth.** PRODUCT.md records other families as a future audience, but AGENT.md §2.5 allows subscription auth for this household only. Any second household in production must switch `ESTA_AUTH_MODE` to `api_key` first. P6-06 records this in DEPLOY.md.
- **The Impeccable engine in git is darwin-arm64 only.** CI on Linux downloads the engine version pinned in `.claude/skills/impeccable/scripts/VERSION` through the repo's launcher before `pnpm design:detect`, as P0-01 shipped. The download is checked only against a checksum from the same release, so issue #3 pins the digest in the repo, and P0-11 closes it.
- **gstack browse cannot emulate a color scheme.** P0-11 adds a `data-theme` attribute with a cookie, and the verify skill switches themes through it.
- **Verification cost.** 73 PRs with ten live lanes each is more than 730 lane runs before fix rounds. Swarm workers run on a cheaper model through `/setup-pstack`, and verdicts carry across rebases under the patch-id rule. Watch usage at every tick and pause safely before limits.
- **Docker load with concurrent slots.** Each slot runs a full local Supabase. Keep at most three slots live at once and record slot assignments in the trail.
- **The NSO service may change or disappear.** P0-06 commits the derived CSV with SHA-256 sums, so seeding never calls the service. The thanglequoc dataset is the fallback.
- **Lighthouse variance.** Perf rules use the median of five interleaved runs per side on the same machine.
- **Human gates can stall a phase.** The Mom test, the bank-app VietQR scan and every P6-07 step need Ryan. Non-gated work of the next phase continues while they wait.
- **`[verify]` facts that no source settles.** How VAT and PIT combine, co-owner attribution and the PIT effective date ship as labelled `[app rule]` estimates and are listed in STATUS.md, per DOMAIN-VN §0.

## Appendix D. Links and reading list

- Read `CLAUDE.md`, `PRODUCT.md` and `docs/spec/SPEC.md` before any PR. Read `docs/spec/DOMAIN-VN.md` before PRs that touch certificates, addresses, money, tax, VietQR or names. Read `docs/spec/DESIGN-BRIEF.md` and `DESIGN.md` before UI PRs. Read `docs/spec/AGENT.md` before agent and extraction PRs.
- Spike reports live on `spike/s1-agent-sdk`, `spike/s2-fonts`, `spike/s3-admin-units`, `spike/s4-vietqr` and `spike/s7-receipt`.
- Run `skills/how/SKILL.md` before building P0-02, P0-03, P0-07, P0-15, P3-04 and P5-03, because each sets a pattern many later PRs copy.
- Run `skills/interrogate/SKILL.md` on P0-02 (RLS and audit), P0-15 (worker sandbox), P2-02 (storage access), P3-02, P3-03 and P3-04 (money core and invoicing), P4-01 (tax), P5-03 (number guard), P5-06 (approvals under the user's session) and P6-05 (CSP and headers) before shipping.
- The root keeps its decision trail in `.audit/decisions.tsv` per `skills/show-me-your-work/SKILL.md`, and each owner keeps its own `decisions.tsv`. The Phase 5 live run records its outputs in `docs/plan/trail/`.
