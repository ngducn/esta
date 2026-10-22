'use server';

import { batchUndo, runOp, type UndoBlocker } from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { webOpContext } from '@/server/ops';

export type UndoState =
  | { readonly status: 'undone' }
  | { readonly status: 'refused'; readonly blockers: readonly Pick<UndoBlocker, 'reason' | 'flow'>[] }
  | { readonly status: 'already_undone' }
  | { readonly status: 'failed' }
  | null;

export async function undoBatch(_previous: UndoState, batchId: string): Promise<UndoState> {
  const result = await runOp(batchUndo, await webOpContext(), { batch_id: batchId });
  if (result.ok) {
    revalidatePath('/', 'layout');
    return { status: 'undone' };
  }
  if (result.reason.kind === 'not_undoable') return { status: 'already_undone' };
  if (result.reason.kind !== 'undo_blocked') return { status: 'failed' };
  const byReason = new Map(result.reason.blockers.map(({ reason, flow }) => [reason, { reason, flow }]));
  return { status: 'refused', blockers: [...byReason.values()] };
}
