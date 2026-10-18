export const EXTRACTION_STATUSES = ['none', 'queued', 'running', 'needs_review', 'accepted', 'rejected', 'failed'] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export type DocumentStatuses = {
  readonly statuses: Readonly<Record<string, ExtractionStatus>>;
  readonly workerOffline: boolean;
  /** The last heartbeat as `HH:mm`, with its date when it is an earlier day; null when the worker is online or never ran. */
  readonly offlineSince?: string | null;
};
