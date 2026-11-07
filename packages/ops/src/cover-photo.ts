import { stalePhotos, type StoredPhoto } from '@esta/core/properties';
import type { Db } from './db';

export const PROPERTY_PHOTOS_BUCKET = 'property-photos';
/** The `property-photos` bucket's file size limit (migration `property_list`); Storage refuses a larger object. */
export const MAX_COVER_BYTES = 5 * 1024 * 1024;

/** The objects stored for one property, null when Storage could not list them. */
export async function listPhotos(db: Db, householdId: string, propertyId: string): Promise<StoredPhoto[] | null> {
  const { data, error } = await db.storage.from(PROPERTY_PHOTOS_BUCKET).list(`${householdId}/${propertyId}`, { limit: 100 });
  return error ? null : data.flatMap((object) => (object.created_at === null ? [] : [{ path: `${householdId}/${propertyId}/${object.name}`, createdAt: object.created_at }]));
}

/** The cover the live property holds now; null when there is no such property or the read failed. */
export async function readCover(db: Db, householdId: string, propertyId: string): Promise<{ path: string | null } | null> {
  const { data, error } = await db.from('properties').select('cover_photo_path').eq('household_id', householdId).eq('id', propertyId).is('deleted_at', null).maybeSingle();
  return error || data === null ? null : { path: data.cover_photo_path };
}

/**
 * Removes the objects a cover change made stale (`stalePhotos`). It lists the folder before re-reading the row, so a
 * cover another editor saved meanwhile is the `current` that stays. `keep` names a path to leave alone as well, such as
 * the cover an undo may need to bring back.
 */
export async function sweepPhotos(db: Db, householdId: string, propertyId: string, anchor: { readonly path: string; readonly inclusive: boolean }, keep: string | null = null): Promise<void> {
  const objects = await listPhotos(db, householdId, propertyId);
  const cover = await readCover(db, householdId, propertyId);
  if (objects === null || cover === null) return;
  const stale = stalePhotos(objects, { anchor: anchor.path, inclusive: anchor.inclusive, current: cover.path }).filter((path) => path !== keep);
  if (stale.length === 0) return;
  await db.storage.from(PROPERTY_PHOTOS_BUCKET).remove(stale);
}
