import { z } from 'zod';
import { DOCUMENT_MIME_TYPES, MAX_DOCUMENT_BYTES } from './categories';

/** What the browser says about a file before it sends it; registering checks the stored object against it (DOC-1). */
export const documentFileSchema = z.object({
  filename: z.string().min(1).max(500),
  mime: z.enum(DOCUMENT_MIME_TYPES),
  size: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

/** A file the browser has sent to the paths its upload ticket signed, under the ticket's document id. */
export const sentDocumentSchema = documentFileSchema.extend({
  documentId: z.uuid(),
  pageCount: z.number().int().min(1).max(2000),
});
export type SentDocument = z.output<typeof sentDocumentSchema>;

export const documentTitleSchema = z.string().trim().min(1).max(200);
