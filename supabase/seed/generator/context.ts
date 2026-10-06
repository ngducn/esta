import type { Instant, IsoDate } from '../../../packages/core/src/index.ts';
import type { Database, TablesInsert } from '../../../packages/db/src/index.ts';
import type { SeedId } from './ids.ts';
import type { Rng } from './rng.ts';
import type { SqlRow } from './sql.ts';
import type { Variant } from './variants.ts';

/** `demo` is `Gia đình Demo`; `lane-<n>` is `Gia đình Demo <n>`. Seed keys embed it (supabase/seed/README.md). */
export type HouseholdKey = 'demo' | `lane-${number}`;

export type HouseholdSeed = {
  readonly key: HouseholdKey;
  readonly name: string;
  readonly emailSuffix: string;
};

export type SeedContext = {
  readonly household: HouseholdSeed;
  readonly variant: Variant;
  readonly asOf: Instant;
  readonly today: IsoDate;
  /** A stream keyed by `scope` alone, so every household draws the same values and adding a table shifts none. */
  rng(scope: string): Rng;
};

/** Rows of one table for one household, in a stable order. */
export type Emitter = { readonly table: string; rows(ctx: SeedContext): readonly SqlRow[] };

type PublicTable = keyof Database['public']['Tables'];
type Generated = 'id' | 'created_by' | 'created_at' | 'updated_at';
type Insert<T extends PublicTable> = Omit<TablesInsert<T>, Generated>;

// The generated types say `unknown` for PostGIS columns; the seed writes them as EWKT text.
export type SeedRow<T extends PublicTable> = { [K in keyof Insert<T>]: unknown extends Insert<T>[K] ? string : Insert<T>[K] } & {
  id: SeedId;
};

export function publicTable<T extends PublicTable>(table: T, rows: (ctx: SeedContext) => SeedRow<T>[]): Emitter {
  return { table: `public.${table}`, rows };
}
