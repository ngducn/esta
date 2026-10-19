import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { businessDate, parseInstant, type Instant } from '../../../packages/core/src/index.ts';
import type { Emitter } from './context.ts';
import { HOUSEHOLD_EMITTERS, householdSeeds } from './households.ts';
import { documents } from './documents.ts';
import { expenses, vendors } from './expenses.ts';
import { certificates, parcels, structures } from './legal.ts';
import { billingSql, depositEntries, leaseAmendments, leases, tenants } from './leasing.ts';
import { ownershipShares } from './ownership.ts';
import { parties } from './parties.ts';
import { properties, PROPERTY_SEEDS } from './properties.ts';
import { agentJobs, agentRuns } from './agent.ts';
import { renderSeed } from './sql.ts';
import { units } from './units.ts';
import { utilityAccounts } from './utility-accounts.ts';
import { isVariantName, VARIANTS, type VariantName } from './variants.ts';

const EMITTERS: readonly Emitter[] = [
  ...HOUSEHOLD_EMITTERS,
  parties,
  vendors,
  properties,
  certificates,
  parcels,
  structures,
  ownershipShares,
  units,
  utilityAccounts,
  tenants,
  leases,
  leaseAmendments,
  depositEntries,
  documents,
  expenses,
  agentJobs,
  agentRuns,
];

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
  const omitted: readonly string[] = VARIANTS[variant].omitProperties;
  const properties = PROPERTY_SEEDS.filter((seed) => !omitted.includes(seed.key));
  const tables = EMITTERS.map(({ table, upsert, rows }) => ({
    table,
    ...(upsert === true ? { upsert } : {}),
    rows: households.flatMap((household) => rows({ household, properties, asOf, today })),
  }));
  return renderSeed(tables, asOf, billingSql(households, { properties }, asOf));
}

export const USAGE =
  'Usage: tsx supabase/seed/generator/index.ts [--households N] [--as-of <iso with offset>] [--variant full|northstar] [--out <file>]';

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
  const households = values.households ?? String(DEFAULT_OPTIONS.lanes);
  const lanes = Number(households);
  if (!/^\d+$/.test(households) || lanes > MAX_LANES) {
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
