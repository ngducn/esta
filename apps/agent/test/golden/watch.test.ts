import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateWatch, watchSnapshotSchema } from '@esta/core/watch';
import { describe, expect, it } from 'vitest';
import { seedId } from '../../../../supabase/seed/generator/ids.ts';
import { compareFacts, subjectKey, WATCH_GOLDEN } from './watch-golden';

export const WATCH_FIXTURE = 'packages/core/src/watch/fixtures/full-2026-10-07.snapshot.json';

const snapshot = watchSnapshotSchema.parse(JSON.parse(readFileSync(join(import.meta.dirname, '../../../..', WATCH_FIXTURE), 'utf8')));
const household = WATCH_GOLDEN.household;

describe('portfolio_watch golden facts on the full seed at 2026-10-07 (AGENT.md §7.1)', () => {
  const facts = evaluateWatch(snapshot);

  it('reads the demo household on the golden date', () => {
    expect(snapshot.householdId).toBe(seedId(`seed:household:${household}`));
    expect(snapshot.asOf).toBe(WATCH_GOLDEN.as_of);
  });

  it('matches the expected (rule_id, subject_key, severity) set exactly', () => {
    const { matched, missing, extra } = compareFacts(facts, household);
    console.log(`${matched} facts matched, ${missing.length} missing, ${extra.length} extra`);
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    expect(facts).toHaveLength(WATCH_GOLDEN.expected.length);
  });

  it.each(WATCH_GOLDEN.must_not_fire)('does not fire $rule_id $subject_key ($why)', ({ rule_id, subject_key }) => {
    const subject = subject_key === undefined ? undefined : subjectKey(subject_key, household);
    expect(facts.filter((fact) => fact.ruleId === rule_id && (subject === undefined || fact.subjectKey === subject))).toEqual([]);
  });

  it('holds every subject the must-not-fire list names, so each absence is a decision and not a missing row', () => {
    const present = new Set([
      ...snapshot.invoices.map((row) => `invoice:${row.id}`),
      ...snapshot.leases.map((row) => `lease:${row.id}`),
      ...snapshot.units.map((row) => `unit:${row.id}`),
      ...snapshot.taxPositions.map((row) => `party:${row.partyId}:${row.year}`),
    ]);
    const named = WATCH_GOLDEN.must_not_fire.flatMap((row) => (row.subject_key === undefined ? [] : [subjectKey(row.subject_key, household)]));
    expect(named.filter((key) => !present.has(key))).toEqual([]);
  });
});
