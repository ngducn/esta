import { coverPhotoPath } from '@esta/core/properties';
import { z } from 'zod';
import { MAX_COVER_BYTES, PROPERTY_PHOTOS_BUCKET, readCover, sweepPhotos } from './cover-photo';
import { uploadObject } from './documents';
import type { FileRefusal, LocalContext } from './files';
import { dbRefusal, idSchema } from './kit';
import { change, defineOp, refuse, unchanged } from './op';
import { viewRows } from './view';

const COVER_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;

const coverInputSchema = z.strictObject({ property_id: idSchema, path: z.string().trim().min(1).max(1000) });

/** What Ryan approves: the picture as it was hashed and the cover it replaces. Apply sends it only while both still hold. */
type CoverChange = {
  readonly property_id: string;
  readonly path: string;
  readonly file: { readonly name: string; readonly mime: keyof typeof COVER_TYPES; readonly size: number; readonly sha256: string };
  readonly before: string | null;
  readonly after: string;
};

export type CoverSet = { readonly property_id: string; readonly cover_photo_path: string };
export type CoverRefusal = FileRefusal | { readonly kind: 'file_changed' };

const isCoverType = (mime: string): mime is keyof typeof COVER_TYPES => Object.hasOwn(COVER_TYPES, mime);

/**
 * Sets a property's cover photo from a JPEG, PNG or WebP in the import folders, as the property page does: the object
 * goes to `property-photos` on the member's session, `cover_photo_path` points at it, then older objects are removed.
 * The object is named for its SHA-256, so the same picture is the same cover and a second apply plans as unchanged.
 * The cover it replaces stays in Storage, since undo points the row back at it; the next cover change sweeps it.
 */
export const propertyCover = defineOp<z.output<typeof coverInputSchema>, CoverChange, CoverSet, CoverRefusal, LocalContext>({
  creates: null,
  input: coverInputSchema,
  async plan(ctx, { property_id, path }) {
    const [property] = await viewRows(ctx, 'properties', { id: property_id });
    if (property === undefined) return refuse({ kind: 'invalid', issues: [{ path: 'property_id', code: 'not_found' }] });
    const read = await ctx.files.readDocument(path);
    if (!read.ok) return refuse(read.reason);
    const { name, mime, size, sha256 } = read.value;
    if (!isCoverType(mime)) return refuse({ kind: 'file', problem: 'unsupported_type' });
    if (size > MAX_COVER_BYTES) return refuse({ kind: 'file', problem: 'too_large' });
    const target = coverPhotoPath(ctx.householdId, property_id, `${sha256}.${COVER_TYPES[mime]}`);
    if (!target.ok) throw new Error(`Naming the cover failed: ${target.reason}`);
    const before = (await readCover(ctx.db, ctx.householdId, property_id))?.path ?? null;
    if (before === target.value) return unchanged({ property_id, cover_photo_path: target.value });
    return change({ property_id, path, file: { name, mime, size, sha256 }, before, after: target.value });
  },
  async apply(ctx, { property_id, path, file, before, after }) {
    const read = await ctx.files.readDocument(path);
    if (!read.ok || read.value.sha256 !== file.sha256) return refuse({ kind: 'file_changed' });
    if (!(await uploadObject(ctx.db, PROPERTY_PHOTOS_BUCKET, after, read.value.bytes, file.mime))) return refuse({ kind: 'failed' });
    const point = ctx.db.from('properties').update({ cover_photo_path: after }).eq('household_id', ctx.householdId).eq('id', property_id).is('deleted_at', null);
    const { data, error } = await (before === null ? point.is('cover_photo_path', null) : point.eq('cover_photo_path', before)).select('id').maybeSingle();
    if (error) return refuse(dbRefusal(error));
    if (data === null) return refuse({ kind: 'conflict' });
    await sweepPhotos(ctx.db, ctx.householdId, property_id, { path: after, inclusive: false }, before);
    return { ok: true, value: { property_id, cover_photo_path: after } };
  },
  async preview(ctx, { property_id, file }) {
    const [property] = await viewRows(ctx, 'properties', { id: property_id });
    return { property: property?.nickname ?? null, file_name: file.name, size_display: `${Math.max(1, Math.round(file.size / 1024))} KB` };
  },
});
