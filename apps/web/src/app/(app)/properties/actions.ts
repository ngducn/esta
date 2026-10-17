'use server';

import { formatCurrentAddress } from '@esta/core/address';
import { coverPhotoPath, parseCoverPhotoPath, stalePhotos, type StoredPhoto } from '@esta/core/properties';
import { propertyInputSchema, type PropertyInput } from '@esta/core/schemas/property';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { isCommuneOf, listCommunes, suggestCurrentUnits, type AdminUnitOption, type CurrentUnitSuggestion } from '@/server/address/suggest';
import { readRequestClock } from '@/server/clock';
import { requireMember } from '@/server/member';
import { PROPERTY_PHOTOS_BUCKET } from '@/server/properties/photos';
import { createSessionClient } from '@/server/supabase/server';

export type PropertyWrite =
  | { readonly ok: true; readonly id: string; readonly nickname: string }
  | { readonly ok: false; readonly reason: 'invalid' | 'failed' }
  | { readonly ok: false; readonly reason: 'code_taken'; readonly code: string; readonly takenBy: string };

export type PhotoWrite = { readonly ok: true } | { readonly ok: false };

export type UploadTicket = { readonly ok: true; readonly path: string; readonly url: string } | { readonly ok: false };

const id = z.uuid();
const UNIQUE_VIOLATION = '23505';

function toRow(input: PropertyInput) {
  const address = input.current_address;
  const line = address === null ? null : formatCurrentAddress({ houseNo: address.house_no, street: address.street });
  return {
    nickname: input.nickname,
    code: input.code,
    kind: input.kind,
    kind_details: input.kind_details,
    use_mode: input.use_mode,
    legal_status: input.legal_status,
    current_address:
      address === null
        ? null
        : {
            ...(address.house_no === null ? {} : { house_no: address.house_no }),
            ...(address.street === null ? {} : { street: address.street }),
            commune_code: address.commune_code,
            province_code: address.province_code,
            ...(line === null ? {} : { line }),
          },
    certificate_address_text: input.certificate_address_text,
    acquired_on: input.acquired_on,
    acquisition_kind: input.acquisition_kind,
    acquisition_price_vnd: input.acquisition_price_vnd,
    notes: input.notes,
  };
}

async function parseInput(raw: unknown): Promise<PropertyInput | null> {
  const parsed = propertyInputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const address = parsed.data.current_address;
  if (address !== null && !(await isCommuneOf(address.commune_code, address.province_code))) return null;
  return parsed.data;
}

async function codeTaken(householdId: string, code: string): Promise<PropertyWrite> {
  const supabase = await createSessionClient();
  const { data } = await supabase.from('properties').select('nickname').eq('household_id', householdId).eq('code', code).maybeSingle();
  return data === null ? { ok: false, reason: 'failed' } : { ok: false, reason: 'code_taken', code, takenBy: data.nickname };
}

function revalidateProperty(propertyId: string) {
  revalidatePath('/properties');
  revalidatePath(`/properties/${propertyId}`, 'layout');
}

export async function createProperty(raw: unknown): Promise<PropertyWrite> {
  const [member, input] = await Promise.all([requireMember(), parseInput(raw)]);
  if (input === null) return { ok: false, reason: 'invalid' };
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('properties')
    .insert({ ...toRow(input), household_id: member.household.id })
    .select('id, nickname')
    .single();
  if (error) return error.code === UNIQUE_VIOLATION ? codeTaken(member.household.id, input.code) : { ok: false, reason: 'failed' };
  revalidatePath('/properties');
  return { ok: true, id: data.id, nickname: data.nickname };
}

export async function updateProperty(propertyId: unknown, raw: unknown): Promise<PropertyWrite> {
  const parsedId = id.safeParse(propertyId);
  const [member, input] = await Promise.all([requireMember(), parseInput(raw)]);
  if (!parsedId.success || input === null) return { ok: false, reason: 'invalid' };
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('properties')
    .update(toRow(input))
    .eq('household_id', member.household.id)
    .eq('id', parsedId.data)
    .is('deleted_at', null)
    .select('id, nickname')
    .maybeSingle();
  if (error) return error.code === UNIQUE_VIOLATION ? codeTaken(member.household.id, input.code) : { ok: false, reason: 'failed' };
  if (data === null) return { ok: false, reason: 'failed' };
  revalidateProperty(data.id);
  return { ok: true, id: data.id, nickname: data.nickname };
}

/** Archive and restore set `deleted_at` (SPEC §5 soft delete), so the property and its photo stay restorable. */
async function setArchived(propertyId: unknown, archived: boolean): Promise<PropertyWrite> {
  const parsedId = id.safeParse(propertyId);
  if (!parsedId.success) return { ok: false, reason: 'invalid' };
  const [member, supabase, clock] = await Promise.all([requireMember(), createSessionClient(), readRequestClock()]);
  const { data, error } = await supabase
    .from('properties')
    .update({ deleted_at: archived ? clock.now() : null })
    .eq('household_id', member.household.id)
    .eq('id', parsedId.data)
    .select('id, nickname')
    .maybeSingle();
  if (error || data === null) return { ok: false, reason: 'failed' };
  revalidateProperty(data.id);
  return { ok: true, id: data.id, nickname: data.nickname };
}

export async function archiveProperty(propertyId: unknown): Promise<PropertyWrite> {
  return setArchived(propertyId, true);
}

export async function restoreProperty(propertyId: unknown): Promise<PropertyWrite> {
  return setArchived(propertyId, false);
}

const provinceCode = z.string().regex(/^[0-9]{2}$/);
const addressText = z.string().trim().min(3).max(300);

export async function loadCommunes(code: unknown): Promise<AdminUnitOption[]> {
  const parsed = provinceCode.safeParse(code);
  return parsed.success ? listCommunes(parsed.data) : [];
}

export async function suggestAddress(text: unknown): Promise<CurrentUnitSuggestion[]> {
  const parsed = addressText.safeParse(text);
  return parsed.success ? suggestCurrentUnits(parsed.data) : [];
}

async function photoObjects(householdId: string, propertyId: string): Promise<StoredPhoto[] | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.storage.from(PROPERTY_PHOTOS_BUCKET).list(`${householdId}/${propertyId}`, { limit: 100 });
  return error ? null : data.flatMap((object) => (object.created_at === null ? [] : [{ path: `${householdId}/${propertyId}/${object.name}`, createdAt: object.created_at }]));
}

async function coverPath(householdId: string, propertyId: string): Promise<{ path: string | null } | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('properties')
    .select('cover_photo_path')
    .eq('household_id', householdId)
    .eq('id', propertyId)
    .is('deleted_at', null)
    .maybeSingle();
  return error || data === null ? null : { path: data.cover_photo_path };
}

/** Lists the folder before re-reading the row, so a cover another editor saved meanwhile is the `current` that stays. */
async function sweepPhotos(householdId: string, propertyId: string, anchor: string, inclusive: boolean): Promise<void> {
  const objects = await photoObjects(householdId, propertyId);
  const cover = await coverPath(householdId, propertyId);
  if (objects === null || cover === null) return;
  const stale = stalePhotos(objects, { anchor, inclusive, current: cover.path });
  if (stale.length === 0) return;
  const supabase = await createSessionClient();
  await supabase.storage.from(PROPERTY_PHOTOS_BUCKET).remove(stale);
}

/**
 * The browser sends the bytes straight to Storage with the URL this returns; no file passes through a server
 * function. The session client signs it, so the storage insert policy decides. Every upload gets a new object name,
 * because the cover URL cache keys on the path (#77).
 */
export async function requestCoverPhotoUpload(propertyId: unknown, type: unknown): Promise<UploadTicket> {
  const parsedId = id.safeParse(propertyId);
  const extension = type === 'image/webp' ? 'webp' : type === 'image/jpeg' ? 'jpg' : null;
  if (!parsedId.success || extension === null) return { ok: false };
  const member = await requireMember();
  const path = coverPhotoPath(member.household.id, parsedId.data, `${randomUUID()}.${extension}`);
  if (!path.ok) return { ok: false };
  const supabase = await createSessionClient();
  const { data, error } = await supabase.storage.from(PROPERTY_PHOTOS_BUCKET).createSignedUploadUrl(path.value);
  return error ? { ok: false } : { ok: true, path: data.path, url: data.signedUrl };
}

/** Points the cover at an uploaded object, then, once the update has committed, removes the objects older than it. */
export async function setCoverPhoto(propertyId: unknown, path: unknown): Promise<PhotoWrite> {
  const parsedId = id.safeParse(propertyId);
  const parts = typeof path === 'string' ? parseCoverPhotoPath(path) : null;
  const member = await requireMember();
  if (!parsedId.success || parts === null || parts.householdId !== member.household.id || parts.propertyId !== parsedId.data) {
    return { ok: false };
  }
  const uploaded = await photoObjects(parts.householdId, parts.propertyId);
  const next = `${parts.householdId}/${parts.propertyId}/${parts.name}`;
  if (uploaded === null || !uploaded.some((object) => object.path === next)) return { ok: false };
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('properties')
    .update({ cover_photo_path: next })
    .eq('household_id', member.household.id)
    .eq('id', parts.propertyId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  if (error || data === null) return { ok: false };
  await sweepPhotos(parts.householdId, parts.propertyId, next, false);
  revalidateProperty(parts.propertyId);
  return { ok: true };
}

export async function removeCoverPhoto(propertyId: unknown): Promise<PhotoWrite> {
  const parsedId = id.safeParse(propertyId);
  if (!parsedId.success) return { ok: false };
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  const previous = await coverPath(member.household.id, parsedId.data);
  if (previous === null) return { ok: false };
  const { data, error } = await supabase
    .from('properties')
    .update({ cover_photo_path: null })
    .eq('household_id', member.household.id)
    .eq('id', parsedId.data)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  if (error || data === null) return { ok: false };
  if (previous.path !== null) await sweepPhotos(member.household.id, parsedId.data, previous.path, true);
  revalidateProperty(parsedId.data);
  return { ok: true };
}
