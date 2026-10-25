import 'server-only';
import { compareVietnameseNames } from '@esta/core/names';
import type { OwnershipShare } from '@esta/core/schemas/ownership';
import { readLegalRows, readOwnership, type LegalKind, type LegalRow } from '@esta/ops';
import { cache } from 'react';
import { z } from 'zod';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

export type PartyOption = { readonly id: string; readonly fullName: string; readonly kind: 'individual' | 'organization'; readonly isBank: boolean };
export type LandUseCode = { readonly code: string; readonly nameVi: string; readonly nameEn: string };

export type PropertyLegal = {
  readonly certificates: readonly LegalRow<'certificates'>[];
  readonly parcels: readonly LegalRow<'parcels'>[];
  readonly structures: readonly LegalRow<'structures'>[];
};

async function readRows<K extends LegalKind>(kind: K, householdId: string, propertyId: string, itemId?: string): Promise<LegalRow<K>[]> {
  return readLegalRows(await createSessionClient(), householdId, kind, propertyId, itemId);
}

/** RLS limits every read to the member's households and the predicate to the current one. */
export const loadPropertyLegal = cache(async (propertyId: string): Promise<PropertyLegal> => {
  const member = await requireMember();
  const [certificates, parcels, structures] = await Promise.all([
    readRows('certificates', member.household.id, propertyId),
    readRows('parcels', member.household.id, propertyId),
    readRows('structures', member.household.id, propertyId),
  ]);
  return { certificates, parcels, structures };
});

export async function loadLegalItem<K extends LegalKind>(kind: K, propertyId: string, itemId: string): Promise<LegalRow<K> | null> {
  const member = await requireMember();
  const [row] = await readRows(kind, member.household.id, propertyId, itemId);
  return row ?? null;
}

const partyRowSchema = z.object({
  id: z.uuid(),
  full_name: z.string(),
  kind: z.enum(['individual', 'organization']),
  tags: z.array(z.string()),
});

/** Sorted by given name, then middle, then family name (DOMAIN-VN §9). */
export const loadParties = cache(async (): Promise<PartyOption[]> => {
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const { data, error } = await supabase.from('parties').select('id, full_name, kind, tags').eq('household_id', member.household.id);
  if (error) throw new Error(`Reading parties failed: ${error.message}`);
  return z
    .array(partyRowSchema)
    .parse(data)
    .map((party) => ({ id: party.id, fullName: party.full_name, kind: party.kind, isBank: party.tags.includes('bank') }))
    .sort((a, b) => compareVietnameseNames(a.fullName, b.fullName));
});

export const loadLandUseCodes = cache(async (): Promise<LandUseCode[]> => {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from('land_use_codes').select('code, name_vi, name_en').order('code');
  if (error) throw new Error(`Reading land use codes failed: ${error.message}`);
  return data.map((row) => ({ code: row.code, nameVi: row.name_vi, nameEn: row.name_en }));
});

export const loadOwnership = cache(async (propertyId: string): Promise<OwnershipShare[]> => {
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  return readOwnership(supabase, member.household.id, propertyId);
});
