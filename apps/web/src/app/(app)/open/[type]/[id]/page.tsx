import { notFound, redirect } from 'next/navigation';
import { openLinkTarget } from '@/server/agent/open-link';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

/** Opens an `esta://{type}/{id}` link from an assistant note on the record's own screen: a tenant's latest lease, an owner's tax card. */
export default async function OpenAssistantLink({ params }: { params: Promise<{ type: string; id: string }> }) {
  const [{ type, id }] = await Promise.all([params, requireMember()]);
  const target = await openLinkTarget(await createSessionClient(), `${type}/${id}`);
  if (target === null) notFound();
  redirect(target);
}
