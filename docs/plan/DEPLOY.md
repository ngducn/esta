# Deploy runbook

Every cloud step below is marked `Ryan`: CLAUDE.md says to stop and ask Ryan before any production deploy or cloud change, so no agent runs them. Steps marked `Agent` run on the local stack and were dry-run on 2026-11-06 (see `docs/plan/trail/deploy-dry-run.md`). Run every script through `pnpm` so it uses the pinned Node 24.22.0; the `node` on PATH may be older or newer and fails to load `packages/core`.

## 1. Before you start (Agent, local)

1. `pnpm check`, `pnpm db:test` on a fresh `pnpm db:reset`, and `ESTA_E2E_SERVER=build pnpm e2e:northstar` all pass on the commit you will deploy. The last one builds the app and serves the build with `ESTA_ENV=test` against the `northstar` seed.
2. Before the first real import, run the stricter national ID check over the text of the export. `private.holds_national_id` does not revalidate rows that already exist, and an import of an older export holding text it now refuses fails the whole import, because CHECK constraints still bind during an import. The local import is that check: `ESTA_SLOT=<k> pnpm db:reset:empty`, then `ESTA_SLOT=<k> node scripts/import-export.ts <export folder or zip>`. It prints `uploaded N files` and `imported N rows` when every text passes; a refused text stops it with the table and CHECK name, and nothing is kept. Fix that text in the source, export again, and rerun until it passes. The same two commands are the restore drill in section 8.

## 2. Supabase cloud projects (Ryan)

Two projects, never one. `esta-prod` holds the family's data. `esta-preview` holds synthetic Demo data only, and is the only database a Vercel preview deployment (which runs unreviewed branch code, with `/dev/*` and `/api/test/clock` on) ever sees. No key from `esta-prod` goes into Vercel's `preview` environment, and none from `esta-preview` into `production`.

1. Create both projects in Singapore (`ap-southeast-1`). Free plan first; see section 9 for when to pay. Write each project's reference (the 20 letters in its URL) down as `<prod ref>` and `<preview ref>`.
2. For each project in turn: `supabase link --project-ref <ref>`, then `supabase db push`, which applies every migration in order, the same ones `pnpm db:test` applied on a fresh reset. Storage buckets come from migrations; do not create them by hand.
3. Export the values `supabase/config.toml` reads for its `[remotes.production]` and `[remotes.preview]` blocks, in the shell that runs the push. Use your real hosts; the preview pattern matches your Vercel preview URLs:

```
export ESTA_PRODUCTION_PROJECT_REF=<prod ref>
export ESTA_PREVIEW_PROJECT_REF=<preview ref>
export ESTA_PRODUCTION_URL=https://<production host>
export ESTA_PRODUCTION_CALLBACK_URL=https://<production host>/sign-in/callback
export ESTA_PREVIEW_URL=https://<stable preview host>
export ESTA_PREVIEW_CALLBACK_URL='https://<preview host pattern>/sign-in/callback'
```

   Export both project references even when you push only one: the CLI refuses to read `config.toml` for any command run in the repo's own `supabase` folder (`supabase migration new` included) when a reference is missing. `pnpm db:*` use a copy without these blocks and are not affected.
4. For each project, after its `supabase link`: `supabase config push`. The blocks put each project's own Site URL and the sign-in callback in its Redirect URLs, and turn Google on for `esta-preview` and off for `esta-prod` (section 3 turns it on there). If Google is not set up yet, set `enabled = false` in the `[remotes.preview.auth.external.google]` block first, and flip it back when section 3 is done. The CLI prints a diff and asks before it applies anything. Expect these lines and no others that matter: `site_url`, `additional_redirect_urls`, `email_sent = 30` (the local value 2 would allow two sign-in emails an hour for the whole project), `external.google.enabled`, and the unchanged auth values from `config.toml` (6-digit OTP `otp_length = 6`, `enable_confirmations = true`, `minimum_password_length = 8`, `secure_password_change = true`, the recovery email template in `supabase/templates/recovery.html`). Refuse the push and stop if any line shows `127.0.0.1` or Google switching off on `esta-preview`. The blocks have not been run against a cloud project yet; this step is their first test, so read the diff before you answer yes.
5. Open Authentication in each dashboard and confirm Site URL, the Redirect URLs list and every value above. `config push` does not report a setting the plan does not allow.
6. Compare each project's auth rate limits for sign-in, code verification and password recovery with `[auth.rate_limit]` in `config.toml`. The local stack never limited 60 wrong passwords, so do not assume the cloud does. Write the values you read in `docs/plan/STATUS.md`.
7. For each project copy the project URL, the anon key and the service role key for section 4. The anon key and the service role key sit on the same dashboard page: the anon key is the one marked `anon` and `public`. Never put the service role key in a `NEXT_PUBLIC_` variable; `check:env` refuses a service role key it finds in one, even when the two are swapped.

## 3. Google sign-in (Ryan, optional)

1. In Google Cloud, create an OAuth client (web). Add the redirect URIs `https://<preview ref>.supabase.co/auth/v1/callback` and `https://<prod ref>.supabase.co/auth/v1/callback`.
2. Put the client id and secret in the Supabase dashboard under Authentication, Providers, Google, for `esta-preview`. Test a sign-in on a preview deployment first.
3. Only after that works: do the same on `esta-prod`, set `enabled = true` in the `[remotes.production.auth.external.google]` block of `supabase/config.toml` (commit it), export `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in the shell, link `esta-prod` and run `supabase config push` again; the diff should show only Google turning on. Then set `ESTA_GOOGLE_AUTH=on` in the Vercel `production` environment. Until then every `config push` to `esta-prod` keeps Google off, which is the intended default.

## 4. Vercel project (Ryan)

1. Import the repository. `vercel.json` already sets the function region (`"regions": ["sin1"]`) and holds the crons (`lease-status` 17:20 UTC, `invoices` 17:30, `document-sweep` 21:00, `keep-alive` 01:00); change nothing there. After the import, confirm in Settings, Functions that the region reads Singapore (`sin1`) and in Settings, Cron Jobs that all four jobs are listed.
2. Set each variable below in the Vercel `production` environment from `esta-prod` and in the `preview` environment from `esta-preview`. The two environments hold different Supabase values and a different `CRON_SECRET`. `scripts/check-env.ts` checks a file holding one environment's values.

| Variable | Where the value comes from |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project settings, API, of that environment's project. Public. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Same page, same project. The service role key is used by the cron routes only. |
| `CRON_SECRET` | `openssl rand -hex 32`. Vercel sends it as `Authorization: Bearer` to the cron routes. A different value per environment. |
| `ESTA_ENV` | `production` or `preview`. Required whenever `NODE_ENV=production`. |
| `ESTA_GOOGLE_AUTH` | `off`, or `on` after step 3. |
| `EMAIL_TRANSPORT`, `SMTP_URL`, `ESTA_EMAIL_FROM` | Step 5. |
| `ESTA_SIGNED_URL_TTL_SECONDS`, `ESTA_EXPORT_PART_MB`, `ESTA_TIMEZONE` | Defaults (300, 45, `Asia/Ho_Chi_Minh`); leave unset unless a limit forces a change. |
| `ESTA_FROZEN_NOW` | Never set in production; the build and `check-env` refuse it. |

3. Before deploying, run `pnpm check:env --target production --app web <file>` on a file holding the production values (kept outside the repo), and `--target preview --app web` on one holding the preview values. It fails on a missing variable, a frozen clock, a service role key in a `NEXT_PUBLIC_` variable (by name, by value, or swapped with the anon key) or `ESTA_ENV` not matching the target.
4. Deploy. Then run `pnpm smoke https://<production host>`; it sends GET requests only and must print `smoke ok` with every check listed (security headers, CSP, `/dev` and `/api/test/clock` hidden with `404`, the sign-in page answering `200` without a redirect, and every cron route in `vercel.json` refusing a call without the secret with `401`).
5. In the Vercel dashboard, run each cron once from Settings, Cron Jobs and check the response is 200.

## 5. Email sender (Ryan)

Supabase's built-in sender is limited to a few emails an hour, so sign-in codes need your own SMTP before real use. Choose one: Resend, Postmark, or a Gmail app password on a family domain address. Put its SMTP host, port, user and password in Supabase (Authentication, SMTP settings) and the same `SMTP_URL` and `ESTA_EMAIL_FROM` in Vercel. Send one code to Ryan's own address before anyone else's. Never configure a real sender in development.

## 6. The worker on Ryan's Mac (Ryan)

1. Create `apps/agent/.env.production` outside git (ignored through `.env*`) holding `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ESTA_ENV=production`, `ESTA_AGENT_MODE=live`, `ESTA_AUTH_MODE=subscription`, `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`), `ESTA_MODEL_ROUTINE`, `ESTA_MODEL_DEEP` and `ESTA_BACKUP_DIR`. Run `pnpm check:env --target production --app agent apps/agent/.env.production`. It must print `env ok for production (agent)`; it fails by name on a missing `CLAUDE_CODE_OAUTH_TOKEN`, `ESTA_MODEL_ROUTINE` or `ESTA_BACKUP_DIR`, on a replay worker and on a frozen clock.
2. From the repo folder, one command fills the plist's three placeholders and checks the result:

```
sed -e "s|__REPO__|$PWD|" -e "s|__ENV_FILE__|$PWD/apps/agent/.env.production|" -e "s|__HOME__|$HOME|" apps/agent/launchd/vn.esta.agent.plist > ~/Library/LaunchAgents/vn.esta.agent.plist && plutil -lint ~/Library/LaunchAgents/vn.esta.agent.plist
```

   It must print `OK`.
3. `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/vn.esta.agent.plist`. `launchctl list | grep vn.esta.agent` shows it, and the log is `~/Library/Logs/esta-agent.log`. The plist wraps the worker in `caffeinate -s`, which keeps the Mac awake while it is on power.
4. System Settings, Energy: turn on "Prevent automatic sleeping on power adapter when the display is off" and "Wake for network access". A sleeping Mac runs jobs on wake; the scheduler backfills only today's daily jobs.
5. Keep the worker on Ryan's account and for this household only (AGENT.md §2.5). If Mẹ writes to the thread heavily, switch to `ESTA_AUTH_MODE=api_key`.
6. Stop it with `launchctl bootout gui/$(id -u)/vn.esta.agent`.

## 7. Dry run on a laptop (Agent, local)

This is what was run on 2026-11-06, in order, and re-run for the fix round. Pick a free slot `k` and keep it for every step. The web port is `3000 + 100·k` and the Supabase API port `54321 + 100·k`.

1. `export ESTA_SLOT=<k>`, then `pnpm db:reset:northstar`.
2. `cp -n .env.example apps/web/.env.local` (it holds the local `CRON_SECRET` that `pnpm cron:run` sends). Then `NODE_ENV=production ESTA_ENV=test node scripts/web.ts build`, which is the slot-aware build and bakes the slot's Supabase URL into the page; `pnpm build` is the deploy build and ignores the slot. Then `NODE_ENV=production ESTA_ENV=test pnpm start`.
3. Write a file holding the slot's URL and keys (`supabase status -o env --workdir supabase/.slots/<k>` prints them) with `ESTA_ENV=preview`, then `pnpm check:env --target preview --app web <web file>`. For the worker, a second file with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ESTA_ENV=preview` and `ESTA_AGENT_MODE=replay`, and `pnpm check:env --target preview --app agent <worker file>`.
4. `pnpm smoke http://localhost:<web port> --env=test`. Stop the server and start the same build with `ESTA_ENV=production`, then run it again without the flag to prove `/dev` and `/api/test/clock` answer 404.
5. `pnpm cron:run`.
6. Start the worker with the plist's own command: `ESTA_AGENT_ENV_FILE=<worker file> pnpm --filter @esta/agent start`. In replay it registers a heartbeat; a `missing_recording` line for a job with no recording is expected. Stop it by its process id.
7. `ESTA_E2E_SERVER=build pnpm e2e:northstar`.
8. The backup and restore drill in section 8, step 1, against a backup this worker wrote (`ESTA_BACKUP_DIR` in the worker file).
9. `ESTA_SLOT=<k> pnpm db:stop` when you are done.

## 8. Backups, restore and rollback (Ryan)

1. Restore drill, after the first nightly backup has run and again before you trust the backups with the family's data. The backup is a folder per household and date under `ESTA_BACKUP_DIR`: `<ESTA_BACKUP_DIR>/<household id>/<date>/`. On the local stack of a free slot `k`:

```
export ESTA_SLOT=<k>
pnpm db:reset:empty
node scripts/import-export.ts <ESTA_BACKUP_DIR>/<household id>/<date>
node scripts/row-counts.ts <ESTA_BACKUP_DIR>/<household id>/<date>
```

   The import prints `uploaded N files` and `imported N rows`. `row-counts` must print `all tables and files match` and `nothing was withheld: this is the complete copy`; any other line is a failed drill. Then open one restored document and one restored photo: sign in to the local app as a member of that household and open a document and a property photo, or fetch one file of each with the slot's service key from `supabase status -o env --workdir supabase/.slots/<k>`: `curl -H "Authorization: Bearer $SERVICE_ROLE_KEY" "$API_URL/storage/v1/object/<bucket>/<path under files/>"` returns `200` and the same bytes as the file in the backup (`shasum -a 256` on both). The drill restores into a local stack only.
2. Restoring into a cloud project has no tool yet: `scripts/import-export.ts` refuses any database that is not on this machine on purpose. Whether to build one, or to rely on the paid Supabase plan's own backups and point-in-time recovery (section 9), is your decision: https://github.com/ngducn/esta/issues/428. Until it is decided, the nightly backup is a copy you can read and restore locally, not a one-command cloud recovery.
3. A bad web release: in Vercel, Deployments, promote the last good deployment. Migrations are not rolled back by this.
4. A bad migration: `supabase db push` has no down step. Write a new forward migration that undoes it. Restore from the nightly backup only if data was damaged, and see step 2 for where.
5. A bad worker release: `launchctl bootout gui/$(id -u)/vn.esta.agent`, `git checkout` the last good commit, `pnpm install`, then bootstrap again.
6. A leaked key: rotate it in Supabase or the provider, update Vercel and the worker file, redeploy.

## 9. When to pay (Ryan)

Move `esta-prod` to a paid Supabase plan (daily backups and point-in-time recovery come with it) when any of these happens: the project pauses for inactivity (the keep-alive cron should prevent it), the database nears 500 MB, storage nears 1 GB, or a single export part exceeds the storage object limit (lower `ESTA_EXPORT_PART_MB` first). Paying is a cloud change: ask first.

## 10. After the first deploy (Ryan, with Mẹ)

Run the Mom test on the final build (`docs/plan/mom-test.md`), starting `pnpm dev:lan --prod` for seeded data on a phone. Record each task's time there; a failure becomes a fix.

Steps still to add when P5-09, P5-10, P5-14 and P5-15 merge: any new environment variable, cron route or worker job they bring. Add it to the table in section 4 (a cron route needs nothing else: `smoke` reads `vercel.json`), and rerun the dry run.

## 11. Live lanes on the preview deploy (Agent, after Ryan has deployed preview)

Lanes sign in as seeded `Demo` members on `esta-preview` with a code they mint themselves, so no lane has to read a mailbox. The sign-in page shows its code box only after a send, and the send also mails a code to the lane address, so one real email goes to the seeded `Demo` address per sign-in (check the address is one you control or can lose). Only the agent's shell holds these values; they never go into a file in the repo or into Vercel.

1. In the shell, export `ESTA_ENV=preview`, `ESTA_PREVIEW_PROJECT_REF=<preview ref>`, `SUPABASE_URL=https://<preview ref>.supabase.co` and the `esta-preview` service role key as `SUPABASE_SERVICE_ROLE_KEY`.
2. On the preview's `/sign-in/code` page, fill the email and press the send button first, so the code box appears. Then run `pnpm lane:otp me.lane1@demo.esta.test`, which prints a 6-digit code through `auth.admin.generateLink`, and type that code into the box. Mint after the send: the send issues a new code and cancels any code minted before it ("Mã không đúng hoặc đã hết hạn").
3. The script refuses, and prints why, unless `ESTA_ENV=preview` and `SUPABASE_URL` is exactly `https://<ref>.supabase.co` with `<ref>` equal to `ESTA_PREVIEW_PROJECT_REF` (or a local URL when the ref is that local host). A production `SUPABASE_URL` or `ESTA_ENV=production` can never mint a code.
4. Record the date and who ran the lanes under this section in the step log.
