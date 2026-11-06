import { describe, expect, it } from 'vitest';
import { coverageProblems, hiddenRowProblems } from './table-coverage.ts';

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

describe('hiddenRowProblems', () => {
  const proof = [{ path: 'supabase/tests/audit_private_rows.test.sql', text: "select * from tests.hidden_everywhere('conversations', id, 'a@test.esta.test');" }];

  it('passes a private table that a test proves hidden', () => {
    expect(hiddenRowProblems(['conversations'], proof)).toEqual([]);
  });

  it('fails a private table with no call, even when another table shares its prefix', () => {
    expect(hiddenRowProblems(['conversation', 'agent_items'], proof)).toEqual([
      "public.conversation limits who may read its rows, and no pgTAP file calls tests.hidden_everywhere('conversation', ...)",
      "public.agent_items limits who may read its rows, and no pgTAP file calls tests.hidden_everywhere('agent_items', ...)",
    ]);
  });
});
