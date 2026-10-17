import { expect, test } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { allocatePayment, type OpenInvoice } from './allocate';

const BUDGET_MS = 0.5;

const month = (i: number) => `${2016 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-25`;

const tenYearsMonthly: OpenInvoice[] = Array.from({ length: 120 }, (_, i) => ({
  id: `inv-${String(119 - i).padStart(3, '0')}`,
  dueDate: isoDate(month(119 - i)),
  periodStart: isoDate(month(119 - i)),
  outstandingVnd: vnd(3_500_000 + (i % 7) * 100_000),
}));

const allButLast = vnd(tenYearsMonthly.reduce((total, invoice) => total + invoice.outstandingVnd, 0) - 1);

test('the bench payment reaches every one of the 120 invoices', () => {
  const result = allocatePayment(allButLast, tenYearsMonthly);
  expect(result.ok && result.value.allocations.length).toBe(120);
});

test('allocatePayment stays under 0.5 ms per call across 120 open invoices', async ({ bench }) => {
  const result = await bench('allocatePayment 120 invoices', () => {
    allocatePayment(allButLast, tenYearsMonthly);
  }).run();
  expect(result.latency.p50).toBeLessThan(BUDGET_MS);
});
