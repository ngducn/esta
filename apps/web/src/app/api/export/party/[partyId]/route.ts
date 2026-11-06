import { writePartyExport } from '@esta/db/export';
import { idSchema } from '@esta/ops';
import { readRequestClock } from '@/server/clock';
import { refuseExport, storeExport } from '@/server/export/store-export';
import { getCurrentMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ partyId: string }> }) {
  const member = await getCurrentMember();
  if (member === null) return refuseExport(401);
  if (!member.can('export')) return refuseExport(403);
  const partyId = idSchema.safeParse((await params).partyId);
  if (!partyId.success) return refuseExport(404);

  const { data } = await (await createSessionClient()).from('parties').select('id').eq('household_id', member.household.id).eq('id', partyId.data).maybeSingle();
  if (data === null) return refuseExport(404);

  const clock = await readRequestClock();
  return storeExport(member, (sink, supabase) => writePartyExport(supabase, member.household.id, partyId.data, sink, { clock }));
}
