import { describe, expect, it } from 'vitest';
import { invoiceIssue, invoiceVoid } from './invoice-ops';
import { runOp } from './op';
import { fakeDb, opContext as context, type Sent } from './test/fake-db';

const INVOICE = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0010';
const stored = (status: string, allocated_vnd = 0) => (request: Sent) => (request.table === 'invoice_balances' ? [{ status, allocated_vnd }] : []);
const raised = (message: string) => (request: Sent) => (request.table.startsWith('rpc/') ? { code: '55000', message } : null);

describe('invoiceVoid', () => {
  it('trims the reason and refuses a blank one before reading anything', async () => {
    expect(invoiceVoid.input.parse({ invoice_id: INVOICE, reason: '  Demo: nhầm kỳ  ' })).toEqual({ invoice_id: INVOICE, reason: 'Demo: nhầm kỳ' });
    const { db, sent } = fakeDb(stored('issued'));
    expect(await runOp(invoiceVoid, context(db), { invoice_id: INVOICE, reason: '   ' })).toMatchObject({ ok: false, reason: { kind: 'invalid', issues: [{ path: 'reason' }] } });
    expect(sent).toEqual([]);
  });

  it('voids an issued bill through void_invoice', async () => {
    const { db, sent } = fakeDb(stored('issued'));
    expect(await runOp(invoiceVoid, context(db), { invoice_id: INVOICE, reason: 'Demo: nhầm kỳ' })).toEqual({ ok: true, value: { invoice_id: INVOICE } });
    expect(sent.at(-1)).toMatchObject({ table: 'rpc/void_invoice', body: { p_invoice_id: INVOICE, p_reason: 'Demo: nhầm kỳ' } });
  });

  it('plans a void bill as unchanged, and refuses a draft, a paid bill or a bill of another household', async () => {
    const input = { invoice_id: INVOICE, reason: 'Demo' };
    expect(await invoiceVoid.plan(context(fakeDb(stored('void')).db), input)).toEqual({ ok: true, value: { kind: 'unchanged', current: { invoice_id: INVOICE } } });
    expect(await invoiceVoid.plan(context(fakeDb(stored('draft')).db), input)).toEqual({ ok: false, reason: { kind: 'not_issued' } });
    expect(await invoiceVoid.plan(context(fakeDb(stored('issued', 1)).db), input)).toEqual({ ok: false, reason: { kind: 'has_payments' } });
    expect(await invoiceVoid.plan(context(fakeDb().db), input)).toEqual({ ok: false, reason: { kind: 'not_found' } });
  });

  it('names a payment that landed between plan and apply', async () => {
    const { db } = fakeDb(stored('issued'), raised('ESTA_INVOICE_HAS_PAYMENTS'));
    expect(await invoiceVoid.apply(context(db), { invoice_id: INVOICE, reason: 'Demo' })).toEqual({ ok: false, reason: { kind: 'has_payments' } });
  });
});

describe('invoiceIssue', () => {
  it('issues a draft through issue_invoice_now', async () => {
    const { db, sent } = fakeDb(stored('draft'));
    expect(await runOp(invoiceIssue, context(db), { invoice_id: INVOICE })).toEqual({ ok: true, value: { invoice_id: INVOICE } });
    expect(sent.at(-1)).toMatchObject({ table: 'rpc/issue_invoice_now', body: { p_invoice_id: INVOICE } });
  });

  it('plans an issued bill as unchanged and refuses a void one', async () => {
    expect(await invoiceIssue.plan(context(fakeDb(stored('issued')).db), { invoice_id: INVOICE })).toEqual({ ok: true, value: { kind: 'unchanged', current: { invoice_id: INVOICE } } });
    expect(await invoiceIssue.plan(context(fakeDb(stored('void')).db), { invoice_id: INVOICE })).toEqual({ ok: false, reason: { kind: 'not_draft' } });
  });

  it('names a draft the nightly job issued between plan and apply', async () => {
    const { db } = fakeDb(stored('draft'), raised('ESTA_INVOICE_NOT_DRAFT'));
    expect(await invoiceIssue.apply(context(db), { invoice_id: INVOICE })).toEqual({ ok: false, reason: { kind: 'not_draft' } });
  });
});
