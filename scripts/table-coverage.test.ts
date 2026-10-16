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
});
