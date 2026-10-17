import { expect, test } from 'vitest';
import type { IsoDate } from '../date/iso-date';
import { formatVnd, formatVndCompact } from '../format';
import { vnd } from '../money/vnd';
import { checkNumbers } from './checkNumbers';
import { collectAllowed } from './collectAllowed';

const BUDGET_MS = 5;
const ALLOWED_VALUES = 2_000;
const VALUES_PER_ROW = 6;

function rows(count: number): unknown[] {
  return Array.from({ length: count }, (_, i) => {
    const amount = vnd(1_000_000 + i * 123_457);
    return {
      invoice_id: `d1000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      label: `Phòng ${(i % 40) + 1}`,
      due_on: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      days_overdue: i % 90,
      outstanding: amount,
      outstanding_display: formatVnd(amount, 'vi'),
      outstanding_compact: formatVndCompact(amount, 'vi'),
    };
  });
}

const allowed = collectAllowed(
  [{ tool: 'collections', result: { rows: rows(Math.ceil(ALLOWED_VALUES / VALUES_PER_ROW)), gross_yield_bp: 650, area_m2: 125.5 } }],
  { today: '2026-10-07' as IsoDate, householdName: 'Gia đình Demo 3' },
);

const sentence = (i: number): string =>
  `- Phòng ${(i % 40) + 1} quá hạn ${i % 90} ngày, hóa đơn đến hạn 25/09/2026, còn nợ ${formatVnd(vnd(1_000_000 + i * 123_457), 'vi')} (khoảng ${formatVndCompact(vnd(1_000_000 + i * 123_457), 'vi')}), lợi suất 6,5%, 125,5 m². [Xem](esta://invoice/d1000000-0000-4000-8000-${String(i).padStart(12, '0')})`;
const text = Array.from({ length: 12 }, (_, i) => sentence(i)).join('\n');

const values = new Set([...allowed.values()].flat()).size;

test(`checkNumbers on a ${text.split(/\s+/u).length}-token text against ${values} allowed values stays under ${BUDGET_MS} ms`, async ({ bench }) => {
  expect(values).toBeGreaterThanOrEqual(ALLOWED_VALUES);
  expect(checkNumbers(text, allowed).ok).toBe(true);
  const result = await bench('checkNumbers', () => {
    checkNumbers(text, allowed);
  }).run();
  expect(result.latency.mean).toBeLessThan(BUDGET_MS);
});
