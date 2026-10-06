# Conventions for drafting PR sections of docs/plan/esta-v1-plan.md

You draft PR sections for one phase. Write them to the file you are told. Do not write any other part of the plan.

## Read first

- /Users/ngducn/Workplace/esta/CLAUDE.md, PRODUCT.md, docs/spec/SPEC.md, docs/spec/DOMAIN-VN.md, docs/spec/DESIGN-BRIEF.md, docs/spec/AGENT.md. Read the parts your phase touches in full.
- /Users/ngducn/Workplace/esta/.audit/pr-inventory.md for the PR list, ids, order, gated set and per-PR scope. Do not add, drop, merge or reorder PRs. If you find a real problem with the inventory, write it in a `NOTES` block at the very end of your file, outside any PR section.
- /Users/ngducn/Workplace/esta/.audit/spike-facts.md for decisions settled by spikes.
- The exemplar section at the bottom of this file. Match its shape exactly.
- The pstack technical-writing and unslop skills: /Users/ngducn/.claude/plugins/cache/pstack-claude/pstack/0.9.74/skills/technical-writing/SKILL.md and .../unslop/SKILL.md. Write clean as you go.

## Hard format rules (a script checks these)

- Each PR is one H2: `## <Task as a verb phrase> (<PR id>)`. No other H2 or H3 headings in your file.
- Inside each PR, these bold sub-block labels, in this order, each on its own line start: `**Depends on.**`, `**Files.**`, `**Build.**`, `**You see.**`, `**Verify, unit.**`, `**Verify, live.**`, `**Verify, perf.**`, `**Review gate.**`, `**Merge.**`.
- `**Depends on.**` is followed on the same line by the PR id(s) or `None.`
- `Files.`, `Build.`, `You see.`, `Verify, unit.` and `Merge.` each have at least one `- [ ] ` box.
- `**Verify, unit.**`, `**Verify, live.**` and `**Verify, perf.**` lines open, on the same line, with exactly: `Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.`
- The `**Verify, live.**` line continues with exactly: `Ten lanes on the configured \`swarm workers\` model at the PR head, per the boot recipe.`
- Live boxes are exactly ten, `- [ ] Lane 1. ` to `- [ ] Lane 10. `. Each names a screenshot as Save `slug.png` (backticks) and contains `Pass when`.
- Lane 1 is always `Regression lane against trunk.` It runs the same load-bearing scenario at trunk and head. If trunk lacks the feature, the lane says so and gates the behavior the diff adds plus the end state the user waits for.
- Perf boxes are exactly four, starting `Metric.`, `Probe.`, `Baseline.`, `Rule.` in that order. Dual-sided. Trunk and head both produce the metric. If trunk lacks the feature, add an absolute budget for the diff-added work and the user-visible end state. Never claim a ratio between unlike scenarios.
- Gated PR. `**Review gate.** The operator reviews before merge.` then three boxes: copy lane screenshots to `~/.claude/orchestrate/esta/media/<pr-id>/<pr-id>-review-<slug>.png`; record a 30 to 60 second video saved as `~/.claude/orchestrate/esta/media/<pr-id>/<pr-id>-review.mp4`; post the screenshots and the video in chat, stop at merge-ready, wait for the operator's click. The box text must contain the words screenshot, video and operator.
- Not gated. `**Review gate.** None. <PR id> is not review-gated.` and no boxes under it.
- Merge boxes, always these four, adapted only in the last one:
  - `- [ ] Root's clean verdict at the exact head SHA.`
  - `- [ ] Bugbot triage done.`
  - `- [ ] Base and verdict are current under the execution playbook and the patch-id rule in \`playbooks/shipping.md\`.`
  - Not gated. `- [ ] The root squash-merges with \`gh pr merge --squash --match-head-commit <verified head>\` once every PR below it has merged.`
  - Gated. `- [ ] The root appends it to the stack at STACK-READY. The operator lands it bottom-up in the phase-end batch.`
- Prose rules. No long dashes (U+2013, U+2014). No curly quotes. No `: ` followed by a non-space character anywhere in prose outside backticks. Write "Pass when the header reads `07/10/2026`." not "Pass when: ...". Vietnamese UI strings go in backticks. Short declarative sentences.
- No emoji. No exclamation marks.

## Content rules

- One PR is one verifiable change. Name concrete files under the architecture in SPEC §8 (`apps/web/src/...`, `apps/agent/src/...`, `packages/core/src/<module>/...`, `packages/db/...`, `supabase/migrations/<timestamp>_<name>.sql`, `supabase/tests/<name>.test.sql`, `e2e/<name>.spec.ts`, `fixtures/...`). Migration file names use a placeholder timestamp like `20261007000100_`.
- Build boxes name the symbol and the file. Domain logic is pure in `packages/core` (no IO, Clock injected). Registries and data over conditionals. Money is integer `Vnd`.
- Every PR that adds a table adds RLS through `private.is_member(household_id, min_role)`, pgTAP tests proving household isolation and viewer read-only, an audit trigger, and extends the seed generator (FND-7) for that table.
- You see boxes state one observable result each, with the exact screen state, log line or command output.
- Unit boxes name the test file and the cases it gains, then `Run \`pnpm check\``, `Run \`pnpm db:test\`` when SQL changed, and the touched e2e spec with `pnpm e2e <spec>`. Cite acceptance ids (FND-x, PRP-x, LSE-x, AGT-x).
- UI PRs (anything under `apps/web/src/app` or components) add these unit boxes: `Run \`pnpm design:detect\` with zero findings, or record each accepted exception with \`npx impeccable ignores add-value <rule> <value> --reason "<reason>"\` and cite it in the PR body.`; `Run \`/impeccable critique\` on the touched surfaces and fix every high-severity point.`; `axe reports zero serious or critical issues on the touched routes in \`e2e/<spec>\`.` Core screens from DESIGN-BRIEF §6 also get a first Build box `Run \`/impeccable shape <screen>\` and record the confirmed brief in the PR body before building.` and a harden box `Run \`/impeccable harden\` on the screen for long Vietnamese names and addresses, 130% text scale, empty, loading, error and offline states.`
- Agent PRs add `Golden tests in AGENT.md §7 for <job> pass in replay mode with \`ESTA_AGENT_MODE=replay pnpm --filter agent test\`.`
- Live lanes drive the real surface through the project verify skill (`.claude/skills/verify/`, created in P0-10). Before P0-10 merges, lanes drive through gstack browse (`$B`). Lane n signs in as the seeded member of lane household n (`me.lane<n>@demo.esta.test` for Mẹ, `ryan.lane<n>@demo.esta.test` for Ryan) on the `full` seed unless the scenario needs `northstar`. Test clock 2026-10-07 09:00 Asia/Ho_Chi_Minh unless stated. Vietnamese UI. Spread lanes across 390x844 and 1440x900 and across light and dark, and say which in each lane. Use SPEC §9.4 seeds as scenarios wherever the surface exists. For a surface with no UI (core, schema, worker), lanes drive `/dev/core`, `/dev/agent`, Supabase Studio at the slot's Studio port, or the existing screens that consume the change. Lane 10, once the app shell exists (P0-14), runs SPEC §9.4 seed 10 adapted to the PR (English, text scale 130%, dark).
- Pass predicates are concrete and checkable from the screenshot or a read-only diagnostic (DOM text, SQL count, log line).
- Perf for UI routes. Metric is Lighthouse mobile LCP, INP proxy (TBT), CLS and initial route JS gzipped on a production build (`pnpm build && pnpm start`) with the full seed. Probe is 5 interleaved runs per side. Budgets are SPEC §7.2. Perf for core or SQL. Metric is a vitest bench, query time via `EXPLAIN (ANALYZE)` on the full seed, job wall time, or `pnpm db:reset` time, as fits.
- Phase-final PRs carry the phase exit predicate from SPEC §10 in You see and Verify boxes and are gated.
- `[verify]` facts never block. Confirm from a source and record it in DOMAIN-VN in the same PR, or ship the `[app rule]` behavior labelled `Ước tính` or `Giả định` and list it in `docs/plan/STATUS.md`.
- Operator items (cloud project, production deploy, real email sender, anything under CLAUDE.md "Stop and ask Ryan") stop at merge-ready. Say so in the Build box that touches them.

## Exemplar

## Scaffold the pnpm monorepo, CI and the dev route guard (P0-01)

**Depends on.** None.

**Files.**

- [ ] Create `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`, `.env.example`.
- [ ] Create `apps/web/` (Next.js App Router, TypeScript strict, Tailwind CSS), `apps/agent/package.json`, `packages/core/package.json`, `packages/db/package.json`.
- [ ] Create `eslint.config.mjs`, `vitest.workspace.ts`, `.github/workflows/ci.yml`.
- [ ] Create `apps/web/src/server/env.ts` and `apps/web/src/app/dev/layout.tsx`.

**Build.**

- [ ] Add the root `check` script that runs typecheck, lint and unit tests across the workspace.
- [ ] Parse every environment variable in SPEC §8 with zod in `apps/web/src/server/env.ts` and export `env`. Default `ESTA_ENV` to `development`.
- [ ] Make `apps/web/src/app/dev/layout.tsx` call `notFound()` when `env.ESTA_ENV` is `production`, so every `/dev/*` route is absent from production builds.
- [ ] Run `pnpm check` in `.github/workflows/ci.yml` on every push and pull request.

**You see.**

- [ ] `pnpm dev` serves `http://localhost:3000` with a single placeholder line `Esta`.
- [ ] `ESTA_ENV=production pnpm build && pnpm start` returns 404 for `/dev`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/web/src/server/env.test.ts` gains cases for a missing required variable, an unknown `ESTA_ENV` value and the `development` default. Run `pnpm check`.
- [ ] CI is green on the PR head.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no app, so the lane records that and gates the head serving `/` at 390x844. Save `p0-01-root-mobile.png`. Pass when the page shows `Esta` and the console has no errors.
- [ ] Lane 2. ...
- [ ] Lane 10. ...

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
