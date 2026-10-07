# Seed ids

Seed rows use fixed ids so tests, screenshots and lanes can name them. Each id is `extensions.uuid_generate_v5(extensions.uuid_ns_url(), <key>)`, where the key is a string in one of these shapes.

| Row | Key | Example |
| --- | --- | --- |
| Household | `seed:household:<household>` | `seed:household:lane-3` |
| `auth.users` row | `seed:user:<person>-<household>` | `seed:user:ryan-lane-3` |
| `household_members` row | `seed:member:<person>-<household>` | `seed:member:me-demo` |
| Owner party | `seed:party:<person>-<household>` | `seed:party:me-lane-10` |

`<household>` is `demo` for slot 0's household `Gia đình Demo`, and `lane-<n>` for the lane households `Gia đình Demo <n>`, where n is 1 to 10. `<person>` is `me` or `ryan`.

Emails follow the same split. In `Gia đình Demo` they are `me@demo.esta.test` and `ryan@demo.esta.test`. In lane n they are `me.lane<n>@demo.esta.test` and `ryan.lane<n>@demo.esta.test`.

To get an id in SQL, run `select extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'seed:household:lane-3')`.

Keep these shapes when the seed generator replaces `bootstrap.sql`, so ids stay stable across resets and PRs.
