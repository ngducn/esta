import { describe, expect, it } from 'vitest';
import type { IsoDate } from '../date/iso-date';
import { checkNumbers, repairMessage, type CheckedNumber } from './checkNumbers';
import { collectAllowed } from './collectAllowed';
import { extractNumbers, scan } from './extractNumbers';
import { CONTEXT, IDS, RUN } from './fixtures/run';
import { NOTES } from './fixtures/notes';
import type { CanonicalNumber, ExtractedValue } from './normalize';

const NBSP = ' ';
const today = '2026-10-07' as IsoDate;
const context = { today, householdName: 'Gia đình Demo 3' };

const values = (text: string): ExtractedValue[] => extractNumbers(text).map((number) => number.value);
const texts = (text: string): string[] => extractNumbers(text).map((number) => number.text);

const amount = (vnd: number): CanonicalNumber => ({ kind: 'amount', vnd });
const compact = (vnd: number, unit: 'ty' | 'tr' | 'nghin'): CanonicalNumber => ({ kind: 'compact', vnd, unit });
const count = (value: number): CanonicalNumber => ({ kind: 'count', value });
const date = (iso: string): CanonicalNumber => ({ kind: 'date', iso: iso as IsoDate });
const invalid: ExtractedValue = { kind: 'invalid' };

const allowedWith = (result: unknown, tool = 'tool') => collectAllowed([{ tool, result }], context);
const check = (text: string, result: unknown) => checkNumbers(text, allowedWith(result));
const offending = (text: string, result: unknown): string[] => check(text, result).violations.map((violation) => violation.text);

describe('extractNumbers reads every form', () => {
  it.each<[string, ExtractedValue[]]>([
    [`15.000.000${NBSP}₫`, [amount(15_000_000)]],
    ['15.000.000 ₫', [amount(15_000_000)]],
    ['15.000.000₫', [amount(15_000_000)]],
    ['15.000.000 đ', [amount(15_000_000)]],
    ['15.000.000 đồng', [amount(15_000_000)]],
    ['15.000.000 VND', [amount(15_000_000)]],
    ['15.000.000 VNĐ', [amount(15_000_000)]],
    [`15,000,000${NBSP}₫`, [amount(15_000_000)]],
    ['15000000 ₫', [amount(15_000_000)]],
    [`-1.500.000${NBSP}₫`, [amount(-1_500_000)]],
    ['−1.500.000 ₫', [amount(-1_500_000)]],
    ['3,5 tr', [compact(3_500_000, 'tr')]],
    ['3,5tr', [compact(3_500_000, 'tr')]],
    ['3,5 triệu', [compact(3_500_000, 'tr')]],
    ['3,5 triệu đồng', [compact(3_500_000, 'tr')]],
    ['3,5 trđ', [compact(3_500_000, 'tr')]],
    ['15 tr', [compact(15_000_000, 'tr')]],
    ['1,25 tỷ', [compact(1_250_000_000, 'ty')]],
    ['1,2 tỉ', [compact(1_200_000_000, 'ty')]],
    ['1.234 tỷ', [compact(1_234_000_000_000, 'ty')]],
    ['850 nghìn', [compact(850_000, 'nghin')]],
    ['850 ngàn', [compact(850_000, 'nghin')]],
    ['850k', [compact(850_000, 'nghin')]],
    ['-3,5 tr', [compact(-3_500_000, 'tr')]],
    ['3.2B ₫', [compact(3_200_000_000, 'ty')]],
    ['15.5M ₫', [compact(15_500_000, 'tr')]],
    ['850K ₫', [compact(850_000, 'nghin')]],
    ['15.5M', [compact(15_500_000, 'tr')]],
    ['6,5%', [{ kind: 'ratio', bp: 650 }]],
    ['6.5%', [{ kind: 'ratio', bp: 650 }]],
    ['80 %', [{ kind: 'ratio', bp: 8000 }]],
    ['6,555%', [{ kind: 'ratio', bp: 655_500 }]],
    ['6,555 %', [{ kind: 'ratio', bp: 655_500 }]],
    ['12,5%', [{ kind: 'ratio', bp: 1250 }]],
    ['6,5555%', [invalid]],
    ['125,5 m²', [{ kind: 'area', m2: 125.5 }]],
    ['125.5 m2', [{ kind: 'area', m2: 125.5 }]],
    ['80 m²', [{ kind: 'area', m2: 80 }]],
    ['1.000 m²', [{ kind: 'area', m2: 1000 }]],
    ['1,000 m²', [{ kind: 'area', m2: 1000 }]],
    ['1.250,5 m²', [{ kind: 'area', m2: 1250.5 }]],
    ['07/10/2026', [date('2026-10-07')]],
    ['7/10/2026', [date('2026-10-07')]],
    ['07.10.2026', [date('2026-10-07')]],
    ['07-10-2026', [date('2026-10-07')]],
    ['Thứ Tư, 07/10/2026', [date('2026-10-07')]],
    ['2026-10-07', [date('2026-10-07')]],
    ['2026-09', [{ kind: 'monthYear', year: 2026, month: 9 }]],
    ['2020-2026', [count(2020), count(2026)]],
    ['31/02/2026', [invalid]],
    ['7/10', [{ kind: 'dayMonth', month: 10, day: 7 }]],
    ['ngày 7 tháng 10', [{ kind: 'dayMonth', month: 10, day: 7 }]],
    ['ngày 7 tháng 10 năm 2026', [date('2026-10-07')]],
    ['tháng 10/2026', [{ kind: 'monthYear', year: 2026, month: 10 }]],
    ['tháng 10 năm 2026', [{ kind: 'monthYear', year: 2026, month: 10 }]],
    ['tháng 10', [{ kind: 'month', month: 10 }]],
    ['năm 2026', [{ kind: 'year', year: 2026 }]],
    ['October 7, 2026', [date('2026-10-07')]],
    ['7 October 2026', [date('2026-10-07')]],
    ['7th October 2026', [date('2026-10-07')]],
    ['Oct. 7, 2026', [date('2026-10-07')]],
    ['October 2026', [{ kind: 'monthYear', year: 2026, month: 10 }]],
    ['07:00', [{ kind: 'time', hhmm: '07:00' }]],
    ['21:30', [{ kind: 'time', hhmm: '21:30' }]],
    [
      '2026-10-06T23:40:00Z',
      [date('2026-10-06'), { kind: 'time', hhmm: '23:40' }, date('2026-10-07'), { kind: 'time', hhmm: '06:40' }],
    ],
    [
      '2026-10-07T06:40:00+07:00',
      [date('2026-10-07'), { kind: 'time', hhmm: '06:40' }, date('2026-10-07'), { kind: 'time', hhmm: '06:40' }],
    ],
    ['12 ngày', [count(12)]],
    ['12 days', [count(12)]],
    ['1 day', [count(1)]],
    ['Phòng 5', [count(5)]],
    ['3 phòng', [count(3)]],
    ['Quận 1', [count(1)]],
    ['Q7', [count(7)]],
    ['Phòng6', [count(6)]],
    ['12ngày', [count(12)]],
    ['1.500', [count(1500)]],
    ['1,500', [count(1500)]],
    ['3,5', [count(3.5)]],
    ['10-12 ngày', [count(10), count(12)]],
    ['15 trống', [count(15)]],
    ['5 kỳ', [count(5)]],
    ['3 Bảo Lộc', [count(3)]],
    ['7 K', [count(7)]],
    ['7/13', [count(7), count(13)]],
    ['25:99', [count(25), count(99)]],
    [`1.500.00${NBSP}₫`, [invalid]],
    ['3,5 ₫', [invalid]],
    ['1,2345 nghìn', [invalid]],
    ['1.2.3', [invalid]],
  ])('%s', (text, expected) => {
    expect(values(text)).toEqual(expected);
  });

  it('reads a code-shaped word as one code, and nothing from ids, links and list markers', () => {
    expect(values('mã ESTA 7K2QX9MP')).toEqual([{ kind: 'code', code: '7K2QX9MP' }]);
    expect(values('ESTA7k2qx9mp')).toEqual([{ kind: 'code', code: 'ESTA7K2QX9MP' }]);
    expect(values('3f2a9c1d-4b5e-4c6d-8e9f-0a1b2c3d4e5f')).toEqual([]);
    expect(values('3f2a9c1d-1234-4c6d-8e9f-0a1b2c3d4e5f')).toEqual([]);
    expect(values('https://example.com/x/123?y=45')).toEqual([]);
    expect(values(`[Phòng 5](esta://unit/${IDS.room5})`)).toEqual([count(5)]);
    expect(values('1. Phòng 5\n2. Phòng 7\n10) Kho')).toEqual([count(5), count(7)]);
  });

  it('reports the substring with its unit word and position', () => {
    expect(extractNumbers('Phòng 5 quá hạn 12 ngày.')).toEqual([
      { text: '5', start: 6, end: 7, sentence: 0, value: count(5) },
      { text: '12 ngày', start: 16, end: 23, sentence: 0, value: count(12) },
    ]);
    expect(texts(`còn nợ 3.460.000${NBSP}₫ (khoảng 3,5 tr)`)).toEqual([`3.460.000${NBSP}₫`, '3,5 tr']);
  });

  it('numbers sentences by terminal punctuation and line breaks', () => {
    const { numbers } = scan('Phòng 5 quá hạn 12 ngày. Phòng 7 còn cọc 6 tr\n- Kho trống 70 ngày');
    expect(numbers.map((number) => [number.text, number.sentence])).toEqual([
      ['5', 0],
      ['12 ngày', 0],
      ['7', 1],
      ['6 tr', 1],
      ['70 ngày', 2],
    ]);
  });

  it('collects esta:// citations per sentence', () => {
    const text = `[Phòng 5](esta://unit/${IDS.room5}) quá hạn. [Hóa đơn](esta://invoice/${IDS.room5SeptInvoice}) còn nợ.`;
    expect(scan(text).citations).toEqual([
      { id: IDS.room5, sentence: 0 },
      { id: IDS.room5SeptInvoice, sentence: 1 },
    ]);
  });
});

describe('collectAllowed indexes tool results and context', () => {
  it('indexes raw numbers, display strings and labels with their source', () => {
    const allowed = allowedWith({ rent: 3_500_000, rent_display: `3.500.000${NBSP}₫`, unit_label: 'Phòng 5' }, 'get_lease');
    expect(allowed.get('n:3500000')).toEqual([
      { tool: 'get_lease', path: 'rent', ids: [], text: '3500000' },
      { tool: 'get_lease', path: 'rent_display', ids: [], text: `3.500.000${NBSP}₫` },
    ]);
    expect(allowed.get('n:5')).toEqual([{ tool: 'get_lease', path: 'unit_label', ids: [], text: '5' }]);
  });

  it('carries the ids of every record on the path, and takes no numbers from ids, keys, UUIDs or URLs', () => {
    const allowed = allowedWith({
      id: 'lease-2026-01',
      unit_id: IDS.room5,
      subject_key: 'invoice:di-an:phong-5:2026-09',
      dedupe_key: 'watch:W1:phong-5:2026-10-07',
      source_url: 'https://example.com/listing/9999',
      periods: [{ id: 'period-77', amount: 3_500_000, memo: '3f2a9c1d-1234-4c6d-8e9f-0a1b2c3d4e5f' }],
    });
    expect(allowed.get('n:3500000')).toEqual([
      { tool: 'tool', path: 'periods[0].amount', ids: ['lease-2026-01', IDS.room5, 'period-77'], text: '3500000' },
    ]);
    expect([...allowed.keys()].filter((key) => key !== 'n:3500000' && !key.startsWith('c:'))).toEqual([
      'd:2026-10-07',
      'dm:10-07',
      'my:2026-10',
      'm:10',
      'y:2026',
      'n:3',
    ]);
  });

  it('derives the day-month, month-year, month and year of every date, and the Hồ Chí Minh date of a timestamp', () => {
    const allowed = allowedWith({ due_on: '2026-09-25', updated_at: '2026-10-06T23:40:00+00:00' });
    expect(allowed.has('d:2026-09-25')).toBe(true);
    expect(allowed.has('dm:09-25')).toBe(true);
    expect(allowed.has('my:2026-09')).toBe(true);
    expect(allowed.has('m:09')).toBe(true);
    expect(allowed.has('y:2026')).toBe(true);
    expect(allowed.has('d:2026-10-06')).toBe(true);
    expect(allowed.has('d:2026-10-07')).toBe(true);
    expect(allowed.has('t:23:40')).toBe(true);
    expect(allowed.has('t:06:40')).toBe(true);
  });

  it('adds today and the household name from the context', () => {
    const allowed = collectAllowed([], context);
    expect(allowed.get('d:2026-10-07')).toEqual([{ tool: 'context', path: 'today', ids: [], text: '2026-10-07' }]);
    expect(allowed.get('n:3')).toEqual([{ tool: 'context', path: 'household_name', ids: [], text: '3' }]);
  });

  it('registers a compact rounding for every integer and no exact value for a compact display', () => {
    const allowed = allowedWith({ outstanding: 3_460_000, outstanding_compact: '3,5 tr' });
    expect(allowed.get('c:tr:3500000')?.map((source) => source.path)).toEqual(['outstanding', 'outstanding_compact']);
    expect(allowed.has('n:3500000')).toBe(false);
    expect(allowed.has('c:ty:3500000')).toBe(false);
    expect(allowed.get('c:nghin:3460000')?.map((source) => source.path)).toEqual(['outstanding']);
  });
});

describe('checkNumbers against the run (AGENT.md §6.3)', () => {
  it.each([
    ['1.500', 1500],
    ['1,500', 1500],
  ])('%s is 1500 in either locale', (text, value) => {
    expect(check(text, { count: value }).ok).toBe(true);
    expect(check(text, { count: 1.5 }).ok).toBe(false);
  });

  it('equates percent and basis points', () => {
    expect(check('lợi suất 6,5%', { gross_yield_bp: 650 }).ok).toBe(true);
    expect(check('yield 6.5%', { gross_yield_display: '6,5%' }).ok).toBe(true);
    expect(check('lợi suất 650', { gross_yield_bp: 650 }).ok).toBe(true);
    expect(offending('lợi suất 6,6%', { gross_yield_bp: 650 })).toEqual(['6,6%']);
  });

  it('takes a percentage only from a basis-point field or a percentage, not from any number with the same digits', () => {
    expect(offending('tăng 5%', { area_m2: 500, rent: 500 })).toEqual(['5%']);
    expect(check('tăng 5%', { vat_rate_bp: 500 }).ok).toBe(true);
  });

  it('checks a code-shaped word as a token the run must contain', () => {
    expect(check('chuyển khoản ghi ESTA 7K2QX9MP', { memo_code: 'ESTA 7K2QX9MP' }).ok).toBe(true);
    expect(offending('chuyển khoản ghi ESTA 7K2QX9MQ', { memo_code: 'ESTA 7K2QX9MP' })).toEqual(['7K2QX9MQ']);
    expect(offending('căn 3PN2WC', { bedrooms: 3, bathrooms: 2 })).toEqual(['3PN2WC']);
  });

  it('flags digits outside ASCII as unreadable', () => {
    expect(check('quá hạn １３ ngày', { days_overdue: 13 }).violations).toMatchObject([{ status: 'unparseable', text: '１３' }]);
  });

  it('reads the spoken shorthand 3tr5 and 1ty2 as compact amounts', () => {
    expect(check('tiền thuê 3tr5, giá 1ty2', { rent: 3_500_000, price: 1_200_000_000 }).ok).toBe(true);
    expect(offending('tiền thuê 3tr5', { rent: 12_000_000 })).toEqual(['3tr5']);
    expect(offending('tiền thuê 12TR5', { rent: 12_000_000 })).toEqual(['12TR5']);
    expect(offending('cọc 1k5', { deposit: 1_000 })).toEqual(['1k5']);
  });

  it('accepts a date as 7/10 or 07/10/2026 and its month and year', () => {
    for (const text of ['hạn 7/10', 'hạn 07/10/2026', 'tháng 10/2026', 'tháng 10', 'năm 2026', 'October 2026', '2026']) {
      expect(check(text, {}).ok, text).toBe(true);
    }
    expect(offending('hạn 8/10', {})).toEqual(['8/10']);
    expect(offending('hạn 07/10/2025', {})).toEqual(['07/10/2025']);
    expect(offending('tháng 11', {})).toEqual(['11']);
  });

  it('allows Phòng 5 by its label and the household name by the context', () => {
    expect(check('Phòng 5 trống', { unit_label: 'Phòng 5' }).ok).toBe(true);
    expect(check('Gia đình Demo 3', {}).ok).toBe(true);
    expect(offending('Phòng 6 trống', { unit_label: 'Phòng 5' })).toEqual(['6']);
  });

  it('rejects an invented day count', () => {
    expect(offending('quá hạn 13 ngày', { days_overdue: 12, relative_due_display: 'quá hạn 12 ngày' })).toEqual(['13 ngày']);
    expect(check('quá hạn 12 ngày', { days_overdue: 12 }).ok).toBe(true);
  });

  it('rejects uncited amounts in every form', () => {
    const result = { rent: 12_000_000 };
    expect(offending(`tiền thuê 12.500.000${NBSP}₫`, result)).toEqual([`12.500.000${NBSP}₫`]);
    expect(offending('tiền thuê 12,5 tr', result)).toEqual(['12,5 tr']);
    expect(offending('rent 12.5M ₫', result)).toEqual(['12.5M ₫']);
    expect(offending('tiền thuê 12.500.000', result)).toEqual(['12.500.000']);
    expect(check(`tiền thuê 12.000.000${NBSP}₫ (12 tr)`, result).ok).toBe(true);
  });

  it('matches nothing against an empty run except the context', () => {
    expect(offending(`Hôm nay 07/10/2026 thu 3.500.000${NBSP}₫`, {})).toEqual([`3.500.000${NBSP}₫`]);
  });

  it('flags a number it cannot read', () => {
    const report = check(`còn nợ 1.500.00${NBSP}₫`, { outstanding: 1_500_000 });
    expect(report.violations).toMatchObject([{ status: 'unparseable', text: `1.500.00${NBSP}₫` }]);
  });

  it('checks areas as decimals', () => {
    expect(check('diện tích 125,5 m²', { area_m2: 125.5 }).ok).toBe(true);
    expect(check('area 125.5 m2', { area_display: '125,5 m²' }).ok).toBe(true);
    expect(offending('diện tích 125 m²', { area_m2: 125.5 })).toEqual(['125 m²']);
  });

  it('matches a negative amount only with its sign', () => {
    expect(check(`chi -1.500.000${NBSP}₫`, { amount: -1_500_000 }).ok).toBe(true);
    expect(offending(`chi 1.500.000${NBSP}₫`, { amount: -1_500_000 })).toEqual([`1.500.000${NBSP}₫`]);
    expect(offending('chi -1,5 tr', { amount: 1_500_000 })).toEqual(['-1,5 tr']);
  });
});

describe('compact tolerance follows the formatVndCompact rounding', () => {
  it.each<[string, number, boolean]>([
    ['3,5 tr', 3_500_000, true],
    ['3,5 tr', 3_450_000, true],
    ['3,5 tr', 3_449_999, false],
    ['3,5 tr', 3_549_999, true],
    ['3,5 tr', 3_550_000, false],
    ['3.5M ₫', 3_450_000, true],
    ['3.5M ₫', 3_449_999, false],
    ['-3,5 tr', -3_450_000, true],
    ['-3,5 tr', -3_449_999, false],
    ['-3,5 tr', -3_549_999, true],
    ['-3,5 tr', -3_550_000, false],
    ['1,2 tỷ', 1_204_000_000, true],
    ['1,2 tỷ', 1_206_000_000, false],
    ['1,21 tỷ', 1_206_000_000, true],
    ['1,25 tỷ', 1_245_000_000, true],
    ['1,25 tỷ', 1_244_999_999, false],
    ['1 tỷ', 999_999_999, true],
    ['1 tỷ', 994_999_999, false],
    ['850 nghìn', 850_499, true],
    ['850 nghìn', 850_500, false],
    ['850 nghìn', 849_500, true],
    ['850 nghìn', 849_499, false],
    ['0,9 tr', 850_000, false],
    ['3,46 tr', 3_460_000, true],
    ['3,46 tr', 3_462_000, false],
    ['995 tr', 994_950_000, true],
  ])('%s against %i is %s', (text, allowedValue, ok) => {
    expect(check(text, { value: allowedValue }).ok).toBe(ok);
  });

  it('names the nearest compact rounding when a compact claim misses by one step', () => {
    const report = check('còn nợ 3,4 tr', { outstanding: 3_460_000 });
    expect(report.violations).toMatchObject([
      { status: 'rounding', text: '3,4 tr', nearest: { tool: 'tool', path: 'outstanding', text: '3460000' } },
    ]);
    expect(check('còn nợ 3,3 tr', { outstanding: 3_460_000 }).violations).toMatchObject([{ status: 'unknown' }]);
  });
});

describe('citation mapping', () => {
  const allowed = collectAllowed(RUN, CONTEXT);
  const statuses = (text: string): Array<[string, string]> =>
    checkNumbers(text, allowed).numbers.map((number: CheckedNumber) => [
      number.text,
      number.status === 'matched' ? `${number.citation}:${number.source.tool}` : number.status,
    ]);

  it('marks a number found in the record the sentence links as cited, with that record as its source', () => {
    const text = `[Phòng 5](esta://invoice/${IDS.room5SeptInvoice}) còn nợ 3.460.000${NBSP}₫ sau 12 ngày.`;
    const report = checkNumbers(text, allowed);
    expect(report.ok).toBe(true);
    expect(report.numbers).toMatchObject([
      { text: '5', status: 'matched', citation: 'cited', source: { tool: 'watch_facts', path: 'facts[0].unit_label' } },
      { text: `3.460.000${NBSP}₫`, status: 'matched', citation: 'cited', source: { tool: 'watch_facts', path: 'facts[0].outstanding' } },
      { text: '12 ngày', status: 'matched', citation: 'cited', source: { tool: 'watch_facts', path: 'facts[0].days_overdue' } },
    ]);
  });

  it('marks a number from another record or the context as elsewhere when the sentence links a record', () => {
    expect(statuses(`[Phòng 5](esta://invoice/${IDS.room5SeptInvoice}) giữ cọc 6.000.000${NBSP}₫ hôm 07/10/2026.`)).toEqual([
      ['5', 'cited:watch_facts'],
      [`6.000.000${NBSP}₫`, 'elsewhere:watch_facts'],
      ['07/10/2026', 'elsewhere:watch_facts'],
    ]);
  });

  it('marks numbers in a sentence without links as none, and scopes citations by sentence', () => {
    expect(statuses(`Phòng 5 quá hạn 12 ngày. [Xem](esta://lease/${IDS.room7Lease}) giữ cọc 6 tr.`)).toEqual([
      ['5', 'none:watch_facts'],
      ['12 ngày', 'none:watch_facts'],
      ['6 tr', 'cited:watch_facts'],
    ]);
  });

  it('never passes a wrong number because the sentence cites a record', () => {
    expect(statuses(`[Phòng 5](esta://invoice/${IDS.room5SeptInvoice}) quá hạn 13 ngày.`)).toEqual([
      ['5', 'cited:watch_facts'],
      ['13 ngày', 'unknown'],
    ]);
  });
});

describe('repairMessage', () => {
  it('names every offending number with its reason', () => {
    const report = check(`Phòng 5 quá hạn 13 ngày, nợ 3,4 tr, trả 1.500.00${NBSP}₫.`, {
      unit_label: 'Phòng 5',
      days_overdue: 12,
      outstanding: 3_460_000,
    });
    expect(repairMessage(report)).toBe(
      `"13 ngày" appears in no tool result; "3,4 tr" rounds differently from 3460000 (tool outstanding); "1.500.00${NBSP}₫" is not a readable number`,
    );
  });

  it('is empty for a clean report', () => {
    expect(repairMessage(check('Phòng 5', { unit_label: 'Phòng 5' }))).toBe('');
  });
});

describe('Trợ lý notes over the fixture run', () => {
  const allowed = collectAllowed(RUN, CONTEXT);

  it.each(NOTES.map((note) => [note.name, note] as const))('%s', (_name, note) => {
    const report = checkNumbers(note.text, allowed);
    const violations = report.violations.map((violation) => violation.text);
    if (note.expect === 'pass') expect(violations).toEqual([]);
    else expect(violations).toEqual(note.expect);
    expect(report.ok).toBe(note.expect === 'pass');
  });

  it('indexes the whole run with one source per path', () => {
    const paths = new Set([...allowed.values()].flat().map((source) => `${source.tool}:${source.path}`));
    expect(paths.has('watch_facts:facts[0].outstanding')).toBe(true);
    expect(allowed.get('code:7K2QX9MP')?.map((source) => source.path)).toEqual(['facts[0].memo_code']);
    expect(paths.has('watch_facts:facts[0].invoice_id')).toBe(false);
  });
});
