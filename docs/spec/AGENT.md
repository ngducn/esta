# Esta assistant (Trợ lý): agent spec

The assistant watches the portfolio, reads documents, researches the market, and talks with each member in one Trợ lý thread, where its notes arrive and where she writes back about anything (Ryan's direction of 2026-10-25). It runs as a worker on a machine Ryan controls, using the Claude Agent SDK on Ryan's Claude subscription.

Ryan's own Claude chats reach Esta through the connector, which docs/spec/CONNECTOR.md specifies (agreed 2026-10-19). This file governs the unattended assistant.

## 1. Principles

1. **The agent proposes, people dispose.** The agent never writes business tables (properties, leases, invoices, payments, expenses, certificates, documents). It writes only agent-owned tables (§10) and `document_extractions`. Anything that changes business data is a proposal a person approves; the web app executes approvals under that person's session so RLS and the audit log attribute the change to them.
2. **Numbers come from fact sources, not from the model.** A fact source is a tool's data, a number the member typed herself in the conversation, a figure quoted word for word from a web page fetched in the same turn, or the result of the `calculate` tool, which shows its working (§6.4). Tools return the aggregates an answer needs and `calculate` does any other arithmetic, so the model never does arithmetic. The model never types a number either: it writes a placeholder that names a fact field, and Esta fills it (§6.3). Every other number is blocked, including numbers the model knows from training (Ryan, 2026-10-25).
3. **Deterministic first.** Rules that can be computed (overdue, expiring, vacancy, thresholds) are computed in `packages/core/watch` and SQL. The model ranks, groups and words them.
4. **Cite everything external.** Research output carries source URLs, source names and publication dates. Summaries are in the agent's own words with at most one short quote per source. A web figure in the thread is a word-for-word quote with its source chip.
5. **Vietnamese by default.** Output language follows the household locale, or the language of her message in the thread.
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

Time comes from the shared `Clock` (SPEC FND-9), read at the start of every scheduler tick and every job, so tests can advance it without restarting the worker. Claiming uses a SQL function `claim_agent_job(worker_id, p_as_of timestamptz)` with `FOR UPDATE SKIP LOCKED`, ordered by priority then `run_after`. A claimed job whose `locked_at` is older than its kind's timeout plus 2 minutes may be reclaimed while it has an attempt left; one with no attempt left is failed instead. Every write a job makes is keyed by `job_id` plus a dedupe key, so a re-run after a crash does not duplicate output. A failed job is retried up to 3 times, 1, 5 and then 25 minutes after the failure, so `max_attempts` defaults to 4; a missing replay recording or an `auth_error` fails the job at once, because a retry cannot fix either. The worker's Supabase client sends `x-esta-actor: agent:{worker_id}` on every request so the audit trigger attributes its writes (SPEC §5.7). `worker_id` is a random UUID per process, so two workers on one host never share a lock owner, a heartbeat row or a config dir.

Deterministic daily work (invoice generation and auto-issue, lease status transitions, keep-alive) does not run here. It runs on Vercel Cron (SPEC §8) so it never depends on Ryan's machine.

### 2.2 Claude Agent SDK usage

Spike S1 (`spike/s1-agent-sdk`, 83c56e0) confirmed these options on SDK 0.3.291, and `apps/agent/src/sdk/options.ts` builds them:

- `query({ prompt, options })` per job.
- Custom tools through an in-process MCP server named `esta` (`createSdkMcpServer({ name, version, tools, alwaysLoad: true })` with `tool(name, description, zodRawShape, handler)`), so tools appear as `mcp__esta__<name>`. `alwaysLoad: true` keeps them out of tool search, so they are in the first turn's prompt.
- `settingSources: []` and `strictMcpConfig: true`, so the worker never loads Ryan's personal or project Claude Code settings, skills, plugins, hooks, MCP servers or CLAUDE.md. The runtime agent must not inherit the build-time stack.
- Tool access is enforced twice. `tools` lists the job kind's built-in tools (§3), which is the only way to remove Glob, Grep, Skill, ToolSearch and the other built-ins that `disallowedTools` leaves on; `ping` sets `tools: []`. `allowedTools` lists the kind's built-in and MCP tools so they run without prompts. A `PreToolUse` hook then denies any tool outside the kind's list and any `Read` outside the job's directory, after resolving symlinks. The hook is the gate, because a bare name in `allowedTools` approves the tool before `canUseTool` runs. `permissionMode: 'default'` is set explicitly.
- `cwd` is the job's directory under `ESTA_AGENT_HOME`: a temp dir per job, deleted afterwards, except Ask, which uses a stable `conversations/{conversation_id}` dir so SDK sessions can be resumed.
- `env` replaces the subprocess environment. It holds `PATH`, `LANG`, the credential for the active `ESTA_AUTH_MODE` (§2.3) and never both, and `HOME` and `CLAUDE_CONFIG_DIR` pointing at a directory under `ESTA_AGENT_HOME` that holds nothing of the operator's, so the SDK never finds the operator's own Claude login: an empty per-worker dir for every kind except Ask, whose conversation keeps its own `sdk/` folder for its transcripts (§5.6).
- `model` from `ESTA_MODEL_ROUTINE` or `ESTA_MODEL_DEEP`; never hardcoded.
- `maxTurns` and a wall-clock timeout per kind (§3), the timeout through `abortController`.
- Ask stores the SDK `session_id` on the conversation and resumes it for follow-ups.
- An auth failure arrives as `subtype: 'success'` with `is_error: true`, so the worker fails any result with `is_error`, and records a 401 or a missing login as `auth_error`, which it does not retry.
- Record the final result message's `num_turns`, `session_id`, `total_cost_usd` (as `cost_estimate_usd`), `usage` with `modelUsage` and `permission_denials`, and the tool calls as names and counts in `agent_runs`, and the reply in `agent_jobs.result`.

S1 settled the SDK path, so the `claude -p --output-format stream-json` fallback is not used.

### 2.3 Authentication

- `ESTA_AUTH_MODE=subscription` (default): run `claude setup-token` once and put the token in `apps/agent/.env.local` as `CLAUDE_CODE_OAUTH_TOKEN`.
- `ESTA_AUTH_MODE=api_key`: uses `ANTHROPIC_API_KEY`.
- In `live` mode the worker refuses to start if `ESTA_ENV` or the variable for the chosen mode is missing, passes only that credential to the SDK, and writes the mode to its heartbeat. The operator diagnostics page (`/assistant/diagnostics`) shows it through `public.worker_modes`, which answers operators only.
- In `replay` mode (§8) no credential is needed or read, so CI starts the worker without secrets.

### 2.4 Where it runs

- **Ryan's Mac.** A launchd agent (`~/Library/LaunchAgents/vn.esta.agent.plist`, RunAtLoad, KeepAlive, logs to `~/Library/Logs/esta-agent.log`). The Mac must not sleep for scheduled jobs to run on time; document the Energy settings and `caffeinate -s`. Jobs missed while asleep run on wake; the scheduler backfills only today's daily jobs.
- **Always-on box.** A small home server or VPS using the provided Dockerfile. Same env vars.
- **No always-on machine (P2 alternative).** Daily research can run as a Claude scheduled task in Claude's cloud writing `research_items` through the Supabase connector. Not the default because it bypasses the tool layer's guards.

### 2.5 Terms and usage

As of October 2026, Anthropic's help center states that Claude Agent SDK usage in your own projects and `claude -p` draw from the subscription's usage limits (a planned separate SDK credit was paused on 15 June 2026). The SDK docs say third-party developers may not offer claude.ai login to their users. Esta is Ryan's own project run for his household, so subscription auth is the intended use. Consequences:

1. Keep the worker under Ryan's account and for this household only. Do not add other families on this auth.
2. If Mẹ writes to the thread heavily, either she uses her own Claude plan or the worker switches to `api_key`. The daily `ask` cap (§9) bounds it meanwhile.

Re-check the help center article before production deploy; record the date checked in `docs/plan/STATUS.md`.

## 3. Job kinds and schedules

| Kind | Trigger | Model | Tools | maxTurns | Timeout |
| --- | --- | --- | --- | --- | --- |
| `ping` | Manual (Phase 0) | routine | `household_info` | 3 | 1 min |
| `extract_document` | Upload in an extractable category | routine | Read (job dir only), `save_extraction` | 8 | 5 min |
| `research_scan` | Daily 06:00 and manual | routine | WebSearch, WebFetch, `research_topics`, `recent_items`, `list_properties`, `add_research_item` | 40 | 10 min |
| `portfolio_watch` | Daily 06:40 | routine | `watch_facts`, `create_item` | 8 | 3 min |
| `morning_brief` | Daily 07:00 | routine | `watch_facts`, `recent_items`, `create_brief` | 6 | 3 min |
| `weekly_review` | Sunday 08:00 | deep | All read tools, WebSearch, WebFetch, `create_item`, `create_proposal` | 25 | 10 min |
| `ask` | Message in the Trợ lý thread | routine (deep on request) | All read tools, `create_proposal`, `calculate` (P5-15), WebSearch and WebFetch (P5-14) | 15; 20 with web | 2 min a session, 3 min with web; twice that with the repair turn |
| `backup_export` | Daily 02:00 | none (no model) | n/a | n/a | 20 min |

Idempotency keys: `{kind}:{household_id}:{local_date}` for daily jobs, `{kind}:{household_id}:{iso_week}` for weekly, `extract_document:{document_id}:{sha256}`, `ask:{message_id}`.

`morning_brief` depends on the same day's `research_scan` and `portfolio_watch`. When the brief is claimed while either is queued or running, it reschedules itself 5 minutes later, up to 3 times, then proceeds and says in one line which input is missing. An input that already failed with no attempt left does not hold the brief back; the brief names it in the same section. Backfilled jobs (worker waking late, or a test advancing the clock) are inserted in schedule order, so the dependency holds after backfill too.

## 4. Tools

All tools are built per job with the household id bound in a closure. Every query filters by it. A unit test calls each tool with a job for household A and asserts zero rows from household B. Tools return the aggregates listed so answers never need arithmetic. Every numeric field also comes with a `_display` string formatted by `packages/core/format` in the household locale (for example `gross_yield_bp: 650` with `gross_yield_display: "6,5%"`, amounts with full and compact forms), so the model cites display strings instead of converting units. Each record a tool returns carries a handle (`f1`, `f2`, …), and the model cites one of its fields as `{{f3.outstanding_display}}` (§6.3).

Read tools (no sensitive document content):

| Tool | Returns |
| --- | --- |
| `household_info` | Household name, member count, property count, locale |
| `portfolio_overview` | Property and rental unit counts, units leased and occupancy, this month's billed and collected totals, deposits held on live properties' leases other than drafts (including those of ended leases not yet returned), estimated value total with the oldest valuation date and the count of properties without one |
| `list_properties(filter)` | Ids, nicknames, kinds, current and certificate provinces, use mode, legal status, completeness |
| `get_property(property)` | For one `list_properties` handle: its latest valuation, each certificate (serial, status, mortgage bank, amount and date registered), linked to the property's Pháp lý tab (`esta://legal/{property}`), and its owners with their shares. Units and their leases come from `property_metrics` and `list_leases`; parcels and structures are not read yet |
| `property_metrics(property, year)` | Monthly and annual rent in effect, gross yield in basis points with the valuation used, leased and rental unit counts, the date of the property's `Trống từ` pill read from `property_list_rows.vacant_since` (`readPropertyDetail`), and per unit whether it is leased and, when empty, the days empty |
| `list_leases(status?, ends_within_days?, property?)` | Leases of live properties, the soonest end first (a draft never ends within `ends_within_days`), with property, unit, tenant, status, rent, deposit held, start and end dates and days until the end, each linked to its lease |
| `get_lease(id)` | Lease with periods, invoices, allocations, deposit entries, held deposit |
| `collections(year, month, property?)` | The collections board's own read (`readCollectionRows` in `packages/ops`, SPEC LSE-10): invoices due in the month plus earlier unpaid ones marked `carried_over`, with derived status and days overdue, each linked to its invoice, plus totals and counts per status and the board's `Đã thu X / Y` (`monthCollected`: payments to the month's own bills, each capped at its bill) |
| `ledger(property?, year, month?)` | For one property (a handle from `list_properties`) or the whole household's live properties, as Reports counts it, and one month or a whole year: one record with the period and the income (allocations by payment received date), expense and net totals and the Thu chi link, one record per expense category with spending, and for a year one record per month |
| `tax_position(year)` | Per owner, the tax card's own path (`toTaxInputs` and `computeTaxPosition` over `readReportSnapshot`): accrued-to-date and projected full-year attributed revenue, other business revenue, threshold, remaining to threshold, share of threshold, estimated owner-paid VAT and PIT, rule source; `no_rule` when the year has no tax rule |
| `payment_behavior(year)` | Per tenant, over the year's issued invoices due by today (`paymentBehavior` in `packages/core/reports`): invoices, invoices paid late (fully allocated after due_date), average days late, invoices still overdue; the tenant who paid late most often first, a tie going to the larger late share, then the longer average |
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
| `create_brief(summary, todo, watch)` | One `brief` item a day in `agent_items`: each line is plain text naming the facts it tells, and the tool links it to the first fact's record and renders the sections (§5.4). It fills and checks every text through the same number guard writer as `create_item` |
| `create_proposal(type, params, rationale, related, dedupe_key)` | `agent_items` with kind `proposal` |

Proposal types, each with a zod schema in `packages/core/proposals` and a handler in the web app: `create_task`, `draft_reminder`, `suggest_lease_renewal`, `suggest_rent_change`, `flag_data_issue`. Unknown types are rejected by the tool.

Thread fact tools, in `ask` only:

| Tool | Returns |
| --- | --- |
| `quote_page(url, quotes[])` (P5-14) | One source record for a page WebFetch returned in this turn: `source_name`, `published_display` when the page writes a date, and one `quote_n_label` per quote. Each quote is checked word for word against that page's text with the rule of `apps/agent/src/tools/web-quotes.ts` (§6.4), and a quote that does not match is refused with the reason. It writes nothing |
| `calculate(op, operands)` (P5-15) | One record with `result_display` and `working_display` for an operation of the `packages/core/src/calc` registry over fact fields named by handle (§6.4). It writes nothing |

## 5. Jobs in detail

### 5.1 extract_document

1. The web app enqueues the job after upload when the category is `certificate`, `lease_contract` or `utility_bill`.
2. The worker downloads the file with the service role into the job directory.
3. The agent reads it with `Read` (images and PDFs) and returns JSON for the category's schema: `certificate_v1` (DOMAIN-VN §2.1), `lease_v1` (tenant name and phone, the last four digits of the tenant's ID number only, property address as printed, room or unit label, start date, end date or term in months, monthly rent, payment cycle, due day, deposit, and notes that carry escalation and utility terms as printed; P3-19), `utility_bill_v1` (provider, customer code, period, amount, consumption, address).
4. The worker validates with zod; on failure it sends the validation errors back for up to two repair turns.
5. Full national ID numbers are reduced to the last 4 digits before saving, whatever the model returns.
6. `save_extraction` stores the result, and an `agent_item` tells the uploader that review is waiting.

### 5.2 research_scan

Topics are generated from the portfolio (read-only list in v1 Settings):

- For each province and commune where the household owns property (current and legacy names): land price table changes, planning and zoning, infrastructure (ring roads, metro, expressways, airports, bridges), rental market for the property kinds held there.
- Standing national topics: Land Law amendments and guidance, rental tax and declaration rules, state land price tables, mortgage interest rates.

Process: up to 12 searches and 8 fetches per run (`research_searches` and `research_fetches` in `household_settings.agent` may lower them, never raise them, since the turn budget is sized for these); the `PreToolUse` hook counts them and denies the calls past each cap, and a fetch must name one https page that this run's WebSearch returned (the link as the search gave it, folding only host case, `www.`, port 443, a trailing slash and the fragment; no added query parameter or userinfo, which could carry data to that host), so a page cannot send the model to another site with the family's details in a link (#323). [app rule] A page that redirects to another host is dropped, because its new link was never a search result. Vietnamese queries first, English where useful. Prefer official sources (`*.gov.vn`, chinhphu.vn, baochinhphu.vn, provincial portals, thuvienphapluat.vn, luatvietnam.vn) and established press. Do not use forums or listing sites as news sources. Do not crawl; fetch individual articles only.

Keep an item only if it cites a page WebFetch read in this run, and it was published since the last successful run (or within 7 days on the first run), or concerns a rule whose effective date is within 60 days. Dedupe by normalized URL (any stored item) and by title similarity over the last 30 days (pg_trgm similarity above 0.6, compared without diacritics). `add_research_item` answers a dropped item with its reason, and the job result lists every dropped item.

The item's texts and its `source_name` pass the number guard (§6.3), each item with its own repair turn; an outlet whose name holds a digit is written as `{{f0.host_label}}`, the page's host. A figure, a road or a law number from the article (Vành đai 3) is never typed: the model copies it into `quotes` with the words around it, at least three words, which must appear word for word and at word and number boundaries (so `50` never matches inside `150`, `500` inside `1.500` or `2,500`, and `% giá` inside `15% giá`) in the text WebFetch returned for that page (the scan asks WebFetch for them verbatim, since it answers a processed reading, not the raw page), and cites it as `{{f0.quote_1_label}}`; `f0` is the item's own source record, which also holds `published_display`. [app rule] `maxTurns` is 40, not 30, so a run that calls one tool a turn keeps room for repair turns. `create_item` is not one of its tools: Esta writes the empty item itself.

`published_on` must be a date the fetched text writes out (`05/10/2026`, `2026-10-05`, `ngày 5 tháng 10 năm 2026`), or the item drops as `date_unconfirmed`; an `effective_on` the text does not write out is stored as null, before either drives the keep rule. `source_url` stores the normalized link of the page WebFetch read.

Each item: `title_vi` (own words), `summary_vi` (≤ 60 whitespace-separated tokens, own words), `why_it_matters_vi` naming specific properties or provinces, `kind` (`infrastructure | land_price | legal_tax | market_rent | planning | other`), `relevance` in [0, 1], `related_property_ids`, `province_codes`, `source_url`, `source_name`, `published_on`, `effective_on` (a rule's effective date, or null). Items with relevance ≥ 0.6 are eligible for the brief. All items appear in the Thị trường tab.

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

[app rule] W2 counts an invoice due today, so it covers today and the next 3 days. W3 counts a lease terminated on a future date as active until that date. W6 reads a renewal chain as one deposit: a renewed lease passes its held balance to its renewal (`renew_lease` writes no entries for the new lease), so W6 fires once the last lease of the chain has ended more than 14 days ago. W9 orders a tenant's invoices by due date, then period start, then id, and counts every invoice, so two short invoices of one month make the pair.

The model receives the facts and writes one `agent_item` per action fact, relating that fact alone, and one grouped item for watch and info facts. It may merge related watch and info facts in the grouped item but may not add facts. An action item takes its dedupe key from its one fact, so a rerun the same day finds the item it wrote however the model orders its calls. [app rule] `maxTurns` is 8: a day with three action facts takes six turns, which leaves one for the number guard's repair turn and one for a refused call.

### 5.4 morning_brief

Composes today's watch facts and eligible research items into one `brief` item (P0, in the thread and on Home); PLT-4 emails a notice with its title and a link to it (P5-09):

- One-line summary.
- "Cần làm" with up to 5 action items, each linked.
- "Theo dõi" with up to 5 watch items.
- "Thị trường" with up to 3 research items, each with its source chip.
- At most 300 whitespace-separated tokens. Every number passes the guard. Every link resolves to an existing record.

The model drafts the summary and the lines through `create_brief`; `renderBriefMarkdown` in `packages/core/src/agent-schemas/brief.ts` writes the sections in the order `BRIEF_SECTIONS` lists them, and the summary is the item's title, which Home shows as one line. While a section has room, `create_brief` asks for a line for every action fact under "Cần làm" and every watch fact under "Theo dõi", so no fact drops out unseen; the job result lists any it left out. When the brief ran without an input it waited for (§3), or that input failed with no attempt left, a last section "Còn thiếu" names it. [app rule] Esta writes "Thị trường" itself from today's stored research items of relevance 0.6 or more, most relevant first: each line is the item's title, which passed the number guard when the scan stored it, and a source chip with the source name and `dd/mm/yyyy` that opens the article. The model does not write these lines, because one replay recording must serve every household, and a household whose scan failed, kept nothing or is still queued has no research handles to cite.

### 5.5 weekly_review

Every Sunday 08:00 with the deep model, keyed by ISO week, so a second run in the same week adds nothing and a missed Sunday is not backfilled. The run reads its week from the job's key, through any `:retry:{n}`, and its figures stand at that week's Sunday, so a `Thử lại` after midnight writes the week it retries and the next Sunday keeps its own. It writes one note, `agent_items` kind `weekly` with `dedupe_key` `weekly_review:{iso_week}`, in five sections: this month's collections against expected so far (the month-to-date `month_collected` figure, which the collections board shows), the next 30 days, vacancy, notable expenses, and the tax position as it stands (no earlier snapshot exists to diff against). It makes at most 3 proposals a week; `create_proposal` refuses a fourth, counting what earlier attempts and retries of the same week stored, and takes the calls of one run one at a time so parallel calls cannot pass the cap together. A `suggest_rent_change` must cite at least one URL, and every cited URL must be a page `WebFetch` read in this run or a stored `research_items` row, matched by normalized URL; anything else is refused. Proposals name a property or lease by fact handle, so one recording replays for every seeded household. Web calls are capped at 6 `WebSearch` and 4 `WebFetch` per run [app rule].

### 5.6 ask, the Trợ lý thread

Each member has one thread under Trợ lý's `Tin nhắn` tab (P5-12). It merges, by time with the newest at the bottom, the household's notes the member may read (`agent_items` with audience `all`, and `operator` for operators) with the conversations that member started. Conversations are the thread's segments. Each one bounds an SDK session, and she never sees the seams. Trợ lý's notes are the proactive half: the brief, alerts, proposals, the weekly review and, through the brief's `Thị trường` section, the news. Her messages are the open half.

1. She types in the reply box. `public.ask_in_thread` takes an advisory lock for the member and picks the conversation the message joins: her latest one while its last question was asked on the same business day and it holds fewer than 20 questions, and a new one otherwise [app rule]. The business day comes from the database clock (`private.audit_now()`, which honors the test clock), never from the client, so no caller can pass a future date (#340). A message with a topic (`messages.topic_item_id` or `topic_property_id`, P5-13), a reply to a note or a question from a property's `Hỏi Trợ lý về tài sản này`, always starts a new one, so the topic leads. It then runs `public.ask_question` on that conversation, which no client may call directly. `ask_question` writes the conversation, her message, an empty assistant row with status `streaming` and the `ask` job, keyed `ask:{question_id}`, in one transaction. A viewer may ask. No member writes `conversations` or `messages` directly. A follow-up names the same conversation: a question id it already holds returns at once, so a resent tap asks once, and a question while the last answer still streams is refused as busy (`ESTA_ASK_BUSY`). Only an operator may tick Suy nghĩ kỹ hơn, which runs the job on `ESTA_MODEL_DEEP`; the function refuses `p_deep` for anyone else.
2. The worker runs the job in `conversations/{conversation_id}` under `ESTA_AGENT_HOME`, a directory it keeps, and refuses an id that is not a UUID or a directory that is a link. The SDK keeps its transcripts in that directory too (`CLAUDE_CONFIG_DIR` is its `sdk/` folder). `public.finish_answer` marks the answer done and stores the turn's session id, its replay input hash and the number of fact handles the session has handed out, in one transaction, so only a turn whose answer the family saw is resumed. A follow-up resumes that session as a fork, and its handles start after the last one, so a handle the model remembers from an earlier turn cannot name a new record; the prompt tells it to call the tools again for every figure. The same holds for a web page: the text WebFetch returned lives only for the turn that fetched it, so a follow-up that needs a quoted figure fetches the page and calls `quote_page` again (P5-14). When the saved session is gone, as after a redeploy that emptied `ESTA_AGENT_HOME`, the same job starts a new session whose prompt holds Ask's full rules and the conversation's earlier questions with the answers she read (without their links), and `finish_answer` saves that session for the next follow-up. A conversation with no answered turn to rebuild from forgets its saved session, so its next question starts one of its own, and the follow-up fails at once (`lost_session`), with no retry. A new segment of the thread (step 1) starts its session with the same rebuild prompt, holding the last 3 questions and answers of her previous segment, so `Còn tháng 9 thì sao?` just after midnight or after the 20th question still knows what `tháng 9` follows (P5-12).
3. The assistant answers with the read tools of §4 and may suggest a change through `create_proposal`, which a member approves on its note card in the thread; a viewer's question can leave a proposal, and `approve_proposal` still needs a member. It writes in the language of the question, Vietnamese when unsure. It links a record as `[text](f3)`, with the handle of a record a tool returned in this run. Before the guard fills any value, the worker turns that into the record's `esta://` link and lists it in `refs`, so a cited name that holds `](f2)` stays text and the 4,000-character limit counts the links. The 3,000-character template limit counts only what the model wrote. Every write of the row carries the `refs` of the text it shows, and the page keeps only those links live: a handle with no link, an `esta://` link the model typed itself and any other URL render as their text.
4. Text streams through the number guard (§6.3) a sentence at a time (`apps/agent/src/jobs/askStream.ts`). The worker buffers model text to a sentence boundary outside an open link or placeholder, and never at the `.` of a line that holds only an ordered list's number, guards the whole prefix up to it, and writes the filled text that passed to the row at most every 300 ms. A violating sentence stops what the row shows. One repair turn writes the whole answer again from the start and replaces the row's content. A second violation sets the row to `error` with empty content and writes the operator item of §6.3.
5. The page reads the row through a server-sent events route, `/api/answers/{id}`, that polls it every 250 ms through the member's session client, so RLS is the only boundary and no Supabase key reaches the browser. The route closes when the row reaches `done` or `error`, when the client leaves, and after 5 minutes.
6. If no fact source can answer, it says what is missing and what it can do instead, such as look it up on the web or calculate from a number she types. It never estimates figures. A turn that ends after its tool calls without any text fails the job at once (`invalid_job`), with no retry.
7. She may ask anything (P5-12). About her data, the read tools answer. For writing, such as a Zalo message to a tenant or a short letter, any amount or date in the draft is a cited field like any answer, and the page offers `Sao chép`. Advice and explanations carry no number unless a fact source holds it. Answers about law, tax or procedure cite an official page fetched in the turn, which a structural check proves, apart from answers about her own tax position, which cite `tax_position` (step 9, P5-14). With a topic, the worker loads the topic's records before the first turn: for a note, the records its `related` names, read through the read tools; for a property, `get_property` and `property_metrics`. Those records hold the first handles, and the note's own text is context the model may not quote figures from.
8. Suggested replies are data, not model output. `SUGGESTIONS` in `packages/core/src/assistant/suggestions.ts` maps a note's kind and watch rule to message-file texts with record labels as parameters, and the page shows up to 3 from open notes of any day, as Cần xử lý reads them, most severe first and then newest, above the reply box (P5-13) [app rule]. The watch and the seed write notes the morning before, so today's notes alone would often show none. A tap sends one as her message with that note as the topic.
9. Legal answers carry a source. When an answer ends, `checkSources(question, refs)` in `packages/core/src/assistant/sources.ts` treats it as legal when her question holds a word of the `LEGAL_TERMS` registry in that file (`luật`, `nghị định`, `thông tư`, `thuế`, `thủ tục`, `sang tên`, `công chứng`, `sổ đỏ`, `sổ hồng`, `law`, `tax`, `procedure`, …, matched with diacritics, so `thuê` is not `thuế`). A legal answer passes when its `refs` hold at least one source chip whose host is on `OFFICIAL_SOURCES` in `packages/core/src/research/official-sources.ts`, the list the `research_scan` prompt reads (§5.2), or when it cites a `tax_position` field, since her own tax position comes from the tax card. A failing answer gets one repair turn that asks for an official page. If it still fails, Esta replaces the answer with a fixed message-file sentence saying Trợ lý found no official source and naming who can confirm (the relevant office or a notary), and never shows an error [app rule] (P5-14).

Target: first visible text within 10 seconds when the worker is online. A turn that searches the web shows `Trợ lý đang tra cứu trên mạng` (`messages.activity`) until its first sentence, which should come within 45 seconds [app rule].

## 6. Prompts and guards

### 6.1 System prompt skeleton (shared)

```text
Bạn là Trợ lý của ứng dụng Esta, giúp một gia đình quản lý bất động sản ở Việt Nam.
You may only use the tools provided. Never type a digit, an amount or currency word, or a number word.
For every number, date, amount, percent and numbered label (Phòng 5), write the placeholder of the tool field that holds it, such as {{f3.outstanding_display}}.
Write every person's name or nickname and every place name through its _name or _label placeholder, such as {{f2.tenant_name}}, because names like chú Ba or Hai Bà Trưng hold number words.
Do not calculate totals, differences or ratios yourself; call the tool that returns them.
Never invent amounts, dates, names or sources. If information is missing, say so plainly.
You cannot change business records. To suggest a change, use create_proposal.
Write in {locale}. Use the household's terms: sổ, thửa đất, hợp đồng thuê, tiền cọc, kỳ thanh toán.
Tone: calm, polite, concise, like a careful family accountant. No exclamation marks, no emoji.
Today is {local_date} in Asia/Ho_Chi_Minh.
```

Each job appends its own task section and output schema. The ask job replaces `Write in {locale}` with `Write in the language of the question, Vietnamese when unsure`, so an English question gets an English answer (§7.4 question 10). Its task section opens the scope of §5.6 step 7, lists the fact records of §6.4 that exist before the first turn (her typed numbers, the topic's records), and replaces `You may only use the tools provided` with a line that still forbids any number outside a fact source.

### 6.2 Output schemas

Every job's final output is JSON validated by zod schemas in `packages/core/agent-schemas`. Text fields are Markdown limited to paragraphs, lists, bold and links, and the web app sanitizes them (SPEC §7.1).

An Ask answer may also hold a GFM table, for a list answer such as leases ending soon. `SafeMarkdown` renders tables only when it is given the answer's `refs`, with the table syntax alone (no autolinked URLs, strikethrough or footnotes), so a note card in the thread shows a table as its literal text. The number guard reads an answer with the same GFM table grammar (`checkNote` format `markdown-tables`), one row per line and its cells apart, so a `|` inside a link target splits the cell for the guard as it does on screen and a number after it is checked (`safe-markdown.test.tsx`).

### 6.3 Number guard

Ryan ruled on 2026-10-24 ("Placeholders") that the model never types a number. This replaced the free-text number parser this section used to specify, which let invented numbers through two adversarial review rounds on #61 and two on #309.

1. **Handles.** Each record a tool returns carries a handle: `f` and the record's position among this run's records (`f1`, `f2`, …), assigned in call order, so a replay assigns the same handles. A placeholder `{{f3.outstanding_display}}` cites one field of one record. A field is citable when its value is a string and its name ends in `_display`, `_compact`, `_relative`, `_label` or `_name`. Tools format every number into such a field with `packages/core/src/format` (§4), so the guard never formats.
2. **Fill.** `checkNote(template, sheet)` in `packages/core/src/guard` replaces each placeholder with its field's string, Markdown punctuation escaped and line breaks turned into spaces, and returns the filled text. A placeholder that names no record of this run, no field of the record, or a field that is not citable is a violation. So is any `{`, `}` or private-use character left over, which catches single braces and a placeholder with spaces in it (`malformed`). A value that is blank (`empty_value`, with a hint to say the information is missing), longer than 200 characters, or holding a bidi control, a private-use character or a control character other than a line break (`unsafe_value`) is not filled.
3. **Residue.** The model's own text is the template with every placeholder masked. The guard renders it as `SafeMarkdown` shows it (character references decoded, raw HTML as literal text, links as their text, plus image alt text and link, image and definition titles that another renderer may show) and rejects:
   - any character of Unicode category Number, in any script: digits, full-width and other-script digits, superscripts, circled numbers, fractions, Roman numeral characters;
   - a currency symbol, `%` and its full-width, small and Arabic forms, `‰`, `‱`, the emoji `💯` and `🔟`, and the keycap mark U+20E3;
   - any default-ignorable character (`invisible`): bidi controls, zero-width spaces and joiners, the soft hyphen, word joiners and variation selectors, typed or as a character reference (`&shy;`, `&#8203;`). The guard rejects them instead of deleting them, because `ba&#8203;triệu` would otherwise read as one unknown word;
   - a letter outside the Latin script (`script`), such as Cyrillic look-alikes or CJK numerals;
   - Roman numerals in Latin letters: an upper-case numeral of two or more letters (`II`, `XIV`, `MMXXVI`), a numeral of four or more letters in any case (`mmxxvi`), and a lone `I`, `V` or `X` after a label word (`quý`, `tầng`, `dãy`, `khu`, `phòng`, `điều`, `khoản`, `phần`, `giai đoạn`, `quận`, `phase`, `part`, `article`, `section`, `room`, `floor`). The acronyms `MIX`, `CD`, `CV`, `DC`, `MC`, `MD` and `XL` pass; `CCCD`, `CMND`, `VIP`, `LLC` and `HD` are not numerals;
   - a word from the table in `packages/core/src/guard/words.ts`, compared after NFKC and lower-casing: amount and currency words (`triệu`, `tỷ`, `nghìn`, `trăm`, `tr`, `đồng`, `VND`, `million`, `percent`, `score`, …), number words (`hai` to `mười`, `mươi`, `lăm`, `hăm`, `rưỡi`, `nửa`, `two`, `dozen`, `half`, `twofold`, `nought`, `nil`, the ordinals `second` to `twentieth`, `thirtieth`, `hundredth`, …) and the date words listed below. `một` and `one` pass because they also serve as articles. A table word that is also part of a common compound passes in that compound only (`hợp đồng`, `đồng sở hữu`, `Đồng Nai`, `tỷ lệ`, `tỷ giá`, `công ty`, `xu hướng`, `thông tư`, `đầu tư`, `tư vấn`, `linh tinh`, `ngày mốt`, `năm nay`, `mỗi năm`, `theo năm`, `lâu năm`, `năm tài chính`, `Năm Căn` written with its capitals; `words.ts` holds the full list). The open thread (§5.6 step 7) writes advice and letters, where a word such as `ba` (father), `chín` (`chín chắn`) or `bảy` can be ordinary prose, so P5-12 measures the false-reject rate on at least 20 open advice and writing prompts, adds each compound it finds, and P5-10 measures it again live. `năm` next to a placeholder passes only when the placeholder's field name has a `year` or `date` segment (`năm {{f5.tax_year_display}}`), because `năm {{f1.property_label}}` reads as "five". The single letters `k`, `m`, `b` and `d` are violations only next to a placeholder or a number word (`{{f1.x}} k`, `ba k`), so a block letter (`dãy B`, `Khu D`) passes;
   - the date words actually rejected: English month names and their abbreviations except `May`, English weekday names, `fortnight`, `giêng`, `chạp`, `rằm`, `chủ nhật`, and `một` after `mùng`, `mồng` or `tháng` (`mùng một`, `tháng một`; `mỗi tháng một lần` passes). Vietnamese weekdays `thứ hai` to `thứ bảy` and `thứ nhất` fail on their number words;
   - a placeholder glued to a letter, as in `{{f1.count_display}}k`.
4. **Seams.** Two filled values with a digit at their seam are a violation when nothing but spaces, dots or commas stands between them (`{{f1.a}}.{{f2.b}}` reads as `3.500`), or any joiner without a space (`{{f1.day}}/{{f1.month}}`, `{{f1.a}}-{{f2.b}}`, `{{f1.a}}<!---->{{f2.b}}`). A joiner with a space around it (`{{f1.a}} – {{f2.b}}`) reads as two numbers and passes. Filling must not change what renders around a value: the filled note must render as the masked template with each mask replaced by its value.
5. **Repair.** A violation triggers one repair turn naming each offending text and its rule. A second violation fails the job and creates an `info` item with audience `operator` holding the template and the offending text. Mẹ never sees it.
6. **Storage.** The stored note is the filled text. The job result keeps the template and the cited values for audit.
7. **Limits.** The guard rejects as `too_long`, before or instead of reading it, a template longer than 3,000 characters or 150 lines, with more than 400 of `*`, `_`, `[` and `]`, or with lists or quotes nested more than 8 deep on one line, and a filled note longer than 4,000 characters. The Markdown parser slows down quadratically on long runs of lines (setext underlines, list items), on deep nesting and on many delimiters. At these limits the slowest note the two review rounds on #311 found took about 11 ms on an M3 Pro, where the slowest without the line limit took about 42 ms.

[app rule] Left unchecked, by decision: `không`, the negation word, which reads as zero only before a unit the table rejects; vague quantifiers (`vài`, `mấy`, `nhiều`, `few`, `several`); relative day words (`hôm nay`, `ngày mai`), for which the prompt asks for the tools' `_relative` fields; and text that does not render, such as link targets.

[app rule] An ordered list that starts at 1 shows `1.`, `2.`, … as structure, and the guard does not check those markers; an ordered list that starts at any other number fails on its first marker. Structural counters are not numbers the model asserts.

[app rule] Number words are checked with their diacritics only, apart from the amount words in the table (`trieu`, `tram`, `nghin`, …). Without diacritics `nam`, `sau`, `bay` and `tam` are also other common words (south, after, fly), so the guard lets them pass.

[app rule] People and places are written through `_name` and `_label` placeholders, and the §6.1 prompt says so. The table cannot tell a nickname or a place name from a number (`chú Ba`, `cô Tư`, `Út Hai`, `đứng tên ba`, `Ba Đình`, `Hai Bà Trưng`), so such words stay rejected in the model's prose; written through a field they pass, because the guard never checks a value.

### 6.4 Fact sources in the thread

Ryan ruled on 2026-10-25 that the number rule stays absolute in the open thread, with three fact sources beside the tools. Each is a record in the run's fact sheet with a handle from the same `f1`, `f2`, … sequence, so §6.3 fills and checks them unchanged. A field that holds a number also keeps its typed value (`Vnd`, basis points, a count, months or an `IsoDate`) beside its `_display` string, which `calculate` reads.

1. **Tool data**, as §4 and §6.3 say.
2. **Numbers she typed.** Before the first turn, `extractTypedNumbers` in `packages/core/src/guard/typed.ts` reads every message she wrote in this conversation, and her questions among the last 3 turns a new segment is seeded with (§5.6 step 2), with the parsers of `packages/core/src/parse`: `parseVndInput` amounts (`4tr`, `3,5tr`, `2 tỷ`, `850k`), percents and yearly rates as basis points (`9%/năm`), `dd/mm/yyyy` dates, and counts where a number comes before a unit word (`15 năm`, `8 phòng`). A unit word before a number is a label (`phòng 2`), and a number no parser reads (a phone number) is not a fact [app rule]. Each number becomes a record with `value_display` formatted by `packages/core/src/format` (`4tr` shows `4.000.000 ₫`), its typed value and `typed_text`, and the prompt lists them by handle (P5-15).
3. **Web quotes.** A figure from a page is quoted as §5.2 says for the scan. After WebFetch returns a page, the model calls `quote_page(url, quotes)` (§4) with each figure and at least three words around it. The tool checks each quote word for word and at word and number boundaries against the text WebFetch returned for that page in this turn, then mints the page's source record with a new handle, and the model cites it as `{{f7.quote_1_label}}`. The page texts live in the job's memory for the turn only, as the scan's do, so nothing stores them and no table changes. `apps/agent/src/tools/web-quotes.ts` holds the matching rule for `quote_page` and for `add_research_item`. The answer's `refs` list each page as a numbered source chip with its source name and, when the page writes one, its date. The number inside a quote is parsed as in 2, so `calculate` can use it (P5-14).
4. **`calculate`.** Operands are fact fields named by handle and field, never numbers the model types. Operations come from the registry in `packages/core/src/calc`: `sum`, `difference`, `times_count`, `monthly_to_yearly`, `yearly_to_monthly`, `share_bp`, `apply_bp`, `change_bp`, `loan_payment` (principal, yearly rate and months) and `days_between`. They work in integer VND and basis points with BigInt intermediates and no floats, and round half up to the đồng [app rule]. An operand of the wrong kind is refused with the reason. The result is a new record with `result_display` and `working_display` (`4.000.000 ₫ × 12 = 48.000.000 ₫`) that a later call may use. The answer's `refs` list each cited result, and the page shows its working under the answer as `Cách tính: …`, which Esta writes and the model does not (P5-15).
5. **Nothing else.** A number from the model's own knowledge, an estimate, or a figure from a page fetched in an earlier turn or another conversation is a §6.3 violation like any typed number.

Search words stay free of family data. The `PreToolUse` hook denies a WebSearch query that holds a digit other than a four-digit year, or any person's name, nickname, property label or the street of a property address from this run's records, and tells the model why; province and commune names pass [app rule]. A fetch must name a page this turn's WebSearch returned, and a redirect to another host is dropped, as in §5.2. In the thread the caps are 4 searches and 4 fetches per turn [app rule] (P5-14).

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

Must not fire: W1 for the Dĩ An invoices due 2026-10-25 (not yet due); W2 (no issued invoice due 2026-10-07 to 2026-10-10); W4 for `di-an` Phòng 7 (22 days) or for `long-an` and `bao-loc` (use_mode held); W6 for `bien-hoa` (deposit refunded 2026-08-05); W7 for Trần Minh Demo; W8 (readings with `read_on` 2026-10-03); W9 (Phòng 5 has one short past-due invoice, not two); W10.

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

Thread cases (P5-12 to P5-15), on the same seed and clock, pass when every number is a fact source of §6.4 equal to its ground truth or its page text, every link and source chip resolves, and the case's own check holds:

- T1. `Viết tin nhắn Zalo nhắc khách phòng 5 ở Dĩ An đóng tiền.` (`collections`): a polite draft naming the tenant and the amount owed on the collections board.
- T2. `Có nên cho thuê theo năm thay vì theo tháng không?`: advice with no number.
- T3. A reply to the Phòng 5 overdue note, `Khách này trễ mấy lần rồi?` (`payment_behavior`).
- T4. From Đất Bảo Lộc's page, `Tài sản này đang thế chấp ở đâu?` (`get_property`): the bank on its Pháp lý tab.
- T5. `Nếu tăng tiền phòng 2 ở Dĩ An lên 4tr thì mỗi năm thu thêm bao nhiêu?` (`list_leases`, a typed amount, `calculate`): the yearly gain with its working.
- T6. `Vay 2 tỷ trong 15 năm, lãi 9%/năm thì mỗi tháng trả bao nhiêu?` (typed numbers, `calculate` `loan_payment`): equal to the formula within 1 đồng.
- T7. `Lãi suất vay mua nhà bây giờ khoảng bao nhiêu?` (WebSearch, WebFetch): a rate quoted word for word with its source chip. Replay holds the fetched page text.
- T8. `Giá đất Bảo Lộc bây giờ khoảng bao nhiêu?` with no source found: says it has no figure and offers to look it up or calculate from her number, with no number.

### 7.5 Research (live only)

At least one item or the explicit empty item; every source URL fetches with status 200 at check time; related property ids exist; summaries within the token limit; no duplicates of the last 30 days; Vietnamese.

### 7.6 Live run at the Phase 5 exit

Run every job kind once in `live` mode locally on the `full` seed with the frozen clock, record the outputs in `docs/plan/trail/`, and check: watch facts equal §7.1 (deterministic), the brief and the ten golden questions pass §7.3 and §7.4, the thread cases T1 to T8 pass §7.4, research passes §7.5 and every source chip's URL returns 200 at check time, extraction meets §7.2.

### 7.7 Ping

The `ping` job (Phase 0) proves the worker, the tool layer and auth end to end. Its prompt carries no date, id or household name, so one recording in `fixtures/agent-replay/ping/` replays at any clock for every household. The golden test (`apps/agent/src/jobs/ping.test.ts`) replays it for `Gia đình Demo`, `Gia đình Demo 4` and `Gia đình Demo 10`, and passes when the reply names that household exactly, the run makes exactly one `mcp__esta__household_info` call, and an empty replay directory raises the missing-recording error. `pnpm agent:record` refreshes the recording from a live run for `Gia đình Demo`.

## 8. Replay mode

`ESTA_AGENT_MODE=replay` replaces model calls with recordings stored in `{ESTA_REPLAY_DIR}/{job_kind}/{input_hash}.json`, where `ESTA_REPLAY_DIR` defaults to `fixtures/agent-replay`. The input hash is the SHA-256 of the canonical input: the prompt, the kind's tools and `maxTurns`, and a schema version. A turn that continues a session, such as `ask`'s repair turn or a follow-up question, also names the hash of the turn it follows (`resumesInputHash`), and a turn on the deep model names `modelRole: deep`. A replayed session's id is `replay-` and the first 16 hex digits of its input hash, a stand-in that lets a follow-up resume it the way it resumes a live one. A replayed turn that keeps its transcript, as Ask's do, leaves a stand-in file under its config dir's `replay-sessions/`, and a turn that resumes a session with no such file finds it gone, as a live one does. Before hashing, the input is canonicalized: the job's household name becomes `<household>`, UUIDs become `<id:1>`, `<id:2>` in order of first appearance, memo codes become `<memo:n>`, and timestamps become `<time:n>`, taken from the test clock. Recorded outputs use the same placeholders, which are mapped back to the real values of the current run, so records created during a test (north-star step 2 onward) replay correctly. Recorded model text holds number placeholders (§6.3), not values, so it fills from the current run's tool data. Tools, the `PreToolUse` policy, validation, the number guard and all writes run for real: the worker replays each recorded tool call through the job's own tools, and a built-in call's recorded `result` (the page WebFetch read) reaches the job as the `PostToolUse` hook hands it over live. A missing recording fails the job at once, with no retry, and its error names the 64-character hash and `pnpm agent:record`. Replay needs no credential and records auth mode `none` and cost 0. `pnpm agent:record` runs the same cases in `live` mode and refreshes recordings; Ryan reviews recording diffs like code. CI and `pnpm e2e:northstar` always use replay.

## 9. Limits, failures and UX

- Per-household daily caps per kind (defaults in `private.agent_daily_caps`: extract 30, ask 60, research 2, weekly 1; `household_settings.agent.daily_caps` overrides a kind with a whole number from 0 to 1000). `claim_agent_job` enforces them where jobs are claimed: under an advisory lock per household and kind it counts the kind's jobs started on the business day, and moves a job over its cap to the next local midnight. An `ask` over its cap sets its answer row's `deferred_until`, and the Hỏi page says "Hôm nay Trợ lý đã trả lời đủ câu hỏi. Câu hỏi này sẽ được trả lời vào ngày mai." from the message files.
- `agent_runs` records usage and the SDK's cost estimate. Operators see the worker's auth and agent mode, the last 20 runs with status, turns and duration, the notes the number guard held back, and usage and cost by kind for 7 days on `/assistant/diagnostics`, linked from the account menu; anyone else gets the not-found page.
- A run that fails because of a usage limit (the SDK's `rate_limit` cause, or its limit text) is rescheduled with the usual backoff, and the worker beats `state = usage_limited`, so every member's status line reads "Trợ lý tạm dừng do hết hạn mức sử dụng" until a session ends without one. [verify] the subscription's limit text in the P5-10 live run.

| Situation | Behavior |
| --- | --- |
| Worker offline (heartbeat older than 5 min) | Banner: "Trợ lý ngoại tuyến từ 21:30. Việc mới sẽ chạy khi máy hoạt động lại." Jobs stay queued |
| Job failed after retries | `info` item with Thử lại for admins (operators only when the number guard held the note back), keyed `job_failed:{job_id}`; `retry_agent_job` queues one job per tap number, keyed `{original key or kind:job id}:retry:{n}` |
| Login refused (`auth_error`) | One operator `system` item a day saying the worker cannot sign in to Claude; no error text |
| Extraction failed | The review screen offers manual entry beside the image |
| Number guard failure | Job fails; operator-only item with the text; nothing shown to Mẹ |
| Research source unreachable | Item dropped; the run continues |

## 10. Agent-owned tables

- `agent_jobs`: kind, payload, status (`queued | running | done | failed | cancelled`), priority (lower runs first), run_after, attempts, max_attempts (default 4), idempotency_key (unique), locked_by, locked_at, started_at, finished_at, error, result jsonb (the job's output, such as the ping reply), requested_by. Operators read it; a user inserts only a `ping` for themself, and every other write comes from the worker's service client.
- `agent_runs`: household_id, job_id, auth_mode (`subscription | api_key | none`, where `none` is replay), agent_mode (`live | replay`), model, num_turns, usage jsonb, cost_estimate_usd, session_id, tool_calls jsonb (names and counts only), started_at, finished_at. Operators read it; only the worker writes it.
- `agent_items`: kind (`brief | alert | proposal | answer_note | research_scan_empty | system`), severity, audience (`all | operator`), title, body_md, related (jsonb of typed ids), citations (jsonb of url, title, source_name, published_at), proposal (jsonb type and params), status (`new | read | approved | dismissed | done | failed`), dedupe_key (unique per household), job_id, decided_by, decided_at.
- `research_topics`: topic_key (unique per household), label, query_templates, province_codes, property_ids, source (`auto | user`), active.
- `research_items`: url_normalized (unique per household), source_url, source_name, published_on, effective_on, title_vi, summary_vi, why_it_matters_vi, kind, relevance, related_property_ids, province_codes, job_id.
- `conversations`: title (the first question), created_by, last_asked_at (`ask_in_thread` reads it to pick the segment a message joins), and the last finished turn's sdk_session_id, sdk_turn_hash and sdk_handles. Each member reads only the conversations she started, and their audit rows likewise; only `ask_question`, through `ask_in_thread`, and the worker write.
- `messages`: conversation_id, role, content_md, status (`streaming | done | error`), job_id, refs jsonb (the `esta://` links the answer resolved), deferred_until (set while an answer waits for the next day's cap). A question is always `done` and non-blank. Each member reads only the messages of her own conversations; only `ask_question` and the worker write.
- `worker_heartbeats`: worker_id (a UUID per worker process), host_label, version, auth_mode, agent_mode, state (`ok | usage_limited`), last_seen_at. No household data and no audit trigger. Members read only `worker_id`, `last_seen_at` and `state`, so they never see the hostname; only the service role writes.
- `notifications`: user_id, channel (`inapp | email | push`), agent_item_id, status, sent_at, error.

`document_extractions` is defined in SPEC §5.5; the agent writes it through `save_extraction` only.

Thread columns. `messages.topic_item_id` and `messages.topic_property_id` (P5-13) hold her message's topic, a note or a property, at most one of them, written only by `ask_in_thread` from `p_topic` `{ kind: 'item' | 'property', id }`. Composite foreign keys on `(household_id, id)` keep a topic inside her household. `messages.activity` (P5-14) is `web` while a web tool runs before the first sentence. An answer's `refs` also hold source chips and `calculate` results (P5-14, P5-15). `notifications` rows name the note they announce, and P5-09's notice links to `/assistant?note={id}`.
