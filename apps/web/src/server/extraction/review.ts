import 'server-only';
import { isSchemaName, type SchemaName } from '@esta/core/extraction/fields';
import { z } from 'zod';
import { openDocument } from '@/server/documents/actions';
import type { DocumentStatuses, ExtractionStatus } from '@/server/documents/extraction-status';
import { readDocumentStatuses } from '@/server/documents/status';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

export type ReviewDocument = {
  readonly id: string;
  readonly title: string;
  readonly mime: string;
  readonly pageCount: number;
  readonly propertyId: string | null;
  readonly category: string;
};

export type ReviewExtraction = { readonly id: string; readonly status: ExtractionStatus; readonly schemaName: SchemaName; readonly result: unknown };

export type ReviewData = {
  readonly document: ReviewDocument;
  readonly extraction: ReviewExtraction | null;
  /** A signed URL to the file; null when Storage refused it. Signing it logs a view (DOC-4). */
  readonly fileUrl: string | null;
  readonly statuses: DocumentStatuses;
  readonly canEdit: boolean;
  /** Only for a document filed without a property, which needs one before it is saved. */
  readonly properties: readonly { readonly id: string; readonly nickname: string }[];
};

/** The document and its latest extraction under the member's RLS; another household's document reads as absent. */
export async function loadReview(documentId: string): Promise<ReviewData | null> {
  if (!z.uuid().safeParse(documentId).success) return null;
  const member = await requireMember();
  const supabase = await createSessionClient();
  const { data: document } = await supabase
    .from('documents')
    .select('id, title, mime, page_count, property_id, category')
    .eq('household_id', member.household.id)
    .eq('id', documentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (document === null) return null;
  const [latest, fileUrl, statuses, properties] = await Promise.all([
    supabase
      .from('document_extractions')
      .select('id, status, schema_name, result')
      .eq('household_id', member.household.id)
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
    openDocument(documentId, 'view'),
    readDocumentStatuses(documentId, 'document'),
    document.property_id === null
      ? supabase.from('properties').select('id, nickname').eq('household_id', member.household.id).order('nickname')
      : Promise.resolve({ data: [] }),
  ]);
  const row = latest.data;
  const extraction = row !== null && isSchemaName(row.schema_name) ? { id: row.id, status: row.status as ExtractionStatus, schemaName: row.schema_name, result: row.result } : null;
  return {
    document: {
      id: document.id,
      title: document.title,
      mime: document.mime,
      pageCount: document.page_count ?? 1,
      propertyId: document.property_id,
      category: document.category,
    },
    extraction,
    fileUrl,
    statuses: statuses ?? { statuses: {}, workerOffline: false, offlineSince: null },
    canEdit: member.role !== 'viewer',
    properties: properties.data ?? [],
  };
}
