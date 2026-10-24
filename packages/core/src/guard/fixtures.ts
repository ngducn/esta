import { isoDate } from '../date/iso-date';
import type { Locale } from '../format';
import { checkNumbers, collectAllowed, extractNumbers, onScreenText, type CanonicalNumber } from './index';

export const amount = (vnd: number): CanonicalNumber => ({ kind: 'amount', vnd: BigInt(vnd) });
export const count = (value: number | string): CanonicalNumber => ({ kind: 'count', value: String(value) });
export const ratio = (bp: number): CanonicalNumber => ({ kind: 'ratio', bp: BigInt(bp) });
export const date = (iso: string): CanonicalNumber => ({ kind: 'date', iso });

export const values = (markdown: string, locale: Locale = 'vi') =>
  onScreenText(markdown)
    .flatMap((block) => extractNumbers(block, locale))
    .map((number) => number.value);

export const RUN = [
  {
    facts: [
      {
        rule_id: 'W1',
        subject_key: 'invoice:3f1c2a9e-5b7d-4c1a-9e2f-7a6b5c4d3e2f',
        unit_label: 'Phòng 5',
        property_label: 'Nhà trọ Dĩ An',
        days_overdue: 12,
        outstanding_vnd: 3_500_000,
        outstanding_display: '3.500.000 ₫',
        outstanding_compact: '3,5 tr',
        due_date: '2026-09-25',
      },
      { rule_id: 'W3', property_label: 'Căn hộ Thủ Đức', days_left: 25, end_date: '2026-11-01' },
      { rule_id: 'W7', progress_bp: 8240, progress_display: '82,4%', threshold_vnd: 500_000_000 },
      { rule_id: 'W5', property_label: 'Nhà phố Q7', unit_id: 'unit-777' },
    ],
  },
];

export const allowedFor = (results: readonly unknown[] = RUN, locale: Locale = 'vi') =>
  collectAllowed(results, { today: isoDate('2026-10-07'), householdName: 'Gia đình Demo 3', locale });

export const offending = (markdown: string, results: readonly unknown[] = RUN, locale: Locale = 'vi') => checkNumbers(markdown, allowedFor(results, locale));
