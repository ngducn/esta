# Spike S5. Certificate extraction quality on synthetic fixtures

Question (SPEC §11 S5). Can the agent read a photographed or scanned Vietnamese land certificate into `certificate_v1` well enough for P2-03 to fill the fields, or must P2-03 fall back to manual entry?

Answer. On synthetic fixtures, yes. One live run read all 16 fixtures with every AGENT.md §7.2 target met. P2-03 fills fields from extraction and keeps the review step. Real certificates are not measured yet, because `fixtures-private/certificates/` does not exist on this machine.

```text
schema-valid 100.0%, required exact 100.0%, high-confidence precision 100.0%
```

## Setup

- Fixtures. `pnpm fixtures:certificates` renders the five DOMAIN-VN §2 forms as a clean scan PDF, a skewed photo with a glare band, and a dim, blurred, noisy low-light photo, plus the north-star Dĩ An sổ hồng (`fixtures/certificates/README.md`). Names contain "Demo" and ID numbers are invented.
- Model and path. `claude-sonnet-5-5`, the routine model the P0-15 ping recording ran on, on subscription auth. Each fixture runs through the worker's own `liveSession` (`apps/agent/src/sdk/session.ts`): only the `Read` tool, a fresh temp job dir holding only the page files, the `PreToolUse` path policy, `settingSources: []`, `permissionMode: 'default'` and an empty config dir. The prompt was the spike's own `extractionPrompt` in `scripts/extraction-eval.ts`, since removed (see Reproduce).
- Scoring. `scoreExtraction` in `packages/core/src/extraction/score.ts`: zod validity, exact match on the required fields the truth fills after normalization (NFC, collapsed whitespace, upper-case land use codes, areas to two decimals, dates to `IsoDate`), and precision of fields with confidence at or above 0.9. A schema-invalid reply scores no hit. Required slots whose truth is null (`serial_no` and `issued_on` on the three `paper_only` fixtures) are counted apart as `nullTruth`, so an empty reply cannot earn them.
- One live run on 2026-10-17 (04:18Z), four fixtures at a time. The raw replies are in `s5/outputs/`, and the tables below were scored from them.

## AGENT.md §7.2 targets

| Target | Result | Met |
| --- | --- | --- |
| 100% schema-valid | 16/16 (100.0%) | Yes |
| Required fields exact ≥ 90% | 106/106 (100.0%), plus 6/6 null-truth slots counted apart | Yes |
| Fields with confidence ≥ 0.9 at least 97% correct | 331/331 (100.0%) | Yes |

## By form

| Form | Fixtures | Schema-valid | Required exact | High-confidence precision |
| --- | --- | --- | --- | --- |
| so_do_pre2009 | 3 | 3/3 (100.0%) | 21/21 (100.0%) | 59/59 (100.0%) |
| so_hong_pre2009 | 3 | 3/3 (100.0%) | 21/21 (100.0%) | 76/76 (100.0%) |
| gcn_2009_2024 | 4 | 4/4 (100.0%) | 28/28 (100.0%) | 116/116 (100.0%) |
| gcn_2024 | 3 | 3/3 (100.0%) | 21/21 (100.0%) | 73/73 (100.0%) |
| paper_only | 3 | 3/3 (100.0%) | 15/15 (100.0%) | 7/7 (100.0%) |

## By required field

| Required field | Exact |
| --- | --- |
| parcels[].parcel_no | 16/16 (100.0%) |
| parcels[].map_sheet_no | 16/16 (100.0%) |
| parcels[].area_m2 | 16/16 (100.0%) |
| parcels[].address_text | 16/16 (100.0%) |
| holders[].full_name | 16/16 (100.0%) |
| issued_on | 13/13 (100.0%) |
| serial_no | 13/13 (100.0%) |

## By fixture

| Fixture | Schema-valid | Required exact | High-confidence correct | Turns | Wall s | Cost USD |
| --- | --- | --- | --- | --- | --- | --- |
| so_do_pre2009-scan | yes | 7/7 | 22/22 | 2 | 17.2 | 0.0354 |
| so_do_pre2009-photo | yes | 7/7 | 20/20 | 3 | 16.9 | 0.0388 |
| so_do_pre2009-low-light | yes | 7/7 | 17/17 | 3 | 17.5 | 0.0388 |
| so_hong_pre2009-scan | yes | 7/7 | 30/30 | 2 | 18.1 | 0.0382 |
| so_hong_pre2009-photo | yes | 7/7 | 27/27 | 3 | 11.8 | 0.0336 |
| so_hong_pre2009-low-light | yes | 7/7 | 19/19 | 3 | 12.4 | 0.0336 |
| gcn_2009_2024-scan | yes | 7/7 | 32/32 | 3 | 14.6 | 0.0407 |
| gcn_2009_2024-photo | yes | 7/7 | 29/29 | 4 | 13.5 | 0.0481 |
| gcn_2009_2024-low-light | yes | 7/7 | 26/26 | 4 | 13.3 | 0.0436 |
| gcn_2024-scan | yes | 7/7 | 31/31 | 2 | 11.7 | 0.0307 |
| gcn_2024-photo | yes | 7/7 | 17/17 | 3 | 12.4 | 0.0341 |
| gcn_2024-low-light | yes | 7/7 | 25/25 | 3 | 13.4 | 0.0355 |
| paper_only-scan | yes | 5/5 | 2/2 | 2 | 8.6 | 0.0183 |
| paper_only-photo | yes | 5/5 | 2/2 | 2 | 9.7 | 0.0234 |
| paper_only-low-light | yes | 5/5 | 3/3 | 2 | 9.5 | 0.0196 |
| northstar-di-an | yes | 7/7 | 29/29 | 4 | 12.5 | 0.0419 |

Totals: 45 turns, 213.0 s of model time (59 s wall clock at four at a time), 0.5544 USD, a mean of 0.0346 USD and at most 18.1 s per fixture.

## What the number does and does not say

- The fixtures are the limit, not the model. They are clean digital renders in one modern sans face at 1000 px wide, with mild camera effects. Real certificates add typewriter faces, faded ink, stamps and signatures over text, folds, handwritten annotations and pages shot at an angle in poor light. Expect lower numbers on real scans; the private run is the measurement that counts.
- Every run did the task. No result had `is_error`, every fixture took 2 to 4 turns of `Read`, and the job dir held only the page files, never `truth.json`.
- One trial. The run was not repeated, by the spike's budget, so there is no spread. A second trial would cost about 0.55 USD.
- Leaves outside the required set show the model's real errors. Across all 457 truth leaves, 452 matched and 5 missed. Under low light, `gcn_2024-low-light` read the first holder's ID ending 1776 as 1746, at confidence 0.85, below the 0.9 bar, so precision held. Four `gcn_2009_2024` fixtures copied the template's `-` placeholder in "Ghi chú" as `notes_text` instead of null, at confidence 0.6 to 0.7.
- The model never wrote a full 12-digit ID number. A grep of every printed number over `s5/outputs/` finds none. P2-03 still reduces IDs to the last four digits whatever the model returns (AGENT.md §5.1).

## Changes P2-03 makes

No target missed, so no schema change is needed. P2-03 reuses `certificateV1Schema` unchanged and makes these prompt and fixture changes:

1. Tell the model that a lone `-` or a blank after a label is an absent value (null), which removes the `notes_text` misses.
2. Keep "Handwritten values get confidence at most 0.6" and "Never write the full number anywhere". On `paper_only` the model kept handwritten values at or below 0.6, so only 7 of its leaves counted as high confidence.
3. Score the `gcn_2024` holders' `relation` from the print. The fixture prints no relation, and its truth now says null.
4. Fix two `gcn_2024` layout faults, then regenerate and rerun the set. The QR code belongs at the top right of page 1, where Circular 10/2024/TT-BTNMT places it, and the fixtures print it at the top left. Page 1 also holds more than fits, so the renderer squeezes the title, the holder lines and the address into each other; the model still read every holder field there. Changing either now would change the images this run measured.

## Private run

`pnpm extraction:eval --mode live --set private` printed `no private fixtures measured`. Ryan places scans and hand-written `truth.json` files under `fixtures-private/certificates/<any name>/`, one PDF or the JPEG photos of the pages per folder. The run prints field names, counts and percentages only, never a form, a folder name or a value, and saves nothing.

## DOMAIN-VN

§2 forms and eras and the rule that older certificates stay valid are `[verified]` against Circular 17/2009/TT-BTNMT, Circular 10/2024/TT-BTNMT and Land Law 2024 Article 256(3). §3 is `[verified]` against Circular 08/2024/TT-BTNMT Annex II as two legal portals list it. LUC and LUK drop "nước", HNK and BCS are added, and CSD is renamed to the whole unused group, in migration `20261007201000_land_use_codes_s5.sql`. BHK and CSD stay as `[app rule]` rows, listed in `docs/plan/STATUS.md`.

## Reproduce

The numbers above came from the spike's own prompt. Since issue #185, `extraction:eval` sends the worker's extract_document request and scores what `save_extraction` keeps, so a run now measures the prompt the worker ships. The spike prompt and the `--from` rescore are gone, and `s5/outputs/` stays as the record of this run. The golden test (`apps/agent/test/golden/extract.test.ts`) scores the shipped prompt on these fixtures in replay.

```sh
pnpm fixtures:certificates                                      # 16 fixtures, manifest unchanged
ESTA_ENV=development ESTA_MODEL_ROUTINE=claude-sonnet-5-5 \
  pnpm extraction:eval --mode live --set synthetic              # live, about 0.55 USD
pnpm extraction:eval --mode live --set private                  # counts only
```
