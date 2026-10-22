import 'server-only';
import { isSchemaName, reviewFields, type SchemaName } from '@esta/core/extraction/fields';
import { z } from 'zod';
import { openDocument } from '@/server/documents/actions';
import { signPagePreviews, type PagePreviews } from '@/server/documents/sign';
import type { DocumentStatuses, ExtractionStatus } from '@/server/documents/extraction-status';
import { readDocumentStatuses } from '@/server/documents/status';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';
import { fieldViews, type FieldView } from './field-views';

export type ReviewDocument = {
  readonly id: string;
  readonly title: string;
  readonly mime: string;
  readonly pageCount: number;
  readonly propertyId: string | null;
  readonly category: string;
  /** The lease a scanned contract already belongs to (P3-19). */
  readonly leaseId: string | null;
};

export type ReviewExtraction = { readonly id: string; readonly status: ExtractionStatus; readonly schemaName: SchemaName; readonly result: unknown };

export type ReviewData = PagePreviews & {
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
    .select('id, title, mime, page_count, property_id, category, lease_id')
    .eq('household_id', member.household.id)
    .eq('id', documentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (document === null) return null;
  const [latest, fileUrl, previews, statuses, properties] = await Promise.all([
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
    signPagePreviews(member.household.id, documentId),
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
      leaseId: document.lease_id,
    },
    extraction,
    fileUrl,
    ...previews,
    statuses: statuses ?? { statuses: {}, workerOffline: false, offlineSince: null },
    canEdit: member.role !== 'viewer',
    properties: properties.data ?? [],
  };
}

/** What `ReviewPanel` shows for each extraction state; mirrors its `ReviewMode`, which a client module cannot export here. */
const MODES = {
  none: 'none',
  queued: 'waiting',
  running: 'waiting',
  needs_review: 'review',
  failed: 'manual',
  accepted: 'accepted',
  rejected: 'rejected',
} as const satisfies Readonly<Record<ExtractionStatus, string>>;

/** How the review heads the fields that sit outside any list. */
const ROOT_LIST = { certificate_v1: 'certificate', utility_bill_v1: 'bill', lease_v1: 'lease' } as const satisfies Record<SchemaName, string>;

export type ReviewPanelState = { readonly status: ExtractionStatus; readonly mode: (typeof MODES)[ExtractionStatus]; readonly fields: readonly FieldView[] };

/** The panel's mode and its rows: the read's fields to check, or for a failed read the empty form to fill by hand. */
export async function reviewPanelState(extraction: ReviewExtraction | null): Promise<ReviewPanelState> {
  const status = extraction?.status ?? 'none';
  const mode = MODES[status];
  const reviewed = extraction === null ? [] : mode === 'review' ? reviewFields(extraction.schemaName, extraction.result) : mode === 'manual' ? reviewFields(extraction.schemaName, null) : [];
  const fields = await fieldViews(reviewed, ROOT_LIST[extraction?.schemaName ?? 'certificate_v1']);
  return { status, mode, fields };
}
