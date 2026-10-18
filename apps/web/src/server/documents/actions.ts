'use server';

import {
  acceptsMime,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_IDS,
  DOCUMENT_MIME_TYPES,
  documentObjectName,
  MAX_DOCUMENT_BYTES,
  storagePath,
  thumbBlurPath,
  thumbPath,
} from '@esta/core/documents';
import { isIsoDate } from '@esta/core/date';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { readRequestClock } from '@/server/clock';
import { env } from '@/server/env';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';
import { DOCUMENTS_BUCKET, signDocumentUrl } from './sign';

const id = z.uuid();

const fileSchema = z.object({
  filename: z.string().min(1).max(500),
  mime: z.enum(DOCUMENT_MIME_TYPES),
  size: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

const uploadSchema = fileSchema.extend({ propertyId: id, category: z.enum(DOCUMENT_CATEGORY_IDS) });

const registerSchema = uploadSchema.extend({
  documentId: id,
  title: z.string().trim().min(1).max(200),
  expiresOn: z.string().refine(isIsoDate).nullable(),
  sensitive: z.boolean(),
  pageCount: z.number().int().min(1).max(2000),
});

export type UploadTarget = { readonly path: string; readonly url: string };

export type UploadTicket =
  | {
      readonly ok: true;
      readonly documentId: string;
      readonly file: UploadTarget;
      readonly thumb: UploadTarget;
      readonly thumbBlur: UploadTarget;
      readonly duplicates: readonly { readonly id: string; readonly title: string }[];
    }
  | { readonly ok: false };

/**
 * Picks the document id and signs one upload URL for the file and one for each thumbnail. The browser sends the bytes
 * straight to Storage; the session client signs, so the storage insert policy decides. Upsert lets a retry rewrite
 * the same path. Same-household rows with the same SHA-256 come back for the duplicate warning.
 */
export async function createDocumentUpload(input: unknown): Promise<UploadTicket> {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success || !acceptsMime(parsed.data.category, parsed.data.mime)) return { ok: false };
  const member = await requireMember();
  if (member.role === 'viewer') return { ok: false };
  const household = member.household.id;
  const documentId = randomUUID();
  const supabase = await createSessionClient();
  const sign = async (path: string): Promise<UploadTarget | null> => {
    const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path, { upsert: true });
    return error ? null : { path: data.path, url: data.signedUrl };
  };
  const [file, thumb, thumbBlur, duplicates] = await Promise.all([
    sign(storagePath(household, documentId, parsed.data.filename)),
    sign(thumbPath(household, documentId)),
    sign(thumbBlurPath(household, documentId)),
    supabase
      .from('documents')
      .select('id, title')
      .eq('household_id', household)
      .eq('sha256', parsed.data.sha256)
      .is('deleted_at', null)
      .order('created_at'),
  ]);
  if (file === null || thumb === null || thumbBlur === null || duplicates.error) return { ok: false };
  return { ok: true, documentId, file, thumb, thumbBlur, duplicates: duplicates.data };
}

export type Registered = { readonly ok: true; readonly title: string } | { readonly ok: false };

/** Writes the row once the file is in Storage. A retry with the same id converges on one row. */
export async function registerDocument(input: unknown): Promise<Registered> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success || !acceptsMime(parsed.data.category, parsed.data.mime)) return { ok: false };
  const { documentId, propertyId, category, title, expiresOn, sensitive, filename, mime, size, sha256, pageCount } = parsed.data;
  const member = await requireMember();
  const household = member.household.id;
  const name = documentObjectName(filename);
  const supabase = await createSessionClient();
  const { data: objects, error: listError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .list(`${household}/${documentId}`, { search: name, limit: 10 });
  const stored = objects?.find((object) => object.name === name);
  if (listError || stored === undefined || stored.metadata?.size !== size) return { ok: false };
  const { error } = await supabase.from('documents').upsert(
    {
      id: documentId,
      household_id: household,
      property_id: propertyId,
      category,
      title,
      storage_path: storagePath(household, documentId, filename),
      mime,
      size_bytes: size,
      page_count: pageCount,
      sha256,
      sensitivity: sensitive ? 'sensitive' : 'normal',
      expires_on: expiresOn,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error) return { ok: false };
  // The file is saved either way; a failed enqueue leaves the tile without a reading state rather than losing the upload.
  if (DOCUMENT_CATEGORIES[category].extractionSchema !== null) {
    await supabase.rpc('enqueue_extract_document', { p_document_id: documentId, p_as_of: (await readRequestClock()).now() });
  }
  return { ok: true, title };
}

type AccessAction = 'view' | 'download' | 'share';

async function signAndLog(documentId: unknown, action: AccessAction, pathOf: (row: { household_id: string; id: string; storage_path: string }) => string) {
  const parsed = id.safeParse(documentId);
  if (!parsed.success) return null;
  const supabase = await createSessionClient();
  const { data: row, error } = await supabase.from('documents').select('id, household_id, storage_path').eq('id', parsed.data).maybeSingle();
  if (error || row === null) return null;
  const url = await signDocumentUrl(pathOf(row), env.ESTA_SIGNED_URL_TTL_SECONDS);
  if (url === null) return null;
  const { error: logError } = await supabase.from('document_access_log').insert({ household_id: row.household_id, document_id: row.id, action });
  return logError ? null : url;
}

/** Selects the row under RLS, signs the file for `ESTA_SIGNED_URL_TTL_SECONDS` and logs the open (DOC-4). */
export async function openDocument(documentId: unknown, action: AccessAction = 'view'): Promise<string | null> {
  return signAndLog(documentId, action, (row) => row.storage_path);
}

/** The clear thumbnail of a sensitive document, signed only on a tap of `Xem` and logged as a view (DOC-5). */
export async function revealThumbnail(documentId: unknown): Promise<string | null> {
  return signAndLog(documentId, 'view', (row) => thumbPath(row.household_id, row.id));
}

async function setDeletedAt(documentId: unknown, deletedAt: string | null): Promise<boolean> {
  const parsed = id.safeParse(documentId);
  if (!parsed.success) return false;
  const member = await requireMember();
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('documents')
    .update({ deleted_at: deletedAt })
    .eq('household_id', member.household.id)
    .eq('id', parsed.data)
    .select('id');
  return !error && data.length === 1;
}

export async function archiveDocument(documentId: unknown): Promise<boolean> {
  return setDeletedAt(documentId, (await readRequestClock()).now());
}

export async function restoreDocument(documentId: unknown): Promise<boolean> {
  return setDeletedAt(documentId, null);
}
