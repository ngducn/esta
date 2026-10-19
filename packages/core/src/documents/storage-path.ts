import { foldVietnamese } from '../search/fold';

const MAX_NAME = 100;
const THUMB = 'thumb.webp';
const THUMB_BLUR = 'thumb-blur.webp';
const REVIEW = 'review.webp';
const DERIVED: ReadonlySet<string> = new Set([THUMB, THUMB_BLUR, REVIEW]);

/** The object name pattern the `documents` bucket policies and the `storage_path` check accept. */
export const DOCUMENT_OBJECT_NAME = /^(?=.{1,100}$)[a-z0-9-]+(\.[a-z0-9]{1,8})?$/;

const slug = (text: string) => foldVietnamese(text.normalize('NFC')).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** An ASCII object name for an uploaded file, at most 100 characters, never the name of a copy made from it. */
export function documentObjectName(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const extension = dot > 0 ? slug(filename.slice(dot + 1)).replaceAll('-', '').slice(0, 8) : '';
  const suffix = extension === '' ? '' : `.${extension}`;
  const base = slug(dot > 0 ? filename.slice(0, dot) : filename).slice(0, MAX_NAME - suffix.length).replace(/-+$/, '') || 'tai-lieu';
  const name = `${base}${suffix}`;
  return DERIVED.has(name) ? `file-${name}` : name;
}

/** `<household_id>/<document_id>/<name>`, the folder that holds the file and the copies made from it at upload. */
export function storagePath(householdId: string, documentId: string, filename: string): string {
  return `${householdId}/${documentId}/${documentObjectName(filename)}`;
}

export function thumbPath(householdId: string, documentId: string): string {
  return `${householdId}/${documentId}/${THUMB}`;
}

/** The only thumbnail a sensitive document's tile receives before Mẹ taps `Xem` (DOC-5). */
export function thumbBlurPath(householdId: string, documentId: string): string {
  return `${householdId}/${documentId}/${THUMB_BLUR}`;
}

/** Page 1 at review size, which the review screen shows in place of the full-size file until Mẹ zooms in. */
export function reviewPath(householdId: string, documentId: string): string {
  return `${householdId}/${documentId}/${REVIEW}`;
}
