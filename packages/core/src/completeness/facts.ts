import { z } from 'zod';
import { PROPERTY_KINDS } from '../properties/kinds';
import type { CompletenessFacts } from './types';

const count = z.number().int().min(0);

/** A row of `public.property_completeness_facts`, as PostgREST and `supabase db query` return it. */
export const completenessFactsRowSchema = z
  .object({
    property_id: z.string(),
    kind: z.enum(PROPERTY_KINDS),
    has_current_address: z.boolean(),
    has_location: z.boolean(),
    has_acquisition: z.boolean(),
    parcel_count: count,
    parcel_without_number_id: z.string().nullable(),
    parcel_without_area_id: z.string().nullable(),
    structure_count: count,
    structure_without_floor_area_id: z.string().nullable(),
    share_total_bp: count,
    utility_account_count: count,
    certificate_document_count: count,
    photo_count: count,
  })
  .transform(
    (row): CompletenessFacts => ({
      propertyId: row.property_id,
      kind: row.kind,
      hasCurrentAddress: row.has_current_address,
      hasLocation: row.has_location,
      hasAcquisition: row.has_acquisition,
      parcelCount: row.parcel_count,
      parcelWithoutNumberId: row.parcel_without_number_id,
      parcelWithoutAreaId: row.parcel_without_area_id,
      structureCount: row.structure_count,
      structureWithoutFloorAreaId: row.structure_without_floor_area_id,
      shareTotalBp: row.share_total_bp,
      utilityAccountCount: row.utility_account_count,
      certificateDocumentCount: row.certificate_document_count,
      photoCount: row.photo_count,
    }),
  );

/** The schema's keys as one literal, so the PostgREST client can type the select. */
export const COMPLETENESS_FACT_COLUMNS =
  'property_id, kind, has_current_address, has_location, has_acquisition, parcel_count, parcel_without_number_id, parcel_without_area_id, structure_count, structure_without_floor_area_id, share_total_bp, utility_account_count, certificate_document_count, photo_count';
