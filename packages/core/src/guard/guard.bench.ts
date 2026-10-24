import { expect, test } from 'vitest';
import { isoDate } from '../date/iso-date';
import { formatVnd, formatVndCompact } from '../format';
import { vnd } from '../money/vnd';
import { checkNumbers, collectAllowed, onScreenText } from './index';

/** 2,000 allowed values, as a large run's tool results would give: amounts with their display strings, day counts and labels. */
const results = Array.from({ length: 500 }, (_, index) => ({
  unit_label: `Phòng ${index + 1}`,
  days_overdue: index % 60,
  outstanding_vnd: (index + 1) * 137_000,
  outstanding_display: formatVnd(vnd((index + 1) * 137_000), 'vi'),
  outstanding_compact: formatVndCompact(vnd((index + 1) * 1_370_000), 'vi'),
}));
const allowed = collectAllowed(results, { today: isoDate('2026-10-07'), householdName: 'Gia đình Demo', locale: 'vi' });

const sentence = '**Phòng 5** quá hạn 12 ngày, còn nợ 685.000 ₫ (6,9 tr), hạn 25/09/2026; từ 3 đến 5 triệu là giá khu vực. ';
const note = sentence.repeat(Math.ceil(300 / sentence.split(/\s+/).length));

test('the guard checks a 300-token note against 2,000 allowed values in under 5 ms', async ({ bench }) => {
  expect(note.split(/\s+/).length).toBeGreaterThanOrEqual(300);
  expect(allowed.keys.size).toBeGreaterThanOrEqual(2_000);
  const result = await bench('checkNumbers, 300 tokens', () => {
    checkNumbers(onScreenText(note), allowed);
  }).run();
  console.info(`checkNumbers, 300 tokens: mean ${result.latency.mean.toFixed(3)} ms, p99 ${result.latency.p99.toFixed(3)} ms`);
  expect(result.latency.mean).toBeLessThan(5);
});
