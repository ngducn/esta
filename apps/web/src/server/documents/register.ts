import 'server-only';
import type { IsoDate } from '@esta/core/date';
import { acceptsMime, DOCUMENT_CATEGORIES, documentObjectName, storagePath, type DocumentCategory, type SentDocument } from '@esta/core/documents';
import type { TablesInsert } from '@esta/db';
import { createSessionClient } from '@/server/supabase/server';
import { DOCUMENTS_BUCKET } from './sign';

export type NewDocument = SentDocument & {
  readonly propertyId: string;
  readonly category: DocumentCategory;
  readonly title: string;
  readonly expiresOn: IsoDate | null;
  readonly leaseId: string | null;
};

/**
 * The row that registers a document whose file the browser has sent, or null when its category refuses the file's type
 * or Storage does not hold the file at the size the browser said (DOC-1). Once the row exists the storage policies
 * freeze the document's folder (documents.sql). `registerDocument` writes it alone; `save_expense` writes it with the
 * expense its receipt belongs to.
 */
export async function documentRow(household: string, document: NewDocument) {
  const { documentId, propertyId, category, title, expiresOn, leaseId, filename, mime, size, sha256, pageCount } = document;
  if (!acceptsMime(category, mime)) return null;
  const name = documentObjectName(filename);
  const supabase = await createSessionClient();
  const { data: objects, error } = await supabase.storage.from(DOCUMENTS_BUCKET).list(`${household}/${documentId}`, { search: name, limit: 10 });
  const stored = objects?.find((object) => object.name === name);
  if (error || stored === undefined || stored.metadata?.size !== size) return null;
  return {
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
    lease_id: leaseId,
  } satisfies TablesInsert<'documents'>;
}
