# Deploy dry run, 2026-11-06

Local only, on slot 3, against the `northstar` seed. Rows marked fix round 1 were re-run after the audit changed the runbook; the rest is the first run. Keys are shown as `<jwt>`. No cloud project, Vercel or deploy was touched. Numbers match the steps in `docs/plan/DEPLOY.md` section 7.

| Step | Command | Result |
| --- | --- | --- |
| 1. Reset | `pnpm db:reset:northstar` | Every migration applied through `20261007626100`, seed loaded, 55 photos and 264 documents. |
| 2. Build | `NODE_ENV=production ESTA_ENV=test pnpm build` (through `scripts/web.ts build`) | Built in 33 s. |
| 3. Env check | `pnpm check:env --target preview dryrun.env` | `env ok for preview`. The same file with `--target production` failed as it should: `ESTA_ENV: must be production for this target, got preview` and `ESTA_AGENT_MODE: replay ... must not run in production`. |
| 4. Smoke, test build | `pnpm smoke http://localhost:3300 --env=test` | Security headers, CSP, sign-in `200` with `Đăng nhập`, four cron routes `401`; `smoke ok (test build: hidden-route checks skipped)`. |
| 4b. Smoke, production env | Same build restarted with `ESTA_ENV=production`, `pnpm smoke http://localhost:3300` | `/dev` `404`, `/api/test/clock` `404`, plus the checks above; `smoke ok`. |
| 5. Cron | `pnpm cron:run` | `200 lease-status ended=11`, `200 invoices issued=11 households=11`, `200 document-sweep`, `200 keep-alive`. |
| 6. Worker | `ESTA_AGENT_ENV_FILE=dryrun.env pnpm --filter @esta/agent start` (the plist's own command) | Started in replay, read its env file, polled jobs. Morning-brief jobs logged `missing_recording`, which replay does so for dates without a recording. Stopped by pid. |
| 7. North-star | `ESTA_E2E_SERVER=build pnpm e2e:northstar` | 6 passed, 2 skipped (steps 7 and 9 wait for P5-10), 1.1 min. Re-run in fix round 1 with the new name. |

## Fix round 1 re-run (slot 3)

| Step | Command | Result |
| --- | --- | --- |
| 2. Build | `cp -n .env.example apps/web/.env.local`, then `NODE_ENV=production ESTA_ENV=test node scripts/web.ts build` and `pnpm start` on port 3300 (3000 + 100·3) | Built and served. |
| 3. Env check, web | `pnpm check:env --target preview --app web web-preview.env` | `env ok for preview (web)`. The same file as production with `ESTA_ENV=production`: `env ok for production (web)`. |
| 3. Env check, worker | `--target preview --app agent worker-preview.env`, and `--target production --app agent` on a live file without `CLAUDE_CODE_OAUTH_TOKEN` and `ESTA_BACKUP_DIR` | `env ok for preview (agent)`. The live file fails with `needs CLAUDE_CODE_OAUTH_TOKEN` and `ESTA_BACKUP_DIR: production has no default folder`. A complete live production worker file prints `env ok for production (agent)`. |
| 4. Smoke, test build | `pnpm smoke http://localhost:3300 --env=test` | `smoke ok`; the four crons answer `401`. `GET /api/test/clock` answers `401` on a test build (it was `405`, the same as production, until the route got a GET that runs the guard first). |
| 4b. Smoke, production env | Same build with `ESTA_ENV=production`, `pnpm smoke http://localhost:3300` | `/dev` `404`, `/api/test/clock` `404, hidden`; `smoke ok`, GET requests only. |
| 5. Cron | `pnpm cron:run` | `200` for lease-status (`ended=11`), invoices (`issued=11`), document-sweep, keep-alive. |
| 6. Worker | `ESTA_AGENT_ENV_FILE=worker-preview.env pnpm --filter @esta/agent start` | Started in replay, scheduled 44 jobs, ran `backup_export` to `done`. Stopped by process id. |
| 7. North-star | `ESTA_E2E_SERVER=build pnpm e2e:northstar` | 6 passed, 2 skipped, 1.1 min. |
| 6.2 Plist | The one `sed` command in DEPLOY.md section 6 step 2, to a scratch path | `plutil -lint`: `OK`. |
| db:start / db:reset with the new `[remotes.*]` blocks | `ESTA_SLOT=3 pnpm db:start`, `pnpm db:reset`, `pnpm db:reset:northstar`, `pnpm db:test` | All work: the slot's copy of `config.toml` drops the blocks. The CLI itself, run on the repo's own folder, loads the blocks only when both project references are exported; with one unset it stops with `Invalid config for remotes.production.project_id`. Section 2 step 3 says so. |

## Restore drill (fix round 1, slot 3)

The worker above wrote `<backup dir>/<household id>/2026-11-06/` for the 11 northstar households (`manifest.json` says `complete: true`, 40 tables, 29 files each). Then, for one household:

```
ESTA_SLOT=3 pnpm db:reset:empty
node scripts/import-export.ts <backup dir>/0943e55d-.../2026-11-06   -> uploaded 29 files, imported 487 rows
node scripts/row-counts.ts   <backup dir>/0943e55d-.../2026-11-06   -> all tables and files match (40 tables, 29 files)
                                                                       nothing was withheld: this is the complete copy
```

One document and one photo fetched back from the restored Storage with the slot's service key: `documents/.../cccd-demo.png` answered `200 image/png` and `property-photos/.../dat.avif` answered `200 image/avif`, and each file's SHA-256 matched the file in the backup.

## What failed and what the runbook now says

- `node scripts/check-env.ts` failed with `ERR_MODULE_NOT_FOUND` for `packages/core` on both Node 25 (PATH) and Node 24: plain `node` cannot load the extensionless imports in `packages/core`. Fixed: `check:env` runs `node --import tsx`, and DEPLOY.md says to run every script through `pnpm`.
- `launchctl bootstrap` of the plist was blocked by the session's permission check, so the plist was not loaded here. It is checked by `plutil -lint` after the placeholders are filled, and its command ran by hand as step 6. Loading it and `launchctl list` showing `vn.esta.agent` is an operator step for Ryan (DEPLOY.md section 6).
