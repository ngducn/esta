# Status

## Waiting for Ryan

- Confirm that only an operator can grant operator. SPEC §5.1 ships this as an `[app rule]` from P0-02: a user session changes `household_members.is_operator` only when it is already an operator of that household; the service role is exempt.

## Carry-forward notes

- P0-09: once members have a locale, the language switch must write the member's locale as well as the `NEXT_LOCALE` cookie, because `resolveLocale` prefers the member locale over the cookie (from the P0-05 review).
