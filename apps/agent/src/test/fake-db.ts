import type { AgentDb } from '../supabase';

type Row = Record<string, unknown>;

export type Recorded = { table: string; op: 'upsert' | 'insert'; row: Row };

/** Just enough of the supabase-js builder for the worker's reads: select, eq, is, single, maybeSingle, head counts. */
export function fakeDb(tables: Record<string, Row[]>, writes: Recorded[] = []): AgentDb {
  const from = (table: string) => {
    let rows = tables[table] ?? [];
    let head = false;
    const builder = {
      select(_columns: string, options?: { head?: boolean }) {
        head = options?.head ?? false;
        return builder;
      },
      eq(column: string, value: unknown) {
        rows = rows.filter((row) => row[column] === value);
        return builder;
      },
      is(column: string, value: unknown) {
        rows = rows.filter((row) => (row[column] ?? null) === value);
        return builder;
      },
      single: async () => (rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: `${rows.length} rows` } }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      upsert: async (row: Row) => {
        writes.push({ table, op: 'upsert', row });
        return { error: null };
      },
      then<T>(resolve: (value: { data: Row[] | null; count: number; error: null }) => T) {
        return Promise.resolve({ data: head ? null : rows, count: rows.length, error: null }).then(resolve);
      },
    };
    return builder;
  };
  return { from } as unknown as AgentDb;
}
