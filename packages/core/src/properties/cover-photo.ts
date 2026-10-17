import type { Result } from '../result';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NAME = /^[a-z0-9-]{1,64}\.(avif|webp|jpe?g|png)$/;

/** `<household_id>/<property_id>/<name>`, the one shape the `property-photos` policies and the `cover_photo_path` check accept. */
export type CoverPhotoPath = string & { readonly __brand: 'CoverPhotoPath' };

export type CoverPhotoParts = { householdId: string; propertyId: string; name: string };

export type CoverPhotoPathRefusal = 'household_id' | 'property_id' | 'name';

export function coverPhotoPath(householdId: string, propertyId: string, name: string): Result<CoverPhotoPath, CoverPhotoPathRefusal> {
  if (!UUID.test(householdId)) return { ok: false, reason: 'household_id' };
  if (!UUID.test(propertyId)) return { ok: false, reason: 'property_id' };
  if (!NAME.test(name)) return { ok: false, reason: 'name' };
  return { ok: true, value: `${householdId}/${propertyId}/${name}` as CoverPhotoPath };
}

export function parseCoverPhotoPath(path: string): CoverPhotoParts | null {
  const segments = path.split('/');
  if (segments.length !== 3) return null;
  const [householdId = '', propertyId = '', name = ''] = segments;
  return coverPhotoPath(householdId, propertyId, name).ok ? { householdId, propertyId, name } : null;
}

export type StoredPhoto = { readonly path: string; readonly createdAt: string };

/**
 * The objects a cover change may delete: those created before `anchor` (and `anchor` itself when `inclusive`), never
 * `current`, the path the row holds when re-read after listing. A newer object is another editor's upload that may not
 * have reached the row yet, so it stays for that editor's own sweep.
 */
export function stalePhotos(
  objects: readonly StoredPhoto[],
  { anchor, inclusive, current }: { anchor: string; inclusive: boolean; current: string | null },
): string[] {
  const bound = objects.find((object) => object.path === anchor);
  if (bound === undefined) return [];
  const limit = Date.parse(bound.createdAt);
  return objects
    .filter((object) => object.path !== current)
    .filter((object) => (object.path === anchor ? inclusive : Date.parse(object.createdAt) < limit))
    .map((object) => object.path);
}
