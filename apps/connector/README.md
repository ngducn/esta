# Esta connector

An MCP server that lets Claude Code on Ryan's Mac read and change the household's properties in Esta, and file papers from a folder on his Mac into the vault, signed in as Ryan. The design is `docs/spec/CONNECTOR.md`. For now it talks only to a local Supabase stack with Demo data.

## Tools

| Tool | Returns |
| --- | --- |
| `list_properties` | Every property with its kind, use, legal status, addresses and unit count |
| `get_property(id)` | One property as its detail page shows it, with its kind details |
| `find_property(text)` | The properties the property list's search finds for the same text, each with the field every word matched |
| `resolve_address(text)` | The current ward and province for an address written with old names, best first |
| `parse_money(text)` | A typed amount such as `4,85 tỷ` or `9tr` as whole đồng, with the display string |
| `parse_date(text)` | A typed date such as `15/08/2005` as `YYYY-MM-DD` |
| `list_folder(path)` | The names, kinds and sizes in a folder under the import folders, never what a file holds |
| `read_spreadsheet(path)` | Every sheet of an xlsx file, or a CSV file, row by row, each cell as text with the type the file stored |
| `plan_changes(summary, items)` | The exact change each item would make, or why it is refused; stores the plan when nothing is refused. Items are `property.create`, `property.edit` and `document.attach` |
| `apply_plan(plan_id)` | Applies a stored plan once, after Ryan said OK, checking each item again |

Every amount comes with a `_display` string in the household's locale, so Claude copies it rather than formatting money itself.

Nothing is written until Ryan approves. Claude plans, shows him a short summary, and applies only on his OK. A plan expires 30 minutes after it was made, applies at most once, and an item whose change is no longer what he saw is refused as stale.

## Files on the Mac

The connector reads only under its import folders: `~/Esta-import`, plus any folder listed in `ESTA_IMPORT_ROOTS` (separated by `:`). It refuses a path outside them, a symlink that leads out of them, anything that is not a regular file, and a file over the vault's 25 MB limit. A path that does not exist outside the folders is refused the same way, so the tools never tell what is elsewhere on the disk.

A `document.attach` item names a file, the property it belongs to, its category and title, and optionally a lease. The plan records the file's size and SHA-256. Apply reads the file again and refuses it as stale if it changed since Ryan saw the plan, then uploads it with its thumbnail and review copy through signed upload URLs, as the vault does, and registers it. A file the household already holds is refused as a duplicate unless the item sets `allow_duplicate`. A paper is filed only on a property Esta already has, so properties from a spreadsheet go in one plan and their papers in the next.

## Set it up

1. Start the slot's stack and seed it.

   ```sh
   ESTA_SLOT=0 pnpm db:start
   ESTA_SLOT=0 pnpm db:reset
   ```

2. Sign in once as the household's operator. The seeded operators are `ryan.lane<n>@demo.esta.test`, with the password in `supabase/seed/README.md`. Leave the password empty to get a 6-digit code in the slot's Inbucket mailbox instead.

   ```sh
   ESTA_SLOT=0 pnpm connector:login
   ```

   The session goes to the macOS Keychain under the service `esta-connector`, one entry per Supabase URL. Set `ESTA_SESSION_FILE` to keep it in a file only you can read instead, which is also the default on systems without the Keychain.

3. Add the server to Claude Code, with the path of your checkout.

   ```sh
   claude mcp add esta -e ESTA_SLOT=0 -- pnpm --silent --dir /path/to/esta connector
   ```

   Add `-e ESTA_IMPORT_ROOTS=/path/to/another/folder` to let it read a folder other than `~/Esta-import`.

   `--silent` keeps pnpm's banner off stdout, which carries the MCP protocol. The connector's own log lines go to stderr and name only the tool and a count.

Ask Claude "Which of my properties were in Bình Dương before the 2025 merger?" to try it.

## Demo: load a folder

`fixtures/connector-demo/Demo` is a synthetic move-in folder: a tracker workbook with two properties, two certificate photos and a lease contract. To show the whole flow on a local stack:

1. Reset the slot so the Demo codes are free, and copy the folder into the import folder.

   ```sh
   ESTA_SLOT=0 pnpm db:reset
   mkdir -p ~/Esta-import && cp -R fixtures/connector-demo/Demo ~/Esta-import/
   ```

2. Sign in as `ryan.lane<n>@demo.esta.test` with `pnpm connector:login`, as in step 2 above, and start Claude Code.

3. Ask Claude: "Load the properties in ~/Esta-import/Demo/theo-doi-tai-san-demo.xlsx into Esta, then file the papers listed in the Giấy tờ column."

Claude lists the folder, reads the tracker, sends the typed price and date through `parse_money` and `parse_date`, and finds the wards with `resolve_address`. It shows a plan for the two properties and applies it on your OK, then shows a second plan for the three papers. Both properties then show in Esta with their papers on each one's Tài liệu tab, as if typed in and uploaded by hand. The certificates wait for the assistant worker to read them; nothing in this flow needs it running.

## Who can use it

Only the operator of the household Esta opens for the account. Anyone else is signed out again at sign-in, and every tool call checks again, so taking away the operator flag stops the connector at its next call. It never holds the service role key: `pnpm connector` reads only the anon key from the slot's `supabase status`.

To sign out, delete the Keychain entry.

```sh
security delete-generic-password -s esta-connector
```
