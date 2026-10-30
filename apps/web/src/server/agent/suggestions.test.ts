import { OPEN_NOTE_STATUSES, SUGGESTION_WINDOW } from '@esta/core/assistant';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/server/supabase/server', () => ({ createSessionClient: async () => ({ from }) }));

type Row = Record<string, unknown>;
const HOUSEHOLD = '0943e55d-b0a6-5aef-839d-07c8693c520e';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const db = vi.hoisted(() => ({ notes: [] as Row[], invoices: [] as Row[], cap: 1000, statuses: [] as unknown[], lookups: [] as Array<{ table: string; ids: string[] }> }));

/** A PostgREST builder that reads `db`, sorts as `.order` says and cuts the read at `db.cap` rows, as PostgREST's max_rows does. */
function from(table: 'agent_items' | 'invoices' | 'leases' | 'units') {
  let rows = table === 'agent_items' ? [...db.notes] : table === 'invoices' ? [...db.invoices] : [];
  const orders: Array<[string, boolean]> = [];
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: (field: string, values: string[]) => {
      if (table === 'agent_items') db.statuses = values;
      else db.lookups.push({ table, ids: values });
      rows = rows.filter((row) => values.includes(String(row[field])));
      return builder;
    },
    order: (field: string, { ascending }: { ascending: boolean }) => (orders.push([field, ascending]), builder),
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) => {
      const sorted = rows.toSorted((a, b) => {
        for (const [field, ascending] of orders) {
          const [left, right] = [String(a[field]), String(b[field])];
          if (left !== right) return (left < right ? -1 : 1) * (ascending ? 1 : -1);
        }
        return 0;
      });
      return Promise.resolve({ data: sorted.slice(0, db.cap), error: null }).then(resolve);
    },
  };
  return builder;
}

const { loadSuggestions } = await import('./suggestions');

const place = (unit: string, property: string) => `${unit}, ${property}`;
const lease = (n: number) => ({ tenant: { full_name: `Khách ${n} Demo` }, unit: { label: `Phòng ${n}`, kind: 'room', property: { nickname: 'Dãy trọ Dĩ An' } } });

/** One late-invoice note per number, the higher number written later. */
function lateInvoices(count: number) {
  db.notes = Array.from({ length: count }, (_, n) => ({
    id: uuid(n + 1),
    kind: 'alert',
    severity: 'action',
    status: 'new',
    created_at: `2026-10-07T06:45:${String(n).padStart(2, '0')}.000000+00:00`,
    related: { facts: [{ rule_id: 'W1', subject_key: `invoice:${uuid(1000 + n)}` }], links: [] },
  }));
  db.invoices = Array.from({ length: count }, (_, n) => ({ id: uuid(1000 + n), lease: lease(n) }));
}

const askedInvoices = () => db.lookups.filter(({ table }) => table === 'invoices').flatMap(({ ids }) => ids);

describe('loadSuggestions', () => {
  beforeEach(() => {
    db.notes = [];
    db.invoices = [];
    db.cap = 1000;
    db.statuses = [];
    db.lookups = [];
  });

  it('reads the labels of the notes that lead, once for each kind of record, not of every open note', async () => {
    lateInvoices(30);
    const replies = await loadSuggestions(HOUSEHOLD, place);
    const newest = Array.from({ length: SUGGESTION_WINDOW }, (_, i) => uuid(1000 + 29 - i));
    expect(askedInvoices().toSorted()).toEqual(newest.toSorted());
    expect(db.lookups.map(({ table }) => table).toSorted()).toEqual(['invoices', 'leases', 'units']);
    expect(db.statuses).toEqual([...OPEN_NOTE_STATUSES]);
    expect(replies.map(({ noteId, key, params }) => [noteId, key, params.tenant])).toEqual([
      [uuid(30), 'remindTenant', 'Khách 29 Demo'],
      [uuid(30), 'tenantLateCount', 'Khách 29 Demo'],
      [uuid(29), 'remindTenant', 'Khách 28 Demo'],
    ]);
  });

  it('keeps the newest notes when the read is cut at the row cap, so the same notes lead each time', async () => {
    lateInvoices(30);
    db.cap = 4;
    await loadSuggestions(HOUSEHOLD, place);
    expect(askedInvoices().toSorted()).toEqual([26, 27, 28, 29].map((n) => uuid(1000 + n)));
  });

  it('offers no reply for a note whose record the member cannot read, and does not stop at it', async () => {
    lateInvoices(3);
    db.invoices = db.invoices.filter((row) => row.id !== uuid(1002));
    const replies = await loadSuggestions(HOUSEHOLD, place);
    expect(replies.map(({ noteId }) => noteId)).toEqual([uuid(2), uuid(2), uuid(1)]);
  });
});
