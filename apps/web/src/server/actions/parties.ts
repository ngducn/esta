'use server';

import type { Result } from '@esta/core/result';
import { partyRedact, runOp } from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { webOpContext } from '@/server/ops';

/** `failed` covers a person who is gone, a caller who is not an admin and anything the database could not explain. */
export type ErasePersonRefusal = 'active_lease' | 'deposit_held' | 'files_left' | 'failed';
export type ErasePersonResult = Result<true, ErasePersonRefusal>;

/** Erases a former tenant's personal details (DOMAIN-VN §8); leases, invoices and payments stay, so no total changes. */
export async function erasePerson(partyId: unknown): Promise<ErasePersonResult> {
  const result = await runOp(partyRedact, await webOpContext(), { id: partyId });
  if (result.ok) {
    revalidatePath('/', 'layout');
    return { ok: true, value: true };
  }
  const { kind } = result.reason;
  if (kind === 'files_left') revalidatePath('/', 'layout');
  return { ok: false, reason: kind === 'active_lease' || kind === 'deposit_held' || kind === 'files_left' ? kind : 'failed' };
}
