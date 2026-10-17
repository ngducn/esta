'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireMember } from '@/server/member';
import type { TablesInsert } from '@esta/db';
import { LEGAL_KINDS, legalKindSchema, legalTable, type LegalKind, type PartyOption } from '@/server/properties/legal';
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

function revalidateLegal(propertyId: string) {
  revalidatePath(`/properties/${propertyId}/legal`, 'layout');
}

type LegalInsert = Omit<TablesInsert<'parcels'>, 'household_id' | 'property_id'>;

/** Parsed by the kind's own schema; typed as a parcel only to reach the client, as `legalTable` explains. */
function parseValue(kind: LegalKind, raw: unknown): LegalInsert | null {
  const parsed = LEGAL_KINDS[kind].schema.safeParse(raw);
  return parsed.success ? (parsed.data as LegalInsert) : null;
}

export async function saveLegalItem(propertyId: unknown, kind: unknown, itemId: unknown, raw: unknown): Promise<LegalWrite> {
  const property = uuid.safeParse(propertyId);
  const table = legalKindSchema.safeParse(kind);
  const item = itemId === null ? { success: true as const, data: null } : uuid.safeParse(itemId);
  if (!property.success || !table.success || !item.success) return { ok: false, reason: 'invalid' };
  const value = parseValue(table.data, raw);
  if (value === null) return { ok: false, reason: 'invalid' };
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const scope = { household_id: member.household.id, property_id: property.data };
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
  const value = parseValue(kind, rest);
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

const partyInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('individual'),
    full_name: z.string().trim().min(1).max(200),
    id_last4: z
      .string()
      .regex(/^[0-9]{4}$/)
      .nullable(),
  }),
  z.object({ kind: z.literal('organization'), full_name: z.string().trim().min(1).max(200), bank: z.boolean() }),
]);

export type PartyWrite = { readonly ok: true; readonly party: PartyOption } | { readonly ok: false };

/** Quick-add from a picker: a name and, for a person, only the last 4 ID digits (SPEC D11). */
export async function quickAddParty(raw: unknown): Promise<PartyWrite> {
  const parsed = partyInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const input = parsed.data;
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const fullName = input.full_name.normalize('NFC');
  const { data, error } = await supabase
    .from('parties')
    .insert({
      household_id: member.household.id,
      kind: input.kind,
      full_name: fullName,
      ...(input.kind === 'individual' ? { id_last4: input.id_last4, tags: ['owner'] } : { tags: input.bank ? ['bank'] : ['other'] }),
    })
    .select('id')
    .single();
  if (error) return { ok: false };
  return { ok: true, party: { id: data.id, fullName, kind: input.kind, isBank: input.kind === 'organization' && input.bank } };
}
