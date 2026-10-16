# Esta verification map

This directory is the maintained source for verifying the user-facing behavior of the Esta web app. Read the index, then use the matching feature file as the recipe.

## Baseline preconditions

- `export ESTA_SLOT=<your slot>` and `S=.claude/skills/verify/scripts`.
- `$S/launch.sh` has printed `Ready` for the slot, which means the `full` seed and the clock at `2026-10-07T09:00:00+07:00`.
- `$S/doctor.sh` prints six `OK` lines.
- `$S/b.sh viewport 390x844` or `$S/b.sh viewport 1440x900` is set before the first screenshot.
- Never drive an instance this run did not launch.

## Driving conventions

- Start every recipe signed out or through `sign-in.sh`, unless its preconditions say otherwise.
- Use lane `n`'s seeded household only: `me.lane<n>@demo.esta.test` and `ryan.lane<n>@demo.esta.test`, admins of `Gia đình Demo <n>`.
- A new address for a lane is `<role>.lane<n>@demo.esta.test`, such as `new.lane4@` or `invitee.lane5@`. A rerun on the same stack needs a fresh suffix or a new `launch.sh`.
- Prefer form field names, `role=` selectors with accessible names, and `@e` refs from a fresh snapshot.
- The UI defaults to Vietnamese. Expected strings below are the Vietnamese ones.

## Proof and skip reporting

- Capture the action and the resulting state with `$S/evidence.sh <pr-id> <slug>`.
- Back every mutation with a read-only `psql` `select` on `supabase_db_esta-<n>`.
- Report an unreachable path with the command you ran and the unmet precondition.
- Do not report an entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with the verify skill`, and `Gotchas`.

## Features

- [Sign in](./sign-in.md) covers an existing member, a wrong code, the invite claim and the language on `/sign-in`.
- [Onboarding](./onboarding.md) covers a new address creating a household and the invite step.
- [App shell](./shell.md) covers the tab bar, the sidebar, the account menu and display settings on `/settings`.
