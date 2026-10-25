import { PAYMENT_STATUSES } from '@esta/core/allocation';
import type { CollectionCandidate } from '@esta/core/collections';
import type { IsoDate } from '@esta/core/date';
import { vnd } from '@esta/core/money';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { z } from 'zod';
import type { Db } from './db';

export type CollectionRow = CollectionCandidate & {
  /** A whole unit is named by its property alone. */
  readonly wholeUnit: boolean;
  /** The property was archived while this bill was still owed; its pages are gone, so the row links nowhere. */
  readonly propertyArchived: boolean;
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
    property_archived: z.boolean(),
    unit_label: z.string(),
    unit_kind: z.string(),
    lease_id: z.uuid(),
    tenant_name: z.string().nullable(),
    number: z.string(),
    due_date: isoDateSchema,
    total_vnd: z.number().int().transform(vnd),
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
      propertyArchived: row.property_archived,
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

/** LSE-10's rows for `month`. RLS limits a member to her households; the household filter keeps a member of two, and the worker, to one. */
export async function readCollectionRows(db: Db, householdId: string, month: IsoDate, propertyId?: string): Promise<CollectionRow[]> {
  let query = db.rpc('collection_candidates', { p_month: month }).eq('household_id', householdId);
  if (propertyId !== undefined) query = query.eq('property_id', propertyId);
  const { data, error } = await query;
  if (error) throw new Error(`Reading the collections board failed: ${error.message}`);
  return z.array(candidateSchema).parse(data);
}
