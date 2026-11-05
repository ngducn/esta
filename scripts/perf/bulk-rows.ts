import { e2eServiceHeaders } from '../e2e-service.ts';
import { parseSlot } from '../slot.ts';
import { slotEnv } from '../slot-env.ts';
import { join } from 'node:path';
import { seedId } from '../../supabase/seed/generator/ids.ts';

const COUNT = 1000;
export const BULK_LANE = 5;

/** Adds 1,000 synthetic Demo properties to lane household 5, keyed by seed keys so a rerun converges. */
export async function addBulkProperties(): Promise<void> {
  const env = slotEnv(join(import.meta.dirname, '..', '..'), parseSlot(process.env.ESTA_SLOT));
  const household = seedId(`seed:household:lane-${BULK_LANE}`);
  const rows = Array.from({ length: COUNT }, (_, index) => {
    const n = String(index + 1).padStart(4, '0');
    return { id: seedId(`seed:property:lane-${BULK_LANE}:bulk-${n}`), household_id: household, nickname: `Demo bulk ${n}`, code: `DB${n}`, kind: 'townhouse', use_mode: 'rental' };
  });
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/properties?on_conflict=id`, {
    method: 'POST',
    headers: { ...e2eServiceHeaders(), 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error(`bulk insert answered ${response.status}: ${await response.text()}`);
  console.log(`lane ${BULK_LANE} has ${COUNT} bulk properties`);
}

if (import.meta.main) await addBulkProperties();
