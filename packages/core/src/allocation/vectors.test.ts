import { describe, expect, it } from 'vitest';
import csv from '../../../../supabase/tests/fixtures/allocation_vectors.csv?raw';
import type { IsoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { allocatePayment, openInvoicesOldestFirst, type OpenInvoice } from './allocate';

type Bill = OpenInvoice & { status: string; chosen: boolean; expectedVnd: number };
type Vector = { name: string; paymentVnd: number; bills: Bill[]; credit: string };

function readVectors(): Vector[] {
  const [, ...lines] = csv.trim().split('\n');
  const byCase = new Map<string, Vector>();
  for (const line of lines) {
    const cells = line.split(',');
    const at = (index: number) => cells[index] ?? '';
    const name = at(0);
    const vector = byCase.get(name) ?? { name, paymentVnd: Number(at(1)), bills: [], credit: at(11) };
    vector.bills.push({
      id: at(2),
      status: at(3),
      dueDate: at(5) as IsoDate,
      periodStart: at(6) as IsoDate,
      outstandingVnd: vnd(Math.max(Number(at(7)) - Number(at(8)), 0)),
      chosen: at(9) === 'yes',
      expectedVnd: Number(at(10)),
    });
    byCase.set(name, vector);
  }
  return [...byCase.values()];
}

const VECTORS = readVectors();

describe('allocation vectors, which supabase/tests/allocation_vectors_parity.test.sql replays through record_payment', () => {
  it('holds at least 25 cases', () => {
    expect(VECTORS.length).toBeGreaterThanOrEqual(25);
  });

  it.each(VECTORS.map((vector) => [vector.name, vector] as const))('%s', (_, vector) => {
    const choice = vector.bills.some((bill) => bill.chosen);
    const pool = openInvoicesOldestFirst(vector.bills.filter((bill) => !choice || bill.chosen));
    const result = allocatePayment(vnd(vector.paymentVnd), pool);
    if (vector.credit === 'refused') {
      expect(result.ok).toBe(false);
      return;
    }
    if (!result.ok) throw new Error(result.reason);
    const got = new Map(result.value.allocations.map((part) => [part.invoiceId, part.amountVnd]));
    expect(vector.bills.map((bill) => [bill.id, got.get(bill.id) ?? 0])).toEqual(vector.bills.map((bill) => [bill.id, bill.expectedVnd]));
    expect(result.value.creditVnd).toBe(Number(vector.credit));
  });
});
