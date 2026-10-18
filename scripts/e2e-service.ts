import { join } from 'node:path';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

/**
 * Service-role headers for e2e setup and for reading another household's rows in a spec, on the slot's local stack
 * only. Specs import this rather than reading the key, so the key stays inside the scripts/ allowlist.
 */
export function e2eServiceHeaders(): Record<string, string> {
  const env = slotEnv(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT));
  const host = URL.parse(env.SUPABASE_URL ?? '')?.hostname;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error(`e2e service access is for a local stack only, not ${host}`);
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is unknown: start the slot with pnpm db:start');
  return { apikey: key, authorization: `Bearer ${key}`, 'x-esta-actor': 'system:e2e' };
}
