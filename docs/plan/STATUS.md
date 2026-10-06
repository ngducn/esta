# Status

## Waiting for Ryan

- Confirm that only an operator can grant operator. SPEC §5.1 ships this as an `[app rule]` from P0-02: a user session changes `household_members.is_operator` only when it is already an operator of that household; the service role is exempt.
- Approve the NSO admin units source for P0-06: the NSO catalog SOAP service and conversion table, pinned in `scripts/reference/data/`. P0-06 is held until then.
- Approve the license reading for that source: public legal documents excluded from copyright under IP Law Article 15, an engineer's reading rather than a lawyer's (`supabase/seed/README.md`).
- Approve the NAPAS BIN snapshot for `bank_bins`: 74 banks taken by hand from the NAPAS VietQR portal, whose terms allow personal non-commercial use with the source cited and bar automated collection.
- Review the curated admin unit rows in `supabase/seed/reference/legacy_curated.csv` and the bank short names in `bank_short_names.csv`, both `[app rule]`.
- Security: local Supabase is reachable from the LAN (since P0-02, found in the P0-08 audit). Docker Desktop publishes each slot's Supabase API (Kong, including pg-meta under `/pg/`, which runs SQL with no key), database, Studio and Inbucket ports on `0.0.0.0` and `[::]`, and every local stack uses the well-known default keys. The Supabase CLI (v2.90.0 here, and v2.120.0) sets no host address on its port bindings and has no option for one. A Docker network created with `com.docker.network.bridge.host_binding_ipv4=127.0.0.1` and passed through `SUPABASE_NETWORK_ID` was tested on Docker Desktop 29.2.0 and still bound `0.0.0.0` and `[::]`. `pnpm db:start` and `pnpm dev:lan` now check the listeners and print a warning while any Supabase port listens beyond loopback. Options, each your call because it changes this Mac beyond the repo: (1) System Settings > Network > Firewall > Options, set Docker (`com.docker.backend`) to block incoming connections; loopback still works and `pnpm dev:lan` is unaffected because Caddy is a separate program (recommended); (2) Docker Desktop > Settings > Docker Engine, add `"ip": "127.0.0.1"` to bind every published port to loopback, which also changes the `ekh-*` containers and is untested here because Docker Desktop ignored the per-network form; (3) run local stacks only on a network you trust.
- Trust the `pnpm dev:lan` CA once before phone testing (from P0-08). The script keeps one mkcert CA for every worktree in `~/.local/share/esta/dev-ca/` (`ESTA_DEV_CA_DIR` overrides it) and never runs `mkcert -install`, because that asks for your login password. `pnpm dev:lan` prints the CA's SHA-256 fingerprint and the trust steps with the real paths: run `CAROOT=~/.local/share/esta/dev-ca mkcert -install` on the Mac, and on the phone open `https://<lan>:3443/esta-dev-ca.crt`, install the profile and turn it on under Settings > General > About > Certificate Trust Settings. Check that each device shows the printed fingerprint before you trust it. The CA key can intercept every HTTPS connection of a device that trusts it, so it stays on the Mac and the CA comes off each device when phone testing ends (`mkcert -uninstall` on the Mac, Remove Profile on the iPhone, Trusted credentials > User > Remove on Android). Until you trust it, browsers show a certificate warning on the LAN URLs.

## Needs professional confirmation

- Whether the 2026 rental PIT applies from 1 January or 1 July 2026 (DOMAIN-VN §5). The `tax_rules` row from P0-06 uses 1 January and carries a note that says so.

## Carry-forward notes

- P0-09: once a session client exists, move the `/dev/core` address lookup (`apps/web/src/app/dev/core/suggest.ts`) from the anon key to the user's session client. P0-06 lets `anon` read `admin_units` and `admin_unit_legacy_map` only because the lookup runs before sign-in; drop that grant if no signed-out surface needs it.

- P0-09: once members have a locale, the language switch must write the member's locale as well as the `NEXT_LOCALE` cookie, because `resolveLocale` prefers the member locale over the cookie (from the P0-05 review).
