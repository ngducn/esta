import { join } from 'node:path';
import { businessDate, parseInstant, type Instant } from '../packages/core/src/index.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

const USAGE = 'Usage: pnpm clock:set <iso date-time with offset> | off [--lane <n> | --household <uuid>]';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

export type ClockSetCheck = { target: Instant | 'off'; household: string | null } | { exitCode: 1 | 2; message: string };

/** No flag is the global row, which the agent worker and the cron routes read; a lane or household moves only that household's date. */
function parseScope(flag: string | undefined, value: string | undefined): string | null | undefined {
  if (flag === undefined) return null;
  if (flag === '--lane' && /^(10|[1-9])$/.test(value ?? '')) return seedId(`seed:household:lane-${value}`);
  if (flag === '--household' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value ?? '')) return value;
  return undefined;
}

export function checkClockSet(arg: string | undefined, supabaseUrl: string | undefined, flag?: string, value?: string): ClockSetCheck {
  if (arg === undefined) return { exitCode: 2, message: USAGE };
  const household = parseScope(flag, value);
  if (household === undefined) return { exitCode: 2, message: USAGE };
  let target: Instant | 'off';
  try {
    target = arg === 'off' ? arg : parseInstant(arg);
  } catch (error) {
    return { exitCode: 2, message: `${error instanceof Error ? error.message : String(error)}\n${USAGE}` };
  }
  const host = URL.parse(supabaseUrl ?? '')?.hostname;
  if (host === undefined || !LOCAL_HOSTS.has(host)) {
    return {
      exitCode: 1,
      message: `Refusing to write test_clock on ${host ?? supabaseUrl}: SUPABASE_URL must point at a local stack`,
    };
  }
  return { target, household };
}

async function send(response: Promise<Response>): Promise<void> {
  const result = await response;
  if (!result.ok) {
    console.error(`test_clock write failed: ${result.status} ${await result.text()}`);
    process.exit(1);
  }
}

if (import.meta.main) {
  const repoRoot = join(import.meta.dirname, '..');
  const slot = parseSlot(process.env.ESTA_SLOT);
  const check = checkClockSet(process.argv[2], slotEnv(repoRoot, slot, { withKeys: false }).SUPABASE_URL, process.argv[3], process.argv[4]);
  if ('exitCode' in check) {
    console.error(check.message);
    process.exit(check.exitCode);
  }
  const env = slotEnv(repoRoot, slot);
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

  const scope = check.household === null ? 'for_household=is.null' : `for_household=eq.${check.household}`;
  const where = check.household === null ? 'the global row' : `household ${check.household}`;
  await send(fetch(`${table}?${scope}`, { method: 'DELETE', headers }));
  if (check.target === 'off') {
    console.log(`Test clock off for ${where}`);
  } else {
    await send(fetch(table, { method: 'POST', headers, body: JSON.stringify({ for_household: check.household, frozen_now: check.target }) }));
    const timezone = env.ESTA_TIMEZONE || 'Asia/Ho_Chi_Minh';
    console.log(`Test clock for ${where}: ${check.target} (business date ${businessDate(check.target, timezone)})`);
  }
}
