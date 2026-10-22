import { z } from 'zod';
import { BILLING_CYCLES } from '../lease/types';
import { isoDateSchema } from '../schemas/legal';
import { leaf } from './certificate_v1';
import { amountLeaf } from './utility_bill_v1';

const text = leaf(z.string());
const date = leaf(isoDateSchema);

/** AGENT.md §5.1: one Vietnamese room or house lease, every printed value a `{ value, confidence, page }` leaf. */
export const leaseV1Schema = z.object({
  tenant_name: text,
  tenant_phone: text,
  tenant_id_last4: leaf(z.string().regex(/^\d{4}$/, 'exactly four digits')),
  property_address: text,
  unit_label: text,
  start_date: date,
  end_date: date,
  term_months: leaf(z.number().int().min(1).max(600)),
  rent_vnd: amountLeaf,
  billing_cycle_months: leaf(z.union(BILLING_CYCLES.map((months) => z.literal(months)))),
  due_day: leaf(z.number().int().min(1).max(31)),
  deposit_vnd: amountLeaf,
  notes: text,
  /** The contract's printed text, not a reviewed field: P2-05 copies it into `documents.ocr_text` for search. */
  full_text: z.string().optional(),
});

export type LeaseV1 = z.infer<typeof leaseV1Schema>;
