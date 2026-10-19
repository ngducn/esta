'use server';

import {
  acceptsMime,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_IDS,
  DOCUMENT_MIME_TYPES,
  documentObjectName,
  MAX_DOCUMENT_BYTES,
  reviewPath,
  storagePath,
  thumbPath,
} from '@esta/core/documents';
import { isIsoDate } from '@esta/core/date';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
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
  pageCount: z.number().int().min(1).max(2000),
});

export type UploadTarget = { readonly path: string; readonly url: string };

export type UploadTicket =
  | {
      readonly ok: true;
      readonly documentId: string;
      readonly file: UploadTarget;
      readonly thumb: UploadTarget;
      readonly review: UploadTarget;
      readonly duplicates: readonly { readonly id: string; readonly title: string }[];
    }
  | { readonly ok: false };

/**
 * Picks the document id and signs one upload URL for the file and one for each preview made from it. The browser
 * sends the bytes straight to Storage; the session client signs, so the storage insert policy decides. Upsert lets a
 * retry rewrite the same path. Same-household rows with the same SHA-256 come back for the duplicate warning.
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
  const [file, thumb, review, duplicates] = await Promise.all([
    sign(storagePath(household, documentId, parsed.data.filename)),
    sign(thumbPath(household, documentId)),
    sign(reviewPath(household, documentId)),
    supabase
      .from('documents')
      .select('id, title')
      .eq('household_id', household)
      .eq('sha256', parsed.data.sha256)
      .is('deleted_at', null)
      .order('created_at'),
  ]);
  if (file === null || thumb === null || review === null || duplicates.error) return { ok: false };
  return { ok: true, documentId, file, thumb, review, duplicates: duplicates.data };
}

export type Registered = { readonly ok: true; readonly title: string } | { readonly ok: false };

/** Writes the row once the file is in Storage, sensitive when its category is (DOC-5). A retry converges on one row. */
export async function registerDocument(input: unknown): Promise<Registered> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success || !acceptsMime(parsed.data.category, parsed.data.mime)) return { ok: false };
  const { documentId, propertyId, category, title, expiresOn, filename, mime, size, sha256, pageCount } = parsed.data;
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
      sensitivity: DOCUMENT_CATEGORIES[category].sensitivity,
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
  const url = await signDocumentUrl(pathOf(row), env.ESTA_SIGNED_URL_TTL_SECONDS, { download: action === 'download' });
  if (url === null) return null;
  const { error: logError } = await supabase.from('document_access_log').insert({ household_id: row.household_id, document_id: row.id, action });
  return logError ? null : url;
}

/** Selects the row under RLS, signs the file for `ESTA_SIGNED_URL_TTL_SECONDS` and logs the open (DOC-4). */
export async function openDocument(documentId: unknown, action: AccessAction = 'view'): Promise<string | null> {
  return signAndLog(documentId, action, (row) => row.storage_path);
}

/** `Tải xuống`: the file signed as an attachment, logged as a download (DOC-4). */
export async function downloadDocument(documentId: unknown): Promise<string | null> {
  return signAndLog(documentId, 'download', (row) => row.storage_path);
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

const tagSchema = z.string().trim().min(1).max(40);

const editSchema = z.object({
  documentId: id,
  title: z.string().trim().min(1).max(200),
  category: z.enum(DOCUMENT_CATEGORY_IDS),
  propertyId: id.nullable(),
  expiresOn: z.string().refine(isIsoDate).nullable(),
  tags: z.array(tagSchema).max(20),
});

export type DocumentEdit = z.output<typeof editSchema>;

export type DocumentUpdate = { readonly ok: true; readonly previous: DocumentEdit } | { readonly ok: false; readonly reason: 'invalid' | 'forbidden' | 'failed' };

/**
 * `Sửa thông tin`: writes what the row says about the document, the title and tags as typed (D11), and returns what it
 * said before, so the undo toast writes that back through this same action. The category sets the sensitivity, and a
 * document turned sensitive drops its read text, which the database refuses to keep on a sensitive row.
 */
export async function updateDocument(input: unknown): Promise<DocumentUpdate> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  const member = await requireMember();
  if (member.role === 'viewer') return { ok: false, reason: 'forbidden' };
  const { documentId, title, category, propertyId, expiresOn, tags } = parsed.data;
  const household = member.household.id;
  const supabase = await createSessionClient();
  const { data: row, error: readError } = await supabase
    .from('documents')
    .select('title, category, property_id, expires_on, tags, mime')
    .eq('household_id', household)
    .eq('id', documentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (readError || row === null) return { ok: false, reason: 'failed' };
  if (!acceptsMime(category, row.mime)) return { ok: false, reason: 'invalid' };
  const previous = editSchema.safeParse({
    documentId,
    title: row.title,
    category: row.category,
    propertyId: row.property_id,
    expiresOn: row.expires_on,
    tags: row.tags,
  });
  if (!previous.success) return { ok: false, reason: 'failed' };
  const { sensitivity } = DOCUMENT_CATEGORIES[category];
  const { data, error } = await supabase
    .from('documents')
    .update({
      title,
      category,
      property_id: propertyId,
      expires_on: expiresOn,
      tags: [...new Set(tags)],
      sensitivity,
      ...(sensitivity === 'sensitive' ? { ocr_text: null } : {}),
    })
    .eq('household_id', household)
    .eq('id', documentId)
    .select('id');
  if (error || data.length !== 1) return { ok: false, reason: 'failed' };
  revalidatePath('/documents', 'layout');
  for (const property of new Set([row.property_id, propertyId])) if (property !== null) revalidatePath(`/properties/${property}`, 'layout');
  return { ok: true, previous: previous.data };
}
