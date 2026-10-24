import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WatchFact } from '@esta/core/watch';
import { z } from 'zod';
import { seedId } from '../../../../supabase/seed/generator/ids.ts';

const goldenSchema = z.object({
  as_of: z.string(),
  household: z.string(),
  expected: z.array(z.object({ rule_id: z.string(), subject_key: z.string(), severity: z.enum(['info', 'watch', 'action']) })),
  must_not_fire: z.array(z.object({ rule_id: z.string(), subject_key: z.string().optional(), why: z.string() })),
});

/** AGENT.md §7.1 as data: the expected facts on the full seed at 2026-10-07, and the facts that must not appear. */
export const WATCH_GOLDEN = goldenSchema.parse(JSON.parse(readFileSync(join(import.meta.dirname, 'watch-2026-10-07.json'), 'utf8')));

const OWNER_PERSON: Readonly<Record<string, string>> = { 'nguyen-thi-demo': 'me', 'tran-minh-demo': 'ryan' };

/** AGENT.md §7.1 names each subject by its place in the seed; this is the key of the record the seed puts there (supabase/seed/README.md). */
export function subjectKey(readable: string, household: string): string {
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

export const triple = (fact: Pick<WatchFact, 'ruleId' | 'subjectKey' | 'severity'>) => `${fact.ruleId} ${fact.subjectKey} ${fact.severity}`;

export const expectedTriples = (household: string) =>
  WATCH_GOLDEN.expected.map((row) => `${row.rule_id} ${subjectKey(row.subject_key, household)} ${row.severity}`);

export function compareFacts(facts: readonly WatchFact[], household: string) {
  const expected = expectedTriples(household);
  const actual = facts.map(triple);
  return { matched: expected.filter((key) => actual.includes(key)).length, missing: expected.filter((key) => !actual.includes(key)), extra: actual.filter((key) => !expected.includes(key)) };
}
