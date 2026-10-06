---
name: verify
description: Launch, check and drive the Esta web app (Next.js on local Supabase) in a real browser, one isolated stack per ESTA_SLOT. Signs in with the 6-digit code from the slot's mailbox, switches language, theme and viewport, and saves screenshot evidence. Use to prove a UI change works, to run a verification lane, or to screenshot a screen at 390x844 or 1440x900.
---

# Verify the Esta web app

The surface is the web app in `apps/web`, served by `next dev` against one local Supabase stack. The browser is gstack browse, a headless Chromium daemon you send one command at a time. Everything here is keyed by `ESTA_SLOT`. Each slot has its own ports, database, mailbox, test clock and browser daemon, so lanes never share state.

All helpers live in `.claude/skills/verify/scripts/` and run from the repo root. Export your slot once per shell:

```bash
export ESTA_SLOT=13            # the slot your brief names, 1 to 99
S=.claude/skills/verify/scripts
```

| Slot `n` | Port |
| --- | --- |
| Web app | `3000 + 100n` (slot 13 is `http://localhost:4300`) |
| Supabase API | `54321 + 100n` |
| Postgres | `54322 + 100n` (container `supabase_db_esta-<n>`) |
| Mailbox (Mailpit, Inbucket API) | `54324 + 100n` |
| Browser daemon | `47000 + n`, state in `/tmp/esta-verify/slot-<n>/browse.json` |

Slot 0 is refused because port 3000 belongs to another app. Override the browser with `BROWSE_STATE_FILE` and `BROWSE_PORT` when your brief gives them, for example `BROWSE_STATE_FILE=/tmp/swarm-<pr>/worker-<w>/browse.json`.

## Launch

```bash
$S/launch.sh                      # full seed, clock 2026-10-07T09:00:00+07:00
$S/launch.sh --variant northstar  # north-star seed
$S/launch.sh --clock 2026-11-01T09:00:00+07:00
```

Launch runs `pnpm db:start`, `pnpm db:reset` (or `db:reset:northstar`), `pnpm clock:set` and then `node scripts/web.ts dev`, which is what `pnpm dev` runs. It starts the web server without pnpm because pnpm moves its script into another process group and forwards no signal, so the recorded pid could not stop it. Launch records the pid in `/tmp/esta-verify/slot-<n>/web.pid` and the server log in `web.log` beside it.

Ready means `http://localhost:<web port>/sign-in` answers 200, and Launch prints `Ready: ... after <s> s`. From a stopped slot this takes about 65 s, most of it Supabase start and reset. Running Launch again on a live slot reseeds the database and reuses the running server.

Launch refuses a web port held by a process it did not start. Pick another slot instead of driving someone else's server.

## Doctor

```bash
$S/doctor.sh
```

Doctor is read-only. It prints one `OK` or `FAIL` line each for `docker`, `supabase`, `web`, `inbucket`, `browse` and `clock`, and every `FAIL` line names the command that fixes it. It exits 1 on any failure. Run it first, and again whenever anything looks off. The `web` check also confirms the listener descends from the pid Launch recorded, so a stray server on your port reads `FAIL`.

## Drive

Send browser commands through `$S/b.sh`, which runs gstack browse against your slot's daemon. Never call the gstack binary with another lane's state file.

```bash
$S/b.sh viewport 390x844          # phone; 1440x900 for desktop
$S/sign-in.sh me.lane1@demo.esta.test
$S/set-locale.sh en               # or vi
$S/set-theme.sh dark              # or light
$S/b.sh goto http://localhost:4300/onboarding
$S/b.sh snapshot -i               # interactive elements with @e refs
$S/b.sh click 'role=button[name="Tạo gia đình"]'
```

- `sign-in.sh <email>` drops any earlier session (`sign-out.sh`), clears that address's mail, fills `/sign-in`, reads the newest code with `node scripts/inbucket-code.ts <email>`, submits it and waits until the browser leaves `/sign-in`. It prints the landing path, `/` for a member and `/onboarding` for an address with no household. It takes about 3 s.
- `set-locale.sh <vi|en>` sets the `NEXT_LOCALE` cookie and reloads. A signed-in member's saved locale wins over the cookie, so when `<html lang>` does not change it presses the in-app language switch (`button[lang="en"]`), which saves the member's choice. It fails unless `<html lang>` ends at the requested locale.
- `set-theme.sh <light|dark>` sets the `esta_theme` cookie and `data-theme` on `<html>` of the open page. Until P0-11 makes the app read the cookie and ships dark tokens, a navigation or reload drops the attribute and a dark screenshot looks the same as a light one, so run `set-theme.sh` after the last navigation and before the screenshot, and do not judge dark styling before P0-11.
- `sign-out.sh` clears the `sb-` session cookies and opens `/sign-in`. It does not test the app's sign-out button.

Selectors accept CSS and Playwright engines. Prefer form names, `role=` with an accessible name, and `@e` refs from a fresh `snapshot`:

- `input[name="email"]`, `input[name="code"]`, `button[value="send"]`, `button[value="verify"]` on `/sign-in`.
- `input[name="householdName"]`, `input[name="displayName"]`, `input[name="role"][value="viewer"]` on `/onboarding`.
- `role=button[name="Mời"s]` matches the exact name. Without `s` the name matches as a substring.
- `[data-testid="date-line"]` is the business date line at the top of every page.
- `$S/b.sh wait '<selector>'` waits up to 15 s. Wait for an element, never a fixed sleep.

Seed people. `pnpm db:reset` seeds `Gia đình Demo` and ten lane households `Gia đình Demo 1` to `Gia đình Demo 10`. Lane `n` signs in as `me.lane<n>@demo.esta.test` (Nguyễn Thị Demo) or `ryan.lane<n>@demo.esta.test` (Trần Minh Demo, the operator); both are admins. Any other address under `@demo.esta.test`, such as `new.lane<n>@` or `invitee.lane<n>@`, is a new user. Every slot seeds all ten lanes, so the lane number picks the household and the slot picks the stack.

Test clock. Launch sets `2026-10-07T09:00:00+07:00`, a Wednesday, so the date line reads `Thứ Tư, 07/10/2026`. Change it with `pnpm clock:set <iso>` and clear it with `pnpm clock:set off`. There is one clock row per stack, so a lane that moves the clock runs on its own slot.

Read-only diagnostics:

```bash
$S/b.sh console --errors
$S/b.sh text
docker exec supabase_db_esta-$ESTA_SLOT psql -U postgres -tAc "select name from households order by name"
curl -s "http://127.0.0.1:$((54324 + 100 * ESTA_SLOT))/api/v1/messages?limit=5"
tail -50 /tmp/esta-verify/slot-$ESTA_SLOT/web.log
```

The feature recipes are in [`features/README.md`](features/README.md). Use the matching file before you drive a feature.

## Evidence

```bash
$S/evidence.sh p0-10 p0-10-sign-in
ESTA_WORKER=3 $S/evidence.sh p0-10 p0-10-theme-dark
```

`evidence.sh <pr-id> <slug>` saves the open page as `/tmp/swarm-<pr-id>/<slug>.png` and writes `<slug>.aria.txt` beside it with the URL, viewport, `lang`, `data-theme` and the accessibility tree. With `ESTA_WORKER=<w>` the directory is `/tmp/swarm-<pr-id>/worker-<w>/`. It prints both paths. Read every PNG you cite.

Proof standards:

- Drive the real user path: the form, the button, the link. Do not call server actions, write rows, or use `/api/test/*` to reach a state the user reaches through the UI. `pnpm clock:set` is the one sanctioned shortcut, because the clock has no UI.
- Capture the action and the resulting state, not only the last screen. For a mutation, add a read-only second view, such as a `psql` `select` or a reload that shows the stored value.
- Check side effects next to the screen: the mail in the slot's mailbox, the row in the table, the household membership.
- Screenshots for UI work are Vietnamese, light and dark, at 390x844 and 1440x900, per CLAUDE.md.
- Real family data never enters a screenshot. Seed names contain `Demo`.

## Cleanup

```bash
$S/cleanup.sh
```

Cleanup stops the web server by its recorded pid, clears the test clock while the stack is still up, stops the slot's Supabase stack and the lane's browser daemon, then checks that nothing listens on the slot's web, API, database, Studio, mailbox and browser ports. It prints `OK` or one `FAIL` line per port still held, and exits 1 on any. It never touches `/tmp/swarm-*`, so evidence survives.

Stop only what you started. Never use `pkill`, `killall` or `kill` by name or pattern, never stop a slot you did not launch, and never touch the `ekh-*` containers. Docker has about 8 GB for every stack on the machine, so run Cleanup as soon as you stop testing.

## Helpers

| Script | Does |
| --- | --- |
| `launch.sh [--variant northstar] [--clock <iso>]` | Start, reseed, set the clock and serve the slot; prints `Ready` |
| `doctor.sh` | Six read-only `OK`/`FAIL` checks with fixes |
| `b.sh <command> [args]` | One gstack browse command on the lane's daemon |
| `sign-in.sh <email>` | Sign in through `/sign-in` with the mailbox code |
| `sign-out.sh` | Drop the session cookies and open `/sign-in` |
| `set-locale.sh <vi\|en>` | Switch the UI language |
| `set-theme.sh <light\|dark>` | Set the theme cookie and `data-theme` |
| `evidence.sh <pr-id> <slug>` | Screenshot and accessibility tree under `/tmp/swarm-<pr-id>/` |
| `cleanup.sh` | Stop everything Launch started and prove the ports are free |
| `node scripts/inbucket-code.ts <email> [--clear]` | Print the newest 6-digit code for an address, or clear its mail |

Every script sources `scripts/env.sh`, which derives the ports and paths above from `ESTA_SLOT`.

Keep the feature map current with `/maintain-verification-skill` when a PR adds or changes a user-facing feature.
