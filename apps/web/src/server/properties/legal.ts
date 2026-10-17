import 'server-only';
import { compareVietnameseNames } from '@esta/core/names';
import { certificateSchema, newParcelSchema, parcelSchema, structureSchema } from '@esta/core/schemas/legal';
import { ownershipShareSchema, type OwnershipShare } from '@esta/core/schemas/ownership';
import { cache } from 'react';
import { z } from 'zod';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

/** One entry per legal table: the columns a read selects, the schema that parses a row, an edit and a restore, and the one a create adds. */
export const LEGAL_KINDS = {
  parcels: {
    schema: parcelSchema,
    createSchema: newParcelSchema,
    columns: 'id, certificate_id, parcel_no, map_sheet_no, area_m2, use_form, purposes, origin_text',
  },
  structures: {
    schema: structureSchema,
    createSchema: structureSchema,
    columns: 'id, certificate_id, kind, footprint_m2, floor_area_m2, floors, structure_text, completed_year, ownership_term',
  },
  certificates: {
    schema: certificateSchema,
    createSchema: certificateSchema,
    columns: 'id, form, serial_no, book_entry_no, issued_on, issued_by, holder_party_ids, status, mortgage, annotations',
  },
} as const;

export type LegalKind = keyof typeof LEGAL_KINDS;
export const legalKindSchema = z.enum(Object.keys(LEGAL_KINDS) as [LegalKind, ...LegalKind[]]);

export type LegalValue<K extends LegalKind> = z.output<(typeof LEGAL_KINDS)[K]['schema']>;
export type LegalRow<K extends LegalKind> = LegalValue<K> & { readonly id: string };

export type PartyOption = { readonly id: string; readonly fullName: string; readonly kind: 'individual' | 'organization'; readonly isBank: boolean };
export type LandUseCode = { readonly code: string; readonly nameVi: string; readonly nameEn: string };

export type PropertyLegal = {
  readonly certificates: readonly LegalRow<'certificates'>[];
  readonly parcels: readonly LegalRow<'parcels'>[];
  readonly structures: readonly LegalRow<'structures'>[];
};

const rowIdSchema = z.object({ id: z.uuid() }).loose();

function parseRow<K extends LegalKind>(kind: K, raw: unknown): LegalRow<K> {
  const { id, ...value } = rowIdSchema.parse(raw);
  return { ...(LEGAL_KINDS[kind].schema.parse(value) as LegalValue<K>), id };
}

type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;

/**
 * The three tables share `id`, `household_id` and `property_id`, and every row read or written is parsed by its kind's
 * schema, so one table's generated types serve all three; a union of the three is too large for the compiler.
 */
export function legalTable(supabase: SessionClient, kind: LegalKind) {
  return supabase.from(kind as 'parcels');
}

async function readRows<K extends LegalKind>(kind: K, householdId: string, propertyId: string, itemId?: string): Promise<LegalRow<K>[]> {
  const supabase = await createSessionClient();
  const columns: string = LEGAL_KINDS[kind].columns;
  let query = legalTable(supabase, kind).select(columns).eq('household_id', householdId).eq('property_id', propertyId);
  if (itemId !== undefined) query = query.eq('id', itemId);
  const { data, error } = await query.order('created_at').order('id');
  if (error) throw new Error(`Reading ${kind} failed: ${error.message}`);
  return (data as unknown[]).map((row) => parseRow(kind, row));
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
  const { data, error } = await supabase
    .from('ownership_shares')
    .select('party_id, share_bp, named_on_certificate, since')
    .eq('household_id', member.household.id)
    .eq('property_id', propertyId)
    .order('share_bp', { ascending: false })
    .order('party_id');
  if (error) throw new Error(`Reading ownership failed: ${error.message}`);
  return z.array(ownershipShareSchema).parse(data);
});
