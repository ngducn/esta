import { isoDate, parseInstant } from '@esta/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { fakeStorage, recordingSink } from './test-support';
import { writePartyExport } from './partyExport';

const HOUSEHOLD = 'h-1';
const clock = { source: 'table', now: () => parseInstant('2026-10-07T02:00:00Z'), today: () => isoDate('2026-10-07') } as const;

type Table = Record<string, unknown>[];

function fakeClient(tables: Record<string, Table>, files: Record<string, string> = {}) {
  const reads: { table: string; column: string; values: readonly string[] }[] = [];
  const client = {
    from: (name: string) => {
      const state: { filters: [string, readonly string[]][]; after?: string; limit: number } = { filters: [], limit: 1000 };
      const query = {
        select: () => query,
        eq: (column: string, value: string) => {
          state.filters.push([column, [value]]);
          return query;
        },
        in: (column: string, values: readonly string[]) => {
          state.filters.push([column, values]);
          reads.push({ table: name, column, values });
          return query;
        },
        gt: (_column: string, value: string) => {
          state.after = value;
          return query;
        },
        order: () => query,
        limit: (n: number) => {
          state.limit = n;
          return query;
        },
        then: (resolve: (value: unknown) => unknown) => {
          const rows = (tables[name] ?? [])
            .filter((row) => state.filters.every(([column, values]) => values.includes(String(row[column]))))
            .filter((row) => state.after === undefined || String(row.id) > state.after)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));
          return resolve({ data: rows.slice(0, state.limit), error: null });
        },
      };
      return query;
    },
    storage: fakeStorage(files),
  };
  return { client: client as unknown as SupabaseClient, reads };
}

const h = { household_id: HOUSEHOLD };
const mine = 'p-mine';
const other = 'p-other';
const world: Record<string, Table> = {
  parties: [
    { id: mine, ...h, full_name: 'Lê Thị Của Tôi Demo' },
    { id: other, ...h, full_name: 'Người Khác Demo' },
  ],
  leases: [
    { id: 'l-mine', ...h, tenant_party_id: mine },
    { id: 'l-other', ...h, tenant_party_id: other },
  ],
  invoices: [
    { id: 'i-mine', ...h, lease_id: 'l-mine' },
    { id: 'i-other', ...h, lease_id: 'l-other' },
  ],
  invoice_lines: [
    { id: 'n-mine', ...h, invoice_id: 'i-mine' },
    { id: 'n-other', ...h, invoice_id: 'i-other' },
  ],
  payments: [
    { id: 'm-mine', ...h, payer_party_id: mine },
    { id: 'm-by-relative', ...h, payer_party_id: null },
    { id: 'm-other', ...h, payer_party_id: other },
  ],
  payment_allocations: [
    { id: 'a-mine', ...h, payment_id: 'm-mine', invoice_id: 'i-mine' },
    { id: 'a-relative', ...h, payment_id: 'm-by-relative', invoice_id: 'i-mine' },
    { id: 'a-other', ...h, payment_id: 'm-other', invoice_id: 'i-other' },
  ],
  deposit_entries: [
    { id: 'd-mine', ...h, lease_id: 'l-mine' },
    { id: 'd-other', ...h, lease_id: 'l-other' },
  ],
  documents: [
    { id: 'doc-card', ...h, party_id: mine, lease_id: null },
    { id: 'doc-contract', ...h, party_id: null, lease_id: 'l-mine' },
    { id: 'doc-other', ...h, party_id: other, lease_id: 'l-other' },
  ],
};
const files = { 'documents/h-1/doc-card/front.jpg': 'card', 'documents/h-1/doc-card/thumb.webp': 'thumb', 'documents/h-1/doc-contract/hd.pdf': 'pdf', 'documents/h-1/doc-other/front.jpg': 'their card' };

const idsIn = (entries: Map<string, string>, table: string) => (JSON.parse(entries.get(`tables/${table}.json`) ?? '[]') as { id: string }[]).map((row) => row.id);

describe('writePartyExport', () => {
  it('writes only the rows linked to the person, in a JSON and a CSV file per table', async () => {
    const { client } = fakeClient(world, files);
    const { sink, entries } = recordingSink();
    await writePartyExport(client, HOUSEHOLD, mine, sink, { clock });
    expect(idsIn(entries, 'parties')).toEqual([mine]);
    expect(idsIn(entries, 'leases')).toEqual(['l-mine']);
    expect(idsIn(entries, 'invoices')).toEqual(['i-mine']);
    expect(idsIn(entries, 'invoice_lines')).toEqual(['n-mine']);
    expect(idsIn(entries, 'payments')).toEqual(['m-by-relative', 'm-mine']);
    expect(idsIn(entries, 'payment_allocations')).toEqual(['a-mine', 'a-relative']);
    expect(idsIn(entries, 'deposit_entries')).toEqual(['d-mine']);
    expect(idsIn(entries, 'documents')).toEqual(['doc-card', 'doc-contract']);
    for (const name of ['parties', 'leases', 'documents']) expect(entries.get(`tables/${name}.csv`)?.startsWith('﻿')).toBe(true);
    expect([...entries.values()].join('\n')).not.toMatch(/Người Khác|p-other|l-other|i-other|doc-other|their card/);
  });

  it('streams each linked document\'s files and reports the documents for the access log', async () => {
    const { client } = fakeClient(world, files);
    const { sink, entries } = recordingSink();
    const written = await writePartyExport(client, HOUSEHOLD, mine, sink, { clock });
    expect([...entries.keys()].filter((path) => path.startsWith('files/')).toSorted()).toEqual([
      'files/documents/h-1/doc-card/front.jpg',
      'files/documents/h-1/doc-card/thumb.webp',
      'files/documents/h-1/doc-contract/hd.pdf',
    ]);
    expect(written.files).toBe(3);
    expect(written.documentIds.toSorted()).toEqual(['doc-card', 'doc-contract']);
  });

  it('writes a manifest with the Clock\'s date and a count per table', async () => {
    const { client } = fakeClient(world, files);
    const { sink, entries } = recordingSink();
    await writePartyExport(client, HOUSEHOLD, mine, sink, { clock });
    expect(JSON.parse(entries.get('manifest.json') ?? '{}')).toMatchObject({
      kind: 'party',
      householdId: HOUSEHOLD,
      partyId: mine,
      exportedAt: '2026-10-07T02:00:00.000Z',
      files: 3,
      parts: ['x.zip'],
      tables: { parties: 1, leases: 1, invoices: 1, invoice_lines: 1, payments: 2, payment_allocations: 2, deposit_entries: 1, documents: 2 },
    });
  });

  it('keeps a long list of ids in short requests', async () => {
    const leases = Array.from({ length: 95 }, (_, i) => ({ id: `l-${String(i).padStart(3, '0')}`, ...h, tenant_party_id: mine }));
    const { client, reads } = fakeClient({ ...world, leases });
    const { sink, entries } = recordingSink();
    await writePartyExport(client, HOUSEHOLD, mine, sink, { clock });
    expect(idsIn(entries, 'leases')).toHaveLength(95);
    expect(Math.max(...reads.filter((read) => read.table === 'deposit_entries').map((read) => read.values.length))).toBeLessThanOrEqual(40);
  });

  it('writes empty files for a person with no leases', async () => {
    const { client } = fakeClient({ parties: [{ id: mine, ...h }] });
    const { sink, entries } = recordingSink();
    await writePartyExport(client, HOUSEHOLD, mine, sink, { clock });
    expect(idsIn(entries, 'parties')).toEqual([mine]);
    expect(JSON.parse(entries.get('tables/leases.json') ?? 'x')).toEqual([]);
  });
});
