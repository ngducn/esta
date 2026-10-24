import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateWatch, watchSnapshotSchema, type WatchFact } from '@esta/core/watch';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { seedId } from '../../../../supabase/seed/generator/ids.ts';

const root = join(import.meta.dirname, '../../../..');
const readJson = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'));

const goldenSchema = z.object({
  as_of: z.string(),
  household: z.string(),
  expected: z.array(z.object({ rule_id: z.string(), subject_key: z.string(), severity: z.enum(['info', 'watch', 'action']) })),
  must_not_fire: z.array(z.object({ rule_id: z.string(), subject_key: z.string().optional(), why: z.string() })),
});

const golden = goldenSchema.parse(readJson('apps/agent/test/golden/watch-2026-10-07.json'));
const snapshot = watchSnapshotSchema.parse(readJson('packages/core/src/watch/fixtures/full-2026-10-07.snapshot.json'));

const OWNER_PERSON: Readonly<Record<string, string>> = { 'nguyen-thi-demo': 'me', 'tran-minh-demo': 'ryan' };

/** AGENT.md §7.1 names each subject by its place in the seed; this is the record id the seed gives that place (supabase/seed/README.md). */
function subjectKey(readable: string, household: string): string {
  const [kind, place, unit, extra] = readable.split(':');
  const unitNo = unit?.replace(/^phong-/, '');
  const property = seedId(`seed:property:${household}:${place}`);
  switch (kind) {
    case 'invoice':
      // Dĩ An bills each room's period on its first day, so the due date is the period start the invoice id carries.
      return `invoice:${seedId(`seed:invoice:${household}:${place}:${unitNo}:${extra}`)}`;
    case 'lease':
      return `lease:${seedId(`seed:lease:${household}:${place}:${unitNo ?? 1}`)}`;
    case 'unit':
      return `unit:${unit === 'whole' ? seedId(`esta:unit:whole:${property}`) : seedId(`seed:unit:${household}:${place}:${unitNo}`)}`;
    case 'document':
      return `document:${seedId(`seed:document:${household}:${place}:${unit}`)}`;
    case 'party':
      return `party:${seedId(`seed:party:${OWNER_PERSON[place ?? '']}-${household}`)}:${unit}`;
    case 'property':
      return `property:${property}`;
    default:
      throw new Error(`No seed key for ${readable}`);
  }
}

const triple = (fact: Pick<WatchFact, 'ruleId' | 'subjectKey' | 'severity'>) => `${fact.ruleId} ${fact.subjectKey} ${fact.severity}`;

describe('portfolio_watch golden facts on the full seed at 2026-10-07 (AGENT.md §7.1)', () => {
  const facts = evaluateWatch(snapshot);

  it('reads the demo household on the golden date', () => {
    expect(snapshot.householdId).toBe(seedId(`seed:household:${golden.household}`));
    expect(snapshot.asOf).toBe(golden.as_of);
  });

  it('matches the expected (rule_id, subject_key, severity) set exactly', () => {
    const expected = golden.expected.map((row) => triple({ ruleId: row.rule_id, subjectKey: subjectKey(row.subject_key, golden.household), severity: row.severity }));
    const actual = facts.map(triple);
    const missing = expected.filter((key) => !actual.includes(key));
    const extra = actual.filter((key) => !expected.includes(key));
    console.log(`${expected.length - missing.length} facts matched, ${missing.length} missing, ${extra.length} extra`);
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    expect(actual).toHaveLength(expected.length);
  });

  it.each(golden.must_not_fire)('does not fire $rule_id $subject_key ($why)', ({ rule_id, subject_key }) => {
    const subject = subject_key === undefined ? undefined : subjectKey(subject_key, golden.household);
    expect(facts.filter((fact) => fact.ruleId === rule_id && (subject === undefined || fact.subjectKey === subject))).toEqual([]);
  });

  it('holds every subject the must-not-fire list names, so each absence is a decision and not a missing row', () => {
    const present = new Set([
      ...snapshot.invoices.map((row) => `invoice:${row.id}`),
      ...snapshot.leases.map((row) => `lease:${row.id}`),
      ...snapshot.units.map((row) => `unit:${row.id}`),
      ...snapshot.taxPositions.map((row) => `party:${row.partyId}:${row.year}`),
    ]);
    const named = golden.must_not_fire.flatMap((row) => (row.subject_key === undefined ? [] : [subjectKey(row.subject_key, golden.household)]));
    expect(named.filter((key) => !present.has(key))).toEqual([]);
  });
});
