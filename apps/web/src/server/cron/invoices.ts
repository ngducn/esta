import 'server-only';
import type { Clock, IsoDate } from '@esta/core';
import { cronHandler } from './handler';
import type { CronClient } from './supabase';

export type InvoicesRun = { ok: true; as_of: IsoDate; drafted: number; issued: number; households: number };

/** SPEC §5.4 nightly: public.run_invoicing drafts and issues each household's invoices, so nothing here writes them. */
export async function runInvoices(client: CronClient, clock: Clock): Promise<InvoicesRun> {
  const asOf = clock.today();
  const issuedAt = clock.now();
  const { data: households, error } = await client.from('households').select('id').order('id');
  if (error) throw new Error(`Listing households failed: ${error.message}`);
  let drafted = 0;
  let issued = 0;
  for (const { id } of households) {
    const run = await client.rpc('run_invoicing', { p_household_id: id, p_as_of: asOf, p_issued_at: issuedAt }).single();
    if (run.error) throw new Error(`Invoicing household ${id} failed: ${run.error.message}`);
    drafted += run.data.drafted;
    issued += run.data.issued;
  }
  return { ok: true, as_of: asOf, drafted, issued, households: households.length };
}

export const invoicesCron = cronHandler(runInvoices);
