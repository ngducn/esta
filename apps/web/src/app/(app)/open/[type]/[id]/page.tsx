import { parseEstaUri, type EstaRoute } from '@esta/core/links';
import { notFound, redirect } from 'next/navigation';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

type Session = Awaited<ReturnType<typeof createSessionClient>>;

async function propertyOf(supabase: Session, table: 'leases' | 'units' | 'meters', id: string): Promise<string> {
  const { data, error } = await supabase.from(table).select('property_id').eq('id', id).maybeSingle();
  if (error) throw new Error(`Opening the assistant's link failed: ${error.message}`);
  if (data === null) notFound();
  return data.property_id;
}

async function screenOf(supabase: Session, { type, id }: EstaRoute): Promise<string> {
  switch (type) {
    case 'invoice':
      return `/collections/invoices/${id}`;
    case 'document':
      return `/documents/${id}`;
    case 'property':
      return `/properties/${id}`;
    case 'ledger':
      return `/properties/${id}/finance`;
    case 'legal':
      return `/properties/${id}/legal`;
    case 'lease':
      return `/properties/${await propertyOf(supabase, 'leases', id)}/rental/leases/${id}`;
    case 'unit':
      return `/properties/${await propertyOf(supabase, 'units', id)}/rental`;
    case 'meter':
      return `/properties/${await propertyOf(supabase, 'meters', id)}/rental/meters`;
    case 'party': {
      const { data, error } = await supabase.from('leases').select('id, property_id').eq('tenant_party_id', id).order('start_date', { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(`Opening the assistant's link failed: ${error.message}`);
      return data === null ? '/reports/tax' : `/properties/${data.property_id}/rental/leases/${data.id}`;
    }
  }
}

/** Opens an `esta://{type}/{id}` link from an assistant note on the record's own screen: a tenant's latest lease, an owner's tax card. */
export default async function OpenAssistantLink({ params }: { params: Promise<{ type: string; id: string }> }) {
  const [{ type, id }] = await Promise.all([params, requireMember()]);
  const route = parseEstaUri(`esta://${type}/${id}`);
  if (!route.ok) notFound();
  redirect(await screenOf(await createSessionClient(), route.value));
}
