import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { completenessFactsRowSchema, COMPLETENESS_FACT_COLUMNS } from '../packages/core/src/completeness/index.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { PROPERTY_SEEDS } from '../supabase/seed/generator/properties.ts';
import { query } from './db-checksum.ts';
import { parseSlot, slotWorkdir } from './slot.ts';

const repoRoot = join(import.meta.dirname, '..');
const target = join(repoRoot, 'packages/core/src/completeness/seed-facts.fixture.ts');

const slot = parseSlot(process.env.ESTA_SLOT);
const household = seedId('seed:household:lane-1');
// `supabase db query` prints a uuid as its bytes, so each row comes back as JSON text.
const rows = query<{ row: string }>(
  slotWorkdir(repoRoot, slot),
  `select json_build_object(${COMPLETENESS_FACT_COLUMNS.split(', ').map((column) => `'${column}', ${column}`).join(', ')})::text as row
   from public.property_completeness_facts where household_id = '${household}' order by property_id`,
);
const facts = new Map(rows.map(({ row }) => completenessFactsRowSchema.parse(JSON.parse(row))).map((row) => [row.propertyId, row]));

const entries = PROPERTY_SEEDS.map(({ key }) => {
  const row = facts.get(seedId(`seed:property:lane-1:${key}`));
  if (row === undefined) throw new Error(`ESTA_SLOT=${slot}: no facts row for ${key} in Gia đình Demo 1; reset the slot first`);
  return `  ${JSON.stringify(key)}: ${JSON.stringify(row)},`;
});
if (facts.size !== entries.length) throw new Error(`Gia đình Demo 1 has ${facts.size} facts rows, expected ${entries.length}`);

writeFileSync(
  target,
  [
    '// Written by `pnpm exec tsx scripts/completeness-fixture.ts` from a slot reset with the full seed. Do not edit by hand.',
    "import type { CompletenessFacts } from './types';",
    '',
    `/** The seven \`Gia đình Demo 1\` properties' rows of \`property_completeness_facts\`, by seed key. */`,
    'export const SEED_FACTS = {',
    ...entries,
    '} as const satisfies Record<string, CompletenessFacts>;',
    '',
  ].join('\n'),
);
console.log(`Wrote ${entries.length} rows to ${target}`);
