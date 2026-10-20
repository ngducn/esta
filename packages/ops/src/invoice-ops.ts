import { z } from 'zod';
import { dbRefusal, idSchema, type CommonRefusal } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';

export type InvoiceChanged = { readonly invoice_id: string };
export type InvoiceRefusal = { readonly kind: 'not_issued' | 'not_draft' | 'has_payments' };

const SENTINELS: Readonly<Record<string, InvoiceRefusal | CommonRefusal>> = {
  ESTA_INVOICE_NOT_FOUND: { kind: 'not_found' },
  ESTA_INVOICE_NOT_ISSUED: { kind: 'not_issued' },
  ESTA_INVOICE_NOT_DRAFT: { kind: 'not_draft' },
  ESTA_INVOICE_HAS_PAYMENTS: { kind: 'has_payments' },
  ESTA_VOID_REASON: { kind: 'invalid', issues: [{ path: 'reason', code: 'too_small' }] },
};

type Stored = { readonly status: 'draft' | 'issued' | 'void'; readonly allocated_vnd: number };

async function storedInvoice(ctx: OpContext, invoiceId: string): Promise<Stored | null> {
  const { data, error } = await ctx.db
    .from('invoice_balances')
    .select('status, allocated_vnd')
    .eq('household_id', ctx.householdId)
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) throw new Error(`Reading the invoice failed: ${error.message}`);
  return data === null ? null : { status: z.enum(['draft', 'issued', 'void']).parse(data.status), allocated_vnd: data.allocated_vnd ?? 0 };
}

const voidInputSchema = z.strictObject({ invoice_id: idSchema, reason: z.string().trim().min(1).max(1000) });
type Void = z.output<typeof voidInputSchema>;

/**
 * LSE-5 `Hủy hóa đơn`: an issued bill becomes void with the reason given. Its period stays billed by it, so the nightly
 * job never bills it again. [app rule] A bill a payment settled stays, since a payment is undone only in its toast.
 */
export const invoiceVoid = defineOp<Void, Void, InvoiceChanged, InvoiceRefusal>({
  creates: null,
  input: voidInputSchema,
  async plan(ctx, input) {
    const invoice = await storedInvoice(ctx, input.invoice_id);
    if (invoice === null) return refuse({ kind: 'not_found' });
    if (invoice.status === 'void') return unchanged({ invoice_id: input.invoice_id });
    if (invoice.status === 'draft') return refuse({ kind: 'not_issued' });
    return invoice.allocated_vnd > 0 ? refuse({ kind: 'has_payments' }) : change(input);
  },
  async apply(ctx, { invoice_id, reason }) {
    const { error } = await ctx.db.rpc('void_invoice', { p_invoice_id: invoice_id, p_reason: reason });
    return error ? refuse(dbRefusal(error, SENTINELS)) : { ok: true, value: { invoice_id } };
  },
});

const issueInputSchema = z.strictObject({ invoice_id: idSchema });
type Issue = z.output<typeof issueInputSchema>;

/** LSE-5 `Phát hành`: a draft issues on the database clock's date, before the night it would issue by itself. */
export const invoiceIssue = defineOp<Issue, Issue, InvoiceChanged, InvoiceRefusal>({
  creates: null,
  input: issueInputSchema,
  async plan(ctx, input) {
    const invoice = await storedInvoice(ctx, input.invoice_id);
    if (invoice === null) return refuse({ kind: 'not_found' });
    if (invoice.status === 'issued') return unchanged(input);
    return invoice.status === 'void' ? refuse({ kind: 'not_draft' }) : change(input);
  },
  async apply(ctx, { invoice_id }) {
    const { error } = await ctx.db.rpc('issue_invoice_now', { p_invoice_id: invoice_id });
    return error ? refuse(dbRefusal(error, SENTINELS)) : { ok: true, value: { invoice_id } };
  },
});
