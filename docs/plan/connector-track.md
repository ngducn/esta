# Connector track

Pulled ahead of the rest of Phases 3 and 4 on 2026-10-19 at Ryan's request ("i look forward to be able to tell you populate my portfolio using MCP connector"). The design is `docs/spec/CONNECTOR.md`; this file cuts it into vertical slices. Each slice ends with something Ryan can do by talking to Claude Code on his Mac, against a local stack with Demo data, plus a check that proves it.

## Matrix

| Slice | Ops layer (`packages/ops`) | Ops and the screens that share them | Plans and batches | MCP server and auth | Tools | History and undo | Proof |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1a. Ryan asks Claude about his properties | Read tools and the address lookup move into the new package | none | none | stdio server; sign-in as Ryan with Esta's own sign-in, token in the Keychain; operator check on every call | `list_properties`, `get_property`, `find_property`, `resolve_address` | none | Scripted MCP client against local Supabase lists and finds Demo properties; a non-operator is signed out at sign-in; the address picker unchanged |
| C1b. Ryan asks Claude to add a property and sees it in Esta | `Op` with `input`, `plan`, `apply`; `OpContext`; one refusal model; the id schema and database refusal mapper from #188 at the depth property needs | Property create and edit; the property form's server actions become thin wrappers | `change_batches` with RLS and pgTAP; `plan_changes` stores a planned batch; `apply_plan` re-checks and applies; 30-minute expiry | none new | `plan_changes`, `apply_plan` | none | Scripted MCP client: plan, apply, the row equals what the form writes; another household's plan, an expired plan and a second apply refused; property e2e unchanged |
| C2. Ryan tells Claude about a rented room and Esta shows the lease and its schedule | Items in one batch refer to each other (a lease names the unit planned beside it); item-by-item refusals; `partial` | Unit, person (through `reduceNationalIds`), lease create and activation with paid-through, deposit received | `partial` status with what landed | none new | `find_person`, `parse_money`, `parse_date`, `list_leases`, `get_lease` | none | Scripted client builds the Demo rental; `lease_schedule` equals the same lease entered by hand; only the last four ID digits are stored |
| C3. Ryan points Claude at a Demo folder and it loads the properties with their documents | none new | Document registration through the signed upload, as Ryan | none new | none new | `list_folder`, `read_spreadsheet` (xlsx, csv), `document.attach` plan items; `parse_money` and `parse_date` arrive here, ahead of C2 | none | Synthetic Demo folder (one tracker, two certificate photos, one contract PDF) loads to the same records and documents as the hand-entered seed; the vault shows them; one live run in Claude Code on Ryan's subscription |
| C4. Ryan sees what Claude changed in Esta's history and undoes a batch | none new | Undo as a definer function, as Ryan | `undone`; undo refused once an invoice, a payment or a later edit depends on the batch | sends `x-esta-via` and `x-esta-batch` | none new | Audit trigger stores via and batch; history screen with "qua Claude" and Undo | pgTAP for the audit columns and undo refusals; e2e for undo and a refused undo |

The remaining server actions (expenses, payments, legal, documents outside C3) move onto the ops layer in one cleanup PR after C3, which closes #188. Ongoing chat changes (a payment, a move-out) join Phase 5.

## PRs

1. **C1a, ask Claude about your properties.** The stdio server, sign-in and the four read tools, with the reads and the address lookup in `packages/ops`. Proof: the scripted MCP client test. Split from C1 on 2026-10-19 to keep each PR to one outcome under about 800 lines.
   **C1b, add a property by talking to Claude.** Stacked on C1a. Touches the ops contract, property ops and actions, `change_batches` and the two write tools. Proof: the scripted MCP client test, pgTAP and the property e2e.
2. **C2, add a rented room with its lease.** Needs #181 (deposits) and #209 (one planner) merged. Touches the unit, person, lease, activation and deposit ops and their actions, and five tools. Proof: the scripted client against a hand-entered lease, and the ID-digits test.
3. **C3, load a Demo folder.** Needs #177 (one document upload). Touches document registration and three file tools. Proof: the Demo folder test, a vault screenshot and one live run.
4. **C4, history and undo.** Touches the audit trigger, an undo function and a new history screen. Proof: pgTAP and e2e.

## Before real data

Real family data goes only into the production database (CONNECTOR.md §6). Loading the real portfolio needs, after C3: the land use term fix (#149), the migration squash (#197), and the cloud database and web deploy, which is Ryan's gate. The stdio connector then signs in to the cloud database from Ryan's Mac; the claude.ai transport stays with Phase 6.
