import { foldVietnamese } from '../search/fold';

const MAX_NAME = 100;
const THUMB = 'thumb.webp';
const REVIEW = 'review.webp';
/** Uploads before 2026-10-19 also hold a blurred thumbnail, so an uploaded file never takes that name either. */
const DERIVED: ReadonlySet<string> = new Set([THUMB, 'thumb-blur.webp', REVIEW]);

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

/**
 * The headers of the PUT that sends a document's file or a copy made from it to its signed upload URL, from the browser
 * and from Ryan's Mac alike, so Storage keeps every object the same way. Upsert lets a retry rewrite the same path.
 */
export function signedUploadHeaders(contentType: string): Readonly<Record<string, string>> {
  return { 'content-type': contentType, 'x-upsert': 'true' };
}

/** Page 1 at review size, which the review screen shows in place of the full-size file until Mẹ zooms in. */
export function reviewPath(householdId: string, documentId: string): string {
  return `${householdId}/${documentId}/${REVIEW}`;
}
