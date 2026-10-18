'use server';

import { workerStatus } from '@esta/core/agent';
import { formatDate } from '@esta/core/format';
import { z } from 'zod';
import { getWorkerHeartbeat } from '@/server/assistant';
import { readRequestClock } from '@/server/clock';
import { env } from '@/server/env';
import { createSessionClient } from '@/server/supabase/server';
import { EXTRACTION_STATUSES, type DocumentStatuses, type ExtractionStatus } from './extraction-status';

const status = z.enum(EXTRACTION_STATUSES);
const scope = z.enum(['property', 'document']);

/**
 * Each document's extraction state from the `document_status` view, never from the operator-only job tables, so a
 * member sees `Đang đọc` and its outcome but no diagnostics. The heartbeat says whether the worker is reading at all.
 * `by` reads one property's documents or one document.
 */
export async function readDocumentStatuses(id: unknown, by: unknown = 'property'): Promise<DocumentStatuses | null> {
  const parsed = z.uuid().safeParse(id);
  const column = scope.safeParse(by);
  if (!parsed.success || !column.success) return null;
  const supabase = await createSessionClient();
  const now = (await readRequestClock()).now();
  const [rows, lastSeenAt] = await Promise.all([
    supabase.from('document_status').select('document_id, status').eq(column.data === 'property' ? 'property_id' : 'document_id', parsed.data),
    getWorkerHeartbeat(now),
  ]);
  if (rows.error) return null;
  const statuses: Record<string, ExtractionStatus> = {};
  for (const row of rows.data) {
    const value = status.safeParse(row.status);
    if (row.document_id !== null && value.success) statuses[row.document_id] = value.data;
  }
  const worker = workerStatus(lastSeenAt, now, env.ESTA_TIMEZONE);
  const offlineSince = worker.kind === 'offline' ? (worker.earlierDate === null ? worker.time : `${worker.time} ${formatDate(worker.earlierDate, 'vi')}`) : null;
  return { statuses, workerOffline: worker.kind !== 'online', offlineSince };
}
