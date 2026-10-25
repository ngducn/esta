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
const SCOPE_COLUMNS = { household: 'household_id', property: 'property_id', document: 'document_id' } as const;
const scope = z.enum(['household', 'property', 'document']);

/**
 * Each document's extraction state from the `document_status` view, never from the operator-only job tables, so a
 * member sees `Đang đọc` and its outcome but no diagnostics. The heartbeat says whether the worker is reading at all.
 * `by` reads the household's documents, one property's or one document.
 */
export async function readDocumentStatuses(id: unknown, by: unknown = 'property'): Promise<DocumentStatuses | null> {
  const parsed = z.uuid().safeParse(id);
  const column = scope.safeParse(by);
  if (!parsed.success || !column.success) return null;
  const supabase = await createSessionClient();
  const now = (await readRequestClock()).now();
  const [rows, heartbeat] = await Promise.all([
    supabase.from('document_status').select('document_id, status').eq(SCOPE_COLUMNS[column.data], parsed.data),
    getWorkerHeartbeat(now),
  ]);
  if (rows.error) return null;
  const statuses: Record<string, ExtractionStatus> = {};
  for (const row of rows.data) {
    const value = status.safeParse(row.status);
    if (row.document_id !== null && value.success) statuses[row.document_id] = value.data;
  }
  const worker = workerStatus(heartbeat, now, env.ESTA_TIMEZONE);
  const offlineSince = worker.kind === 'offline' ? (worker.earlierDate === null ? worker.time : `${worker.time} ${formatDate(worker.earlierDate, 'vi')}`) : null;
  return { statuses, workerOffline: worker.kind === 'offline' || worker.kind === 'never', offlineSince };
}
