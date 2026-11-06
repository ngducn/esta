import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(import.meta.dirname, '..', 'supabase', 'tests');
/** The two files that test the table itself, so they write it in forms the rest must not. */
const OWN = new Set(['test_clock.test.sql', 'test_clock_households.test.sql']);
const CLEAR = 'delete from public.test_clock where for_household is null;';
const INSERT = /insert\s+into\s+(?:public\.)?test_clock\b[^;]*;/gi;
const GLOBAL_INSERT = /^insert into public\.test_clock \(frozen_now\) values \('[^']+'\);$/;

/** The statements of `source` that write the global test clock row, flagged when they bypass the one way. */
export function badClockWrites(source: string): string[] {
  const bad = [...source.matchAll(INSERT)].map((m) => m[0]).filter((statement) => !GLOBAL_INSERT.test(statement));
  if (INSERT.test(source) && !source.includes(CLEAR)) bad.push(`missing: ${CLEAR}`);
  INSERT.lastIndex = 0;
  return bad;
}

describe('badClockWrites', () => {
  it('fails the old insert with an id and an on conflict clause', () => {
    expect(badClockWrites("insert into public.test_clock (id, frozen_now) values (true, '2026-10-07T09:00:00+07:00') on conflict (id) do update set frozen_now = excluded.frozen_now;")).toHaveLength(2);
  });

  it('passes the clear and insert pair', () => {
    expect(badClockWrites(`${CLEAR}\ninsert into public.test_clock (frozen_now) values ('2026-10-07T09:00:00+07:00');`)).toEqual([]);
  });
});

describe('supabase/tests', () => {
  it('writes the global test clock row only as a clear of the global row and a plain insert', () => {
    const files = readdirSync(DIR).filter((file) => file.endsWith('.sql') && !OWN.has(file));
    const found = files.map((file) => [file, badClockWrites(readFileSync(join(DIR, file), 'utf8'))] as const).filter(([, bad]) => bad.length > 0);
    expect(found).toEqual([]);
  });
});
