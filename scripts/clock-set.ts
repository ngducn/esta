import { join } from 'node:path';
import { businessDate, parseInstant } from '../packages/core/src/index.ts';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

const arg = process.argv[2];
if (arg === undefined) {
  console.error('Usage: pnpm clock:set <iso date-time with offset> | off');
  process.exit(2);
}

const env = slotEnv(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT));
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is unknown: start the slot with pnpm db:start or export it');
  process.exit(1);
}

const headers = {
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
  'content-type': 'application/json',
  'x-esta-actor': 'system:clock-set',
};
const table = `${env.SUPABASE_URL}/rest/v1/test_clock`;

async function send(response: Promise<Response>): Promise<void> {
  const result = await response;
  if (!result.ok) {
    console.error(`test_clock write failed: ${result.status} ${await result.text()}`);
    process.exit(1);
  }
}

if (arg === 'off') {
  await send(fetch(`${table}?id=eq.true`, { method: 'DELETE', headers }));
  console.log('Test clock off');
} else {
  const frozenNow = parseInstant(arg);
  await send(
    fetch(table, {
      method: 'POST',
      headers: { ...headers, prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: true, frozen_now: frozenNow }),
    }),
  );
  const timezone = env.ESTA_TIMEZONE || 'Asia/Ho_Chi_Minh';
  console.log(`Test clock: ${frozenNow} (business date ${businessDate(frozenNow, timezone)})`);
}
