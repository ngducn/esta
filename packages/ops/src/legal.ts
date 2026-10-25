import { certificateSchema, newParcelSchema, parcelSchema, structureSchema } from '@esta/core/schemas/legal';
import { ownershipShareSchema, type OwnershipShare } from '@esta/core/schemas/ownership';
import { z } from 'zod';
import type { Db } from './db';

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

const rowIdSchema = z.object({ id: z.uuid() }).loose();

function parseRow<K extends LegalKind>(kind: K, raw: unknown): LegalRow<K> {
  const { id, ...value } = rowIdSchema.parse(raw);
  return { ...(LEGAL_KINDS[kind].schema.parse(value) as LegalValue<K>), id };
}

/**
 * The three tables share `id`, `household_id` and `property_id`, and every row read or written is parsed by its kind's
 * schema, so one table's generated types serve all three; a union of the three is too large for the compiler.
 */
export function legalTable(db: Db, kind: LegalKind) {
  return db.from(kind as 'parcels');
}

/** One property's rows of a legal table, or the one row `itemId` names, oldest first. */
export async function readLegalRows<K extends LegalKind>(db: Db, householdId: string, kind: K, propertyId: string, itemId?: string): Promise<LegalRow<K>[]> {
  const columns: string = LEGAL_KINDS[kind].columns;
  let query = legalTable(db, kind).select(columns).eq('household_id', householdId).eq('property_id', propertyId);
  if (itemId !== undefined) query = query.eq('id', itemId);
  const { data, error } = await query.order('created_at').order('id');
  if (error) throw new Error(`Reading ${kind} failed: ${error.message}`);
  return (data as unknown[]).map((row) => parseRow(kind, row));
}

/** One property's owners, the largest share first. */
export async function readOwnership(db: Db, householdId: string, propertyId: string): Promise<OwnershipShare[]> {
  const { data, error } = await db
    .from('ownership_shares')
    .select('party_id, share_bp, named_on_certificate, since')
    .eq('household_id', householdId)
    .eq('property_id', propertyId)
    .order('share_bp', { ascending: false })
    .order('party_id');
  if (error) throw new Error(`Reading ownership failed: ${error.message}`);
  return z.array(ownershipShareSchema).parse(data);
}
