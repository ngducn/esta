import 'server-only';
import { isIsoDate } from '@esta/core/date';
import { kindDetailsText, PROPERTY_KINDS, vndInputText } from '@esta/core/properties';
import { ACQUISITION_KINDS, LEGAL_STATUSES, USE_MODES } from '@esta/core/schemas/property';
import { z } from 'zod';
import type { PropertyFormValues } from '@/components/properties/property-form-values';
import { createSessionClient } from '@/server/supabase/server';

export type EditableProperty = {
  readonly id: string;
  readonly nickname: string;
  readonly coverPhotoPath: string | null;
  readonly values: PropertyFormValues;
};

export type ArchivedProperty = { readonly id: string; readonly nickname: string; readonly kind: (typeof PROPERTY_KINDS)[number] };

const addressSchema = z
  .object({
    house_no: z.string().optional(),
    street: z.string().optional(),
    commune_code: z.string().optional(),
    province_code: z.string().optional(),
  })
  .nullable();

const rowSchema = z.object({
  id: z.string(),
  nickname: z.string(),
  code: z.string(),
  kind: z.enum(PROPERTY_KINDS),
  kind_details: z.record(z.string(), z.unknown()),
  use_mode: z.enum(USE_MODES),
  legal_status: z.enum(LEGAL_STATUSES),
  current_address: addressSchema,
  certificate_address_text: z.string().nullable(),
  acquired_on: z.string().nullable(),
  acquisition_kind: z.enum(ACQUISITION_KINDS).nullable(),
  acquisition_price_vnd: z.number().nullable(),
  notes: z.string().nullable(),
  cover_photo_path: z.string().nullable(),
});

const COLUMNS =
  'id, nickname, code, kind, kind_details, use_mode, legal_status, current_address, certificate_address_text, acquired_on, acquisition_kind, acquisition_price_vnd, notes, cover_photo_path';

export async function loadEditableProperty(householdId: string, id: string): Promise<EditableProperty | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from('properties').select(COLUMNS).eq('household_id', householdId).eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw new Error(`Reading the property failed: ${error.message}`);
  if (data === null) return null;
  const row = rowSchema.parse(data);
  const communeCode = row.current_address?.commune_code ?? null;
  const commune =
    communeCode === null ? null : (await supabase.from('admin_units').select('name').eq('code', communeCode).maybeSingle()).data;
  return {
    id: row.id,
    nickname: row.nickname,
    coverPhotoPath: row.cover_photo_path,
    values: {
      nickname: row.nickname,
      code: row.code,
      kind: row.kind,
      kindTexts: kindDetailsText(row.kind, row.kind_details),
      useMode: row.use_mode,
      legalStatus: row.legal_status,
      address: {
        provinceCode: row.current_address?.province_code ?? null,
        communeCode,
        communeName: commune?.name ?? '',
        houseNo: row.current_address?.house_no ?? '',
        street: row.current_address?.street ?? '',
      },
      certificateAddress: row.certificate_address_text ?? '',
      acquiredOn: row.acquired_on !== null && isIsoDate(row.acquired_on) ? row.acquired_on : null,
      acquisitionKind: row.acquisition_kind,
      priceText: row.acquisition_price_vnd === null ? '' : vndInputText(row.acquisition_price_vnd),
      notes: row.notes ?? '',
    },
  };
}

/** Every code in the household, archived ones included, because the unique constraint covers them all. */
export async function loadPropertyCodes(householdId: string, exceptId: string | null): Promise<string[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from('properties').select('id, code').eq('household_id', householdId);
  if (error) throw new Error(`Reading property codes failed: ${error.message}`);
  return data.filter((row) => row.id !== exceptId).map((row) => row.code);
}

const archivedSchema = z.array(z.object({ id: z.string(), nickname: z.string(), kind: z.enum(PROPERTY_KINDS) }));

export async function loadArchivedProperties(householdId: string): Promise<ArchivedProperty[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('properties')
    .select('id, nickname, kind')
    .eq('household_id', householdId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) throw new Error(`Reading archived properties failed: ${error.message}`);
  return archivedSchema.parse(data);
}

export async function loadArchivedNickname(householdId: string, id: string): Promise<string | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createSessionClient();
  const { data } = await supabase.from('properties').select('nickname').eq('household_id', householdId).eq('id', id).not('deleted_at', 'is', null).maybeSingle();
  return data?.nickname ?? null;
}
