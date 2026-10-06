import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { businessDate, parseInstant, type Instant } from '../../../packages/core/src/index.ts';
import type { Emitter } from './context.ts';
import { HOUSEHOLD_EMITTERS, householdSeeds } from './households.ts';
import { parties } from './parties.ts';
import { properties } from './properties.ts';
import { rngFor } from './rng.ts';
import { renderSeed } from './sql.ts';
import { isVariantName, VARIANTS, type VariantName } from './variants.ts';

/** Every seeded table, in foreign key order. A schema PR adds its emitter here. */
const EMITTERS: readonly Emitter[] = [...HOUSEHOLD_EMITTERS, parties, properties];

const TIMEZONE = 'Asia/Ho_Chi_Minh';
const MAX_LANES = 99;

export type GenerateOptions = { readonly lanes: number; readonly asOf: Instant; readonly variant: VariantName };

export const DEFAULT_OPTIONS: GenerateOptions = {
  lanes: 10,
  asOf: parseInstant('2026-10-07T09:00:00+07:00'),
  variant: 'full',
};

export function generate({ lanes, asOf, variant }: GenerateOptions): string {
  const households = householdSeeds(lanes);
  const today = businessDate(asOf, TIMEZONE);
  const tables = EMITTERS.map(({ table, rows }) => ({
    table,
    rows: households.flatMap((household) =>
      rows({ household, variant: VARIANTS[variant], asOf, today, rng: rngFor }),
    ),
  }));
  return renderSeed(tables, asOf);
}

export const USAGE =
  'Usage: tsx supabase/seed/generator/index.ts [--households N] [--as-of <iso with offset>] [--variant full|northstar] [--out <file>]';

/** Parses generator flags; `--households N` is the number of lane households beside `Gia đình Demo`. */
export function parseOptions(args: readonly string[]): GenerateOptions & { readonly out: string | undefined } {
  const { values } = parseArgs({
    args: [...args],
    options: {
      households: { type: 'string' },
      'as-of': { type: 'string' },
      variant: { type: 'string' },
      out: { type: 'string' },
    },
    strict: true,
  });
  const lanes = values.households === undefined ? DEFAULT_OPTIONS.lanes : Number(values.households);
  if (!Number.isInteger(lanes) || lanes < 0 || lanes > MAX_LANES) {
    throw new Error(`--households must be an integer from 0 to ${MAX_LANES}, got "${values.households}"`);
  }
  const variant = values.variant ?? DEFAULT_OPTIONS.variant;
  if (!isVariantName(variant)) {
    throw new Error(`--variant must be one of ${Object.keys(VARIANTS).join(', ')}, got "${variant}"`);
  }
  const asOf = values['as-of'] === undefined ? DEFAULT_OPTIONS.asOf : parseInstant(values['as-of']);
  return { lanes, asOf, variant, out: values.out };
}

if (import.meta.main) {
  let options: ReturnType<typeof parseOptions>;
  try {
    options = parseOptions(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(USAGE);
    process.exit(2);
  }
  const sql = generate(options);
  if (options.out === undefined) {
    process.stdout.write(sql);
  } else {
    mkdirSync(dirname(options.out), { recursive: true });
    writeFileSync(options.out, sql);
  }
}
