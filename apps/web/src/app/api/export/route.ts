import { writeExport } from '@esta/db/export';
import { readRequestClock } from '@/server/clock';
import { refuseExport, storeExport } from '@/server/export/store-export';
import { getCurrentMember } from '@/server/member';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST() {
  const member = await getCurrentMember();
  if (member === null) return refuseExport(401);
  if (member.role !== 'admin') return refuseExport(403);

  const clock = await readRequestClock();
  return storeExport(member, (sink, supabase) => writeExport(supabase, member.household.id, sink, { clock, exporter: { role: member.role, isOperator: member.isOperator } }));
}
