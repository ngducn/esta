'use client';

import { useEffect, useState } from 'react';
import type { DocumentStatuses } from '@/server/documents/extraction-status';
import { readDocumentStatuses } from '@/server/documents/status';

export type PollStep = { readonly everyMs: number; readonly times: number };

/**
 * Quick while a read usually ends (replay in seconds, a live read in 10 to 30 s), slower after, then not at all: about
 * five minutes and 39 requests in all, so a phone left on the page never polls for good.
 */
const POLL_STEPS: readonly PollStep[] = [
  { everyMs: 2_000, times: 5 },
  { everyMs: 5_000, times: 10 },
  { everyMs: 10_000, times: 24 },
];

const delays = (steps: readonly PollStep[]): readonly number[] => steps.flatMap(({ everyMs, times }) => Array<number>(times).fill(everyMs));

const isPending = (statuses: DocumentStatuses['statuses']) => Object.values(statuses).some((status) => status === 'queued' || status === 'running');

/**
 * The extraction state of the documents in a household, a property or one document, asked again on `POLL_DELAYS_MS`
 * while any is queued or running and never otherwise. A server render (after an upload) or the page being shown again
 * starts the schedule over.
 *
 * Polling, not Realtime: a Realtime subscription under RLS needs the member's access token in the browser, and the
 * session cookie is httpOnly so that page scripts never hold it (`server/supabase/session.ts`).
 */
export function useDocumentStatuses(
  id: string,
  rendered: DocumentStatuses,
  { by = 'property', steps = POLL_STEPS }: { by?: 'household' | 'property' | 'document'; steps?: readonly PollStep[] } = {},
): DocumentStatuses {
  const [polled, setPolled] = useState<{ readonly from: DocumentStatuses; readonly value: DocumentStatuses } | null>(null);
  const current = polled !== null && polled.from === rendered ? polled.value : rendered;
  const pending = isPending(current.statuses);

  useEffect(() => {
    if (!pending) return;
    let stopped = false;
    let timer: number | undefined;
    let asked = 0;
    let round = 0;
    const waits = delays(steps);
    const schedule = () => {
      const delay = waits[asked];
      if (delay === undefined) return;
      const mine = round;
      timer = window.setTimeout(() => {
        asked += 1;
        void readDocumentStatuses(id, by)
          .catch(() => null)
          .then((value) => {
            if (stopped) return;
            if (value !== null) setPolled({ from: rendered, value });
            if (mine === round) schedule();
          });
      }, delay);
    };
    const restart = () => {
      if (document.visibilityState !== 'visible') return;
      window.clearTimeout(timer);
      round += 1;
      asked = 0;
      schedule();
    };
    schedule();
    document.addEventListener('visibilitychange', restart);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', restart);
    };
  }, [pending, id, by, steps, rendered]);

  return current;
}
