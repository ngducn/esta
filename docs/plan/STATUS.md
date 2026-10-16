# Status

## Shipped

- 2026-10-15 to 16 run, under a cap of 50% of one 5-hour block and the operator's landing grant for Phase 0 and the plan docs. #29 P0-12 base components (`8314fa0`), #32 P0-14 app shell (`064303c`, 2026-10-16), #39 design refresh to the bright, modern look with lucide icons, Pexels photos and an app icon (`15a37e9`, 2026-10-16), #43 local CI in a fresh worktree (`20cb81c`), #44 Phase 1 plan fixes with cover photos (`04a595e`), #42 P0-15 agent worker and Trợ lý status (`72fadb6`, after a security fix-forward), with the `/dev/components` LCP miss waived because the page is developer-only. #33 closes two lint guard holes behind #14 and #22 (`b126e29`). #34 re-slices the plan into vertical slices and adds `pnpm plan:coverage` (`d324110`). P0-13 is removed and its composites move to their first real screens; see `docs/plan/trail/slice-matrix.md`.
- P0-01 to P0-11 landed on 2026-10-07.

## Spike results

- S6 (P1-01, 2026-10-16). Parser and SSRF guards pass the PRP-5 tests. Two fresh `maps.app.goo.gl` links, a named place and a dropped pin, each redirect once (`302`) to `www.google.com/maps/place/` with `!3d`/`!4d` coordinates. Google Maps no longer issues `goo.gl/maps` links, and an unknown one answers `404`. The chains are in DOMAIN-VN §9.

## Parked

- Nothing parked. P0-14 (PR #32) merged on 2026-10-16 as `064303c` after a test-only fix-forward: the create-household e2e helper gave the server one 5 s wait, which ran out under load. The 2026-10-15 note that it also failed at load 4 was wrong; that rerun failed in `db reset` with a Supabase 502, not in Playwright.

## Waiting for Ryan

- System design for approval, with the release estimate and seven decisions (D1 to D7): https://claude.ai/artifact/9Bufn7L33HmJueDyXVvqGB. The build continues on its recommendations until you change them.

- Issue #36. The 2026-10-16 10:30 standing orders chose defaults for three of its questions, and the plan follows them. S6 stays first (P1-01 is Phase 1 `Seq` 01, per SPEC §10 and §11, with no spec change), the landing grant extends to Phase 1 until you withdraw it, and the interrogate list names P5-11 in place of P5-03. One question is still yours. Should pstack's `check-plan.mjs`, which still requires ten lanes and a review video per PR, accept the 2026-10-15 verification shape (Playwright rules, one Sonnet verifier lane, no video)?
- Spec item from the P0-15 owner. AGENT.md §2.1 allows up to 3 attempts but lists a 1, 5 and 25 minute backoff, so the 25-minute step can never run. The P0-15 plan reads it as 3 retries, sets `max_attempts` to 4 and rewrites §2.1 to match. Confirm 4 attempts, or say 3 and drop the 25-minute step.
- Spec item from the P0-15 owner. P0-15 makes `agent_jobs` and `agent_runs` readable by operators only, so Mẹ sees no job rows. P2-03 shows `Đang đọc` on her document tiles. If members need job state there, P2-03 must widen that select policy, for example to a member's own `extract_document` jobs, or read state through a view that exposes no diagnostics. Confirm which.
- Close seven issues that `main` already fixes with tests: #3, #4, #8, #9, #10, #11 and #16. Evidence is in `docs/plan/trail/triage-2026-10-15.md`. The permission classifier blocked closing issues from the session.
- The permission classifier also blocked reading a `pnpm check` log on `main` and rerunning `pnpm check` for its exit code. The first run on `main` after #29 exited 1 with stale `node_modules`; after `pnpm install` the visible output showed every test passing, but the exit code is unconfirmed. Every later branch cut from `main` passed `pnpm check` in its own lanes. Allow these commands if you want unattended runs to verify `main` themselves.

- Confirm that only an operator can grant operator. SPEC §5.1 ships this as an `[app rule]` from P0-02: a user session changes `household_members.is_operator` only when it is already an operator of that household; the service role is exempt.
- Approve the NSO admin units source for P0-06: the NSO catalog SOAP service and conversion table, pinned in `scripts/reference/data/`. P0-06 is held until then.
- Approve the license reading for that source: public legal documents excluded from copyright under IP Law Article 15, an engineer's reading rather than a lawyer's (`supabase/seed/README.md`).
- Approve the NAPAS BIN snapshot for `bank_bins`: 74 banks taken by hand from the NAPAS VietQR portal, whose terms allow personal non-commercial use with the source cited and bar automated collection.
- Review the curated admin unit rows in `supabase/seed/reference/legacy_curated.csv` and the bank short names in `bank_short_names.csv`, both `[app rule]`.
- Security: local Supabase is reachable from the LAN (since P0-02, found in the P0-08 audit). Docker Desktop publishes each slot's Supabase API (Kong, including pg-meta under `/pg/`, which runs SQL with no key), database, Studio and Inbucket ports on `0.0.0.0` and `[::]`, and every local stack uses the well-known default keys. The Supabase CLI (v2.90.0 here, and v2.120.0) sets no host address on its port bindings and has no option for one. A Docker network created with `com.docker.network.bridge.host_binding_ipv4=127.0.0.1` and passed through `SUPABASE_NETWORK_ID` was tested on Docker Desktop 29.2.0 and still bound `0.0.0.0` and `[::]`. `pnpm db:start` and `pnpm dev:lan` now check the listeners and print a warning while any Supabase port listens beyond loopback. Options, each your call because it changes this Mac beyond the repo: (1) System Settings > Network > Firewall > Options, set Docker (`com.docker.backend`) to block incoming connections; loopback still works and `pnpm dev:lan` is unaffected because Caddy is a separate program (recommended); (2) Docker Desktop > Settings > Docker Engine, add `"ip": "127.0.0.1"` to bind every published port to loopback, which also changes the `ekh-*` containers and is untested here because Docker Desktop ignored the per-network form; (3) run local stacks only on a network you trust.
- Trust the `pnpm dev:lan` CA once before phone testing (from P0-08). The script keeps one mkcert CA for every worktree in `~/.local/share/esta/dev-ca/` (`ESTA_DEV_CA_DIR` overrides it) and never runs `mkcert -install`, because that asks for your login password. `pnpm dev:lan` prints the CA's SHA-256 fingerprint and the trust steps with the real paths: run `CAROOT=~/.local/share/esta/dev-ca mkcert -install` on the Mac, and on the phone open `https://<lan>:3443/esta-dev-ca.crt`, install the profile and turn it on under Settings > General > About > Certificate Trust Settings. Check that each device shows the printed fingerprint before you trust it. The CA key can intercept every HTTPS connection of a device that trusts it, so it stays on the Mac and the CA comes off each device when phone testing ends (`mkcert -uninstall` on the Mac, Remove Profile on the iPhone, Trusted credentials > User > Remove on Android). Until you trust it, browsers show a certificate warning on the LAN URLs.

- The NSO source, its license reading, the NAPAS BIN snapshot and the curated rows above were approved when you merged P0-02 to P0-11 on 2026-10-07 (standing orders, 08:40 update); they stay listed until you confirm that reading.

## Needs professional confirmation

- Whether the 2026 rental PIT applies from 1 January or 1 July 2026 (DOMAIN-VN §5). The `tax_rules` row from P0-06 uses 1 January and carries a note that says so.
