'use server';

import type { Result } from '@esta/core/result';
import { agentItemSetStatus, agentJobRetry, askQuestion, proposalApprove, runOp, taskSetStatus, type Asked, type ProposalDecided } from '@esta/ops';
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
  if (error) redirect(`/assistant/diagnostics?${failedParam}=failed`);
  revalidatePath('/assistant/diagnostics');
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

/** Đồng ý: the proposal's effect lands as the member, once; a second tap answers what the first decided (AGT-6). */
export async function approveProposal(raw: unknown): Promise<Result<ProposalDecided['status'], { readonly kind: 'failed' }>> {
  const decided = await runOp(proposalApprove, await webOpContext(), raw);
  if (!decided.ok) return { ok: false, reason: { kind: 'failed' } };
  revalidatePath('/assistant');
  revalidatePath('/');
  return { ok: true, value: decided.value.status };
}

export async function setTaskStatus(raw: unknown): Promise<Result<undefined, { readonly kind: 'failed' }>> {
  const saved = await runOp(taskSetStatus, await webOpContext(), raw);
  if (!saved.ok) return { ok: false, reason: { kind: 'failed' } };
  revalidatePath('/assistant');
  revalidatePath('/');
  return { ok: true, value: undefined };
}

/** Thử lại on a failed job's item: an admin queues the job again, once however often it is tapped (AGENT.md §9). */
export async function retryJob(raw: unknown): Promise<Result<undefined, { readonly kind: 'failed' }>> {
  const queued = await runOp(agentJobRetry, await webOpContext(), raw);
  if (!queued.ok) return { ok: false, reason: { kind: 'failed' } };
  revalidatePath('/assistant');
  return { ok: true, value: undefined };
}

/** One message in the member's thread; `ask_in_thread` picks its conversation and its time (P5-12). */
export async function sendQuestion(raw: unknown): Promise<Result<Asked, 'invalid' | 'busy' | 'failed'>> {
  const asked = await runOp(askQuestion, await webOpContext(), raw);
  if (!asked.ok) return { ok: false, reason: asked.reason.kind === 'invalid' || asked.reason.kind === 'busy' ? asked.reason.kind : 'failed' };
  return asked;
}
