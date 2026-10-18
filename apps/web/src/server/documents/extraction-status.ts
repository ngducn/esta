export const EXTRACTION_STATUSES = ['none', 'queued', 'running', 'needs_review', 'accepted', 'rejected', 'failed'] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export type DocumentStatuses = { readonly statuses: Readonly<Record<string, ExtractionStatus>>; readonly workerOffline: boolean };
