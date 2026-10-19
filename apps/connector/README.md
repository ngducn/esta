# Esta connector

An MCP server that lets Claude Code on Ryan's Mac read the household's properties in Esta, signed in as Ryan. The design is `docs/spec/CONNECTOR.md`. For now it talks only to a local Supabase stack with Demo data.

## Tools

| Tool | Returns |
| --- | --- |
| `list_properties` | Every property with its kind, use, legal status, addresses and unit count |
| `get_property(id)` | One property as its form shows it, with its units |
| `find_property(text)` | Properties whose nickname, code, current or certificate address, or pre-2025 ward, district and province names match, each with what matched |
| `resolve_address(text)` | The current ward and province for an address written with old names, best first |

Every amount comes with a `_display` string in the household's locale, so Claude copies it rather than formatting money itself.

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

   The session goes to the macOS Keychain under the service `esta-connector`, one entry per Supabase URL. Set `ESTA_SESSION_FILE` to keep it in a file only you can read instead (the default on other systems is `~/.config/esta/connector-session.json`).

3. Add the server to Claude Code, with the path of your checkout.

   ```sh
   claude mcp add esta -e ESTA_SLOT=0 -- pnpm --silent --dir /path/to/esta connector
   ```

   `--silent` keeps pnpm's banner off stdout, which carries the MCP protocol. The connector's own log lines go to stderr and name only the tool and a count.

Ask Claude "Which of my properties were in Bình Dương before the 2025 merger?" to try it.

## Who can use it

Only the operator of the household Esta opens for the account. Anyone else is signed out again at sign-in, and every tool call checks again, so taking away the operator flag stops the connector at its next call. It never holds the service role key: `pnpm connector` reads only the anon key from the slot's `supabase status`.

To sign out, delete the Keychain entry.

```sh
security delete-generic-password -s esta-connector
```
