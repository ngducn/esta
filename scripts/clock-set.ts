import { join } from 'node:path';
import { businessDate, parseInstant, type Instant } from '../packages/core/src/index.ts';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

const USAGE = 'Usage: pnpm clock:set <iso date-time with offset> | off';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

function usageExit(message?: string): never {
  if (message !== undefined) console.error(message);
  console.error(USAGE);
  process.exit(2);
}

function parseArg(arg: string | undefined): Instant | 'off' {
  if (arg === undefined) usageExit();
  if (arg === 'off') return arg;
  try {
    return parseInstant(arg);
  } catch (error) {
    usageExit(error instanceof Error ? error.message : String(error));
  }
}

const target = parseArg(process.argv[2]);

const env = slotEnv(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT));
const host = URL.parse(env.SUPABASE_URL ?? '')?.hostname;
if (host === undefined || !LOCAL_HOSTS.has(host)) {
  console.error(`Refusing to write test_clock on ${host ?? env.SUPABASE_URL}: SUPABASE_URL must point at a local stack`);
  process.exit(1);
}
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

if (target === 'off') {
  await send(fetch(`${table}?id=eq.true`, { method: 'DELETE', headers }));
  console.log('Test clock off');
} else {
  await send(
    fetch(table, {
      method: 'POST',
      headers: { ...headers, prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: true, frozen_now: target }),
    }),
  );
  const timezone = env.ESTA_TIMEZONE || 'Asia/Ho_Chi_Minh';
  console.log(`Test clock: ${target} (business date ${businessDate(target, timezone)})`);
}
