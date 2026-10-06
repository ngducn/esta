# Status

## Waiting for Ryan

- Confirm that only an operator can grant operator. SPEC §5.1 ships this as an `[app rule]` from P0-02: a user session changes `household_members.is_operator` only when it is already an operator of that household; the service role is exempt.
- Approve the NSO admin units source for P0-06: the NSO catalog SOAP service and conversion table, pinned in `scripts/reference/data/`. P0-06 is held until then.
- Approve the license reading for that source: public legal documents excluded from copyright under IP Law Article 15, an engineer's reading rather than a lawyer's (`supabase/seed/README.md`).
- Approve the NAPAS BIN snapshot for `bank_bins`: 74 banks taken by hand from the NAPAS VietQR portal, whose terms allow personal non-commercial use with the source cited and bar automated collection.
- Review the curated admin unit rows in `supabase/seed/reference/legacy_curated.csv` and the bank short names in `bank_short_names.csv`, both `[app rule]`.

## Needs professional confirmation

- Whether the 2026 rental PIT applies from 1 January or 1 July 2026 (DOMAIN-VN §5). The `tax_rules` row from P0-06 uses 1 January and carries a note that says so.

## Carry-forward notes

- P0-09: once members have a locale, the language switch must write the member's locale as well as the `NEXT_LOCALE` cookie, because `resolveLocale` prefers the member locale over the cookie (from the P0-05 review).
