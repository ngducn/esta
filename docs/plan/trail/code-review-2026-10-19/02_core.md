# 02 core: packages/core/src and packages/db

Reviewer 02. Snapshot `/tmp/esta-thermo-wt` at 5d19277. Read only. Labels: **measured** (command output or quoted code), **inferred** (reasoned from code I read), **guess**.

## Verdict

This is the best-disciplined part of the codebase I would expect to find in a two-person app, and it is still not done. The type discipline is real: zero `any` and zero non-null assertions in core source, branded `Vnd`, `IsoDate` and `Instant`, exact BigInt rounding, and rows parsed by zod at the boundary. The tests are strong: 1,505 tests in 2.5 s, and the fast-check property tests check against day-by-day reference oracles. The structural problems are duplication and one missed simplification. The same concept is written twice or three times, and in one measured case the copies disagree in a way Mẹ can see: the review screen reads `1,255 m²` as 1,255 square meters, and the legal tab refuses the same text. Money rules exist twice, once in TypeScript and once in plpgsql, and the two parity mechanisms are uneven. Extraction acceptance flattens a typed tree into string paths and then rebuilds it by string-prefix scanning. A next engineer can work here safely, but each rule change has to be found and made in two or three places, and nothing points to all of them.

## Ratings

- **Readability: 7/10.** Files are small (largest source file 359 lines) and doc comments explain the reason behind rules. Extraction's string-path plumbing, and the snake_case and camelCase vocabularies mixed inside domain code, cost every reader.
- **Quality: 6.5/10.** The type and test discipline are excellent. One measured user-visible defect class comes from duplicated parsers. Enums, schemas and the calendar are each declared in more than one place. A registry carries data that nothing reads.
- **Performance: 8/10.** Intl formatters and collators are module-level, money math is exact BigInt, and benches exist. The only superlinear paths are escalation recomputed from base on every period, and `itemCount` scans in acceptance. Both are harmless at one family's scale (inferred).

## Findings, ranked

### 1. Three area parsers and two mismatch rules, with a measured 1,000x divergence (correctness, duplication)

Core has three ways to read an area. `agent-schemas/certificate_v1.ts:20-27` defines `parseArea(raw: unknown): unknown` over `parseDecimal`. `extraction/area-check.ts:3-9` defines `readArea`, the same body with a different signature, and its comment says it was copied to stay "free of zod for the browser". `properties/area.ts:6-29` defines `parseAreaInput`, which has its own regexes, unit suffix and hundredths limit. `parseDecimal` (`parse/decimal.ts:15-19`) is a money parser: "Đồng have no minor unit, so `3.500` is 3500", and a single separator followed by three digits counts as thousands grouping. DOMAIN-VN line 92 says Vietnamese decimal commas become dots ("125,5 m²" → 125.5).

Measured with `npx tsx` against the snapshot:

```
"1,255"  parseArea= 1255   readArea= 1255  parseAreaInput= {"ok":false,"reason":"too_precise"}
"12 m"   parseArea= "12 m" readArea= null  parseAreaInput= {"ok":true,"value":12}
"0"      parseArea= 0      readArea= 0     parseAreaInput= {"ok":false,"reason":"invalid"}
```

The extraction review (`INPUT_KINDS.area` at `extraction/fields.ts:79-86`, and `extraction-field-row.tsx:51,60` in web) uses the money semantics. The legal parcel form, the structure form and the unit sheet use `parseAreaInput`. So a certificate area of `1,255 m²` accepted from the review is stored as 1,255 m², while Mẹ typing the same text on the legal tab is told it is too precise. The "purposes do not add up" rule also exists twice: `extraction/area-check.ts:15-20` uses a float sum rounded to hundredths with a 0.005 tolerance, and `properties/area.ts:46-55` compares integer hundredths exactly. They agreed on the three probes I ran (measured), but nothing keeps them in step.

**Remedy (code-judo).** Create one zod-free `parse/area.ts` that returns `Result<number, AreaInputReason>` with the Vietnamese decimal-comma rule. Make `z.preprocess` in the agent schema, `INPUT_KINDS.area`, and every form call it. Keep one `purposesMismatch` in integer hundredths. This deletes `parseArea`, `readArea`, `purposeAreaMismatch` and the copied `AREA_UNIT` regex. The bundle-size concern that caused the copy goes away once the canonical parser lives in a zod-free file.

### 2. Extraction acceptance round-trips a typed tree through string paths (missed dramatic simplification)

The agent result starts as a nested object whose shape is `certificateV1Schema`. `reviewFields` (`extraction/fields.ts:316-358`) walks it as `unknown` with the duck-typing helpers `isRecord` and `asLeaf`; `fields.ts` has 20 `unknown` mentions (measured, `rg -c`). It flattens the tree into concrete string paths such as `parcels[0].purposes[1].area_m2`. `decide` (`acceptance.ts:91-114`) turns decisions into a flat `Map<string, Value>`. `planCertificateAcceptance` (`acceptance.ts:164-286`) then rebuilds the tree by string concatenation: `itemCount` probes `fields.some(section.key === "holders[n]")` until it misses (`acceptance.ts:116-120`), `itemOf` scans every key for an `.any` sentinel (`acceptance.ts:124-128`), and `text()` and `num()` re-narrow each value. Those helpers have 14 call sites in one function (measured). The rebuilt rows go through zod, and `issuePaths` (`acceptance.ts:132-137`) converts zod issue paths back into strings. That makes four representation changes for one tree.

The registry that looks like it drives this does not. `EXTRACTION_FIELDS` (`fields.ts:240-268`) declares `target: to('parcels', 'purposes.area_m2')` for 39 fields. The only read of `target` in the repo is `descriptor.target === null` at `fields.ts:345` (measured: `rg '\btarget\b'` over core, web server, web extraction components and the agent). The real table and column routing is hand-coded again in `planCertificateAcceptance`. A reader trusts the registry and is wrong.

**Remedy (code-judo).** Parse the result once with `AGENT_SCHEMAS[name].schema` at the boundary. Apply decisions leaf by leaf to that typed tree to get a "decided" tree with the same shape, holding values instead of leaves. Then each row is `newParcelSchema.safeParse(decided.parcels[i])`, and zod's issue path already matches the review's field path. `itemCount`, `itemOf`, `.any`, `text`, `num` and `issuePaths` disappear. Then do one of two things with `target`: make it drive the plan, or replace it with `reviewed: boolean`.

### 3. Money rules live twice, in TypeScript and plpgsql, behind two unequal parity mechanisms (cross-layer duplication)

This is deliberate: SPEC writes money rows only in SQL definer functions, and core supplies previews. The cost is concrete. Schedule generation exists as `schedule/generate.ts` (113 lines) and `private.lease_periods` (`20261007306700_lease_changes.sql:105-178`). The invoice plan exists as `lease/invoicing.ts` and `private.plan_invoices` (same file, 180-208). Oldest-first allocation exists as `allocation/allocate.ts:52-74` and `record_payment` (`20261007305000_record_payment.sql:97`). `payment_status`, `scale_round_half_up` and `months_until` are also twins. Migration comments reference `packages/core` from 5 migrations (measured).

Parity is enforced in two ways. `payment_status` uses a golden CSV that the TypeScript test writes (`allocation/status.test.ts:31`, `toMatchFileSnapshot`) and pgTAP replays. That check is cheap and runs in `pnpm db:test`. The schedule and allocation twins are compared only by web integration tests against a live stack (`leases.integration.test.ts:151,318`, `cron.integration.test.ts:159`, `payments.integration.test.ts`), with hand-picked cases. Both twins also recompute escalation from the base rent on every period (`escalation.ts:17-32`, and the `for i in 1 .. months_until/v_every` loop in SQL), which is O(periods × steps). That is harmless at this scale (inferred).

**Remedy.** Keep the twins, because the locked decision requires them, but make parity total and cheap. Generate schedule, plan and allocation vectors from the existing fast-check arbitraries into `supabase/tests/fixtures/*.csv`, the same way `payment_status.csv` is made, and replay them in pgTAP. A drift in either twin then fails `pnpm db:test` without the web harness. Also add a one-line `-- twin:` / `// twin:` marker convention so that `rg twin:` lists every pair.

### 4. Domain vocabulary is declared more than once (type and model duplication)

All of the following are measured with `rg`.
- `TaxPayer` is a const-array type at `lease/types.ts:7-8` and a separate literal union at `tax/attribute.ts:7`.
- `BillingCycleMonths`, `PeriodAnchor` and `FirstPeriodProration` are literal unions at `schedule/types.ts:4-8`. The same values are separate const arrays `BILLING_CYCLES`, `PERIOD_ANCHORS` and `PRORATIONS` at `lease/types.ts:10-12`, and those arrays feed the zod schemas.
- `CERTIFICATE_FORMS` and `ANNOTATION_KINDS` are byte-identical at `agent-schemas/certificate_v1.ts:5,9` and `schemas/legal.ts:6,12`. Both modules also export `purposeSchema`, `parcelSchema`, `structureSchema` and `annotationSchema` with different shapes, so an auto-import can pick the wrong one silently.
- `isoDateSchema` is defined at `schemas/legal.ts:16` and again at `tax/rules.ts:23`.
- `Result<T, Reason extends string>` (`result.ts:1`, 32 uses) has five ad hoc siblings: `Parsed` (`fields.ts:18`), `PlanResult` (`acceptance.ts:64`), `TlvResult` (`vietqr/tlv.ts:8`), `DecodeResult` (`vietqr/decode.ts:13`) and `DepositLedgerResult` (`allocation/deposits.ts:16`). They exist because the error slot must be a string.

**Remedy.** Declare one const array per enum, in the module that owns the concept, and derive the type, the zod enum, and every other module's view from it. Widen `Result` to `Result<T, E = string>` and collapse the siblings into it.

### 5. The calendar is owned by `schedule` and partly duplicated (wrong layer)

`daysInMonth` is byte-identical at `date/iso-date.ts:5-8` and `schedule/dates.ts:4-7`. The era constants are duplicated at `date/calendar.ts:9-11` and `schedule/dates.ts:28-30`: `epochDay` lives in one file and its inverse `fromEpochDay` in the other. `collections/group.ts`, `collections/month.ts`, `properties/status.ts`, `tax/attribute.ts`, `lease/collected.ts` and five web files import `addDays`, `addMonths` or `firstOfMonth` from `schedule` (measured). `date/` has 55 source lines and 0 test lines, so its arithmetic is tested only indirectly through schedule tests.

**Remedy.** Move `addDays`, `addMonths`, `firstOfMonth`, `fromEpochDay` and `monthsUntil` into `date/calendar.ts`, delete the copies, export them from `@esta/core/date`, and give `date/` its own round-trip property test (`fromEpochDay(epochDay(d)) === d`).

### 6. Two vocabularies inside pure domain code (legibility)

Some core functions take snake_case database rows: `lease/current.ts:7` defines `LeaseSpan` with `start_date` and `end_date`, and 17 non-schema core files type against snake_case shapes (measured). Others take camelCase domain types such as `LeaseTerms`. The row schemas are inconsistent about the mapping. `leaseAmendmentRowSchema` transforms rows to camelCase (`schemas/lease.ts:99-118`). `leaseRowSchema` stays snake_case and needs a separate `leaseTerms()` mapper (`schemas/lease.ts:124-137`). `LEASE_COLUMNS` is a hand-typed column list (`schemas/lease.ts:95`), while `completeness/facts.ts:44` derives its list from the schema keys. The completeness registry also embeds web routes and anchors (`completeness/registry.ts:8-9`), which is presentation knowledge inside the domain package. **Remedy.** Transform every row to the domain shape inside its zod schema, derive column lists from schema keys, and let web map check ids to routes.

### Smaller notes

- 46 non-test `as` hits (measured). Nearly all are brand constructors inside the module that owns the brand, which is the correct place for them. `matching/match.ts:136,143` casts `identities[i] as RowIdentity`; zipping rows with identities in `identifyRows` would remove the cast. `acceptance.test.ts:44` needs `step.row as unknown as Record<string, unknown>`; an `Extract<PlanStep, { table: T }>` helper would type it.
- `scaleRoundHalfUp` (`schedule/rounding.ts:4-8`) and its SQL twin round half up only for non-negative amounts, because BigInt division and `div` truncate toward zero. `vnd()` allows negative values. Nothing negative reaches it today (inferred); a guard or a doc line would make the invariant explicit.
- `StatementMatch` (`matching/match.ts:23-37`) has two `status: 'unmatched'` variants that differ only by `repeatOf`, so the discriminant does not narrow between them.
- `applyEscalation` and `fromEpochDay` are exported from `schedule/index.ts` with no caller outside `schedule` (measured).

## What is genuinely good

The brands are applied where they matter. `vnd()` rejects unsafe integers and normalizes `-0` (`money/vnd.ts:5-8`). Rates are basis points. `scaleRoundHalfUp` is exact at any magnitude. There is no `any` and no `!` in core source (measured). The schedule generator is a tight 113-line state machine whose cursor makes amendments a fold (`schedule/generate.ts:16-74`). The matcher's rules are documented next to the code, and its word-edge tenant match is careful (`matching/match.ts:59-77`). Rules are data where it counts: `COMPLETENESS_CHECKS`, `INPUT_KINDS`, `PLANNERS` with `satisfies Record<SchemaName, …>`, and the tax rules. The tests check behavior, not mocks: 1,505 tests pass in 2.52 s across 77 files, with 0 `vi.mock`, 0 snapshots, 11 fast-check property files, real truth fixtures for acceptance, and a day-by-day reference oracle for billing (`generate.property.test.ts:211`). The `payment_status.csv` golden-vector bridge to pgTAP is the right pattern, and the codebase should use it everywhere it has a twin.

## Measurements and commands

- Sizes: `find packages/core/src -name '*.ts' | xargs wc -l` gives 201 files, 116 source files with 6,824 lines, and 7,696 test lines. Largest source files: `extraction/fields.ts` 359, `extraction/acceptance.ts` 339, `tax/attribute.ts` 261. `packages/db/src/database.types.ts` is 2,568 generated lines, and `index.ts` has 2 lines of re-exports. No file is near 1,000 lines.
- Per-module source/test lines: extraction 895/528, matching 901/1241, properties 698/823, tax 644/713, vietqr 503/459, schedule 284/805, date 55/0.
- Type discipline: `rg ' as [A-Za-z]'` excluding `as const`, tests and benches, gives 46 hits. `rg '\bany\b'` finds only identifiers and prose. The non-null assertion pattern search returns 0 hits. `rg -c '\bunknown\b'` has the most hits in `extraction/fields.ts` (20) and `extraction/score.ts` (8).
- `npx vitest run` in `packages/core`: 77 files, 1,505 tests passed, 2.52 s.
- Area probe: a scratch `area.ts` run with `npx tsx` against the three parsers and both mismatch rules. Output is quoted in finding 1.
- Package surface: 41 subpath exports in `packages/core/package.json`, 24 of which point at leaf files rather than a module index. This is consistent with keeping zod out of client bundles (inferred from the `area-check.ts:5` comment).
- `packages/db`: generated column types leave the domain statuses (`status`, `tax_payer`, `period_anchor`) as `string`, because they are `text` with CHECK constraints, not Postgres enums. Web code bridges them through zod row schemas, and only 4 brand casts appear in `apps/` source (measured), so the gap is contained.

## Not examined

I did not read `vietqr/` (503 lines), `maps/`, `matching/decode.ts` and `matching/layouts.ts`, `agent-schemas/reduce-national-ids.ts`, `tax/position.ts` and `tax/rules.ts`, `properties/filters.ts`, `format/`, or `activity/`. I did not run benches or the typecheck. Watch rules and proposals do not exist yet in this snapshot. The SQL side of each twin was read only far enough to confirm that it mirrors the TypeScript.
