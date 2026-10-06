# Esta assistant (Trợ lý): agent spec

The assistant watches the portfolio, reads documents, researches the market, and answers questions. It runs as a worker on a machine Ryan controls, using the Claude Agent SDK on Ryan's Claude subscription.

## 1. Principles

1. **The agent proposes, people dispose.** The agent never writes business tables (properties, leases, invoices, payments, expenses, certificates, documents). It writes only agent-owned tables (§10) and `document_extractions`. Anything that changes business data is a proposal a person approves; the web app executes approvals under that person's session so RLS and the audit log attribute the change to them.
2. **Numbers come from tools, not from the model.** Tools return the aggregates an answer needs (totals, counts, differences, ratios), so the model never does arithmetic. A guard (§6.3) rejects output containing a number that is not in this run's tool results.
3. **Deterministic first.** Rules that can be computed (overdue, expiring, vacancy, thresholds) are computed in `packages/core/watch` and SQL. The model ranks, groups and words them.
4. **Cite everything external.** Research output carries source URLs, source names and publication dates. Summaries are in the agent's own words with at most one short quote per source.
5. **Vietnamese by default.** Output language follows the household locale, or the language of the question in Ask.
6. **Small blast radius.** Each job gets only the tools it needs, its own directory, isolated settings, and turn and time limits.

## 2. Runtime

### 2.1 Process

`apps/agent` is a long-running Node process (Node 22 or newer, TypeScript):

```text
main loop
  ├─ heartbeat every 60 s → worker_heartbeats
  ├─ scheduler (Clock, Asia/Ho_Chi_Minh) → inserts scheduled jobs with idempotency keys
  └─ runner: claim job → build tools for that household and job kind → query() → validate → guard → write → finish
```

Time comes from the shared `Clock` (SPEC FND-9), read at the start of every scheduler tick and every job, so tests can advance it without restarting the worker. Claiming uses a SQL function `claim_agent_job(worker_id, p_as_of timestamptz)` with `FOR UPDATE SKIP LOCKED`, ordered by priority then `run_after`. A claimed job whose `locked_at` is older than its kind's timeout plus 2 minutes may be reclaimed. Every write a job makes is keyed by `job_id` plus a dedupe key, so a re-run after a crash does not duplicate output. Retries use exponential backoff (1, 5, 25 minutes), up to 3 attempts. The worker's Supabase client sends `x-esta-actor: agent:{worker_id}` on every request so the audit trigger attributes its writes (SPEC §5.7).

Deterministic daily work (invoice generation and auto-issue, lease status transitions, keep-alive) does not run here. It runs on Vercel Cron (SPEC §8) so it never depends on Ryan's machine.

### 2.2 Claude Agent SDK usage

Confirm exact option names against the current TypeScript SDK docs in spike S1. The intended shape:

- `query({ prompt, options })` per job.
- Custom tools through an in-process MCP server named `esta` (`createSdkMcpServer` with `tool(name, description, zodSchema, handler)`), so tools appear as `mcp__esta__<name>`.
- `settingSources: []` so the worker never loads Ryan's personal or project Claude Code settings, skills, plugins, hooks or CLAUDE.md. The runtime agent must not inherit the build-time stack.
- Tool access is enforced twice. `allowedTools` lists the job kind's tools (§3) so they run without prompts, and `canUseTool` denies every tool not on that list and every `Read` outside the job's directory. Bash, Write, Edit, NotebookEdit and subagent tools are also listed in `disallowedTools`.
- `cwd` is the job's directory under `ESTA_AGENT_HOME`: a temp dir per job, deleted afterwards, except Ask, which uses a stable `conversations/{conversation_id}` dir so SDK sessions can be resumed.
- `env` passed to the SDK contains only the credential for the active `ESTA_AUTH_MODE` (§2.3), never both.
- `model` from `ESTA_MODEL_ROUTINE` or `ESTA_MODEL_DEEP`; never hardcoded.
- `maxTurns` and a wall-clock timeout per kind (§3).
- Ask stores the SDK `session_id` on the conversation and resumes it for follow-ups.
- Record the final result message's usage, turn count, cost estimate and session id in `agent_runs`.

If S1 shows the SDK cannot run on subscription auth on this machine, fall back to spawning `claude -p --output-format stream-json` with equivalent isolation flags and an MCP config pointing at a local stdio MCP server exposing the same tools. Record the decision here.

### 2.3 Authentication

- `ESTA_AUTH_MODE=subscription` (default): run `claude setup-token` once and put the token in `apps/agent/.env.local` as `CLAUDE_CODE_OAUTH_TOKEN`.
- `ESTA_AUTH_MODE=api_key`: uses `ANTHROPIC_API_KEY`.
- In `live` mode the worker refuses to start if the variable for the chosen mode is missing, passes only that credential to the SDK, and writes the mode to its heartbeat. Settings shows it to operators.
- In `replay` mode (§8) no credential is needed or read, so CI starts the worker without secrets.

### 2.4 Where it runs

- **Ryan's Mac.** A launchd agent (`~/Library/LaunchAgents/vn.esta.agent.plist`, RunAtLoad, KeepAlive, logs to `~/Library/Logs/esta-agent.log`). The Mac must not sleep for scheduled jobs to run on time; document the Energy settings and `caffeinate -s`. Jobs missed while asleep run on wake; the scheduler backfills only today's daily jobs.
- **Always-on box.** A small home server or VPS using the provided Dockerfile. Same env vars.
- **No always-on machine (P2 alternative).** Daily research can run as a Claude scheduled task in Claude's cloud writing `research_items` through the Supabase connector. Not the default because it bypasses the tool layer's guards.

### 2.5 Terms and usage

As of October 2026, Anthropic's help center states that Claude Agent SDK usage in your own projects and `claude -p` draw from the subscription's usage limits (a planned separate SDK credit was paused on 15 June 2026). The SDK docs say third-party developers may not offer claude.ai login to their users. Esta is Ryan's own project run for his household, so subscription auth is the intended use. Consequences:

1. Keep the worker under Ryan's account and for this household only. Do not add other families on this auth.
2. If Mẹ uses Ask heavily, either she uses her own Claude plan or the worker switches to `api_key`.

Re-check the help center article before production deploy; record the date checked in `docs/plan/STATUS.md`.

## 3. Job kinds and schedules

| Kind | Trigger | Model | Tools | maxTurns | Timeout |
| --- | --- | --- | --- | --- | --- |
| `ping` | Manual (Phase 0) | routine | `household_info` | 3 | 1 min |
| `extract_document` | Upload in an extractable category | routine | Read (job dir only), `save_extraction` | 8 | 5 min |
| `research_scan` | Daily 06:00 and manual | routine | WebSearch, WebFetch, `research_topics`, `recent_items`, `list_properties`, `add_research_item`, `create_item` | 30 | 10 min |
| `portfolio_watch` | Daily 06:40 | routine | `watch_facts`, `create_item` | 6 | 3 min |
| `morning_brief` | Daily 07:00 | routine | `watch_facts`, `recent_items`, `create_item` | 6 | 3 min |
| `weekly_review` | Sunday 08:00 | deep | All read tools, WebSearch, WebFetch, `create_item`, `create_proposal` | 25 | 10 min |
| `ask` | Message in a conversation | routine (deep on request) | All read tools, `create_proposal` | 15 | 2 min |
| `backup_export` | Daily 02:00 | none (no model) | n/a | n/a | 20 min |

Idempotency keys: `{kind}:{household_id}:{local_date}` for daily jobs, `{kind}:{household_id}:{iso_week}` for weekly, `extract_document:{document_id}:{sha256}`, `ask:{message_id}`.

`morning_brief` depends on the same day's `research_scan` and `portfolio_watch`. When the brief is claimed while either is queued or running, it reschedules itself 5 minutes later, up to 3 times, then proceeds and says in one line which input is missing. Backfilled jobs (worker waking late, or a test advancing the clock) are inserted in schedule order, so the dependency holds after backfill too.

## 4. Tools

All tools are built per job with the household id bound in a closure. Every query filters by it. A unit test calls each tool with a job for household A and asserts zero rows from household B. Tools return the aggregates listed so answers never need arithmetic. Every numeric field also comes with a `_display` string formatted by `packages/core/format` in the household locale (for example `gross_yield_bp: 650` with `gross_yield_display: "6,5%"`, amounts with full and compact forms), so the model copies display strings instead of converting units.

Read tools (no sensitive document content):

| Tool | Returns |
| --- | --- |
| `household_info` | Household name, member count, property count, locale |
| `portfolio_overview` | Property and unit counts, occupancy, this month expected and collected totals, held deposits total, estimated value total with dates |
| `list_properties(filter)` | Ids, nicknames, kinds, current and certificate provinces, use mode, legal status, completeness |
| `get_property(id)` | Property with parcels, structures, certificates (status, mortgage bank and amount), owners, units, active leases, latest valuation |
| `property_metrics(property_id, year)` | Contracted annual rent, gross yield in basis points with the valuation used, occupancy, vacancy days per unit |
| `list_leases(filter)` | Leases with status, rent, cycle, end date, days until end, tenant short name |
| `get_lease(id)` | Lease with periods, invoices, allocations, deposit entries, held deposit |
| `collections(month, property_id?)` | Same grouping as the collections board (SPEC LSE-10): invoices due in the month plus earlier unpaid ones marked `carried_over`, with derived status and days overdue, plus totals and counts per status |
| `ledger(property_id?, from, to)` | Income (allocations by payment received date) and expense totals by month and by category, and the rows |
| `tax_position(owner_party_id, year)` | Output of `packages/core/tax`: accrued-to-date and projected full-year attributed revenue, threshold, remaining to threshold, percent of threshold in bp, estimated owner-paid VAT and PIT, withheld leases, rule source |
| `payment_behavior(year)` | Per tenant: invoices, invoices paid late (fully allocated after due_date), average days late |
| `watch_facts(as_of)` | Output of every watch rule (§5.3) with stable ids and the numbers involved |
| `search_documents(query)` | Titles, categories, ids, property; never OCR text of sensitive documents |
| `get_document_text(id)` | OCR text; refuses sensitive documents |
| `recent_items(days, kinds)` | Recent agent items and research items for dedupe |
| `research_topics` | Active topics with query templates and linked properties |

Write tools:

| Tool | Writes |
| --- | --- |
| `save_extraction(document_id, schema_name, result, field_confidence)` | `document_extractions` row with status `needs_review` |
| `add_research_item(...)` | `research_items` (unique on normalized URL per household) |
| `create_item(kind, severity, audience, title, body_md, related, citations, dedupe_key)` | `agent_items` |
| `create_proposal(type, params, rationale, related, dedupe_key)` | `agent_items` with kind `proposal` |

Proposal types, each with a zod schema in `packages/core/proposals` and a handler in the web app: `create_task`, `draft_reminder`, `suggest_lease_renewal`, `suggest_rent_change`, `flag_data_issue`. Unknown types are rejected by the tool.

## 5. Jobs in detail

### 5.1 extract_document

1. The web app enqueues the job after upload when the category is `certificate`, `lease_contract` or `utility_bill`.
2. The worker downloads the file with the service role into the job directory.
3. The agent reads it with `Read` (images and PDFs) and returns JSON for the category's schema: `certificate_v1` (DOMAIN-VN §2.1), `lease_v1` (landlord and tenant names and phones, property address, unit, start and end, rent, cycle, due day, deposit, escalation text, utilities terms, signed date, notarized), `utility_bill_v1` (provider, customer code, period, amount, consumption, address).
4. The worker validates with zod; on failure it sends the validation errors back for up to two repair turns.
5. Full national ID numbers are reduced to the last 4 digits before saving, whatever the model returns.
6. `save_extraction` stores the result, and an `agent_item` tells the uploader that review is waiting.

### 5.2 research_scan

Topics are generated from the portfolio (read-only list in v1 Settings):

- For each province and commune where the household owns property (current and legacy names): land price table changes, planning and zoning, infrastructure (ring roads, metro, expressways, airports, bridges), rental market for the property kinds held there.
- Standing national topics: Land Law amendments and guidance, rental tax and declaration rules, state land price tables, mortgage interest rates.

Process: up to 12 searches and 8 fetches per run (configurable in `household_settings`). Vietnamese queries first, English where useful. Prefer official sources (`*.gov.vn`, chinhphu.vn, baochinhphu.vn, provincial portals, thuvienphapluat.vn, luatvietnam.vn) and established press. Do not use forums or listing sites as news sources. Do not crawl; fetch individual articles only.

Keep an item only if it was published since the last successful run (or within 7 days on the first run), or concerns a rule whose effective date is within 60 days. Dedupe against the last 30 days by normalized URL and by title similarity (pg_trgm similarity above 0.6).

Each item: `title_vi` (own words), `summary_vi` (≤ 60 whitespace-separated tokens, own words), `why_it_matters_vi` naming specific properties or provinces, `kind` (`infrastructure | land_price | legal_tax | market_rent | planning | other`), `relevance` in [0, 1], `related_property_ids`, `province_codes`, `source_url`, `source_name`, `published_at`. Items with relevance ≥ 0.6 are eligible for the brief. All items appear in the Thị trường tab.

A run that finds nothing material writes one `research_scan_empty` item: "Không có tin đáng chú ý cho các khu vực của gia đình hôm nay." That is a valid result; never pad.

### 5.3 portfolio_watch

Rules live in `packages/core/watch` as a registry of pure functions over a snapshot taken at `as_of`. Each returns facts with a stable `rule_id`, `subject_key` (seed-stable key or record id), `severity` (`info | watch | action`) and the numbers involved.

| Rule | Fires when | Severity |
| --- | --- | --- |
| W1 overdue | Issued invoice unpaid past its due date | `action` if more than 7 days, else `watch` |
| W2 due soon | Issued invoice due within the next 3 days and unpaid | `info` |
| W3 lease ending | Active lease ends within 60 days with no renewal | `watch`; `action` within 30 |
| W4 vacancy | Unit of a property with use_mode `rental` and no active lease for more than 30 days, counted as `as_of − last lease end_date`, or `as_of − available_from` if never leased | `watch`; `action` above 90 |
| W5 document expiry | Document expires within 30 days | `watch`; `action` within 7 |
| W6 deposit unsettled | Lease ended more than 14 days ago with deposit held | `action` |
| W7 tax threshold | Owner's projected full-year attributed revenue (SPEC FIN-3) ≥ 80% of threshold | `watch`; `action` when it reaches the threshold (once per year) |
| W8 meter readings missing | After day 5 of the month, a meter of a leased rooming-house unit has no reading with `read_on` in the current month | `action` |
| W9 short payments | Tenant's last 2 invoices whose due date is before as-of each have less than 90% allocated | `watch` |
| W10 extraction waiting | Extraction in `needs_review` for more than 3 days | `info` |
| W11 low completeness | Property completeness below 60% | `info`, at most one property per day, lowest first |

The model receives the facts and writes one `agent_item` per action fact and one grouped item for watch and info facts. It may merge related facts but may not add facts.

### 5.4 morning_brief

Composes today's watch facts and eligible research items into one `brief` item (P0, in-app); PLT-4 emails it (P1):

- One-line summary.
- "Cần làm" with up to 5 action items, each linked.
- "Theo dõi" with up to 5 watch items.
- "Thị trường" with up to 3 research items, each with its source chip.
- At most 300 whitespace-separated tokens. Every number passes the guard. Every link resolves to an existing record.

### 5.5 weekly_review

Every Sunday 08:00 with the deep model: last week's collections against expected, the next 30 days, vacancy, notable expenses, tax position change, and up to 3 proposals. A proposal that cites market rents must cite sources fetched in this run or stored research items.

### 5.6 ask

1. The web app inserts the user message and enqueues `ask`.
2. The worker resumes the conversation's SDK session if one exists.
3. The assistant answers with read tools only, may create a proposal, and links records with `esta://{type}/{id}` URIs that the web app renders as in-app links.
4. Partial text streams into the `messages` row; the web app subscribes via Realtime.
5. If the tools cannot answer, it says what is missing. It never estimates figures.

Target: first visible text within 10 seconds when the worker is online.

## 6. Prompts and guards

### 6.1 System prompt skeleton (shared)

```text
Bạn là Trợ lý của ứng dụng Esta, giúp một gia đình quản lý bất động sản ở Việt Nam.
You may only use the tools provided. Every number you write must appear in a tool result from this run.
Do not calculate totals, differences or ratios yourself; call the tool that returns them.
Never invent amounts, dates, names or sources. If information is missing, say so plainly.
You cannot change business records. To suggest a change, use create_proposal.
Write in {locale}. Use the household's terms: sổ, thửa đất, hợp đồng thuê, tiền cọc, kỳ thanh toán.
Tone: calm, polite, concise, like a careful family accountant. No exclamation marks, no emoji.
Today is {local_date} in Asia/Ho_Chi_Minh.
```

Each job appends its own task section and output schema.

### 6.2 Output schemas

Every job's final output is JSON validated by zod schemas in `packages/core/agent-schemas`. Text fields are Markdown limited to paragraphs, lists, bold and links, and the web app sanitizes them (SPEC §7.1).

### 6.3 Number guard

Before writing any item or message, extract every number from the generated text (Vietnamese and English formats, including "3,5 tr", "1,2 tỷ", "6,5%", dates and day counts), normalize each to a canonical value, and check it against the allowed set: canonical values found anywhere in this run's tool results (raw fields, `_display` strings, and numbers inside labels such as "Phòng 5"), plus the context values injected into the prompt (today's date, the household name). Percent and basis-point forms of the same value are equal after normalization. A violation triggers one repair turn naming the offending numbers; a second violation fails the job and creates an `info` item with audience `operator` containing the offending text. Mẹ never sees it.

## 7. Evaluation

Golden tests run in CI in `replay` mode (§8) with the clock frozen at 2026-10-07 07:00 Asia/Ho_Chi_Minh on the `full` seed.

### 7.1 Watch rules

Expected fact set for 2026-10-07 on the `full` seed (SPEC §9.3). Test: set equality on `(rule_id, subject_key, severity)`. Write `apps/agent/test/golden/watch-2026-10-07.json` from this table before implementing the rules.

| Rule | Subject | Severity | Why |
| --- | --- | --- | --- |
| W1 | invoice of `di-an` Phòng 5 due 2026-09-25 | action | 12 days overdue |
| W3 | lease `thu-duc` | action | ends 2026-11-01, 25 days |
| W4 | unit of `bien-hoa` | watch | 70 days since 2026-07-29 |
| W4 | unit `di-an` Phòng 8 | watch | 67 days since available_from 2026-08-01 |
| W5 | insurance document of `q7` | watch | expires 2026-10-30, 23 days |
| W6 | lease `di-an` Phòng 7 | action | ended 2026-09-15, 22 days, deposit held |
| W7 | owner Nguyễn Thị Demo | watch | projected 2026 revenue between 80% and 100% of threshold |
| W11 | property `long-an` | info | completeness below 60% |

Must not fire: W1 for the Dĩ An invoices due 2026-10-25 (not yet due); W2 (no issued invoice due 2026-10-08 to 2026-10-10); W4 for `di-an` Phòng 7 (22 days) or for `long-an` and `bao-loc` (use_mode held); W6 for `bien-hoa` (deposit refunded 2026-08-05); W7 for Trần Minh Demo; W8 (readings with `read_on` 2026-10-03); W9 (Phòng 5 has one short past-due invoice, not two); W10.

### 7.2 Extraction

Synthetic fixtures for every certificate form, three leases and two utility bills. Targets: 100% schema-valid; field-level exact match ≥ 90% on required fields (parcel_no, map_sheet_no, area_m2, address_text, holder names, issued_on, serial_no); fields with confidence ≥ 0.9 are at least 97% correct. Private fixtures are measured locally and never committed.

### 7.3 Brief

Number guard passes; ≤ 300 tokens; every link resolves; structure snapshot (sections present and ordered), not wording.

### 7.4 Ask

Ten golden questions with SQL ground truth on the `full` seed. Pass when every number in the answer equals ground truth after normalization and every link resolves:

1. Tháng này thu được bao nhiêu từ Dĩ An? (`ledger`: income received in October; the answer links to the property ledger)
2. Phòng nào ở Dĩ An đang quá hạn đóng tiền? (`collections`; ground truth is Phòng 5 only)
3. Hợp đồng nào hết hạn trong 60 ngày tới? (`list_leases`)
4. Tổng tiền cọc đang giữ là bao nhiêu? (`portfolio_overview`)
5. Doanh thu cho thuê năm nay của mẹ là bao nhiêu, còn cách ngưỡng 500 triệu bao xa? (`tax_position`)
6. Kho Biên Hòa để trống bao lâu rồi? (`property_metrics`)
7. Chi phí sửa chữa năm nay của Nhà phố Q7 là bao nhiêu? (`ledger`)
8. Sổ đất Bảo Lộc có đang thế chấp không, ở ngân hàng nào? (`get_property`)
9. Lợi suất cho thuê gộp của Mặt bằng Quận 1 là bao nhiêu? (`property_metrics`)
10. Which tenant paid late most often this year? Must answer in English. (`payment_behavior`)

### 7.5 Research (live only)

At least one item or the explicit empty item; every source URL fetches with status 200 at check time; related property ids exist; summaries within the token limit; no duplicates of the last 30 days; Vietnamese.

### 7.6 Live run at the Phase 5 exit

Run every job kind once in `live` mode locally on the `full` seed with the frozen clock, record the outputs in `docs/plan/trail/`, and check: watch facts equal §7.1 (deterministic), brief and Ask pass §7.3 and §7.4, research passes §7.5, extraction meets §7.2.

## 8. Replay mode

`ESTA_AGENT_MODE=replay` replaces model calls with recordings stored in `fixtures/agent-replay/{job_kind}/{input_hash}.json`. Before hashing, the input (prompt, tool results, schema version) is canonicalized: UUIDs become `<id:1>`, `<id:2>` in order of first appearance, memo codes become `<memo:n>`, and timestamps are taken from the test clock. Recorded outputs use the same placeholders, which are mapped back to the real values of the current run, so records created during a test (north-star step 2 onward) replay correctly. Tools, validation, the number guard and all writes run for real. A missing recording fails the test with the hash and a hint to record it. `pnpm agent:record` runs the same cases in `live` mode and refreshes recordings; Ryan reviews recording diffs like code. CI and `pnpm e2e:northstar` always use replay.

## 9. Limits, failures and UX

- Per-household daily caps per kind in `household_settings.agent` (defaults: extract 30, ask 60, research 2, weekly 1).
- `agent_runs` records usage and the SDK's cost estimate; operators see the last 7 days by kind in Settings.
- A run that fails because of a usage limit is rescheduled with backoff, and the status line reads "Trợ lý tạm dừng do hết hạn mức sử dụng".

| Situation | Behavior |
| --- | --- |
| Worker offline (heartbeat older than 5 min) | Banner: "Trợ lý ngoại tuyến từ 21:30. Việc mới sẽ chạy khi máy hoạt động lại." Jobs stay queued |
| Job failed after retries | `info` item with a Retry button for admins |
| Extraction failed | The review screen offers manual entry beside the image |
| Number guard failure | Job fails; operator-only item with the text; nothing shown to Mẹ |
| Research source unreachable | Item dropped; the run continues |

## 10. Agent-owned tables

- `agent_jobs`: kind, payload, status (`queued | running | done | failed | cancelled`), priority, run_after, attempts, max_attempts, idempotency_key (unique), locked_by, locked_at, started_at, finished_at, error, requested_by.
- `agent_runs`: job_id, auth_mode, agent_mode (`live | replay`), model, num_turns, usage jsonb, cost_estimate_usd, session_id, tool_calls jsonb (names and counts only), started_at, finished_at.
- `agent_items`: kind (`brief | alert | proposal | answer_note | research_scan_empty | system`), severity, audience (`all | operator`), title, body_md, related (jsonb of typed ids), citations (jsonb of url, title, source_name, published_at), proposal (jsonb type and params), status (`new | read | approved | dismissed | done | failed`), dedupe_key (unique per household), job_id, decided_by, decided_at.
- `research_topics`: label, query_templates, province_codes, property_ids, source (`auto | user`), active.
- `research_items`: url_normalized (unique per household), source_url, source_name, published_at, title_vi, summary_vi, why_it_matters_vi, kind, relevance, related_property_ids, province_codes, job_id.
- `conversations`: title, created_by, sdk_session_id.
- `messages`: conversation_id, role, content_md, status (`streaming | done | error`), job_id, refs jsonb.
- `worker_heartbeats`: worker_id, host_label, version, auth_mode, agent_mode, last_seen_at.
- `notifications`: user_id, channel (`inapp | email | push`), agent_item_id, status, sent_at, error.

`document_extractions` is defined in SPEC §5.5; the agent writes it through `save_extraction` only.
