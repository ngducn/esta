import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../packages/db/src/index.ts';
import { isoDate, type IsoDate } from '../packages/core/src/date/iso-date.ts';
import type { WatchSnapshot } from '../packages/core/src/watch/index.ts';
import { readWatchSnapshot } from '../packages/ops/src/watch.ts';
import type { HouseholdSeed } from '../supabase/seed/generator/context.ts';
import { DEMO_PASSWORD, householdId, householdSeeds, personEmail } from '../supabase/seed/generator/households.ts';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

const repoRoot = join(import.meta.dirname, '..');
export const WATCH_FIXTURE = join(repoRoot, 'packages/core/src/watch/fixtures/full-2026-10-07.snapshot.json');

/** A seeded household's watch snapshot on the slot's local stack, read as Ryan of that household under RLS. */
export async function slotWatchSnapshot(household: HouseholdSeed, asOf: IsoDate): Promise<WatchSnapshot> {
  const env = slotEnv(repoRoot, parseSlot(process.env.ESTA_SLOT));
  const url = env.SUPABASE_URL ?? '';
  if (!['127.0.0.1', 'localhost'].includes(URL.parse(url)?.hostname ?? '')) throw new Error(`The watch snapshot reads a local stack only, not ${url}`);
  const db = createClient<Database>(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await db.auth.signInWithPassword({ email: personEmail('ryan', household), password: DEMO_PASSWORD });
  if (error) throw new Error(`Signing in to ${url} failed: ${error.message}; reset the slot with pnpm db:reset`);
  return readWatchSnapshot(db, householdId(household), { asOf, timezone: env.ESTA_TIMEZONE ?? 'Asia/Ho_Chi_Minh' });
}

export const watchFixtureText = (snapshot: WatchSnapshot) => `${JSON.stringify(snapshot, null, 2)}\n`;

if (import.meta.main) {
  const [demo] = householdSeeds(0);
  if (demo === undefined) throw new Error('The seed has no demo household');
  writeFileSync(WATCH_FIXTURE, watchFixtureText(await slotWatchSnapshot(demo, isoDate('2026-10-07'))));
  console.log(`Wrote ${WATCH_FIXTURE}`);
}
