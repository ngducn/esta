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

Use the Node LTS in `.nvmrc`; `packageManager` in `package.json` pins pnpm. `ESTA_SLOT=k` (default 0) adds 100·k to every port so stacks run side by side; `pnpm dev`, `pnpm start`, `pnpm clock:set`, `pnpm cron:run`, `pnpm e2e` and every `db:*` command honor it. `PORT` overrides the web port.

| Command | Does |
| --- | --- |
| `pnpm dev` | Web app on localhost:3000 + 100·ESTA_SLOT against that slot's local Supabase; copies `.env.example` to `apps/web/.env.local` when that file is missing |
| `pnpm build` / `pnpm start` | Production build and server for `apps/web`; both fail on a missing variable, including an unset `ESTA_ENV` (required whenever `NODE_ENV=production`); `ESTA_ENV=production` at start hides `/dev/*` and `/api/test/*` |
| `pnpm dev:lan` | Same, reachable over HTTPS from a phone on the same network (SPEC D13) |
| `pnpm agent:dev` | Agent worker against local Supabase |
| `pnpm agent:record` | Run golden agent cases live and refresh replay recordings |
| `pnpm cron:run` | Call the cron routes locally (invoices, lease status, keep-alive) |
| `pnpm clock:set <iso>` | Set or advance the test clock to an ISO date-time with a required offset, such as `2026-10-07T09:00:00+07:00` (`pnpm clock:set off` clears it); writes only to a Supabase on 127.0.0.1 or localhost |
| `pnpm db:start` / `pnpm db:stop` / `pnpm db:status` | Local Supabase (Docker) for the slot |
| `pnpm db:reset` | Apply migrations and the generated `full` seed with 10 lane households; `pnpm db:reset:northstar` for the north-star variant; takes `--households N`, `--as-of <iso>` and `--variant` (`supabase/seed/README.md`) |
| `pnpm db:checksum` / `pnpm db:seed:check` | One md5 per public table; reset twice and fail on any checksum difference (FND-7) |
| `pnpm db:types` | Regenerate `packages/db` types |
| `pnpm db:test` | pgTAP tests (RLS and constraints) |
| `pnpm check` | i18n parity, then typecheck, lint and unit tests in every workspace |
| `pnpm i18n:parity` | Compares `apps/web/messages/vi.json` and `en.json` (see Translations) |
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
- Database changes only through new Supabase migrations. Every new table ships with RLS policies and pgTAP tests in the same PR. Never edit an applied migration. Seed ids are UUIDv5 from stable seed keys (`supabase/seed/README.md`).
- A new household table follows one recipe. Give it a uuid `id`, `household_id`, `created_at`, `updated_at` and `created_by`. Call `private.enable_household_rls(table, write_role)`, which needs `updated_at`, for the standard policies, then `private.enable_audit(table)`, which needs `id` and also freezes `household_id` and stamps `created_by` from `auth.uid()`. Custom policies call `private.is_member(household_id, min_role)` in SQL. App code never calls it; it reads and writes through the session client and relies on RLS. Its pgTAP test includes `supabase/tests/_harness.psql` and uses `tests.act_as(email)`, `tests.act_as_service(headers)`, `tests.cannot_write(...)` and `tests.sees_household(...)`. The tenancy guards on `household_members` (last admin, operator flag, claims) act only when `current_user = 'authenticated'`, so a security definer function that writes `household_members`, such as the P0-09 invite and claim functions, runs as its owner and must enforce the same rules itself.
- The web app uses the user's session client. The service role key is allowed only in `apps/agent`, `scripts/` and `apps/web/src/server/cron/**`; a lint rule enforces the allowlist. Service-role clients send the `x-esta-actor` header for the audit trigger (SPEC §5.7).
- Uploads go from the browser to Storage with signed upload URLs, never through a server function body.
- Every user-facing string goes through next-intl message files (vi and en). Styling uses design tokens only; no raw colors or ad hoc pixel values in components. Model output renders as sanitized Markdown.
- Dependencies with install scripts run them only when `allowBuilds` in `pnpm-workspace.yaml` says so. `@parcel/watcher` and `@swc/core` are set to `false`: next-intl pulls them in only for its message extractor, which Esta does not use, and their prebuilt platform binaries install without the scripts.
- UI work follows `PRODUCT.md`, `DESIGN.md` and the brief. Run `/impeccable shape` before building a new core screen and the design QA in DESIGN-BRIEF §9 before calling it done.
- CI and automated tests run the agent in `replay` mode. Live model calls happen only in spikes, `pnpm agent:record`, gate demos, and the Phase 5 live run.

## Translations

- Messages live in `apps/web/messages/vi.json` and `en.json`, with the same keys in both. Each top-level key is a namespace for one area of the app (`app` holds the app name and tagline). Keys are camelCase without dots, because next-intl reads a dot as nesting. Values are ICU messages in NFC.
- Translate on the server. Server components call `getTranslations('<namespace>')` and pass the strings they need to client components as props. The root layout has no `NextIntlClientProvider`, so no route ships the next-intl client runtime (about 12 KB gzipped) unless it asks for it. When a client island truly needs `useTranslations`, wrap only that island in `NextIntlClientProvider` with only its namespaces, as `apps/web/src/app/dev/i18n/page.tsx` does. `e2e/prod/bundle.spec.ts` fails when `/` loads the runtime or its initial JS reaches 200,000 bytes gzipped.
- `pnpm i18n:parity` fails when the two files differ in key paths, argument names or types, select options or exact plural matches. It also fails on a dotted or empty key, an empty message, an empty group, a value that is not NFC, or plural categories that do not match the locale's CLDR rules (vi uses `other` only; en uses `one` and `other`).
- `esta/no-jsx-literals` (`eslint-rules/no-jsx-literals.mjs`) fails on text in `apps/web/**/*.tsx` that does not come from the message files. It covers JSX text; string literals, `+` concatenations and array `.join()` calls rendered as children; local `const` strings and `const` object maps (`LABELS.late`, `LABELS[status]`) rendered as children or props; text-like props (`label`, `title`, `description`, `placeholder`, `alt`, `caption`, `heading`, `message`, `text`, `helperText`, and text-carrying `aria-*` such as `aria-label`); any other prop whose literal value has a space or a non-ASCII letter; and literal `title` or `description` in an exported `metadata` or returned from `generateMetadata` under `apps/web/src/app`. Code-valued props are not checked: `data-*`, the remaining `aria-*`, any prop ending in `className`, `classNames` or `style` (any case), `content` on `<meta>`, and the HTML and SVG attributes listed in the rule, such as `href`, `src`, `srcSet`, `sizes`, `media`, `pattern`, `viewBox`, `preserveAspectRatio`, `fontFamily` and `strokeDasharray`. A single ASCII token such as `variant="primary"` passes.
- `apps/web/src/app/dev/**` is exempt, because those routes are developer-only and return 404 in production. Everywhere else in `apps/web`, `@eslint-community/eslint-comments` rejects an inline disable of any `esta/*` rule and a bare `eslint-disable` with no rule names. Disable another rule inline only with its name and a reason after `--`, for example `// eslint-disable-next-line react-hooks/purity -- <why>`. `eslint-rules/inline-config.test.ts` also fails on any `/* eslint <rule>: ... */` config comment there, because such a comment can switch off the rules that would catch it. Put any exception to an `esta/*` rule in `eslint.config.mjs`, where review sees it.

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
