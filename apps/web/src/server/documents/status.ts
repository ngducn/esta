'use server';

import { workerStatus } from '@esta/core/agent';
import { z } from 'zod';
import { getWorkerHeartbeat } from '@/server/assistant';
import { readRequestClock } from '@/server/clock';
import { env } from '@/server/env';
import { createSessionClient } from '@/server/supabase/server';
import { EXTRACTION_STATUSES, type DocumentStatuses, type ExtractionStatus } from './extraction-status';

const status = z.enum(EXTRACTION_STATUSES);

/**
 * Each document's extraction state from the `document_status` view, never from the operator-only job tables, so a
 * member sees `Đang đọc` and its outcome but no diagnostics. The heartbeat says whether the worker is reading at all.
 */
export async function readDocumentStatuses(propertyId: unknown): Promise<DocumentStatuses | null> {
  const parsed = z.uuid().safeParse(propertyId);
  if (!parsed.success) return null;
  const supabase = await createSessionClient();
  const now = (await readRequestClock()).now();
  const [rows, lastSeenAt] = await Promise.all([
    supabase.from('document_status').select('document_id, status').eq('property_id', parsed.data),
    getWorkerHeartbeat(now),
  ]);
  if (rows.error) return null;
  const statuses: Record<string, ExtractionStatus> = {};
  for (const row of rows.data) {
    const value = status.safeParse(row.status);
    if (row.document_id !== null && value.success) statuses[row.document_id] = value.data;
  }
  return { statuses, workerOffline: workerStatus(lastSeenAt, now, env.ESTA_TIMEZONE).kind !== 'online' };
}
