import 'server-only';
import { PAYMENT_STATUSES } from '@esta/core/allocation';
import { collectionState, worstCollectionState, type CollectionCandidate, type CollectionState } from '@esta/core/collections';
import type { IsoDate } from '@esta/core/date';
import { firstOfMonth } from '@esta/core/schedule';
import { vnd } from '@esta/core/money';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { z } from 'zod';
import { createSessionClient } from '@/server/supabase/server';

export type CollectionRow = CollectionCandidate & {
  /** A whole unit is named by its property alone. */
  readonly wholeUnit: boolean;
  readonly leaseId: string;
  readonly tenantName: string | null;
  readonly number: string;
};

const money = z.number().int().min(0).transform(vnd);

const candidateSchema = z
  .object({
    invoice_id: z.uuid(),
    property_id: z.uuid(),
    property_nickname: z.string(),
    unit_label: z.string(),
    unit_kind: z.string(),
    lease_id: z.uuid(),
    tenant_name: z.string().nullable(),
    number: z.string(),
    due_date: isoDateSchema,
    total_vnd: money,
    allocated_vnd: money,
    outstanding_vnd: money,
    payment_status: z.enum(PAYMENT_STATUSES),
  })
  .transform(
    (row): CollectionRow => ({
      invoiceId: row.invoice_id,
      propertyId: row.property_id,
      propertyName: row.property_nickname,
      unitLabel: row.unit_label,
      wholeUnit: row.unit_kind === 'whole',
      leaseId: row.lease_id,
      tenantName: row.tenant_name,
      number: row.number,
      dueDate: row.due_date,
      totalVnd: row.total_vnd,
      allocatedVnd: row.allocated_vnd,
      outstandingVnd: row.outstanding_vnd,
      paymentStatus: row.payment_status,
    }),
  );

/** LSE-10's rows for `month`. RLS limits them to the member's households; the household filter keeps a member of two to one. */
export async function loadCollectionRows(householdId: string, month: IsoDate, propertyId?: string): Promise<CollectionRow[]> {
  const supabase = await createSessionClient();
  let query = supabase.rpc('collection_candidates', { p_month: month }).eq('household_id', householdId);
  if (propertyId !== undefined) query = query.eq('property_id', propertyId);
  const { data, error } = await query;
  if (error) throw new Error(`Reading the collections board failed: ${error.message}`);
  return z.array(candidateSchema).parse(data);
}

/** Each property's worst state on the board for the Clock's month, for its status pill. */
export async function loadCollectionStates(householdId: string, asOf: IsoDate, propertyId?: string): Promise<Map<string, CollectionState>> {
  const byProperty = new Map<string, CollectionState[]>();
  for (const row of await loadCollectionRows(householdId, firstOfMonth(asOf), propertyId)) {
    byProperty.set(row.propertyId, [...(byProperty.get(row.propertyId) ?? []), collectionState(row, asOf)]);
  }
  return new Map(
    [...byProperty].flatMap(([id, states]) => {
      const worst = worstCollectionState(states);
      return worst === null ? [] : [[id, worst] as const];
    }),
  );
}
