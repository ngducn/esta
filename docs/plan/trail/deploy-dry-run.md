# Deploy dry run, 2026-11-06

Local only, on slot 3, against the `northstar` seed. Keys are shown as `<jwt>`. No cloud project, Vercel or deploy was touched. Numbers match the steps in `docs/plan/DEPLOY.md` section 7.

| Step | Command | Result |
| --- | --- | --- |
| 1. Reset | `pnpm db:reset:northstar` | Every migration applied through `20261007626100`, seed loaded, 55 photos and 264 documents. |
| 2. Build | `NODE_ENV=production ESTA_ENV=test pnpm build` (through `scripts/web.ts build`) | Built in 33 s. |
| 3. Env check | `pnpm check:env --target preview dryrun.env` | `env ok for preview`. The same file with `--target production` failed as it should: `ESTA_ENV: must be production for this target, got preview` and `ESTA_AGENT_MODE: replay ... must not run in production`. |
| 4. Smoke, test build | `pnpm smoke http://localhost:3300 --env=test` | Security headers, CSP, sign-in `200` with `Đăng nhập`, four cron routes `401`; `smoke ok (test build: hidden-route checks skipped)`. |
| 4b. Smoke, production env | Same build restarted with `ESTA_ENV=production`, `pnpm smoke http://localhost:3300` | `/dev` `404`, `/api/test/clock` `404`, plus the checks above; `smoke ok`. |
| 5. Cron | `pnpm cron:run` | `200 lease-status ended=11`, `200 invoices issued=11 households=11`, `200 document-sweep`, `200 keep-alive`. |
| 6. Worker | `ESTA_AGENT_ENV_FILE=dryrun.env pnpm --filter @esta/agent start` (the plist's own command) | Started in replay, read its env file, polled jobs. Morning-brief jobs logged `missing_recording`, which replay does so for dates without a recording. Stopped by pid. |
| 7. North-star | `ESTA_E2E_BUILD=prod pnpm e2e:northstar` | 6 passed, 2 skipped (steps 7 and 9 wait for P5-10), 1.2 min, steps 1 and 2 in 4.5 s. |

## What failed and what the runbook now says

- `node scripts/check-env.ts` failed with `ERR_MODULE_NOT_FOUND` for `packages/core` on both Node 25 (PATH) and Node 24: plain `node` cannot load the extensionless imports in `packages/core`. Fixed: `check:env` runs `node --import tsx`, and DEPLOY.md says to run every script through `pnpm`.
- `launchctl bootstrap` of the plist was blocked by the session's permission check, so the plist was not loaded here. It is checked by `plutil -lint` after the placeholders are filled, and its command ran by hand as step 6. Loading it and `launchctl list` showing `vn.esta.agent` is an operator step for Ryan (DEPLOY.md section 6).
