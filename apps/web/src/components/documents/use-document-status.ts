'use client';

import { useEffect, useState } from 'react';
import type { DocumentStatuses } from '@/server/documents/extraction-status';
import { readDocumentStatuses } from '@/server/documents/status';

/** Within the 2 s the status change may take to reach the tile (P2-03 perf rule). */
export const STATUS_POLL_MS = 1_000;

const isPending = (statuses: DocumentStatuses['statuses']) => Object.values(statuses).some((status) => status === 'queued' || status === 'running');

/**
 * The extraction state of a property's documents, read again every second while any is queued or running and never
 * otherwise. A server render (after an upload) replaces whatever was polled before it.
 */
export function useDocumentStatuses(propertyId: string, rendered: DocumentStatuses): DocumentStatuses {
  const [polled, setPolled] = useState<{ readonly from: DocumentStatuses; readonly value: DocumentStatuses } | null>(null);
  const current = polled !== null && polled.from === rendered ? polled.value : rendered;
  const pending = isPending(current.statuses);

  useEffect(() => {
    if (!pending) return;
    let stopped = false;
    const timer = window.setInterval(() => {
      void readDocumentStatuses(propertyId)
        .catch(() => null)
        .then((value) => {
          if (!stopped && value !== null) setPolled({ from: rendered, value });
        });
    }, STATUS_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [pending, propertyId, rendered]);

  return current;
}
