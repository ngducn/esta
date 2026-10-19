# 05. Agent, scripts and tests

Reviewer 05. Snapshot `/tmp/esta-thermo-wt` at 5d19277. Scope is `apps/agent/src`, `scripts/**`, `tools/ci-local.sh`, `eslint-rules/**` and `e2e/**`, judged against `docs/spec/AGENT.md`.

## Verdict

The agent worker is the best-shaped code in this subsystem. It is 1,282 production lines across 20 files with no file above 165 lines (measured), its job kinds are a typed registry, its tool policy is enforced twice as AGENT.md §2.2 asks, and replay mode runs the real tools and policy as §8 asks. Two things undercut it. Its error boundary between "the model should read this and try again" and "the job is broken" exists as a class (`ToolRejection`) that no code ever tests for, so real database failures are either fed to the model or silently swallowed in replay, and the job then reports the wrong cause. And the one thing every recording depends on, the exact extraction request, is assembled in four places, one of which has already drifted to a different prompt. The e2e suite tests behavior through stable seams (roles, test ids, REST with the user's token, almost no fixed sleeps), which is the hard part, but it is copy-paste at the file level. 25 spec files carry their own axe helper and 22 rebuild the slot environment at import, while the shared versions sit unused in a module named `wizard.ts`. The Playwright project layout fights the specs, so 9 of the 16 specs it splits skip tests by project name, and a single global test clock forces the 15 heaviest specs to run one at a time. Scripts are many but each is small and referenced. The custom lint rules earn their place.

## Ratings

- **Readability 7/10.** The agent reads cleanly, with short functions, names that say what they do and comments that give the why, but a typical e2e spec opens with 30 to 60 lines of locally redefined plumbing before the first test.
- **Quality 6/10.** The agent's behavior tests are strong (household isolation, crash after save, path policy), but the undifferentiated tool-error boundary, the four-way duplicated extraction request and an e2e oracle that reuses the code under test are real correctness and maintenance risks.
- **Performance 6/10.** Per-job work is fine, but an idle worker makes 2 to 3 database round trips a second with no backoff, and the e2e suite spawns the Supabase CLI at import in 22 files and serializes 15 specs behind one clock row.

## Findings, ranked

### 1. The tool error boundary is a class nobody checks, so failures lose their cause (boundary, correctness)

`apps/agent/src/tools/server.ts:27-33` defines `ToolRejection` as "an answer the model reads and acts on, such as a validation error, rather than a failure of the job." Measured with `rg -n ToolRejection apps scripts e2e`. It is defined once and thrown twice (`save-extraction.ts:71,76`). Nothing ever runs `instanceof ToolRejection`. Both call sites treat every error the same way. In live mode, `estaServer` (`server.ts:53-58`) catches any error from a tool and returns its message to the model as `isError` text. That includes `save_extraction failed: <Postgres message>` and `save_extraction found no extraction ... waiting` (`save-extraction.ts:99-100`), which are infrastructure failures the model cannot fix. In replay mode, `replaySession` (`sdk/session.ts:93`) runs `await request.tools.get(call.name)?.run(input).catch(() => undefined)`, which swallows every error. Either way the job carries on, `finish` finds no `needs_review` row and throws `The model ended without saving a valid extraction` (`jobs/extract-document.ts:108`). So a status-guard miss, an RLS or network error, or a bug in the write path is reported as a model failure, and in CI the real message is gone (measured by reading; the masking itself is inferred from the control flow). The remedy is to make the class mean something. One `runTool(tool, input)` used by both `estaServer` and `replaySession` should turn a `ToolRejection` into model-visible text and rethrow anything else so the session ends as `error` with the original message, which the runner already records. That deletes the blanket `.catch` and makes the replay a faithful test of the write path, which is what AGENT.md §8 promises ("all writes run for real").

### 2. The extraction request is built four times, and one copy already measures a different prompt (missed simplification)

Every replay hash depends on the prompt, tools and turn limit being byte-identical between the worker and the recorder (AGENT.md §8). They are assembled independently in four places, measured by reading:

- `apps/agent/src/jobs/extract-document.ts:79-98` (the worker).
- `scripts/agent-record.ts:84-94` (`extractRequest`, with household name `'Gia đình Demo'`).
- `apps/agent/test/extract-session.ts:17-39` (`extractSession`, with `'Gia đình Demo 3'`).
- `scripts/extraction-eval.ts:152-170` and `:211-230`, which writes its own certificate prompt with an inline schema, parses fenced JSON from the reply instead of using `save_extraction`, and fakes a `JobSpec` whose `handler.prepare` rejects to satisfy the type.

Each of the first three restages the file, rebuilds `extractDocumentPrompt`, rebinds `estaTool('save_extraction', extractionSaver(...))` and makes a canonicalizer. Drift among them is caught only indirectly, as a `MissingRecordingError` at test time. The fourth copy has already drifted, and it is the only path that runs against `fixtures-private/`. So the accuracy numbers on real family documents measure the spike prompt, not the prompt the worker ships (inferred from the two prompt functions; I did not diff outputs). The code-judo move is to export one pure `extractRequest({ schemaName, bytes, mime, jobDir, configDir, persist })` from `jobs/extract-document.ts`. `prepareExtractDocument` then becomes "load rows, download, `extractRequest` with a `persist` that writes the rows", and the recorder, the golden test and the eval all call the same function with a `persist` that captures. The same applies to ping (`agent-record.ts:46-81` rebuilds what `preparePing` does). Inside `agent-record.ts` the recording literal is also built three times (`:65-74`, `:114`, `:154`) and should be one `toRecording(request, run, label)`. Smaller symptoms of the same missing seam are the `/fable/iu` refusal duplicated at `agent-record.ts:32` and `extraction-eval.ts:219`, and the placeholder `SUPABASE_SERVICE_ROLE_KEY: 'unused-by-...'` in both scripts (`agent-record.ts:162`, `extraction-eval.ts:216`). Those placeholders show that `parseAgentEnv` demands database credentials from runs that never touch the database.

### 3. The e2e suite is copy-paste at the file level, and the shared helpers hide in `wizard.ts` (duplication, boundary)

Measured with `rg -l` over `e2e/`:

| Locally redefined in each spec | Files |
| --- | --- |
| a serious-axe-violations helper | 25 |
| `const env = slotEnv(...)` at module top | 22 |
| a sideways-scroll check (`scrollWidth <=`) | 21 |
| `async function open(` | 18 |
| `const PHONE =` / `const DESKTOP =` | 15 / 15 |
| `const propertyId =` seed-id wrapper | 14 |
| `const toast =` | 10 |
| a local `rest()` against PostgREST | 9 |
| `holdForRecording` | 4 |

There are also 106 `?? ''` fallbacks in 28 files, mostly `env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''`. `slotEnv` returns `Record<string, string>` and, when the stack is down, prints a warning and returns no keys (`scripts/slot-env.ts:20-23`). So a missing key becomes an empty `apikey` header and a confusing 401 deep in a test rather than one clear "start the slot" error. `scripts/e2e-service.ts:9-16` shows the right pattern (parse, then throw with a fix), but only for the service key. The shared versions of most helpers already exist in `e2e/helpers/wizard.ts:13-92` (`PHONE`, `DESKTOP`, `open`, `seriousAxeViolations`, `noSidewaysScroll`, `serviceGet`), but the module is named for one feature, so 18 other specs wrote their own. The remedy is one `e2e/fixtures.ts` built on Playwright's `test.extend`. It should hold a worker-scoped `env` parsed once with zod that throws a clear message, plus `axe`, `openAs(email, theme, viewport)`, `rest`, `service` and the seed-id helpers. Every spec then imports `test` from it. I estimate this deletes 400 to 600 lines (inferred from the counts times the typical 3 to 8 line helper bodies) and makes the next spec start at its first assertion.

### 4. The Playwright project layout fights the specs, and one clock row serializes the heaviest ones (structure, perf)

`playwright.config.ts:44-48` defines `mobile` and `desktop` projects that run every non-clock spec twice at different viewports. The specs set their own viewports per test instead. 9 of the 16 non-clock specs skip whole files or individual tests by project name (measured with `rg -l 'project\.name' e2e`, which lists 10 files, one of them the clock spec). Examples are `property-units.spec.ts:23` (`test.skip(test.info().project.name !== 'mobile', 'each rule sets its own viewport')`), `property-legal.spec.ts:20`, `properties-list.spec.ts:20` and `shell.spec.ts:15`. The project axis is a dead dimension that every spec has to opt out of. Viewport is test data here, so one project and an explicit `for (const viewport of [PHONE, DESKTOP])` where a rule truly needs both would delete the gating. Separately, `playwright.config.ts:13-29` lists 15 spec files by name, among them leases, lease-detail, collections, record-payment, extraction-review and all the documents specs. They run in a `clock` project with `workers: 1`, because "the slot has one test clock and one worker." The seed already isolates data into lane households, so the global clock row is the last shared mutable state forcing the slowest third of the suite to run single-file. If the clock override were keyed per household, or read from a request header honored only when `ESTA_ENV` is not production, those specs could run in parallel lanes. Here the right move is to remove the shared state rather than serialize around it. I did not measure suite wall time, so the size of the win is a guess.

### 5. The runner has a retryable "unknown kind", an unreachable branch and a cross-layer import (spaghetti, small)

In `apps/agent/src/runner.ts:58`, an unknown job kind fails with `kind: 'error'`. That kind is not in `PERMANENT` (`:30`), so a job no worker can run is retried at 1, 5 and 25 minutes before failing. It should be `invalid_job`. `finishJob` then looks the spec up again (`:116`) and tests `outcome.ok && spec !== undefined`. `runSession` already returned `ok: false` for an undefined spec, so `spec !== undefined` is always true there, and the `outcome.ok ? { ...Unknown job kind }` arm at `:121` cannot run (measured by reading). The generic runner also imports `InvalidJobError` from one job's module (`:6`, from `jobs/extract-document`). That error belongs in `jobs/registry.ts` next to `JobSpec`. `check` is defined twice with the same body (`runner.ts:87-90`, `tools/save-extraction.ts:56-59`), and `households` is read twice per extraction job, once for the name (`runner.ts:49-53`) and once for the locale (`extract-document.ts:42-46`). Finally, `ownJob` (`runner.ts:131-133`) guards on `locked_by` and `status = 'running'`, but `check` only looks at `error`. If another worker has taken the job, the update matches zero rows, the run is logged as `done` and nothing notices. The reclaim window is at least 2 minutes past the kind's timeout (`supabase/migrations/20261007203000_document_extractions.sql:309`), so this is rare (inferred), but it is silent. The remedy is to resolve the spec once in `pollOnce`, map an unknown kind to `invalid_job`, move the error type to the registry, and have `ownJob` select `id` and throw on zero rows.

### 6. The idle worker polls the database 2 to 3 times a second with no backoff (perf)

`main.ts:14` sleeps a fixed 1,000 ms between empty polls. Each `pollOnce` makes two RPCs, `claim_abandoned_agent_job` then `claim_agent_job` (`runner.ts:150,158`). Outside production `readClock` adds a `test_clock` read (`clock.ts:9`). That is about 173,000 RPCs a day in production and 259,000 in development from an idle worker on Ryan's machine against the hosted database (arithmetic from the measured constants; I did not observe real traffic). A single `claim_next_agent_job` SQL function that tries the abandoned path and then the normal one halves the round trips and removes an orchestration step from TypeScript. Idle backoff, for example doubling to 10 s and resetting on a claimed job, cuts the rest. That fits AGENT.md, whose heartbeat is 60 s and whose offline banner waits 5 minutes.

### 7. One e2e oracle reuses the code under test (testing)

`e2e/extraction-review.spec.ts:142-144` computes how many "kiểm tra lại" marks the page must show by calling `reviewFields` and `needsCheck` from `packages/core`, the same functions the page renders with. If `reviewFields` dropped a field or the confidence threshold moved, page and oracle would agree and rule 1 would still pass. The recording is a committed fixture, so the expected count is a constant. Assert it as a literal and keep the check that it is greater than zero. This is the only spec that imports `packages/core` (measured with `rg -l "from '\.\./packages/core" e2e`).

### 8. `slotEnv` spawns the Supabase CLI on every call, at import time (perf, boundary)

`scripts/slot-env.ts:17` runs `spawnSync('supabase', ['status', '-o', 'env', ...])` on every `slotEnv()` call with keys. There are 25 call sites in `e2e/`, 22 of them at module top level, and some files call it twice (`leases.spec.ts:10` and again in `beforeAll` at `:30`). Playwright loads spec files in the runner and again in each worker, so a single run pays for the CLI's Docker query many times before any test runs (the per-spawn cost is a guess; I could not run it without a stack). Compute the slot env once in a `globalSetup` and pass it through `process.env`, or memoize it in the fixture from finding 3, and fail loudly when the stack is down.

### 9. `ci-local.sh` hand-rolls a lock that macOS already ships (missed simplification)

`tools/ci-local.sh:55-96` implements a directory lock with a staging dir, a Perl `rename(2)`, inode-and-birth-time ids from `stat -f '%i-%B'`, mtime-based staleness and a "graveyard" for taken-over locks. It takes an 8-line paragraph of the header comment (`:20-27`) to explain. `/usr/bin/shlock` exists on this machine (measured with `ls`) and does pid-file locking with stale-holder detection. `until shlock -p $$ -f "$lock"; do sleep 5; done` plus `rm -f "$lock"` in the EXIT trap would replace roughly 40 lines (inferred that `shlock`'s `kill -0` stale check covers the cases the script handles; it does not cover the "lock with no pid" case, which the hand-rolled version creates and then has to handle itself).

### 10. Script sprawl is mild, but the TypeScript runners are not uniform (legibility)

`scripts/` holds 71 entries, 4,494 non-test lines and 2,315 test lines (measured). Every non-test script is referenced from somewhere other than its own test (a `rg -F` count per basename found none at zero). The flat directory mixes local-stack plumbing, seeds, design checks, reference data, perf and process tooling. The process tooling alone (`phase-exit.ts`, `plan-coverage.ts`, `verify-tier.ts`) is 664 lines plus 769 test lines. `verify-tier.ts:37-55` encodes architecture as path regexes that name individual files (for example `server/(sign-in|member|public-paths)\.ts`), which will rot quietly as files move. The root `package.json` runs TypeScript three ways: `node scripts/x.ts` with native type stripping (most), `tsx` (`contrast:check`, `clock:set`, `extraction:eval`, `fixtures:certificates`) and `node --import tsx` (`agent:dev`, `agent:record`). Pick one, and group `scripts/` into `stack/`, `seed/`, `design/`, `process/` and `agent/` so a reader can find the owner of a command.

## What is genuinely good

The agent's job registry (`jobs/registry.ts:45-64`) is data with `as const satisfies Record<string, JobSpec>`, and the timeouts are documented as mirrored in SQL. The SDK options (`sdk/options.ts:35-51`) follow AGENT.md §2.2 exactly, including `settingSources: []`, `strictMcpConfig`, a replaced `env` and `persistSession: false`. Replay runs the real tool policy and books denials the way the SDK does (`sdk/session.ts:78-110`). `writeRecording` refuses to commit a recording that contains a full national ID (`replay/store.ts:62-66`). The tests are behavioral. A golden test scores 18 fixtures in replay, and an idempotency test kills the worker after `save_extraction` and asserts one row and one item (`test/extract-idempotency.test.ts`). Another test denies `Read` of `/etc/hosts` and of another job's file (`test/sensitive-documents.test.ts`). An e2e helper SIGKILLs a real worker mid-job on a log match (`e2e/helpers/agent-worker.ts:14-59`). The custom lint rules are tested by linting real source through ESLint (`eslint-rules/lint-text.ts`), not by AST snapshots. The guard-against-disabling-the-guard rules look baroque, but they close a real hole for agent-written code. In e2e, `waitForTimeout` appears only 8 times, 4 of them for video recording only and the rest as deliberate "nothing happens in this window" checks. `expect.poll` and auto-waiting assertions carry the rest, and no spec constructs a Supabase client. Specs go through PostgREST with the user's session token, or through `e2eServiceHeaders`, which keeps the service key inside the `scripts/` allowlist.

## Not examined

I did not read the internals of `eslint-rules/no-jsx-literals.mjs` (195 lines) beyond its wiring and test count. I sampled about 6 of the 42 e2e specs in depth. I did not read the seed scripts, `scripts/reference/**`, `scripts/perf/**` or the dev-LAN family (314 non-test lines across 7 files). I ran no type check, lint or tests.

## Commands run

- `find apps/agent -type f | xargs wc -l | sort -n` and the same for `scripts`, `tools`, `eslint-rules` and `e2e`, for file sizes.
- `rg -n 'ToolRejection' apps scripts e2e` for 1 definition, 2 throws and 0 `instanceof`.
- `rg -n ' as (Record|Json|unknown|any|Instant|keyof)' apps/agent/src scripts/agent-record.ts scripts/extraction-eval.ts` for the cast inventory (12 in agent src, 3 of them `as unknown as Json` in `sdk/result.ts:24-26`).
- `rg -c "anthropic-ai/sdk['\"/]|modelcontextprotocol" apps/agent` found both only in `package.json`. The SDK's `peerDependencies` require them, so this is not a finding.
- A per-basename reference count over `scripts/` found no unreferenced script.
- Per-pattern `rg -l -e <pattern> e2e | wc -l` for the duplication table.
- `rg -o "\?\? ''" e2e | wc -l` gave 106, in 28 files.
- `rg -n waitForTimeout e2e` gave 8 sites.
- `rg -o 'getByTestId\(|data-testid'` gave 916, `getBy(Role|Label|Text|Placeholder)` gave 546 and `locator('...')` gave 331.
- A per-spec count of `setViewportSize`, `project.name` and `test(` for the non-clock specs.
- `ls /usr/bin/lockf /usr/bin/shlock` found only `shlock`.
- `rg -n -A20 'function public\.claim_abandoned_agent_job' supabase/migrations` for the reclaim window.
