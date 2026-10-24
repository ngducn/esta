# Esta

Private web app for a Vietnamese family to manage its real estate: properties and certificates, documents, leases and rent, money and tax, and an AI assistant (Trợ lý) that watches the portfolio and researches the market. Users are Ryan (admin and operator, engineer) and his mother Mẹ (admin, phone-first, Vietnamese only).

## Read first

1. `docs/spec/SPEC.md` for scope, data model, acceptance checks and phases.
2. `docs/spec/DOMAIN-VN.md` before touching certificates, addresses, money formatting, tax, VietQR or people names.
3. `docs/spec/DESIGN-BRIEF.md`, `PRODUCT.md`, `DESIGN.md` before any UI work.
4. `docs/spec/AGENT.md` before any agent or extraction work.
5. `docs/plan/` for the current plan, status and resume notes.
6. `ARCHITECTURE.md` before writing a parser, a result type, a server action, a multi-row write, an upload step, a toast, a translation island or a test helper. It names the one home for each, and `pnpm quality` fails a change that adds a second one.

Locked decisions are in SPEC §3. Do not change them; raise a conflict instead.

## Commands

Phase 0 makes every command below real. Keep this list accurate as the repo evolves.

`.nvmrc` and `devEngines.runtime` in `package.json` pin Node 24.22.0, and pnpm downloads that Node and runs every script on it, whatever `node` is on PATH (a Node before 24.21.0 loads Next twice under `next dev`, #292); `packageManager` pins pnpm. `ESTA_SLOT=k` (default 0) adds 100·k to every port so stacks run side by side; `pnpm dev`, `pnpm start`, `pnpm clock:set`, `pnpm cron:run`, `pnpm e2e` and every `db:*` command honor it. `PORT` overrides the web port.

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
| `pnpm db:checksum` / `pnpm db:seed:check` | One md5 per public table and per seeded auth table; reset twice and fail on any checksum difference (FND-7) |
| `pnpm db:types` | Regenerate `packages/db` types |
| `pnpm db:test` | pgTAP tests (RLS and constraints), then fails on a public table without RLS or a pgTAP file naming it; takes `supabase/tests/<name>.test.sql` paths to run only those files |
| `pnpm phase:check <n>` | Runs phase n's exit checks (`PHASE_CHECKS` in `scripts/phase-exit.ts`) and prints one PASS or FAIL row per id; exits 1 on any FAIL; its north-star rows serve the production build, as CI does |
| `pnpm check` | i18n parity, plan coverage and the quality baseline, then typecheck, lint and unit tests in every workspace |
| `pnpm quality` | Counts copied code (jscpd), files over 400 and 1,000 lines, and the smells in `scripts/quality/metrics.ts` (matched on the syntax tree), and fails when a count rises above `quality/baseline.json`, falls without an update, or when the baseline holds more than it did where the branch forked from `origin/main` without a recorded raise (`ARCHITECTURE.md`); `--update` rewrites it from today's counts up to main's, and `--update --allow-raise "<reason>"` goes above main with the reason recorded for review |
| `pnpm i18n:parity` | Compares `apps/web/messages/vi.json` and `en.json` (see Translations) |
| `pnpm plan:coverage` | Maps every SPEC §6 acceptance id, north-star step, phase exit and Mom test to the PRs in `docs/plan/trail/pr-inventory.md`; fails on an unmapped requirement or an id SPEC does not define (`--inventory <path>` checks another copy) |
| `pnpm verify:tier` | Prints the minimum verification tier (lean, standard or rigorous) of the files this branch changes against `origin/main`, with one line per reason; `--base <ref>` and `--head <ref>` pick the range, and `--declared <tier>` exits 1 when that tier is lower than the computed one |
| `pnpm e2e` | Playwright suite; `pnpm e2e:northstar` runs SPEC §1.2. When `CI` is set or `ESTA_E2E_SERVER=build` it builds the web app and serves that build with `ESTA_ENV=test` (so `/dev/*` and `/api/test/*` stay on), which compiles every page before the first test. Otherwise, or with `ESTA_E2E_SERVER=dev`, it serves `pnpm dev` |
| `pnpm e2e:prod` | Builds, starts with `ESTA_ENV=production` and checks `/dev/*` returns 404 |
| `pnpm gate:vietqr` | Writes `/tmp/esta-gate-vietqr.png`, a VietQR for 10.000 ₫ with memo `ESTA GATEQRVN` to the receiving account in `ESTA_GATE_BANK_BIN`, `ESTA_GATE_ACCOUNT_NO` and `ESTA_GATE_ACCOUNT_NAME` (`apps/web/.env.local` or the shell), for the Phase 3 two-app scan; prints only the account's last four digits |
| `pnpm qr:decode <png>` | Reads the VietQR in a PNG (a saved `Lưu ảnh` picture or a screenshot) and prints its bank, account, amount and memo, and whether its checksum holds |
| `pnpm check:build-env` | Builds a clean copy without `CRON_SECRET` and checks it fails with the zod message |
| `pnpm design:detect` | Impeccable detector over `apps/web/src` with JSON output |
| `pnpm glyphs:check` | Font coverage for the Vietnamese glyph test string |
| `pnpm contrast:check` | Contrast of every token pair in `text-pairs.ts`, both themes |
| `pnpm tokens:build` | Regenerate `apps/web/src/styles/tokens.css` from `tokens.ts` and `apps/web/src/lib/cn-tables.ts` from `tokens.css` (`pnpm check` fails when either is stale) |
| `pnpm fonts:build` | Rebuild the subset WOFF2 fonts from the pinned google/fonts commit (needs `uv`) |
| `pnpm icons:build` | Redraw the favicon, apple-touch icon and manifest icons from the brand mark in `apps/web/src/design/brand.ts` |

Local email goes to the Supabase Inbucket mailbox through the SMTP transport. Never configure a real mail sender in development.

### CI

GitHub Actions is the gate. `.github/workflows/ci.yml` runs on every pull request and every push to `main`, at the exact head commit: `check` (`pnpm check` and `pnpm test:live`), `db` (seed determinism, pgTAP, the web integration tests from `pnpm --filter web test:integration` and `pnpm db:types` drift), `e2e` in six shards on a production build, each with its own local Supabase, `e2e-report`, `prod-build` (`pnpm e2e:prod` and `pnpm check:build-env`) and `design`. The `ci` job passes only when every other job passed, so it is the one check a merge needs. `e2e-report` merges the shards into one Playwright report, puts the test counts in the run summary and lists each test that failed and then passed on its one retry as flaky.

The repository is public, so the workflow uses no secrets, runs on `pull_request` and never `pull_request_target`, pins every action by full SHA and has a read-only token. It masks the local stack's keys in the log, and before it uploads a Playwright report it removes every trace that holds one of those keys. It uploads the merged HTML report only when a test failed.

When Actions is down, `tools/ci-local.sh <worktree> <pr> <slot>` runs the same jobs on this machine and posts `local-ci/*` statuses to the PR.

## Conventions

- TypeScript strict. No `any`. Parse external data with zod at boundaries; trust internal types.
- Domain logic lives in `packages/core` as pure functions with no IO: money, formatting and parsing, allocation, matching, tax, completeness, watch rules, VietQR, proposals. Web, cron routes and agent all import it. Rent periods are the exception: the database plans them (`public.lease_schedule` and the nightly invoicing job, the only writer of invoices), and TypeScript reads them through one loader.
- Money is integer VND. Postgres `bigint`; TypeScript branded `Vnd` (a safe integer `number`). Rates are basis points. Never floats for money.
- Time comes from one injected `Clock` that, outside `ESTA_ENV=production`, reads the `test_clock` row or `ESTA_FROZEN_NOW` (SPEC FND-9). Business dates are `IsoDate` strings (`YYYY-MM-DD`) in Asia/Ho_Chi_Minh. No `new Date()` in domain code. Business SQL takes `p_as_of` parameters and never calls `now()` or `current_date`.
- Encode domain rules as data or registries (tax rules, land use codes, completeness checks, watch rules, proposal types), not scattered conditionals.
- Database changes only through new Supabase migrations. Every new table ships with RLS policies and pgTAP tests in the same PR. Never edit an applied migration. Seed ids are UUIDv5 from stable seed keys (`supabase/seed/README.md`).
- A new household table follows one recipe. Give it a uuid `id`, `household_id`, `created_at`, `updated_at` and `created_by`. Call `private.enable_household_rls(table, write_role)`, which needs `updated_at`, for the standard policies, then `private.enable_audit(table)`, which needs `id` and also freezes `household_id` and stamps `created_by` from `auth.uid()`. A table that SPEC §5 marks soft delete then calls `private.enable_soft_delete(table)`, which drops the delete policy so a user's DELETE touches no row and deletion is an update that sets `deleted_at`; its pgTAP test proves both. Custom policies call `private.is_member(household_id, min_role)` in SQL. App code never calls it; it reads and writes through the session client and relies on RLS. Its pgTAP test includes `supabase/tests/_harness.psql` and uses `tests.act_as(email)`, `tests.act_as_service(headers)`, `tests.cannot_write(...)` and `tests.sees_household(...)`. The tenancy guards on `household_members` (last admin, operator flag, claims) act only when `current_user = 'authenticated'`, so a security definer function that writes `household_members`, such as the P0-09 invite and claim functions, runs as its owner and must enforce the same rules itself.
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
- `esta/no-jsx-literals` (`eslint-rules/no-jsx-literals.mjs`) fails on text in `apps/web/**/*.{tsx,jsx}` that does not come from the message files. It covers JSX text; string literals, `+` concatenations and array `.join()` calls rendered as children; local `const` strings and `const` object maps (`LABELS.late`, `LABELS[status]`) rendered as children or props; text-like props (`label`, `title`, `description`, `placeholder`, `alt`, `caption`, `heading`, `message`, `text`, `helperText`, and text-carrying `aria-*` such as `aria-label`); any other prop whose literal value has a space or a non-ASCII letter; and literal `title` or `description` in an exported `metadata` or returned from `generateMetadata` under `apps/web/src/app`. Code-valued props are not checked: `data-*`, the remaining `aria-*`, any prop ending in `className`, `classNames` or `style` (any case), `content` on `<meta>`, and the HTML and SVG attributes listed in the rule, such as `href`, `src`, `srcSet`, `sizes`, `media`, `pattern`, `viewBox`, `preserveAspectRatio`, `fontFamily` and `strokeDasharray`. A single ASCII token such as `variant="primary"` passes.
- `apps/web/src/app/dev/**` is exempt, because those routes are developer-only and return 404 in production. Everywhere else in the repo except `eslint-rules/`, `@eslint-community/eslint-comments` rejects an inline disable of any `esta/*` rule and a bare `eslint-disable` with no rule names. Disable another rule inline only with its name and a reason after `--`, for example `// eslint-disable-next-line react-hooks/purity -- <why>`. `eslint-rules/inline-config.test.ts` also fails on any `/* eslint <rule>: ... */` config comment in `apps/web`, because such a comment can switch off the rules that would catch it. Put any exception to an `esta/*` rule in `eslint.config.mjs`, where review sees it.

## Definition of done

See SPEC §9.1. In short: `pnpm check`, `pnpm db:test` and the touched e2e flows pass; for UI, zero detector findings (or a recorded ignore with a reason), axe clean, screenshots at 390 × 844 and 1440 × 900 in Vietnamese light and dark through the `verify` skill; for agent work, the golden tests in AGENT.md §7 pass in replay mode. Tests alone are not sufficient; drive the real surface.

## `[verify]` facts

Follow DOMAIN-VN §0. Confirm from a source in the mapped spike or phase and record the source. If only a professional could confirm it, ship the labelled `[app rule]` behavior, list it in `docs/plan/STATUS.md`, and keep going.

## Execution priority (80/20)

Spend effort on the plan's critical path first, and keep everything else small.

- Build the next plan item. Do not build ahead of a dependency or add side work unless Ryan asks for it.
- The one fix-forward carries only findings that block the current PR. Anything else is a low, a nit, polish, or a defect `main` already has: file it as a GitHub issue with `[low]` at the start of its title, and do not open a PR for it now.
- Fix `[low]` issues in batches, one cleanup PR per round. A heavy audit and tech-debt round runs at a phase boundary when results and budget allow, decided with Ryan.
- Run heavy jobs (Playwright suites, Lighthouse, production builds) one at a time on this machine. Parallel heavy jobs cause flaky failures that cost more to investigate than they save.

## Writing issues and PRs

Ryan reads issues, PR descriptions and review comments on his phone, without the plan open. Write them so he understands the problem and what you need from him.

- Open with one or two plain sentences: what is wrong or what changes, described by what Mẹ or Ryan sees ("the property list", "the owners section on the legal tab"), and why it matters.
- Name things in words. Add a plan code in parentheses only when it helps find the work, as in "the owners screen (P1-10)". Never make a bare code like `P1-06`, `Seq 02` or `SPEC §10` the subject of a sentence.
- When Ryan has to decide something, put it first: the question, the current default, and your recommendation.
- Put files, SHAs, test names and logs under a "Details" heading or in a `<details>` block, after the summary.

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
