import { describe, expect, it } from 'vitest';
import { coverageProblems, exclusionProblems, hiddenRowProblems } from './table-coverage.ts';

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

  it('keeps dashes inside a dollar-quoted body from starting a comment', () => {
    const dollar = [{ path: 'supabase/tests/a.test.sql', text: 'select $$a -- b$$, leases;' }];
    expect(coverageProblems([{ name: 'leases', rls: true }], dollar)).toEqual([]);
  });

  it('does not let an apostrophe in a tagged dollar-quoted body swallow later text', () => {
    const tagged = [{ path: 'supabase/tests/a.test.sql', text: "select $body$ it's $body$;\n-- leases is only in this comment\nselect 1;" }];
    expect(coverageProblems([{ name: 'leases', rls: true }], tagged)).toEqual(['public.leases is named in no pgTAP file under supabase/tests']);
    const named = [{ path: 'supabase/tests/a.test.sql', text: "select $body$ it's $body$;\nselect 'x', leases;" }];
    expect(coverageProblems([{ name: 'leases', rls: true }], named)).toEqual([]);
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

describe('exclusionProblems', () => {
  const proof = [{ path: 'supabase/tests/a.test.sql', text: `select throws_ok($$ insert ... $$, '23P01', 'conflicting key value violates exclusion constraint "leases_room_one_holder"', 'x');` }];

  it('passes a constraint that a test names beside the 23P01 it expects', () => {
    expect(exclusionProblems(['leases_room_one_holder'], proof)).toEqual([]);
  });

  it('fails a constraint no test names, and one a test names without expecting 23P01', () => {
    expect(exclusionProblems(['invoices_lease_one_bill_per_day'], proof)).toEqual([
      'the exclusion constraint invoices_lease_one_bill_per_day has no pgTAP file that names it and expects 23P01 from the write it forbids',
    ]);
    expect(exclusionProblems(['leases_room_one_holder'], [{ path: 'b.sql', text: 'select "leases_room_one_holder";' }])).toHaveLength(1);
  });
});
