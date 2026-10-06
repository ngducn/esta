# Esta

Private web app for a Vietnamese family to manage its real estate: properties and certificates, documents, leases and rent, money and tax, and an AI assistant (Trợ lý) that watches the portfolio and researches the market. Users are Ryan (admin and operator, engineer) and his mother Mẹ (admin, phone-first, Vietnamese only).

## Read first

1. `docs/spec/SPEC.md` for scope, data model, acceptance checks and phases.
2. `docs/spec/DOMAIN-VN.md` before touching certificates, addresses, money formatting, tax, VietQR or people names.
3. `docs/spec/DESIGN-BRIEF.md`, `PRODUCT.md`, `DESIGN.md` before any UI work.
4. `docs/spec/AGENT.md` before any agent or extraction work.
5. `docs/plan/` for the current plan, status and resume notes.

Locked decisions are in SPEC §3. Do not change them; raise a conflict instead.

## Commands

Phase 0 makes every command below real. Keep this list accurate as the repo evolves.

Use the Node LTS in `.nvmrc`; `packageManager` in `package.json` pins pnpm. `PORT` moves the web port.

| Command | Does |
| --- | --- |
| `pnpm env:init` | Copy `.env.example` to `apps/web/.env.local` when that file is missing; only `pnpm dev` runs it |
| `pnpm dev` | Web app on localhost:3000 against local Supabase |
| `pnpm build` / `pnpm start` | Production build and server for `apps/web`; build fails on a missing variable; `ESTA_ENV=production` at start hides `/dev/*` |
| `pnpm dev:lan` | Same, reachable over HTTPS from a phone on the same network (SPEC D13) |
| `pnpm agent:dev` | Agent worker against local Supabase |
| `pnpm agent:record` | Run golden agent cases live and refresh replay recordings |
| `pnpm cron:run` | Call the cron routes locally (invoices, lease status, keep-alive) |
| `pnpm clock:set <iso>` | Set or advance the test clock (`pnpm clock:set off` clears it) |
| `pnpm db:start` / `pnpm db:stop` / `pnpm db:status` | Local Supabase (Docker). Every `db:*` command honors `ESTA_SLOT=k`, which adds 100·k to each port so stacks run side by side |
| `pnpm db:reset` | Apply migrations and the `full` seed; `pnpm db:reset:northstar` for the north-star variant |
| `pnpm db:types` | Regenerate `packages/db` types |
| `pnpm db:test` | pgTAP tests (RLS and constraints) |
| `pnpm check` | Typecheck, lint and unit tests in every workspace; i18n key parity joins with P0-05 |
| `pnpm e2e` | Playwright suite; `pnpm e2e:northstar` runs SPEC §1.2 |
| `pnpm e2e:prod` | Builds, starts with `ESTA_ENV=production` and checks `/dev/*` returns 404 |
| `pnpm check:build-env` | Builds a clean copy without `CRON_SECRET` and checks it fails with the zod message |
| `pnpm design:detect` | Impeccable detector over `apps/web/src` with JSON output |
| `pnpm glyphs:check` | Font coverage for the Vietnamese glyph test string |

Local email goes to the Supabase Inbucket mailbox through the SMTP transport. Never configure a real mail sender in development.

## Conventions

- TypeScript strict. No `any`. Parse external data with zod at boundaries; trust internal types.
- Domain logic lives in `packages/core` as pure functions with no IO: money, formatting and parsing, schedule, allocation, matching, tax, completeness, watch rules, VietQR, proposals. Web, cron routes and agent all import it.
- Money is integer VND. Postgres `bigint`; TypeScript branded `Vnd` (a safe integer `number`). Rates are basis points. Never floats for money.
- Time comes from one injected `Clock` that, outside `ESTA_ENV=production`, reads the `test_clock` row or `ESTA_FROZEN_NOW` (SPEC FND-9). Business dates are `IsoDate` strings (`YYYY-MM-DD`) in Asia/Ho_Chi_Minh. No `new Date()` in domain code. Business SQL takes `p_as_of` parameters and never calls `now()` or `current_date`.
- Encode domain rules as data or registries (tax rules, land use codes, completeness checks, watch rules, proposal types), not scattered conditionals.
- Database changes only through new Supabase migrations. Every new table ships with RLS policies and pgTAP tests in the same PR. Never edit an applied migration. Seed ids are UUIDv5 from stable seed keys.
- The web app uses the user's session client. The service role key is allowed only in `apps/agent`, `scripts/` and `apps/web/src/server/cron/**`; a lint rule enforces the allowlist. Service-role clients send the `x-esta-actor` header for the audit trigger (SPEC §5.7).
- Uploads go from the browser to Storage with signed upload URLs, never through a server function body.
- Every user-facing string goes through next-intl message files (vi and en). Styling uses design tokens only; no raw colors or ad hoc pixel values in components. Model output renders as sanitized Markdown.
- UI work follows `PRODUCT.md`, `DESIGN.md` and the brief. Run `/impeccable shape` before building a new core screen and the design QA in DESIGN-BRIEF §9 before calling it done.
- CI and automated tests run the agent in `replay` mode. Live model calls happen only in spikes, `pnpm agent:record`, gate demos, and the Phase 5 live run.

## Definition of done

See SPEC §9.1. In short: `pnpm check`, `pnpm db:test` and the touched e2e flows pass; for UI, zero detector findings (or a recorded ignore with a reason), axe clean, screenshots at 390 × 844 and 1440 × 900 in Vietnamese light and dark through the `verify` skill; for agent work, the golden tests in AGENT.md §7 pass in replay mode. Tests alone are not sufficient; drive the real surface.

## `[verify]` facts

Follow DOMAIN-VN §0. Confirm from a source in the mapped spike or phase and record the source. If only a professional could confirm it, ship the labelled `[app rule]` behavior, list it in `docs/plan/STATUS.md`, and keep going.

## Stop and ask Ryan before

- Any production deploy, or creating or changing a cloud Supabase project, its database or its storage.
- Deleting data or files anywhere other than the local dev stack.
- Sending email or messages to real addresses or phone numbers.
- Adding a paid service, or an external data source other than the admin units dataset and NAPAS BIN list approved at plan review. Local dev tooling for `pnpm dev:lan` (mkcert, a local reverse proxy) is allowed; public tunnels are not.
- Changing a locked decision in SPEC §3.

Everything else that is reversible: proceed, show evidence, let Ryan course-correct.

## Data hygiene

- Real family data never enters the repo, screenshots, PR descriptions, replay recordings or test fixtures. Seed data is synthetic with names containing "Demo".
- `fixtures-private/` and every `.env*` file are gitignored. Results measured on private fixtures are recorded as numbers only.
- Never store full national ID numbers in any table (SPEC D11).

## Status files

- `docs/plan/esta-v1-plan.md`: the plan.
- `docs/plan/STATUS.md`: what shipped, what slipped and why, items needing professional confirmation, dates when terms were re-checked.
- `docs/plan/RESUME.md`: written by Pause safely; read by Session pickup.
- `docs/plan/DEPLOY.md`: the deploy runbook (Phase 6).
