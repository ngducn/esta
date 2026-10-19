import {
  acceptsMime,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_IDS,
  documentObjectName,
  documentTitleSchema,
  reviewPath,
  sentDocumentSchema,
  storagePath,
  thumbPath,
} from '@esta/core/documents';
import { isoDateSchema } from '@esta/core/schemas/legal';
import type { TablesInsert } from '@esta/db';
import { z } from 'zod';
import type { Db } from './db';
import { dbRefusal, idSchema, optionalIdSchema } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';

export const DOCUMENTS_BUCKET = 'documents';

export type SignedUpload = { readonly path: string; readonly url: string; readonly token: string };
/** Where the file and the two copies made from it go, each signed for one upload. */
export type DocumentUploads = { readonly file: SignedUpload; readonly thumb: SignedUpload; readonly review: SignedUpload };
export type DocumentSaved = { readonly id: string; readonly title: string };

/**
 * Signs one upload URL for the file and one for each preview, on the member's session, so the storage insert policy
 * decides. Upsert lets a retry rewrite the same path. Null when Storage refuses any of them.
 */
export async function signDocumentUploads(db: Db, householdId: string, documentId: string, filename: string): Promise<DocumentUploads | null> {
  const sign = async (path: string): Promise<SignedUpload | null> => {
    const { data, error } = await db.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path, { upsert: true });
    return error ? null : { path: data.path, url: data.signedUrl, token: data.token };
  };
  const [file, thumb, review] = await Promise.all([
    sign(storagePath(householdId, documentId, filename)),
    sign(thumbPath(householdId, documentId)),
    sign(reviewPath(householdId, documentId)),
  ]);
  return file === null || thumb === null || review === null ? null : { file, thumb, review };
}

/** The bytes of a file read on a server or on Ryan's Mac, sent to the paths `signDocumentUploads` signed. */
export async function sendDocumentUpload(db: Db, upload: SignedUpload, bytes: Uint8Array, contentType: string): Promise<boolean> {
  const { error } = await db.storage.from(DOCUMENTS_BUCKET).uploadToSignedUrl(upload.path, upload.token, bytes, { contentType, upsert: true });
  return error === null;
}

/** The household's live documents with these bytes, oldest first, for the duplicate question; null when the read failed. */
export async function documentsWithHash(db: Db, householdId: string, sha256: string): Promise<readonly DocumentSaved[] | null> {
  const { data, error } = await db.from('documents').select('id, title').eq('household_id', householdId).eq('sha256', sha256).is('deleted_at', null).order('created_at');
  return error ? null : data;
}

export async function savedDocument(ctx: OpContext, id: string): Promise<DocumentSaved | null> {
  const { data, error } = await ctx.db.from('documents').select('id, title').eq('household_id', ctx.householdId).eq('id', id).maybeSingle();
  if (error) throw new Error(`Reading the document failed: ${error.message}`);
  return data;
}

export const newDocumentSchema = sentDocumentSchema.extend({
  propertyId: idSchema,
  category: z.enum(DOCUMENT_CATEGORY_IDS),
  title: documentTitleSchema,
  expiresOn: isoDateSchema.nullable(),
  leaseId: optionalIdSchema.default(null),
});
export type NewDocument = z.output<typeof newDocumentSchema>;

/**
 * The row that registers a document whose file is in Storage, or null when its category refuses the file's type or
 * Storage does not hold the file at the size the sender said (DOC-1). Once the row exists the storage policies freeze
 * the document's folder (documents.sql). `documentRegister` writes it alone; `save_expense` writes it with the expense
 * its receipt belongs to.
 */
export async function documentRow(db: Db, householdId: string, document: NewDocument) {
  const { documentId, propertyId, category, title, expiresOn, leaseId, filename, mime, size, sha256, pageCount } = document;
  if (!acceptsMime(category, mime)) return null;
  const name = documentObjectName(filename);
  const { data: objects, error } = await db.storage.from(DOCUMENTS_BUCKET).list(`${householdId}/${documentId}`, { search: name, limit: 10 });
  const stored = objects?.find((object) => object.name === name);
  if (error || stored === undefined || stored.metadata?.size !== size) return null;
  return {
    id: documentId,
    household_id: householdId,
    property_id: propertyId,
    category,
    title,
    storage_path: storagePath(householdId, documentId, filename),
    mime,
    size_bytes: size,
    page_count: pageCount,
    sha256,
    sensitivity: DOCUMENT_CATEGORIES[category].sensitivity,
    expires_on: expiresOn,
    lease_id: leaseId,
  } satisfies TablesInsert<'documents'>;
}

type DocumentRow = NonNullable<Awaited<ReturnType<typeof documentRow>>>;
export type NotUploaded = { readonly kind: 'not_uploaded' };

/**
 * Registers a document whose file has been sent, the last step of every upload: the vault's, the property wizard's and
 * the connector's. A certificate or a bill is then queued for reading; the file is saved either way, and a failed
 * enqueue leaves the tile without a reading state rather than losing the upload.
 */
export const documentRegister = defineOp<NewDocument, DocumentRow, DocumentSaved, NotUploaded>({
  creates: 'documents',
  input: newDocumentSchema,
  async plan(ctx, document) {
    const saved = await savedDocument(ctx, document.documentId);
    if (saved !== null) return unchanged(saved);
    if (!acceptsMime(document.category, document.mime)) return refuse({ kind: 'invalid', issues: [{ path: 'mime', code: 'not_for_category' }] });
    const row = await documentRow(ctx.db, ctx.householdId, document);
    return row === null ? refuse({ kind: 'not_uploaded' }) : change(row);
  },
  async apply(ctx, row) {
    const { error } = await ctx.db.from('documents').insert(row);
    if (error) return refuse(dbRefusal(error));
    if (DOCUMENT_CATEGORIES[row.category].extractionSchema !== null) {
      await ctx.db.rpc('enqueue_extract_document', { p_document_id: row.id, p_as_of: ctx.clock.now() });
    }
    return { ok: true, value: { id: row.id, title: row.title } };
  },
});
