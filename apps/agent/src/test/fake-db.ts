import type { AgentDb } from '../supabase';

type Row = Record<string, unknown>;

export type Recorded = { table: string; op: 'upsert' | 'insert' | 'update' | 'delete'; row: Row };

type Filter = (row: Row) => boolean;

/**
 * An in-memory stand-in for the service client: filters, single reads, updates that mutate the rows in place, upserts
 * that honour `onConflict` with `ignoreDuplicates`, and Storage downloads from `files`.
 */
export function fakeDb(tables: Record<string, Row[]>, writes: Recorded[] = [], files: Record<string, Uint8Array> = {}): AgentDb {
  const from = (table: string) => {
    const all = (tables[table] ??= []);
    const filters: Filter[] = [];
    let head = false;
    let patch: Row | null = null;
    const matching = () => all.filter((row) => filters.every((filter) => filter(row)));
    const run = () => {
      const rows = matching();
      if (patch !== null) {
        for (const row of rows) Object.assign(row, patch);
        writes.push({ table, op: 'update', row: patch });
      }
      return rows;
    };
    const builder = {
      select(_columns?: string, options?: { head?: boolean }) {
        head = options?.head ?? false;
        return builder;
      },
      update(values: Row) {
        patch = values;
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      in(column: string, values: readonly unknown[]) {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      is(column: string, value: unknown) {
        filters.push((row) => (row[column] ?? null) === value);
        return builder;
      },
      single: async () => {
        const rows = run();
        return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: `${rows.length} rows` } };
      },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      upsert: async (row: Row, options?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        const keys = options?.onConflict?.split(',') ?? ['id'];
        const existing = all.find((other) => keys.every((key) => other[key] === row[key]));
        writes.push({ table, op: 'upsert', row });
        if (existing === undefined) all.push({ ...row });
        else if (options?.ignoreDuplicates !== true) Object.assign(existing, row);
        return { error: null };
      },
      delete: () => ({
        lt: async (column: string, value: unknown) => {
          writes.push({ table, op: 'delete', row: { [column]: { lt: value } } });
          return { error: null };
        },
      }),
      then<T>(resolve: (value: { data: Row[] | null; count: number; error: null }) => T) {
        const rows = run();
        return Promise.resolve({ data: head ? null : rows, count: rows.length, error: null }).then(resolve);
      },
    };
    return builder;
  };
  const storage = {
    from: (bucket: string) => ({
      download: async (path: string) => {
        const bytes = files[`${bucket}/${path}`];
        return bytes === undefined ? { data: null, error: { message: `${path} not found` } } : { data: new Blob([bytes]), error: null };
      },
    }),
  };
  return { from, storage } as unknown as AgentDb;
}
