import { acceptsMime, DOCUMENT_CATEGORY_IDS, documentTitleSchema, type DocumentCategory, type DocumentMimeType } from '@esta/core/documents';
import { PREVIEW_MIME } from '@esta/core/documents/previews';
import type { IsoDate } from '@esta/core/date';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { z } from 'zod';
import { documentRegister, documentsWithHash, savedDocument, sendDocumentUpload, signDocumentUploads, type DocumentSaved, type NewDocument, type NotUploaded } from './documents';
import type { FileRefusal, LocalContext } from './files';
import { idSchema, optionalIdSchema, type CommonRefusal } from './kit';
import { change, defineOp, refuse, runOp, unchanged } from './op';

const attachInputSchema = z.object({
  id: idSchema,
  path: z.string().trim().min(1).max(1000),
  property_id: idSchema,
  category: z.enum(DOCUMENT_CATEGORY_IDS),
  title: documentTitleSchema,
  lease_id: optionalIdSchema.default(null),
  expires_on: isoDateSchema.nullable().default(null),
  /** Ryan's answer to the vault's duplicate question: these bytes are already in the household, and he wants them again. */
  allow_duplicate: z.boolean().default(false),
});

/** What Ryan approves: the file as it was hashed, and where it goes. Apply sends it only while it still hashes the same. */
type Attachment = {
  readonly id: string;
  readonly path: string;
  readonly file: { readonly name: string; readonly mime: DocumentMimeType; readonly size: number; readonly sha256: string; readonly pageCount: number };
  readonly property_id: string;
  readonly lease_id: string | null;
  readonly category: DocumentCategory;
  readonly title: string;
  readonly expires_on: IsoDate | null;
};

export type AttachRefusal =
  | FileRefusal
  | { readonly kind: 'duplicate'; readonly documents: readonly DocumentSaved[] }
  | { readonly kind: 'file_changed' }
  | NotUploaded;

/** The property must be live in the household, and a lease must be one of its leases. */
async function placeRefusal(ctx: LocalContext, propertyId: string, leaseId: string | null): Promise<CommonRefusal | null> {
  const property = await ctx.db.from('properties').select('id').eq('household_id', ctx.householdId).eq('id', propertyId).is('deleted_at', null).maybeSingle();
  if (property.error) throw new Error(`Reading the property failed: ${property.error.message}`);
  if (property.data === null) return { kind: 'invalid', issues: [{ path: 'property_id', code: 'not_found' }] };
  if (leaseId === null) return null;
  const lease = await ctx.db.from('leases').select('id').eq('household_id', ctx.householdId).eq('id', leaseId).eq('property_id', propertyId).maybeSingle();
  if (lease.error) throw new Error(`Reading the lease failed: ${lease.error.message}`);
  return lease.data === null ? { kind: 'invalid', issues: [{ path: 'lease_id', code: 'not_found' }] } : null;
}

/**
 * Files a document from Ryan's Mac into the vault exactly as an upload there does: the same signed upload, the same
 * previews and the same registration. Planning hashes the file; applying reads it again and sends those bytes only if
 * they still hash the same, so nothing reaches the vault that Ryan did not see in the plan.
 */
export const documentAttach = defineOp<z.output<typeof attachInputSchema>, Attachment, DocumentSaved, AttachRefusal, LocalContext>({
  creates: 'documents',
  input: attachInputSchema,
  async plan(ctx, input) {
    const saved = await savedDocument(ctx, input.id);
    if (saved !== null) return unchanged(saved);
    const read = await ctx.files.readDocument(input.path);
    if (!read.ok) return refuse(read.reason);
    const { name, mime, size, sha256, pageCount } = read.value;
    if (!acceptsMime(input.category, mime)) return refuse({ kind: 'invalid', issues: [{ path: 'category', code: 'not_for_file_type' }] });
    const place = await placeRefusal(ctx, input.property_id, input.lease_id);
    if (place !== null) return refuse(place);
    const duplicates = await documentsWithHash(ctx.db, ctx.householdId, sha256);
    if (duplicates === null) throw new Error('Reading the documents with the same bytes failed');
    if (duplicates.length > 0 && !input.allow_duplicate) return refuse({ kind: 'duplicate', documents: duplicates });
    const { id, path, property_id, lease_id, category, title, expires_on } = input;
    return change({ id, path, file: { name, mime, size, sha256, pageCount }, property_id, lease_id, category, title, expires_on });
  },
  async apply(ctx, attachment) {
    const { id, file } = attachment;
    const read = await ctx.files.readDocument(attachment.path);
    if (!read.ok || read.value.sha256 !== file.sha256) return refuse({ kind: 'file_changed' });
    const uploads = await signDocumentUploads(ctx.db, ctx.householdId, id, file.name);
    if (uploads === null) return refuse({ kind: 'failed' });
    const previews = await ctx.files.previews(read.value);
    const sent = await Promise.all([
      sendDocumentUpload(ctx.db, uploads.file, read.value.bytes, file.mime),
      sendDocumentUpload(ctx.db, uploads.thumb, previews.thumb, PREVIEW_MIME),
      sendDocumentUpload(ctx.db, uploads.review, previews.review, PREVIEW_MIME),
    ]);
    if (!sent.every(Boolean)) return refuse({ kind: 'failed' });
    const document: NewDocument = {
      documentId: id,
      propertyId: attachment.property_id,
      leaseId: attachment.lease_id,
      category: attachment.category,
      title: attachment.title,
      expiresOn: attachment.expires_on,
      filename: file.name,
      mime: file.mime,
      size: file.size,
      sha256: file.sha256,
      pageCount: file.pageCount,
    };
    return runOp(documentRegister, ctx, document);
  },
});
