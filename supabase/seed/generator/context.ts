import type { Instant, IsoDate } from '../../../packages/core/src/index.ts';
import type { Database, TablesInsert } from '../../../packages/db/src/index.ts';
import type { SeedId } from './ids.ts';
import type { PropertySeed } from './properties.ts';
import type { SqlRow } from './sql.ts';

export type HouseholdKey = 'demo' | `lane-${number}`;

export type HouseholdSeed = {
  readonly key: HouseholdKey;
  readonly name: string;
  readonly emailSuffix: string;
};

export type SeedContext = {
  readonly household: HouseholdSeed;
  /** The variant's properties; rows that hang off a property iterate these, never PROPERTY_SEEDS. */
  readonly properties: readonly PropertySeed[];
  readonly asOf: Instant;
  readonly today: IsoDate;
};

/** `upsert` renders `on conflict (id) do update`, for rows a trigger already inserted, such as each property's `whole` unit. */
export type Emitter = { readonly table: string; readonly upsert?: boolean; rows(ctx: SeedContext): readonly SqlRow[] };

type PublicTable = keyof Database['public']['Tables'];
type Generated = 'id' | 'created_by' | 'created_at' | 'updated_at';
type Insert<T extends PublicTable> = Omit<TablesInsert<T>, Generated>;

// The generated types say `unknown` for PostGIS columns; the seed writes them as EWKT text.
export type SeedRow<T extends PublicTable> = { [K in keyof Insert<T>]: unknown extends Insert<T>[K] ? string : Insert<T>[K] } & {
  id: SeedId;
};

// Rows built in a `.map` callback skip excess property checks, so a misspelled optional column would pass silently.
type NoExtraColumns<R, Shape> = R & Record<Exclude<keyof R, keyof Shape>, never>;

export function publicTable<T extends PublicTable, R extends SeedRow<T>>(
  table: T,
  rows: (ctx: SeedContext) => readonly NoExtraColumns<R, SeedRow<T>>[],
  options: { readonly upsert?: boolean } = {},
): Emitter {
  return { table: `public.${table}`, rows, ...(options.upsert === true ? { upsert: true } : {}) };
}
