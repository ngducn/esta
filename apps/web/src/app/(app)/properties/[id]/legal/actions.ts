'use server';

import { revalidatePath } from 'next/cache';
import { ownershipSharesSchema } from '@esta/core/schemas/ownership';
import { newPartiesSchema, type NewParty } from '@esta/core/schemas/party';
import { z } from 'zod';
import { requireMember } from '@/server/member';
import type { TablesInsert } from '@esta/db';
import { LEGAL_KINDS, legalKindSchema, legalTable, type LegalKind } from '@/server/properties/legal';
import { createSessionClient } from '@/server/supabase/server';

export type LegalWrite = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly reason: 'invalid' | 'failed' };

/** What a delete hands back, so `Hoàn tác` can put the row back and re-link what it unlinked. */
export type DeletedLegalItem = {
  readonly kind: LegalKind;
  readonly propertyId: string;
  readonly row: { readonly id: string } & Record<string, unknown>;
  readonly unlinked: { readonly parcels: readonly string[]; readonly structures: readonly string[] };
};

export type LegalDelete = { readonly ok: true; readonly deleted: DeletedLegalItem } | { readonly ok: false };

const uuid = z.uuid();
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';
const INVALID_PARAMETER = '22023';

function revalidateLegal(propertyId: string) {
  revalidatePath(`/properties/${propertyId}/legal`, 'layout');
}

type LegalInsert = Omit<TablesInsert<'parcels'>, 'household_id' | 'property_id'>;

/** Parsed by the kind's own schema; typed as a parcel only to reach the client, as `legalTable` explains. */
function parseValue(kind: LegalKind, raw: unknown, creating: boolean): LegalInsert | null {
  const parsed = LEGAL_KINDS[kind][creating ? 'createSchema' : 'schema'].safeParse(raw);
  return parsed.success ? (parsed.data as LegalInsert) : null;
}

export async function saveLegalItem(propertyId: unknown, kind: unknown, itemId: unknown, raw: unknown, newParties: unknown = []): Promise<LegalWrite> {
  const property = uuid.safeParse(propertyId);
  const table = legalKindSchema.safeParse(kind);
  const item = itemId === null ? { success: true as const, data: null } : uuid.safeParse(itemId);
  if (!property.success || !table.success || !item.success) return { ok: false, reason: 'invalid' };
  const value = parseValue(table.data, raw, item.data === null);
  if (value === null) return { ok: false, reason: 'invalid' };
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const scope = { household_id: member.household.id, property_id: property.data };
  return savingWithParties<LegalWrite>(supabase, scope.household_id, newParties, async () => {
    const { data, error } =
      item.data === null
        ? await legalTable(supabase, table.data).insert({ ...value, ...scope }).select('id').single()
        : await legalTable(supabase, table.data)
            .update(value)
            .eq('household_id', scope.household_id)
            .eq('property_id', scope.property_id)
            .eq('id', item.data)
            .select('id')
            .maybeSingle();
    if (error) return { ok: false, reason: error.code === FOREIGN_KEY_VIOLATION || error.code === CHECK_VIOLATION ? 'invalid' : 'failed' };
    if (data === null) return { ok: false, reason: 'failed' };
    revalidateLegal(property.data);
    return { ok: true, id: data.id };
  });
}

async function linkedIds(table: 'parcels' | 'structures', householdId: string, certificateId: string): Promise<string[] | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from(table).select('id').eq('household_id', householdId).eq('certificate_id', certificateId);
  return error ? null : data.map((row) => row.id);
}

export async function deleteLegalItem(propertyId: unknown, kind: unknown, itemId: unknown): Promise<LegalDelete> {
  const property = uuid.safeParse(propertyId);
  const table = legalKindSchema.safeParse(kind);
  const item = uuid.safeParse(itemId);
  if (!property.success || !table.success || !item.success) return { ok: false };
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const householdId = member.household.id;
  const [parcels, structures] =
    table.data === 'certificates'
      ? await Promise.all([linkedIds('parcels', householdId, item.data), linkedIds('structures', householdId, item.data)])
      : [[], []];
  if (parcels === null || structures === null) return { ok: false };
  const { data, error } = await legalTable(supabase, table.data)
    .delete()
    .eq('household_id', householdId)
    .eq('property_id', property.data)
    .eq('id', item.data)
    .select(LEGAL_KINDS[table.data].columns as string)
    .maybeSingle();
  if (error || data === null) return { ok: false };
  revalidateLegal(property.data);
  return { ok: true, deleted: { kind: table.data, propertyId: property.data, row: data as unknown as DeletedLegalItem['row'], unlinked: { parcels, structures } } };
}

const deletedSchema = z.object({
  kind: legalKindSchema,
  propertyId: uuid,
  row: z.object({ id: uuid }).loose(),
  unlinked: z.object({ parcels: z.array(uuid).max(500), structures: z.array(uuid).max(500) }),
});

/**
 * Inserts the row back under its own id with `on conflict (id) do nothing`, then re-links only parcels and structures
 * that are still unlinked, so a second tap, or a retry after a lost response, changes nothing.
 */
export async function restoreLegalItem(raw: unknown): Promise<LegalWrite> {
  const deleted = deletedSchema.safeParse(raw);
  if (!deleted.success) return { ok: false, reason: 'invalid' };
  const { kind, propertyId, row, unlinked } = deleted.data;
  const { id, ...rest } = row;
  const value = parseValue(kind, rest, false);
  if (value === null) return { ok: false, reason: 'invalid' };
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const householdId = member.household.id;
  const { error } = await legalTable(supabase, kind).upsert({ ...value, id, household_id: householdId, property_id: propertyId }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) return { ok: false, reason: 'failed' };
  for (const table of ['parcels', 'structures'] as const) {
    const ids = unlinked[table];
    if (kind !== 'certificates' || ids.length === 0) continue;
    const relink = await supabase
      .from(table)
      .update({ certificate_id: id })
      .eq('household_id', householdId)
      .eq('property_id', propertyId)
      .in('id', ids)
      .is('certificate_id', null);
    if (relink.error) return { ok: false, reason: 'failed' };
  }
  revalidateLegal(propertyId);
  return { ok: true, id };
}

type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;
type PartiesRejected = { readonly ok: false; readonly reason: 'invalid' | 'failed' };

function partyRow(householdId: string, party: NewParty): TablesInsert<'parties'> {
  const base = { id: party.id, household_id: householdId, kind: party.kind, full_name: party.full_name.normalize('NFC') };
  return party.kind === 'individual'
    ? { ...base, id_last4: party.id_last4, tags: ['owner'] }
    : { ...base, tags: party.bank ? ['bank'] : ['other'] };
}

/**
 * Quick-added parties exist only in the form until a save names them. They go in just before the save, under their
 * client-made ids so a retry changes nothing, and the ones this call created are deleted again if the save fails, so
 * an abandoned or failed form leaves no one behind. Only the session client runs, so RLS decides every write.
 */
async function savingWithParties<T extends { readonly ok: boolean }>(
  supabase: SessionClient,
  householdId: string,
  raw: unknown,
  save: () => Promise<T>,
): Promise<T | PartiesRejected> {
  const parsed = newPartiesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  if (parsed.data.length === 0) return save();
  const created = await supabase
    .from('parties')
    .upsert(parsed.data.map((party) => partyRow(householdId, party)), { onConflict: 'id', ignoreDuplicates: true })
    .select('id');
  if (created.error) return { ok: false, reason: 'failed' };
  const rollBack = () => supabase.from('parties').delete().eq('household_id', householdId).in('id', created.data.map((row) => row.id));
  try {
    const result = await save();
    if (!result.ok) await rollBack();
    return result;
  } catch (error) {
    await rollBack();
    throw error;
  }
}

export type OwnershipWrite = { readonly ok: true } | { readonly ok: false; readonly reason: 'invalid' | 'failed' };

/** Replaces the property's whole set in one call; an incomplete set saves, and the page warns from the saved rows. */
export async function saveOwnershipShares(propertyId: unknown, raw: unknown, newParties: unknown = []): Promise<OwnershipWrite> {
  const property = uuid.safeParse(propertyId);
  const shares = ownershipSharesSchema.safeParse(raw);
  if (!property.success || !shares.success) return { ok: false, reason: 'invalid' };
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  return savingWithParties<OwnershipWrite>(supabase, member.household.id, newParties, async () => {
    const { error } = await supabase.rpc('set_ownership_shares', { p_property_id: property.data, p_shares: shares.data });
    if (error) {
      const invalid = [FOREIGN_KEY_VIOLATION, CHECK_VIOLATION, INVALID_PARAMETER].includes(error.code);
      return { ok: false, reason: invalid ? 'invalid' : 'failed' };
    }
    revalidateLegal(property.data);
    return { ok: true };
  });
}
