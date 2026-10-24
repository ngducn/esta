'use server';

import type { Result } from '@esta/core/result';
import { agentItemSetStatus, runOp } from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getClock } from '@/server/clock';
import { getSessionUser, requireMember } from '@/server/member';
import { webOpContext } from '@/server/ops';
import { createSessionClient } from '@/server/supabase/server';

/** Queues one ping through the session client; RLS accepts it only from an operator, for themself (P0-15). */
export async function runConnectionCheck(): Promise<void> {
  const [member, user, clock, supabase] = await Promise.all([requireMember(), getSessionUser(), getClock(), createSessionClient()]);
  if (!member.isOperator || user === null) redirect('/assistant');
  const { error } = await supabase
    .from('agent_jobs')
    .insert({ household_id: member.household.id, kind: 'ping', run_after: clock.now(), requested_by: user.id });
  if (error) redirect('/assistant?check=failed');
  revalidatePath('/assistant');
}

/** Marks an inbox note read, hides it, or puts it back for `Hoàn tác`. */
export async function setNoteStatus(raw: unknown): Promise<Result<undefined, { readonly kind: 'failed' }>> {
  const saved = await runOp(agentItemSetStatus, await webOpContext(), raw);
  if (!saved.ok) return { ok: false, reason: { kind: 'failed' } };
  revalidatePath('/assistant');
  return { ok: true, value: undefined };
}
