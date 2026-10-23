import { describe, expect, it } from 'vitest';
import { coverage, parseInventory, parseSpec } from './plan-coverage.ts';

const specText = `# Spec

### 1.2 North-star scenario

1. Sign in.
2. Add a property.
3. Collect rent.

### 1.3 Users

## 6. Feature specs and acceptance checks

### 6.1 Foundation (FND)

- FND-1 Sign-in. Check: e2e.
- FND-2 Roles. Check: pgTAP.
- FND-3 i18n. Check: lint.

### 6.2 Properties (PRP)

- PRP-1 Create a property. Check: e2e.

## 7. Cross-cutting requirements

- XYZ-1 Not an acceptance id.

## 10. Delivery phases

| Phase | Builds | Exit predicate | Review gate |
| --- | --- | --- | --- |
| 0 Foundations | Monorepo | FND checks | Yes |
| 1 Portfolio | PRP | PRP checks | Yes |

### 10.1 Mom test (human gate after Phase 0, repeated in Phase 1)
`;

const spec = parseSpec(specText);

const inventory = (phase1Exit: string, extra = '') => `# Inventory

## Phase 0. Foundations

| Seq | Id | G | Title | Scope |
| --- | --- | --- | --- | --- |
| 01 | P0-01 | | Sign in | FND-1 to FND-3. North-star step 1. Phase 0 exit with the Mom test. SHA-256 dedupe |

## Phase 1. Portfolio

| Seq | Id | G | Title | Scope |
| --- | --- | --- | --- | --- |
| 01 | P1-01 | G | Add a property | PRP-1, north-star steps 2 and 3 ${extra} |
| 02 | P1-02 | G | Exit | ${phase1Exit} |

## Changes from the old inventory

| Change | Ids | What |
| --- | --- | --- |
| Deleted | P1-09 | Cited PRP-7 and FND-99 |
`;

const check = (phase1Exit: string, extra = '') => coverage(spec, parseInventory(inventory(phase1Exit, extra)));

describe('parseSpec', () => {
  it('reads acceptance ids from §6 only, north-star steps, phases and Mom test phases', () => {
    expect(spec).toEqual({
      prefixes: ['FND', 'PRP'],
      acceptance: ['FND-1', 'FND-2', 'FND-3', 'PRP-1'],
      northStarSteps: [1, 2, 3],
      phases: [0, 1],
      phaseExitSteps: new Map(),
      momTestPhases: [0, 1],
    });
  });
});

describe('coverage', () => {
  it('maps every requirement to the PRs that cite it and ignores rows outside phase tables', () => {
    const report = check('Phase 1 exit and the Mom test');
    expect(report.problems).toEqual([]);
    expect(report.lines).toContain('FND-2 -> P0-01');
    expect(report.lines).toContain('north-star step 3 -> P1-01');
    expect(report.lines).toContain('Phase 1 exit -> P1-02');
    expect(report.lines).toContain('Mom test in Phase 1 -> P1-02');
  });

  it('fails when a SPEC id loses its only PR', () => {
    const report = coverage(spec, parseInventory(inventory('Phase 1 exit and the Mom test').replace('PRP-1, ', '')));
    expect(report.problems).toEqual(['PRP-1 is in SPEC but no PR in the inventory covers it']);
  });

  it('fails when a row cites an id SPEC does not define', () => {
    expect(check('Phase 1 exit and the Mom test', 'and PRP-9').problems).toEqual([
      'P1-01 cites PRP-9, which SPEC §6 does not define',
    ]);
  });

  it('fails when a north-star step has no PR or a row cites a step SPEC lacks', () => {
    const report = coverage(
      spec,
      parseInventory(inventory('Phase 1 exit and the Mom test, north-star step 4').replace('steps 2 and 3', 'step 2')),
    );
    expect(report.problems).toEqual([
      'P1-02 cites north-star step 4, which SPEC §1.2 does not define',
      'north-star step 3 is in SPEC but no PR in the inventory covers it',
    ]);
  });

  it('fails when a phase exit is missing, misplaced or lacks the Mom test', () => {
    expect(check('Mom test').problems).toEqual([
      'Phase 1 exit is in SPEC but no PR in the inventory covers it',
      'The Phase 1 exit PR does not carry the Mom test',
    ]);
    expect(check('Phase 1 exit', 'Phase 0 exit').problems).toEqual([
      'P1-01 sits in Phase 1 but cites the Phase 0 exit',
      'The Phase 1 exit PR does not carry the Mom test',
    ]);
  });

  it('fails when a phase exit PR drops a north-star step its SPEC §10 predicate names, even under a later full-run range', () => {
    const phased = parseSpec(
      specText
        .replace('| PRP checks |', '| PRP checks; north-star steps 2 and 3 pass |')
        .replace('| 1 Portfolio | PRP | PRP checks; north-star steps 2 and 3 pass | Yes |', '$&\n| 2 Ship | Polish | Full north-star passes | Yes |'),
    );
    const staged = (phase1Exit: string) =>
      coverage(
        phased,
        parseInventory(
          inventory(phase1Exit).replace(
            '## Changes from the old inventory',
            '## Phase 2. Ship\n\n| Seq | Id | G | Title | Scope |\n| --- | --- | --- | --- | --- |\n| 01 | P2-01 | G | Ship | Phase 2 exit with north-star steps 1 to 3 |\n\n## Changes from the old inventory',
          ),
        ),
      );
    expect(staged('Phase 1 exit and the Mom test, north-star steps 2 and 3').problems).toEqual([]);
    expect(staged('Phase 1 exit and the Mom test, north-star step 2').problems).toEqual([
      'P1-02 carries the Phase 1 exit but cites no north-star step 3, which SPEC §10 puts in that exit',
    ]);
  });

  it('reads a split PR id with a letter suffix as its own row', () => {
    const text = inventory('Phase 1 exit and the Mom test').replace('| 01 | P1-01 |', '| 01 | P1-01a |');
    expect(coverage(spec, parseInventory(text)).lines).toContain('PRP-1 -> P1-01a');
  });

  it('fails when the same PR id appears twice', () => {
    const text = inventory('Phase 1 exit and the Mom test').replace('| 02 | P1-02 |', '| 02 | P1-01 |');
    expect(coverage(spec, parseInventory(text)).problems).toEqual(['P1-01 appears in 2 rows']);
  });

  it('never passes on an empty SPEC or inventory', () => {
    expect(coverage(parseSpec(''), parseInventory('')).problems).toEqual([
      'SPEC §6 defines no acceptance ids; the SPEC parser found nothing',
      'SPEC §1.2 lists no north-star steps',
      'SPEC §10 lists no phases',
      'SPEC has no Mom test heading naming its phases',
      'The inventory has no PR rows under a "## Phase N." heading',
    ]);
  });
});
