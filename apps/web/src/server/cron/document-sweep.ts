import 'server-only';
import type { Clock, IsoDate } from '@esta/core';
import { cronHandler } from './handler';
import type { CronClient } from './supabase';

export type DocumentSweepRun = { ok: true; as_of: IsoDate; strays: number; erased: number; settled: number };

const BUCKET = 'documents';
const REMOVE_CHUNK = 100;
const STRAY_PAGE = 500;
/** A night's bound: 20 pages of 500 names. Names Storage refuses leave the page, so the rest come up. */
const STRAY_PAGES = 20;

type Removal = { removed: number; refused: string[] };

/**
 * Removes the names through the Storage API, which SQL cannot. A name Storage does not report removed is refused; when a
 * whole chunk errors, its names go one at a time to find the one it kept.
 */
async function removeFiles(client: CronClient, names: readonly string[]): Promise<Removal> {
  const bucket = client.storage.from(BUCKET);
  const outcome: Removal = { removed: 0, refused: [] };
  const tally = (asked: readonly string[], gone: readonly string[]) => {
    outcome.removed += asked.filter((name) => gone.includes(name)).length;
    outcome.refused.push(...asked.filter((name) => !gone.includes(name)));
  };
  for (let from = 0; from < names.length; from += REMOVE_CHUNK) {
    const chunk = names.slice(from, from + REMOVE_CHUNK);
    const { data, error } = await bucket.remove(chunk);
    if (!error) {
      tally(chunk, data.map((file) => file.name));
      continue;
    }
    for (const name of chunk) {
      const single = await bucket.remove([name]);
      tally([name], single.error ? [] : single.data.map((file) => file.name));
    }
  }
  return outcome;
}

/**
 * Pages through the strays, asking the database again about each chunk just before it is removed, so a folder that
 * gained a document row since the listing keeps its file. Refused names are skipped from then on.
 */
async function sweepStrays(client: CronClient): Promise<Removal> {
  const total: Removal = { removed: 0, refused: [] };
  const strays = async (args: { p_limit: number; p_exclude?: string[]; p_only?: string[] }): Promise<string[]> => {
    const { data, error } = await client.rpc('stray_document_files', args);
    if (error) throw new Error(`Reading the unregistered files failed: ${error.message}`);
    return data;
  };
  for (let page = 0; page < STRAY_PAGES; page++) {
    const listed = await strays({ p_limit: STRAY_PAGE, p_exclude: total.refused });
    if (listed.length === 0) break;
    for (let from = 0; from < listed.length; from += REMOVE_CHUNK) {
      const chunk = listed.slice(from, from + REMOVE_CHUNK);
      const swept = await removeFiles(client, await strays({ p_limit: chunk.length, p_only: chunk }));
      total.removed += swept.removed;
      total.refused.push(...swept.refused);
    }
  }
  return total;
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

  const swept = await sweepStrays(client);

  const settled = await client.rpc('settle_file_removals');
  if (settled.error) throw new Error(`Settling the removed files failed: ${settled.error.message}`);
  const kept = erased.refused.length + swept.refused.length;
  if (kept > 0) throw new Error(`Storage kept ${kept} files it was asked to remove`);
  return { ok: true, as_of: clock.today(), strays: swept.removed, erased: erased.removed, settled: settled.data };
}

export const documentSweepCron = cronHandler('document_sweep', sweepDocumentFiles);
