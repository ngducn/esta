import { describe, expect, it } from 'vitest';
import { readInvoicePayments } from './invoices';
import { fakeDb, HOUSEHOLD } from './test/fake-db';

const idOf = (index: number) => `0b6c1f9e-7d1a-4c55-9a3e-${String(index).padStart(12, '0')}`;

describe('readInvoicePayments (#338)', () => {
  it('reads a year of invoices in several requests, each with a short list of ids, and returns every payment', async () => {
    const ids = Array.from({ length: 450 }, (_, index) => idOf(index));
    const { db, sent } = fakeDb((request) => {
      const asked = (request.query.get('invoice_id') ?? '').replace(/^in\.\(|\)$/g, '').split(',');
      return asked.map((invoice_id) => ({ invoice_id, received_on: '2026-10-01', amount_vnd: 1_000_000 }));
    });
    const payments = await readInvoicePayments(db, HOUSEHOLD, ids);
    expect(payments.map((payment) => payment.invoiceId)).toEqual(ids);
    expect(Math.max(...sent.map((request) => request.query.toString().length))).toBeLessThan(5_000);
  });

  it('asks for nothing when there are no invoices', async () => {
    const { db, sent } = fakeDb();
    expect(await readInvoicePayments(db, HOUSEHOLD, [])).toEqual([]);
    expect(sent).toEqual([]);
  });
});
