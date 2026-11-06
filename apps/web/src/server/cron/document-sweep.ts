import 'server-only';
import type { Clock, IsoDate } from '@esta/core';
import { cronHandler } from './handler';
import type { CronClient } from './supabase';

export type DocumentSweepRun = { ok: true; as_of: IsoDate; strays: number; erased: number; settled: number };

const BUCKET = 'documents';
const REMOVE_CHUNK = 100;

/** Removes the names through the Storage API, which SQL cannot; returns how many Storage confirmed and how many it did not. */
async function removeFiles(client: CronClient, names: readonly string[]): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;
  for (let from = 0; from < names.length; from += REMOVE_CHUNK) {
    const chunk = names.slice(from, from + REMOVE_CHUNK);
    const { data, error } = await client.storage.from(BUCKET).remove(chunk);
    if (error) failed += chunk.length;
    else removed += data.length;
  }
  return { removed, failed };
}

/**
 * Daily: finishes the removal of erased ID cards' files that an interrupted erase left behind, then removes files in
 * folders no document row names once Storage holds them for a day (a cancelled upload, #207). Age is Storage's own
 * time, not the Clock, so a test clock jump cannot remove a fresh upload. A folder with a row,
 * another bucket and anything younger are never named by the database functions this calls.
 */
export async function sweepDocumentFiles(client: CronClient, clock: Clock): Promise<DocumentSweepRun> {
  const pending = await client.rpc('pending_file_removal_names');
  if (pending.error) throw new Error(`Reading the files waiting to be removed failed: ${pending.error.message}`);
  const erased = await removeFiles(client, pending.data);

  const strays = await client.rpc('stray_document_files');
  if (strays.error) throw new Error(`Reading the unregistered files failed: ${strays.error.message}`);
  const swept = await removeFiles(client, strays.data);

  const settled = await client.rpc('settle_file_removals');
  if (settled.error) throw new Error(`Settling the removed files failed: ${settled.error.message}`);
  if (erased.failed + swept.failed > 0) throw new Error(`Storage kept ${erased.failed + swept.failed} files it was asked to remove`);
  return { ok: true, as_of: clock.today(), strays: swept.removed, erased: erased.removed, settled: settled.data };
}

export const documentSweepCron = cronHandler(sweepDocumentFiles);
