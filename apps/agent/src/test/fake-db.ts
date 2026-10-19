import type { AgentDb } from '../supabase';

type Row = Record<string, unknown>;

export type Recorded = { table: string; op: 'upsert' | 'insert' | 'update' | 'delete'; row: Row };

type Filter = (row: Row) => boolean;

/**
 * An in-memory stand-in for the service client: filters, single reads, updates that mutate the rows in place, upserts
 * that honour `onConflict` with `ignoreDuplicates`, and Storage downloads from `files`. A write to a table named in
 * `refuse` answers that table's error message and changes nothing, as RLS or a lost connection would.
 */
export function fakeDb(tables: Record<string, Row[]>, writes: Recorded[] = [], files: Record<string, Uint8Array> = {}, refuse: Record<string, string> = {}): AgentDb {
  const from = (table: string) => {
    const all = (tables[table] ??= []);
    const refusal = refuse[table] === undefined ? null : { message: refuse[table] };
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
      insert: async (row: Row) => {
        if (refusal !== null) return { error: refusal };
        writes.push({ table, op: 'insert', row });
        all.push({ ...row });
        return { error: null };
      },
      upsert: async (row: Row, options?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        if (refusal !== null) return { error: refusal };
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
      then<T>(resolve: (value: { data: Row[] | null; count: number | null; error: { message: string } | null }) => T) {
        if (patch !== null && refusal !== null) return Promise.resolve({ data: null, count: null, error: refusal }).then(resolve);
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
