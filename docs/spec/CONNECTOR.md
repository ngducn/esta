# Esta connector: managing the portfolio by talking to Claude

Design agreed with Ryan on 2026-10-19 (standing orders, 14:10 update). It extends AGENT.md and is folded into the Phase 5 re-cut at phase start. Where this file and AGENT.md disagree about the connector, this file wins; AGENT.md still governs the unattended assistant.

## 1. Goal

Ryan manages the portfolio by talking to Claude instead of filling forms. He hands Claude anything: a folder of Excel trackers, scans of sổ đỏ and contracts, pasted notes, instructions such as "căn Q7 cho thuê 9tr từ tháng 3, cọc 2 tháng". Claude turns it into Esta records after he says OK.

- **Move-in first.** One load of the existing portfolio into Esta: properties, units, people, leases with rent, deposit and paid-through date, and the original documents.
- **Then ongoing.** The same tools handle the monthly trickle: a tenant moving out, a transfer received, a new bill.
- **Mẹ keeps the simple screens.** Her in-app Trợ lý (inbox, brief, proposals, and Ask later) stays as AGENT.md plans it.
- **Subscription.** Ryan's chats with the connector run on his Claude plan, the same pool as the daily assistant (SPEC D5, AGENT.md §2.5).

Success: Ryan loads a Demo portfolio folder (a tracker spreadsheet, certificate and contract scans) into an empty household in one conversation, reviews one plan per property, and Esta then shows the same properties, leases, schedules and documents a person entering them by hand would produce.

## 2. Two kinds of assistant

| | Connector | Daily assistant (`apps/agent`) |
| --- | --- | --- |
| Who drives | Ryan, live in a Claude chat | Scheduler, unattended |
| Where | Claude Code on Ryan's Mac first; claude.ai and the Claude app after the Phase 6 deploy | Worker on a machine Ryan controls |
| Writes | Business records, as Ryan, after his OK in chat | Agent-owned tables only; business changes are proposals a person approves |
| Auth | Ryan's own Esta login | `CLAUDE_CODE_OAUTH_TOKEN` (subscription) or `ANTHROPIC_API_KEY` |

AGENT.md §1 rule 1 ("the agent proposes, people dispose") still binds the daily assistant. The connector is Ryan acting through a tool, so it writes, but only through the same operations the screens use and only after he approves a stored plan.

## 3. Architecture

### 3.1 Shared operations, `packages/ops`

Every write a screen performs becomes an op, and a server action and the connector run the same op. Chosen on 2026-10-19 from three candidate designs (C1).

```ts
type OpContext = { db: SupabaseClient<Database>; householdId: string; clock: Clock };  // db is the member's session client
type Op<I, C extends Json, O extends Json, R extends Refusal> = {
  creates: TableName | null;                                   // the table whose new row `input.id` names; the caller mints the id
  input: z.ZodType<I>;                                         // parses form data, Claude's item, and the stored input read back
  plan(ctx: OpContext, input: I): Promise<Result<Planned<C, O>, R | CommonRefusal>>;  // reads only
  apply(ctx: OpContext, change: C): Promise<Result<O, R | CommonRefusal | Conflict>>;  // one insert or update, or one definer function
};
type Planned<C, O> = { kind: 'change'; change: C } | { kind: 'unchanged'; current: O };
```

- **Plan is a diff against the desired state.** An op's input says what the row should hold. `plan` returns the change that gets there, or `unchanged` when the database already holds it: a create whose minted id exists, an edit whose columns already match. An edit's input names only the fields it changes; `plan` lays them over the stored row, checks the whole as the form does, and its change lists only the columns that differ, with their values before.
- **Apply takes the change, not the input.** It can write only what the plan produced, so a stored plan is applied exactly as approved.
- **Ids are minted before plan,** by the server action or by `planChanges`, the way the property wizard already inserts under a browser-chosen id. Creates converge on their id, and a later item can name a sibling's id.
- **Refusals are data.** `Result<T, Reason = string>` from `packages/core/src/result.ts` carries a refusal object in `reason`, with a `kind`: `invalid` (path and code per issue, never zod's English), `not_found`, `forbidden`, `failed`, or an op's own, such as `code_taken` with the code and the property that holds it. `dbRefusal(error, sentinels)` in `packages/ops` is the only reader of SQLSTATE codes: an `ESTA_*` message from a definer function wins, then unique, foreign-key and exclusion violations become an internal `conflict`, check and cast errors `invalid`, row security `forbidden`, anything else `failed`. A conflict is explained by planning once more, so an op never parses a constraint name.
- **`runOp(op, ctx, raw)`** parses, plans and applies at once. A server action builds `OpContext` from the cookie session, calls `runOp`, revalidates, and maps the result to the type its screen already reads. The connector builds the context from Ryan's token.
- Validation stays where it is: zod schemas in `packages/core`, CHECKs, definer functions and RLS in Postgres. Money and legal rows keep their SQL write paths (activation, amend, terminate, renew, issue, payments); their op's `plan` calls the read-only preview and its `apply` calls the same function the screen calls.

Later slices add, without changing the contract above:

- **References (C2).** A batch item may carry a `ref`, and a later item writes `{ "$ref": "<ref>" }` where an id belongs. `planChanges` mints the id, substitutes it, and gives `plan` a view of the changes planned earlier in the batch, so a lease plans against a unit that does not exist yet. An item whose dependency did not land is refused `blocked`.
- **Files (C3).** `LocalContext = OpContext & { files }` reads and hashes files on Ryan's Mac. A document op typed with it hashes at plan time and uploads at apply time only if the bytes still hash the same; a server action cannot compile a call to it.

Read tools live in `packages/ops` beside the ops, so the worker and the connector use one copy, with the `_display` strings AGENT.md §4 defines.

### 3.2 The connector, `apps/connector`

An MCP server in TypeScript with one tool set and two transports:

- **stdio** for Claude Code on Ryan's Mac. It can read local paths, so spreadsheets and scans go straight in and originals land in the vault through the signed upload flow.
- **Streamable HTTP** as a route of the deployed web app for claude.ai and the Claude app, behind an OAuth sign-in step. Built with the Phase 6 deploy, because it needs a public HTTPS origin.

Files attached in claude.ai reach Claude but not the connector's tools, so storing an original scan needs Claude Code or Esta's own upload.

### 3.3 Auth

- The connector signs in once as Ryan the way Esta does (SPEC D8): email and password, or the 6-digit code mailed to that address. `pnpm connector:login` asks for the email and the password and mails a code when the password is left empty. It keeps the session, refresh token included, in the macOS Keychain through the `security` command (fallback: a 0600 file under `~/.config/esta/`), never in the repo or a log, one entry per Supabase URL.
- Every request runs as Ryan's session: RLS limits it to his households, and the audit log names him.
- Only the operator of the household Esta opens for the account (its first membership, `household_members.is_operator`) may use it. Anyone else is signed out again at sign-in, and every tool call checks again.
- It never holds the service role key.

### 3.4 Change batches

- Table `change_batches` (household recipe from CLAUDE.md): `summary` (what Claude showed Ryan), `via` (`claude`), `status` (`planned | applying | applied | partial | undone`), `plan jsonb`, `planned_at` from the injected clock, `outcomes jsonb`, `applied_at`, `undone_at`. A plan expires 30 minutes after `planned_at`; the expiry is derived, never stored.
- Only an admin who is the household's operator plans a batch, only the member who planned it applies it, every member reads it, and nobody deletes one. A trigger freezes what was planned and lets the status move only forward.
- `plan` holds one entry per item: the op, the raw input after the minted id, and the change Ryan approved. A batch is stored only when no item was refused, so his OK always covers the whole batch.
- `apply_plan` claims the batch with one conditional update from `planned` to `applying`, which finds nothing for a second apply, an expired plan or another household's plan. For each item in order it parses the stored input again, plans again, and applies only when the fresh change equals the stored one; a refusal or a different change refuses that item (`stale`, with what it would now be) and writes nothing for it. The batch ends `applied` when every item landed or was already `unchanged`, else `partial`, with one outcome per item. A batch left `applying` by a crash stays so: `apply_plan` on it answers `in_progress` and says so plainly, and Ryan plans again. Before planning, every string of every item passes `reduceNationalIds` (§4).
- The connector sends `x-esta-via: claude` and `x-esta-batch: <id>` on every write (C4). The audit trigger stores both on each `audit_log` row, so a batch's rows are one query.
- Esta's history shows "qua Claude: added Nhà phố Q7 with 2 leases" with an Undo button.
- Undo replays the batch's audit rows in reverse through a definer function, as Ryan. It refuses once anything depends on the change: an issued invoice, an allocated payment, a later edit to the same row. Those go through their own flows (void, terminate, edit).

## 4. Tools

| Group | Tools | Notes |
| --- | --- | --- |
| Read | `portfolio_overview`, `list_properties`, `get_property`, `list_leases`, `get_lease`, `collections`, `ledger`, `tax_position`, `search_documents` | Shared with the daily assistant; numbers come with display strings |
| Find | `find_property(text)`, `find_person(name?, phone?, id_last4?)` | Nickname, address, old and new admin names; returns candidates with a match reason |
| Parse | `parse_money`, `parse_date`, `resolve_address` | The app's own Vietnamese parsers ("9tr", "15/3", "Quận 7 cũ"), so Claude never guesses a format |
| Files | `list_folder(path)`, `read_spreadsheet(path)`, `attach_document(path, property, category, lease?)` | xlsx and csv as typed rows per sheet; Claude reads PDFs and photos itself |
| Write | `plan_changes(items)`, `apply_plan(plan_id)` | Two steps, below |

`plan_changes` takes a list of typed items (`property`, `unit`, `person`, `lease`, `lease_activation`, `payment`, `document`, `termination`, and so on as ops exist), runs each op's `parse` and `plan`, and stores the result as a `planned` batch when no item was refused. It returns the exact changes, what each matched, and every refusal. Claude shows Ryan a short Vietnamese summary. On his OK, `apply_plan(plan_id)` applies exactly the stored plan, in order, and marks the batch `applied` or `partial` with what landed. Claude cannot apply anything Ryan did not see.

**ID numbers.** Everything written through the connector passes `reduceNationalIds`, so only the last four digits of an ID reach Esta, even a number Ryan types in chat. A full ID is stored only when a person types it into Esta's own screens (SPEC D11 as amended 2026-10-19).

## 5. Flows

### 5.1 Move-in

1. Ryan: "Nạp thư mục ~/Esta-import vào Esta."
2. Claude lists the folder, reads the spreadsheets and looks at the scans.
3. It matches each item against what Esta already has, then drafts one plan per property: the property, units, people, leases with rent, deposit and "đã thu đến" (paid-through), and the documents to attach.
4. It shows each plan, for example: "Q7: tạo tài sản, 1 hợp đồng 9 tr/tháng từ 01/03/2026, cọc 18 tr, đã thu đến 30/09; 3 tài liệu", plus anything it could not place.
5. Ryan says OK or corrects it ("cọc là 1 tháng thôi"). Claude re-plans, then applies, one batch per property.
6. It ends with what is still missing, from Esta's completeness checks.

Past rent comes in as each lease's paid-through date, not as a payment history. Money from then on comes through payments and statement import.

### 5.2 Ongoing

- "Phòng 3 chuyển đi cuối tháng": find the lease, plan a termination, apply on OK.
- "Chị Lan chuyển 9tr hôm qua": find the open invoice, plan a payment, apply on OK.
- "Đây là hóa đơn điện tháng 10": attach it to the right property.

## 6. Safety

- Real family data goes only into the production database, which exists after the Phase 6 cloud gate. Before that, the connector runs against local stacks with Demo data.
- The connector never logs file contents or tool payloads; it logs tool names, batch ids and counts.
- A plan expires after 30 minutes unapplied. `apply_plan` re-runs each op's checks, so a plan made stale by another change is refused item by item rather than applied blindly.
- Rate limit: at most 200 writes per batch and 20 batches per hour per user.

## 7. Testing

- Unit: each op's `parse` and `plan` on the same cases as its screen; `reduceNationalIds` on every connector write path.
- Integration against local Supabase, with no model: a scripted MCP client calls the tools over a synthetic "Demo" move-in folder (one xlsx tracker, two certificate photos, one contract PDF) and asserts the records, schedules and documents equal the hand-entered seed; `apply_plan` writes exactly the planned rows; RLS refuses another household; undo restores and refuses when an invoice was issued.
- pgTAP for `change_batches` and the audit trigger's batch and via columns.
- One live gate demo: Claude Code with the connector loads the Demo folder into an empty local household on Ryan's subscription, recorded as a GIF.

## 8. Plan changes (applied at the Phase 5 re-cut)

1. P5-01 (agent tables and read tools) puts the read tools in the shared module.
2. New: the shared operations layer (`packages/ops`), behavior-preserving, server actions migrated in one wave.
3. New: the stdio connector with find, parse, files, `plan_changes`, `apply_plan` and `change_batches`.
4. New: Esta's change history with batch undo.
5. The rest of Phase 5 as planned (watch, brief, research, proposals, Ask for Mẹ, weekly review, email).
6. Phase 6: the HTTPS transport with OAuth for claude.ai and the Claude app, built with the deploy.
