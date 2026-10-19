import 'server-only';
import { z } from 'zod';
import { readRequestClock } from '@/server/clock';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

/**
 * Soft delete (SPEC §5): stamps `deleted_at` from the request Clock, or clears it to restore, on one row of the member's
 * household. The row stays, so `Hoàn tác` brings it back. The row's id, or null when the id does not parse or RLS let
 * the member change no such row.
 */
export async function setDeletedAt(table: 'documents' | 'expenses' | 'properties', rowId: unknown, deleted: boolean): Promise<string | null> {
  const id = z.uuid().safeParse(rowId);
  if (!id.success) return null;
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const { data, error } = await supabase
    .from(table)
    .update({ deleted_at: deleted ? (await readRequestClock()).now() : null })
    .eq('household_id', member.household.id)
    .eq('id', id.data)
    .select('id');
  return error || data.length !== 1 ? null : id.data;
}
