'use server';

import { coverPhotoPath, parseCoverPhotoPath, stalePhotos, type StoredPhoto } from '@esta/core/properties';
import type { Result } from '@esta/core/result';
import { idSchema, propertyCreate, propertyEdit, runOp, type CodeTaken, type CommonRefusal, type CurrentUnitSuggestion, type PropertySaved } from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { listCommunes, suggestCurrentUnits, type AdminUnitOption } from '@/server/address/suggest';
import { requireMember } from '@/server/member';
import { webOpContext } from '@/server/ops';
import { PROPERTY_PHOTOS_BUCKET } from '@/server/properties/photos';
import { setDeletedAt } from '@/server/soft-delete';
import { createSessionClient } from '@/server/supabase/server';

export type PropertyWrite =
  | { readonly ok: true; readonly id: string; readonly nickname: string }
  | { readonly ok: false; readonly reason: 'invalid' | 'failed' }
  | { readonly ok: false; readonly reason: 'code_taken'; readonly code: string; readonly takenBy: string };

export type PhotoWrite = { readonly ok: true } | { readonly ok: false };

export type UploadTicket = { readonly ok: true; readonly path: string; readonly url: string } | { readonly ok: false };

/** The form reads three outcomes; not found, forbidden and a conflict nobody could explain show as `failed`, as before. */
function propertyWrite(result: Result<PropertySaved, CodeTaken | CommonRefusal>): PropertyWrite {
  if (result.ok) return { ok: true, id: result.value.id, nickname: result.value.nickname };
  if (result.reason.kind === 'code_taken') return { ok: false, reason: 'code_taken', code: result.reason.code, takenBy: result.reason.takenBy };
  return { ok: false, reason: result.reason.kind === 'invalid' ? 'invalid' : 'failed' };
}

function revalidateProperty(propertyId: string) {
  revalidatePath('/properties');
  revalidatePath(`/properties/${propertyId}`, 'layout');
}

export async function createProperty(raw: unknown): Promise<PropertyWrite> {
  const result = await runOp(propertyCreate, await webOpContext(), { id: randomUUID(), property: raw });
  if (result.ok) revalidatePath('/properties');
  return propertyWrite(result);
}

export async function updateProperty(propertyId: unknown, raw: unknown): Promise<PropertyWrite> {
  const result = await runOp(propertyEdit, await webOpContext(), { id: propertyId, set: raw });
  if (result.ok) revalidateProperty(result.value.id);
  return propertyWrite(result);
}

/** Archive and restore are soft delete (SPEC §5), so the property and its photo stay restorable. */
async function setArchived(propertyId: unknown, archived: boolean): Promise<{ readonly ok: boolean }> {
  const changed = await setDeletedAt('properties', propertyId, archived);
  if (changed === null) return { ok: false };
  revalidateProperty(changed);
  return { ok: true };
}

export async function archiveProperty(propertyId: unknown): Promise<{ readonly ok: boolean }> {
  return setArchived(propertyId, true);
}

export async function restoreProperty(propertyId: unknown): Promise<{ readonly ok: boolean }> {
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
  const parsedId = idSchema.safeParse(propertyId);
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
  const parsedId = idSchema.safeParse(propertyId);
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
  const parsedId = idSchema.safeParse(propertyId);
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
