'use server';

import type { Result } from '@esta/core/result';
import { partyRedact, runOp } from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { webOpContext } from '@/server/ops';

export type ErasePersonRefusal = 'active_lease' | 'draft_lease' | 'deposit_held' | 'files_left' | 'not_tenant' | 'failed';
export type ErasePersonResult = Result<true, ErasePersonRefusal>;

export async function erasePerson(partyId: unknown): Promise<ErasePersonResult> {
  const result = await runOp(partyRedact, await webOpContext(), { id: partyId });
  if (result.ok) {
    revalidatePath('/', 'layout');
    return { ok: true, value: true };
  }
  const { kind } = result.reason;
  if (kind === 'files_left') revalidatePath('/', 'layout');
  return { ok: false, reason: kind === 'active_lease' || kind === 'draft_lease' || kind === 'deposit_held' || kind === 'files_left' || kind === 'not_tenant' ? kind : 'failed' };
}
