import 'server-only';
import { isoDate, type IsoDate } from '@esta/core/date';
import { idSchema } from '@esta/ops';
import { cache } from 'react';
import { createSessionClient } from '@/server/supabase/server';

export type TenantLease = {
  readonly id: string;
  readonly propertyId: string;
  readonly propertyName: string;
  readonly unitLabel: string;
  readonly status: string;
  readonly startDate: IsoDate | null;
  readonly endDate: IsoDate | null;
};

export type TenantPage = {
  readonly id: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly idLast4: string | null;
  readonly addressText: string | null;
  readonly notes: string | null;
  readonly leases: readonly TenantLease[];
};

/** One person who rents or rented from the household, with their leases; null for anyone else, so the page answers a real 404. */
export const loadTenantPage = cache(async (rawId: string): Promise<TenantPage | null> => {
  const id = idSchema.safeParse(rawId);
  if (!id.success) return null;
  const db = await createSessionClient();
  const [party, leases] = await Promise.all([
    db.from('parties').select('id, full_name, phone, email, id_last4, address_text, notes, tags').eq('id', id.data).maybeSingle(),
    db.from('leases').select('id, status, start_date, end_date, property_id, unit_id').eq('tenant_party_id', id.data).order('start_date', { ascending: false, nullsFirst: true }),
  ]);
  if (party.error) throw new Error(`Reading the person failed: ${party.error.message}`);
  if (leases.error) throw new Error(`Reading the person's leases failed: ${leases.error.message}`);
  if (party.data === null || !party.data.tags.includes('tenant')) return null;
  const [units, properties] = await Promise.all([
    db.from('units').select('id, label').in('id', leases.data.map((lease) => lease.unit_id)),
    db.from('properties').select('id, nickname').in('id', leases.data.map((lease) => lease.property_id)),
  ]);
  if (units.error || properties.error) throw new Error(`Reading the person's rooms failed: ${units.error?.message ?? properties.error?.message}`);
  const unitLabel = new Map(units.data.map((unit) => [unit.id, unit.label]));
  const propertyName = new Map(properties.data.map((property) => [property.id, property.nickname]));
  return {
    id: party.data.id,
    fullName: party.data.full_name,
    phone: party.data.phone,
    email: party.data.email,
    idLast4: party.data.id_last4,
    addressText: party.data.address_text,
    notes: party.data.notes,
    leases: leases.data.map((lease) => ({
      id: lease.id,
      propertyId: lease.property_id,
      propertyName: propertyName.get(lease.property_id) ?? '',
      unitLabel: unitLabel.get(lease.unit_id) ?? '',
      status: lease.status,
      startDate: lease.start_date === null ? null : isoDate(lease.start_date),
      endDate: lease.end_date === null ? null : isoDate(lease.end_date),
    })),
  };
});
