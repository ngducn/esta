import 'server-only';
import type { Clock, IsoDate } from '@esta/core';
import { cronHandler } from './handler';
import type { CronClient } from './supabase';

export type InvoicesFailure = { household_id: string; error: string };
export type InvoicesRun = { ok: boolean; as_of: IsoDate; drafted: number; issued: number; households: number; failed: InvoicesFailure[] };

/**
 * Invoices are written only in SQL: public.run_invoicing drafts and issues one household's, in its own transaction. One
 * household's error is logged with its id and returned in `failed`, and the households after it still bill (#145, #250).
 */
export async function runInvoices(client: CronClient, clock: Clock): Promise<InvoicesRun> {
  const asOf = clock.today();
  const issuedAt = clock.now();
  const { data: households, error } = await client.from('households').select('id').order('id');
  if (error) throw new Error(`Listing households failed: ${error.message}`);
  let drafted = 0;
  let issued = 0;
  const failed: InvoicesFailure[] = [];
  for (const { id } of households) {
    const run = await client.rpc('run_invoicing', { p_household_id: id, p_as_of: asOf, p_issued_at: issuedAt }).single().then(
      (result) => result,
      (thrown: unknown) => ({ data: null, error: { message: thrown instanceof Error ? thrown.message : String(thrown) } }),
    );
    if (run.error) {
      console.error(`Invoicing household ${id} failed: ${run.error.message}`);
      failed.push({ household_id: id, error: run.error.message });
      continue;
    }
    drafted += run.data.drafted;
    issued += run.data.issued;
  }
  return { ok: failed.length === 0, as_of: asOf, drafted, issued, households: households.length, failed };
}

export const invoicesCron = cronHandler('invoices', runInvoices);
