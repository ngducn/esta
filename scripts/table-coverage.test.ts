import { describe, expect, it } from 'vitest';
import { coverageProblems } from './table-coverage.ts';

const files = [{ path: 'supabase/tests/leases.test.sql', text: "select tests.cannot_write('public.leases');" }];

describe('coverageProblems', () => {
  it('passes a table with row level security that a pgTAP file names', () => {
    expect(coverageProblems([{ name: 'leases', rls: true }], files)).toEqual([]);
  });

  it('fails a table without row level security', () => {
    expect(coverageProblems([{ name: 'leases', rls: false }], files)).toEqual(['public.leases has no row level security']);
  });

  it('fails a table that no pgTAP file names, even when a longer name contains it', () => {
    expect(coverageProblems([{ name: 'lease', rls: true }], files)).toEqual(['public.lease is named in no pgTAP file under supabase/tests']);
  });

  it('fails a table that a pgTAP file names only in a comment', () => {
    const commented = [{ path: 'supabase/tests/a.test.sql', text: "-- leases are covered elsewhere\n/* public.leases */\nselect 1;" }];
    expect(coverageProblems([{ name: 'leases', rls: true }], commented)).toEqual(['public.leases is named in no pgTAP file under supabase/tests']);
  });

  it('counts a table named in SQL next to a trailing comment, or inside a string with dashes', () => {
    const named = [{ path: 'supabase/tests/a.test.sql', text: "select tests.cannot_write('public.leases'); -- why\nselect 'a -- b', 'leases';" }];
    expect(coverageProblems([{ name: 'leases', rls: true }], named)).toEqual([]);
  });
});
