import 'server-only';
import type { Instant } from '@esta/core';
import type { IsoDate } from '@esta/core/date';
import { planInvoices } from '@esta/core/lease';
import { LEASE_COLUMNS, leaseRowSchema, leaseTerms } from '@esta/core/schemas/lease';
import type { Database } from '@esta/db';
import type { SupabaseClient } from '@supabase/supabase-js';

export type WrittenInvoice = Database['public']['Functions']['write_invoices']['Returns'][number];

/**
 * SPEC §5.4 generation and issuance for one active lease on the Clock's date. Any client works: the session client
 * from an action, the service client from the daily cron (P3-04). Amendments join in P3-08 and meter readings in P3-14.
 */
export async function runInvoicing(supabase: SupabaseClient<Database>, leaseId: string, asOf: IsoDate, now: Instant): Promise<WrittenInvoice[]> {
  const { data, error } = await supabase.from('leases').select(LEASE_COLUMNS).eq('id', leaseId).single();
  if (error) throw new Error(`Reading the lease failed: ${error.message}`);
  const lease = leaseRowSchema.parse(data);
  const terms = leaseTerms(lease);
  if (terms === null) throw new Error('An active lease has its start date and rent');
  const planned = planInvoices({ ...terms, utilitiesMode: lease.utilities_mode }, [], asOf).map((invoice) => ({
    period_start: invoice.periodStart,
    period_end: invoice.periodEnd,
    due_date: invoice.dueDate,
    issue_on: invoice.issueOn,
    lines: invoice.lines.map((line) => ({
      kind: line.kind,
      description: null,
      quantity: line.quantity,
      unit_price_vnd: line.unitPriceVnd,
      amount_vnd: line.amountVnd,
    })),
  }));
  const written = await supabase.rpc('write_invoices', { p_lease_id: leaseId, p_invoices: planned, p_as_of: asOf, p_issued_at: now });
  if (written.error) throw new Error(`Writing invoices failed: ${written.error.message}`);
  return written.data;
}
