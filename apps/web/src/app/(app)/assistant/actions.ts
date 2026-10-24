'use server';

import type { Result } from '@esta/core/result';
import { agentItemSetStatus, runOp } from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getClock } from '@/server/clock';
import { getSessionUser, requireMember } from '@/server/member';
import { webOpContext } from '@/server/ops';
import { createSessionClient } from '@/server/supabase/server';

/** Queues one job through the session client; RLS accepts a ping or a watch run only from an operator, for themself. */
async function queueJob(kind: 'ping' | 'portfolio_watch', failedParam: string): Promise<void> {
  const [member, user, clock, supabase] = await Promise.all([requireMember(), getSessionUser(), getClock(), createSessionClient()]);
  if (!member.isOperator || user === null) redirect('/assistant');
  const { error } = await supabase.from('agent_jobs').insert({ household_id: member.household.id, kind, run_after: clock.now(), requested_by: user.id });
  if (error) redirect(`/assistant?${failedParam}=failed`);
  revalidatePath('/assistant');
}

export async function runConnectionCheck(): Promise<void> {
  await queueJob('ping', 'check');
}

/** Runs the morning watch now; the notes it writes meet the day's dedupe keys, so a second run adds none (AGENT.md §5.3). */
export async function runWatch(): Promise<void> {
  await queueJob('portfolio_watch', 'watch');
}

export async function setNoteStatus(raw: unknown): Promise<Result<undefined, { readonly kind: 'failed' }>> {
  const saved = await runOp(agentItemSetStatus, await webOpContext(), raw);
  if (!saved.ok) return { ok: false, reason: { kind: 'failed' } };
  revalidatePath('/assistant');
  return { ok: true, value: undefined };
}
