import type { Database } from '@esta/db';
import { parseEstaUri, type EstaRoute } from '@esta/core/links';
import type { SupabaseClient } from '@supabase/supabase-js';

type Db = SupabaseClient<Database>;

const failed = (error: { readonly message: string }) => new Error(`Opening the assistant's link failed: ${error.message}`);

async function propertyOf(db: Db, table: 'leases' | 'units' | 'meters', id: string): Promise<string | null> {
  const { data, error } = await db.from(table).select('property_id').eq('id', id).maybeSingle();
  if (error) throw failed(error);
  return data?.property_id ?? null;
}

/**
 * A tenant's lease in force, the active one that started first, so neither a newer draft nor a renewal that has not
 * started wins; else her newest lease; else an owner's tax card. Null for anyone else, such as a bank, or a person of
 * another household.
 */
async function personScreen(db: Db, id: string): Promise<string | null> {
  const [leases, share] = await Promise.all([
    db.from('leases').select('id, property_id, status').eq('tenant_party_id', id).order('start_date', { ascending: false }).order('id'),
    db.from('ownership_shares').select('id').eq('party_id', id).limit(1).maybeSingle(),
  ]);
  if (leases.error) throw failed(leases.error);
  if (share.error) throw failed(share.error);
  const lease = leases.data.findLast((row) => row.status === 'active') ?? leases.data[0];
  if (lease !== undefined) return `/properties/${lease.property_id}/rental/leases/${lease.id}`;
  return share.data === null ? null : '/reports/tax';
}

async function screenOf(db: Db, { type, id }: EstaRoute): Promise<string | null> {
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
    case 'lease': {
      const property = await propertyOf(db, 'leases', id);
      return property === null ? null : `/properties/${property}/rental/leases/${id}`;
    }
    case 'unit': {
      const property = await propertyOf(db, 'units', id);
      return property === null ? null : `/properties/${property}/rental`;
    }
    case 'meter': {
      const property = await propertyOf(db, 'meters', id);
      return property === null ? null : `/properties/${property}/rental/meters`;
    }
    case 'party':
      return personScreen(db, id);
  }
}

/** The screen an `esta://{type}/{id}` link from Trợ lý opens on, or null when this member reads no such record. */
export async function openLinkTarget(db: Db, link: string): Promise<string | null> {
  const route = parseEstaUri(`esta://${link}`);
  return route.ok ? screenOf(db, route.value) : null;
}
