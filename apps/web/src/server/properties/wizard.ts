'use server';

import { defaultDocumentTitle, DOCUMENT_MIME_TYPES, MAX_DOCUMENT_BYTES } from '@esta/core/documents';
import { nextRoomLabels, PROPERTY_KINDS } from '@esta/core/properties';
import { USE_MODES } from '@esta/core/schemas/property';
import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { addRooms } from '@/app/(app)/properties/[id]/rental/actions';
import { registerDocument } from '@/server/documents/actions';
import { isCommuneOf } from '@/server/address/suggest';
import { requireMember } from '@/server/member';
import { loadPropertyRental } from '@/server/properties/rental';
import { createSessionClient } from '@/server/supabase/server';

const uuid = z.uuid();

const startSchema = z.object({
  propertyId: uuid,
  nickname: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .transform((text) => text.normalize('NFC')),
  code: z.string().regex(/^[A-Z0-9]{1,8}$/),
  kind: z.enum(PROPERTY_KINDS),
  document: z
    .object({
      documentId: uuid,
      filename: z.string().min(1).max(500),
      mime: z.enum(DOCUMENT_MIME_TYPES),
      size: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      pageCount: z.number().int().min(1).max(2000),
    })
    .nullable(),
});

export type WizardStart =
  | { readonly ok: true; readonly propertyId: string; readonly documentId: string | null }
  | { readonly ok: false; readonly reason: 'invalid' | 'forbidden' | 'upload' | 'failed' }
  | { readonly ok: false; readonly reason: 'code_taken'; readonly code: string; readonly takenBy: string };

const UNIQUE_VIOLATION = '23505';

/**
 * Step 1 of the wizard (PRP-7): the property under the id the browser chose, then, when a certificate was uploaded,
 * its document row and the extraction job through the P2-02 register. Every write converges on the ids it is given,
 * so a retry after a lost response leaves one property, one document and one extraction.
 */
export async function startPropertyWizard(raw: unknown): Promise<WizardStart> {
  const parsed = startSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  const member = await requireMember();
  if (member.role === 'viewer') return { ok: false, reason: 'forbidden' };
  const { propertyId, nickname, code, kind, document } = parsed.data;
  const household = member.household.id;
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from('properties')
    .upsert({ id: propertyId, household_id: household, nickname, code, kind, use_mode: 'rental', legal_status: 'certified' }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) {
    if (error.code !== UNIQUE_VIOLATION) return { ok: false, reason: 'failed' };
    const { data: holder } = await supabase.from('properties').select('nickname').eq('household_id', household).eq('code', code).maybeSingle();
    return holder === null ? { ok: false, reason: 'failed' } : { ok: false, reason: 'code_taken', code, takenBy: holder.nickname };
  }
  // An id taken in another household inserts nothing above and reads as absent here.
  const { data: created } = await supabase.from('properties').select('id').eq('household_id', household).eq('id', propertyId).is('deleted_at', null).maybeSingle();
  if (created === null) return { ok: false, reason: 'failed' };
  revalidatePath('/properties');
  if (document === null) return { ok: true, propertyId, documentId: null };

  const t = await getTranslations('documents');
  const registered = await registerDocument({
    ...document,
    propertyId,
    category: 'certificate',
    title: defaultDocumentTitle(t('titlePrefix', { category: 'certificate' }), nickname),
    expiresOn: null,
  });
  return registered.ok ? { ok: true, propertyId, documentId: document.documentId } : { ok: false, reason: 'upload' };
}

const addressSchema = z.object({ communeCode: z.string().regex(/^[0-9]{5}$/), provinceCode: z.string().regex(/^[0-9]{2}$/) });

/**
 * `Hiện nay` after the certificate address is accepted: the ward the user picked among the suggestions becomes the
 * current address, keeping any house number and street already saved.
 */
export async function confirmCurrentAddress(propertyId: unknown, raw: unknown): Promise<boolean> {
  const id = uuid.safeParse(propertyId);
  const address = addressSchema.safeParse(raw);
  if (!id.success || !address.success || !(await isCommuneOf(address.data.communeCode, address.data.provinceCode))) return false;
  const member = await requireMember();
  if (member.role === 'viewer') return false;
  const supabase = await createSessionClient();
  const { data: row } = await supabase
    .from('properties')
    .select('current_address')
    .eq('household_id', member.household.id)
    .eq('id', id.data)
    .is('deleted_at', null)
    .maybeSingle();
  if (row === null) return false;
  const kept = z.object({ house_no: z.string().optional(), street: z.string().optional(), line: z.string().optional() }).catch({}).parse(row.current_address ?? {});
  const { data, error } = await supabase
    .from('properties')
    .update({ current_address: { ...kept, commune_code: address.data.communeCode, province_code: address.data.provinceCode } })
    .eq('household_id', member.household.id)
    .eq('id', id.data)
    .select('id');
  if (error || data.length !== 1) return false;
  revalidatePath('/properties');
  revalidatePath(`/properties/${id.data}`, 'layout');
  return true;
}

const useSchema = z.object({ useMode: z.enum(USE_MODES), rooms: z.number().int().min(0).max(50) });

export type WizardUse = { readonly ok: true } | { readonly ok: false; readonly reason: 'invalid' | 'failed' };

/** Step `use`: the use mode, and for a rooming house `Phòng 1` to `Phòng n` after the rooms it already has. */
export async function saveWizardUse(propertyId: unknown, raw: unknown): Promise<WizardUse> {
  const id = uuid.safeParse(propertyId);
  const value = useSchema.safeParse(raw);
  if (!id.success || !value.success) return { ok: false, reason: 'invalid' };
  const member = await requireMember();
  if (member.role === 'viewer') return { ok: false, reason: 'invalid' };
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('properties')
    .update({ use_mode: value.data.useMode })
    .eq('household_id', member.household.id)
    .eq('id', id.data)
    .is('deleted_at', null)
    .select('id');
  if (error || data.length !== 1) return { ok: false, reason: 'failed' };
  if (value.data.rooms > 0) {
    const { units } = await loadPropertyRental(id.data);
    const rooms = units.filter((unit) => unit.kind === 'room').length;
    const missing = value.data.rooms - rooms;
    if (missing > 0) {
      const added = await addRooms(id.data, { labels: nextRoomLabels(units.map((unit) => unit.label), missing), list_rent_vnd: null });
      if (!added.ok) return { ok: false, reason: 'failed' };
    }
  }
  revalidatePath('/properties');
  revalidatePath(`/properties/${id.data}`, 'layout');
  return { ok: true };
}
