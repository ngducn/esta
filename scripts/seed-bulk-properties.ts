import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

const USAGE = 'Usage: pnpm tsx scripts/seed-bulk-properties.ts --household <lane n> --count <1 to 9999>';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);
const KINDS = ['townhouse', 'apartment', 'rooming_house', 'commercial_space', 'residential_land'] as const;

export function bulkProperties(lane: number, count: number) {
  const household = `lane-${lane}`;
  return Array.from({ length: count }, (_, index) => {
    const n = String(index + 1).padStart(4, '0');
    return {
      id: seedId(`seed:bulk-property:${household}:${n}`),
      household_id: seedId(`seed:household:${household}`),
      nickname: `Tài sản Demo ${n}`,
      code: `DEMO${n}`,
      kind: KINDS[index % KINDS.length],
      use_mode: 'held',
      legal_status: 'unknown',
    };
  });
}

async function run(): Promise<void> {
  const { values } = parseArgs({ options: { household: { type: 'string' }, count: { type: 'string' } }, strict: true });
  const lane = Number(values.household);
  const count = Number(values.count);
  if (!Number.isInteger(lane) || lane < 1 || !Number.isInteger(count) || count < 1 || count > 9999) throw new Error(USAGE);

  const env = slotEnv(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT));
  const host = URL.parse(env.SUPABASE_URL ?? '')?.hostname;
  if (host === undefined || !LOCAL_HOSTS.has(host)) throw new Error(`seed-bulk-properties writes only to a local stack, not ${host}`);
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is unknown: start the slot with pnpm db:start or export it');

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/properties?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      prefer: 'resolution=ignore-duplicates,return=minimal',
      'x-esta-actor': 'system:seed-bulk-properties',
    },
    body: JSON.stringify(bulkProperties(lane, count)),
  });
  if (!response.ok) throw new Error(`seed-bulk-properties failed: ${response.status} ${await response.text()}`);
  console.log(`seed-bulk-properties: ${count} properties in lane ${lane}`);
}

if (import.meta.main) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
