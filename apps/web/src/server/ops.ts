import 'server-only';
import type { OpContext } from '@esta/ops';
import { readRequestClock } from '@/server/clock';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

/** The one place the web builds an op context: the member's cookie session, the household it opens, the request clock. */
export async function webOpContext(): Promise<OpContext> {
  const [member, db, clock] = await Promise.all([requireMember(), createSessionClient(), readRequestClock()]);
  return { db, householdId: member.household.id, clock };
}
