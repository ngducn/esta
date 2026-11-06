# Deploy runbook

Every cloud step below is marked `Ryan`: CLAUDE.md says to stop and ask Ryan before any production deploy or cloud change, so no agent runs them. Steps marked `Agent` run on the local stack and were dry-run on 2026-11-06 (see `docs/plan/trail/deploy-dry-run.md`). Run every script through `pnpm` so it uses the pinned Node 24.22.0; the `node` on PATH may be older or newer and fails to load `packages/core`.

## 1. Before you start (Agent, local)

1. `pnpm check`, `pnpm db:test` on a fresh `pnpm db:reset`, and `pnpm e2e:northstar` with `ESTA_E2E_BUILD=prod` all pass on the commit you will deploy. The last one builds the app and serves the build with `ESTA_ENV=test` against the `northstar` seed.
2. Before the first real import, run the stricter national ID check over the text of the export. `private.holds_national_id` does not revalidate rows that already exist, and an import of an older export holding text it now refuses fails the whole import, because CHECK constraints still bind during an import.

## 2. Supabase cloud project (Ryan)

1. Create the project in Singapore (`ap-southeast-1`). Free plan first; see step 9 for when to pay.
2. `supabase link --project-ref <ref>`.
3. `supabase db push` applies every migration in order, the same ones `pnpm db:test` applied on a fresh reset. Storage buckets come from migrations; do not create them by hand.
4. `supabase config push` sends the auth settings in `supabase/config.toml`: 6-digit OTP (`otp_length = 6`), session length, email confirmations on (`enable_confirmations = true`), `minimum_password_length = 8`, `secure_password_change = true`, and the recovery email template (`supabase/templates/recovery.html`). Open Authentication in the dashboard afterwards and confirm each value; `config push` does not report a setting the plan does not allow.
5. Compare the production auth rate limits for sign-in, code verification and password recovery with `[auth.rate_limit]` in `config.toml`. The local stack never limited 60 wrong passwords, so do not assume the cloud does. Write the values you read in `docs/plan/STATUS.md`.
6. Copy the project URL, the anon key and the service role key for step 4. Never put the service role key in a `NEXT_PUBLIC_` variable.

## 3. Google sign-in (Ryan, optional)

1. In Google Cloud, create an OAuth client (web). Add the redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Put the client id and secret in the Supabase dashboard under Authentication, Providers, Google.
3. Set `ESTA_GOOGLE_AUTH=on` in the Vercel `production` environment only after a test sign-in works on `preview`.

## 4. Vercel project (Ryan)

1. Import the repository. Set the function region to `sin1` in `vercel.json` (`"regions": ["sin1"]`) when you link; the crons already live there (`lease-status` 17:20 UTC, `invoices` 17:30, `document-sweep` 21:00, `keep-alive` 01:00).
2. Set each variable below in both `preview` and `production`. `scripts/check-env.ts` checks a file holding them.

| Variable | Where the value comes from |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project settings, API. Public. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Same page. The service role key is used by the cron routes only. |
| `CRON_SECRET` | `openssl rand -hex 32`. Vercel sends it as `Authorization: Bearer` to the cron routes. A different value per environment. |
| `ESTA_ENV` | `production` or `preview`. Required whenever `NODE_ENV=production`. |
| `ESTA_GOOGLE_AUTH` | `off`, or `on` after step 3. |
| `EMAIL_TRANSPORT`, `SMTP_URL`, `ESTA_EMAIL_FROM` | Step 5. |
| `ESTA_SIGNED_URL_TTL_SECONDS`, `ESTA_EXPORT_PART_MB`, `ESTA_TIMEZONE` | Defaults (300, 45, `Asia/Ho_Chi_Minh`); leave unset unless a limit forces a change. |
| `ESTA_FROZEN_NOW` | Never set in production; the build and `check-env` refuse it. |

3. Before deploying, run `pnpm check:env --target production <file>` on a file holding the production values (kept outside the repo). It fails on a missing variable, a frozen clock, a leaked service role key or `ESTA_ENV` not matching the target.
4. Deploy. Then run `pnpm smoke https://<production host>`; it must print `smoke ok` with every check listed (security headers, CSP, `/dev` and `/api/test/clock` hidden, the sign-in page, four cron routes refusing a call without the secret).
5. In the Vercel dashboard, run each cron once from Settings, Cron Jobs and check the response is 200.

## 5. Email sender (Ryan)

Supabase's built-in sender is limited to a few emails an hour, so sign-in codes need your own SMTP before real use. Choose one: Resend, Postmark, or a Gmail app password on a family domain address. Put its SMTP host, port, user and password in Supabase (Authentication, SMTP settings) and the same `SMTP_URL` and `ESTA_EMAIL_FROM` in Vercel. Send one code to Ryan's own address before anyone else's. Never configure a real sender in development.

## 6. The worker on Ryan's Mac (Ryan)

1. Create `apps/agent/.env.production` outside git (ignored through `.env*`) holding `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ESTA_ENV=production`, `ESTA_AGENT_MODE=live`, `ESTA_AUTH_MODE=subscription`, `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`), `ESTA_MODEL_ROUTINE`, `ESTA_MODEL_DEEP` and `ESTA_BACKUP_DIR`. Run `pnpm check:env --target production apps/agent/.env.production`.
2. Copy `apps/agent/launchd/vn.esta.agent.plist` to `~/Library/LaunchAgents/`, replace `__REPO__` with the repo path, `__ENV_FILE__` with the file above and `__HOME__` with the home folder, then `plutil -lint` it.
3. `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/vn.esta.agent.plist`. `launchctl list | grep vn.esta.agent` shows it, and the log is `~/Library/Logs/esta-agent.log`. The plist wraps the worker in `caffeinate -s`, which keeps the Mac awake while it is on power.
4. System Settings, Energy: turn on "Prevent automatic sleeping on power adapter when the display is off" and "Wake for network access". A sleeping Mac runs jobs on wake; the scheduler backfills only today's daily jobs.
5. Keep the worker on Ryan's account and for this household only (AGENT.md §2.5). If Mẹ writes to the thread heavily, switch to `ESTA_AUTH_MODE=api_key`.
6. Stop it with `launchctl bootout gui/$(id -u)/vn.esta.agent`.

## 7. Dry run on a laptop (Agent, local)

This is what was run on 2026-11-06, in order. Use one slot (`ESTA_SLOT=k`).

1. `pnpm db:reset:northstar`.
2. `NODE_ENV=production ESTA_ENV=test pnpm build` then `NODE_ENV=production ESTA_ENV=test pnpm start`.
3. `pnpm check:env --target preview <env file>` on a file holding the slot's URL and keys with `ESTA_ENV=preview` and `ESTA_AGENT_MODE=replay`.
4. `pnpm smoke http://localhost:<port> --env=test`. Restart the same build with `ESTA_ENV=production` and run it again without the flag to prove `/dev` and `/api/test/clock` answer 404.
5. `pnpm cron:run`.
6. Start the worker with the plist's own command: `ESTA_AGENT_ENV_FILE=<env file> pnpm --filter @esta/agent start`. In replay it registers a heartbeat; a `missing_recording` line for a job with no recording is expected.
7. `ESTA_E2E_BUILD=prod pnpm e2e:northstar`.

## 8. Rollback (Ryan)

1. A bad web release: in Vercel, Deployments, promote the last good deployment. Migrations are not rolled back by this.
2. A bad migration: `supabase db push` has no down step. Write a new forward migration that undoes it. Restore from the nightly backup export only if data was damaged (`scripts/import-export.ts` loads an export into an empty database; local first).
3. A bad worker release: `launchctl bootout`, `git checkout` the last good commit, `bootstrap` again.
4. A leaked key: rotate it in Supabase or the provider, update Vercel and the worker file, redeploy.

## 9. When to pay (Ryan)

Move to a paid Supabase plan when any of these happens: the project pauses for inactivity (the keep-alive cron should prevent it), the database nears 500 MB, storage nears 1 GB, or a single export part exceeds the storage object limit (lower `ESTA_EXPORT_PART_MB` first). Paying is a cloud change: ask first.

## 10. After the first deploy (Ryan, with Mẹ)

Run the Mom test on the final build (`docs/plan/mom-test.md`), starting `pnpm dev:lan --prod` for seeded data on a phone. Record each task's time there; a failure becomes a fix.

Steps still to add when P5-09, P5-10, P5-14 and P5-15 merge: any new environment variable, cron route or worker job they bring. Add it to the table in step 4 and the smoke list, and rerun the dry run.
