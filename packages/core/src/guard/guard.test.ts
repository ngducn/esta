import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import type { Locale } from '../format';
import { checkNumbers, collectAllowed, extractNumbers, onScreenText, type CanonicalNumber } from './index';

const amount = (vnd: number): CanonicalNumber => ({ kind: 'amount', vnd });
const count = (value: number): CanonicalNumber => ({ kind: 'count', value });
const ratio = (bp: number): CanonicalNumber => ({ kind: 'ratio', bp });
const date = (iso: string): CanonicalNumber => ({ kind: 'date', iso });

const values = (text: string, locale: Locale = 'vi') => extractNumbers(onScreenText(text), locale).map((number) => number.value);

/** One portfolio_watch run: the W1 fact for Phòng 5 with its display strings, and the labels other facts carry. */
const RUN = [
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

const allowedFor = (results: readonly unknown[] = RUN, locale: Locale = 'vi') =>
  collectAllowed(results, { today: isoDate('2026-10-07'), householdName: 'Gia đình Demo 3', locale });

const offending = (markdown: string, results: readonly unknown[] = RUN, locale: Locale = 'vi') => checkNumbers(onScreenText(markdown), allowedFor(results, locale));

describe('extractNumbers reads every AGENT.md §6.3 form', () => {
  it.each([
    ['3,5 tr', amount(3_500_000)],
    ['1,2 tỷ', amount(1_200_000_000)],
    ['15.000.000 ₫', amount(15_000_000)],
    ['850 nghìn', amount(850_000)],
    ['3.5M ₫', amount(3_500_000)],
    ['6,5%', ratio(650)],
    ['650 bp', ratio(650)],
    ['07/10/2026', date('2026-10-07')],
    ['7/10', date('--10-07')],
    ['10/2026', date('2026-10')],
    ['2026-09-25', date('2026-09-25')],
    ['12 ngày', count(12)],
    ['Phòng 5', count(5)],
    ['25 triệu đồng', amount(25_000_000)],
    ['VND 5.000.000', amount(5_000_000)],
    ['3,5 triệu/tháng', amount(3_500_000)],
  ])('reads %s', (text, expected) => {
    expect(values(text)).toEqual([expected]);
  });

  it('reads thousands and decimals by the household locale, and the reading the two locales dispute as unreadable', () => {
    expect(values('1.500', 'vi')).toEqual([count(1500)]);
    expect(values('1,500', 'en')).toEqual([count(1500)]);
    expect(values('1,5', 'vi')).toEqual([count(1.5)]);
    expect(values('1.5', 'en')).toEqual([count(1.5)]);
    expect(values('1,500', 'vi')).toEqual([null]);
    expect(values('1.500', 'en')).toEqual([null]);
    expect(values('1.500.000', 'en')).toEqual([count(1_500_000)]);
    expect(values('1,500 triệu', 'vi')).toEqual([null]);
  });

  it('reads magnitude words in Vietnamese and English, with or without diacritics', () => {
    expect(values('25 mil VND, 2 ty dong, 25 trieu, 25 nghin dong, 25 ngan, 3 bn, 7 K')).toEqual([
      amount(25_000_000),
      amount(2_000_000_000),
      amount(25_000_000),
      amount(25_000),
      amount(25_000),
      amount(3_000_000_000),
      amount(7_000),
    ]);
    expect(values('Rent is 12 million VND, 82.4 percent of the 500 million threshold.', 'en')).toEqual([amount(12_000_000), ratio(8240), amount(500_000_000)]);
    expect(values('Tăng 5 phần trăm.')).toEqual([ratio(500)]);
  });

  it('reads compound amounts as a Vietnamese reader says them', () => {
    expect(values('3 triệu rưỡi, 3 triệu 5, 1 tỷ 2, 3 trăm nghìn, 1 tỷ 250 triệu, 1 tỷ 250, 12 triệu 500 nghìn')).toEqual([
      amount(3_500_000),
      amount(3_500_000),
      amount(1_200_000_000),
      amount(300_000),
      amount(1_250_000_000),
      amount(1_250_000_000),
      amount(12_500_000),
    ]);
  });

  it.each(['3 triệu 50', '1 triệu 20', '1 tỷ 25', '5 trăm', '3 triệu tư', '1,2 nghìn tỷ', '3 trăm nghìn tỷ', '½ tỷ', '1,5 ₫'])('reads %s as unreadable', (text) => {
    expect(values(text)).toEqual([null]);
  });

  it('reads dates written in words', () => {
    expect(values('ngày 7 tháng 10 năm 2026')).toEqual([date('2026-10-07')]);
    expect(values('trong tháng 10')).toEqual([date('--10')]);
    expect(values('tháng 9 năm 2026')).toEqual([date('2026-09')]);
    expect(values('October 7, 2026', 'en')).toEqual([date('2026-10-07')]);
    expect(values('on 7 October', 'en')).toEqual([date('--10-07')]);
    expect(values('October 2026', 'en')).toEqual([date('2026-10')]);
  });

  it('keeps a written sign', () => {
    expect(values('Lỗ -1.500.000 ₫, giảm −3,2%.')).toEqual([amount(-1_500_000), ratio(-320)]);
  });
});

describe('a reader and the guard see the same number (#61 round 3)', () => {
  it('reads Markdown as it renders', () => {
    expect(values('**25** triệu')).toEqual([amount(25_000_000)]);
    expect(values('25 *triệu*')).toEqual([amount(25_000_000)]);
    expect(values('`25` triệu')).toEqual([amount(25_000_000)]);
    expect(values('**5**.000.000 ₫')).toEqual([amount(5_000_000)]);
    expect(values('5\\.000\\.000 ₫')).toEqual([amount(5_000_000)]);
    expect(values('25\ntriệu')).toEqual([amount(25_000_000)]);
  });

  it('shows raw HTML as the literal text react-markdown prints, so a comment inside digits is unreadable', () => {
    expect(values('5<!-- -->000.000 ₫')).toContainEqual(null);
  });

  it.each([
    ['line feed', '\n'],
    ['CRLF', '\r\n'],
    ['line separator', ' '],
    ['paragraph separator', ' '],
    ['next line', '\u0085'],
    ['vertical tab', '\v'],
    ['form feed', '\f'],
    ['no-break space', ' '],
  ])('joins a number and its magnitude across a %s', (_name, gap) => {
    expect(extractNumbers(`25${gap}triệu`, 'vi').map((number) => number.value)).toEqual([amount(25_000_000)]);
  });

  it.each(['25triệuđồng', '25 triệuđồng', '25trVND', '25milVND'])('reads the glued tail of %s', (text) => {
    expect(values(text)).toEqual([amount(25_000_000)]);
  });

  it('reads 2tỷđ as two billion', () => {
    expect(values('2tỷđ')).toEqual([amount(2_000_000_000)]);
  });

  it.each(['25⠀triệu', '2́5 triệu', '25x triệu', '5m', '25d'])('reads %s, whose digits share a token with an unknown mark, as unreadable', (text) => {
    expect(values(text)).toEqual([null]);
  });
});

describe('a partial reading never stands in for a larger number (#61 round 2)', () => {
  it('gives the lower bound of a range only the upper bound’s unit word', () => {
    expect(values('Tiền thuê từ 3 đến 3 triệu rưỡi.')).toEqual([amount(3_000_000), amount(3_500_000)]);
    expect(values('Giá 2–2 triệu rưỡi.')).toEqual([amount(2_000_000), amount(2_500_000)]);
    expect(values('Giá từ 1 đến 1 tỷ 2.')).toEqual([amount(1_000_000_000), amount(1_200_000_000)]);
    expect(values('Khoảng 8–12 triệu 5.')).toEqual([amount(8_000_000), amount(12_500_000)]);
    expect(values('Từ 3–3 triệu 5.')).toEqual([amount(3_000_000), amount(3_500_000)]);
    expect(values('Lợi suất 5–7%.')).toEqual([ratio(500), ratio(700)]);
    expect(values('Between 8 and 12M ₫.', 'en')).toEqual([amount(8_000_000), amount(12_000_000)]);
    expect(values('Trống 67–70 ngày.')).toEqual([count(67), count(70)]);
  });

  it('flags the lower bound a range invents', () => {
    expect(offending('Tiền thuê từ 3 đến 3,5 tr.')).toEqual(['3 đến 3,5 tr']);
  });

  it.each(['5 000.000 ₫', '5.000 000 ₫', '5 000,000 ₫', '5,000 000 ₫', '5 000 00 vnđ', "5'000'000 ₫", '5_000_000 ₫', 'Năm 2026 000 000 ₫', '12 00 ₫', '1 2000 ₫', '12-15/10/2026'])(
    'reads %s, whose separators disagree, as unreadable',
    (text) => {
      expect(values(text)).toContainEqual(null);
      expect(values(text).filter((value) => value !== null && value.kind !== 'amount')).toEqual([]);
    },
  );

  it('reads a separator after a currency word the same way', () => {
    expect(values('Owes VND 5 000.000.', 'en')).toEqual([null]);
  });

  it.each([
    ['space', ' '],
    ['figure space', ' '],
    ['en space', ' '],
    ['thin space', ' '],
    ['narrow no-break space', ' '],
    ['ideographic space', '　'],
    ['tab', '\t'],
  ])('groups digits split by the %s as one number', (_name, gap) => {
    expect(values(`5${gap}000${gap}000 ₫`)).toEqual([amount(5_000_000)]);
  });

  it.each(['͏', '️', '​', '­'])('removes the invisible U+%s before reading', (mark) => {
    expect(values(`5${mark}000${mark}000 ₫`)).toEqual([amount(5_000_000)]);
  });
});

describe('checkNumbers against one run (AGENT.md §6.3)', () => {
  it('passes a note made of the run’s numbers and display strings', () => {
    expect(offending('**Phòng 5** ở Nhà trọ Dĩ An quá hạn 12 ngày, còn nợ 3.500.000 ₫ (3,5 triệu), hạn 25/09/2026.')).toEqual([]);
    expect(offending('Hợp đồng Căn hộ Thủ Đức hết hạn ngày 01/11/2026, còn 25 ngày.')).toEqual([]);
  });

  it('rejects an invented day count', () => {
    expect(offending('Phòng 5 quá hạn 13 ngày.')).toEqual(['13']);
  });

  it('allows a room number by its label and the household name by context', () => {
    expect(offending('Phòng 5', [{ unit_label: 'Phòng 5' }])).toEqual([]);
    expect(offending('Gia đình Demo 3 có một việc cần làm.', [])).toEqual([]);
  });

  it('allows today written as 7/10 and as 07/10/2026, and no other day', () => {
    expect(offending('Hôm nay 7/10, tức 07/10/2026.', [])).toEqual([]);
    expect(offending('Hạn 8/10.', [])).toEqual(['8/10']);
  });

  it('treats a percent and its basis points as one value', () => {
    expect(offending('Đạt 82,4% ngưỡng, tức 8240 bp.')).toEqual([]);
    expect(offending('Đạt 6,5%.', [{ yield_bp: 650 }])).toEqual([]);
    expect(offending('Yield 6.5%.', [{ yield_display: '6.5%' }], 'en')).toEqual([]);
  });

  it('reads the tool’s display strings in the household locale', () => {
    expect(offending('Owes 1,500 ₫.', [{ owed_display: '1,500 ₫' }], 'en')).toEqual([]);
    expect(offending('Còn nợ 1.500 ₫.', [{ owed_display: '1.500 ₫' }], 'vi')).toEqual([]);
  });

  it('never lets a smaller count satisfy an amount, or an amount field satisfy a percent', () => {
    expect(offending('Còn nợ 12 ₫.')).toEqual(['12 ₫']);
    expect(offending('Còn nợ 25 triệu.', [{ days: 25 }])).toEqual(['25 triệu']);
    expect(offending('Đạt 12%.')).toEqual(['12%']);
  });

  it('never lets a year inside a date satisfy a count', () => {
    expect(offending('Quá hạn 2026 ngày.', [])).toEqual(['2026']);
  });

  it('lets a negative value be quoted unsigned, and a written minus sign only match a negative value', () => {
    expect(offending('Chênh lệch 1.500.000 ₫.', [{ change_vnd: -1_500_000 }])).toEqual([]);
    expect(offending('Lỗ -1.500.000 ₫.', [{ change_vnd: -1_500_000 }])).toEqual([]);
    expect(offending('Lỗ -1.500.000 ₫.', [{ change_vnd: 1_500_000 }])).toEqual(['-1.500.000 ₫']);
  });

  it('allows a token with digits that reads as no number only when a tool string holds it whole', () => {
    expect(offending('Nhà phố Q7 sắp hết hạn bảo hiểm.')).toEqual([]);
    expect(offending('Mã 777.')).toEqual(['777']);
    expect(offending('Hóa đơn INV12.')).toEqual(['INV12']);
    expect(offending('Mã ESTA 7K2QX9MQ.', [{ memo_code: '7K2QX9MP' }])).toEqual(['7K2QX9MQ']);
  });

  it('checks the numbers an ordered list shows when it does not start at 1', () => {
    expect(offending('1. Phòng 5\n2. Căn hộ Thủ Đức')).toEqual([]);
    expect(offending('13. Phòng 5 quá hạn')).toEqual(['13']);
  });

  it('checks link text and ignores the link target', () => {
    expect(offending('[Phòng 5](esta://property/3f1c2a9e-5b7d-4c1a-9e2f-7a6b5c4d3e2f) quá hạn 12 ngày')).toEqual([]);
    expect(offending('[quá hạn 40 ngày](esta://property/3f1c2a9e-5b7d-4c1a-9e2f-7a6b5c4d3e2f)')).toEqual(['40']);
  });

  it('ignores an image, which SafeMarkdown never shows, and area units', () => {
    expect(onScreenText('Trước ![5 tỷ](https://example.com/a.png) sau')).toBe('Trước sau');
    expect(offending('Diện tích 125,5 m².', [{ area_m2: 125.5 }])).toEqual([]);
  });

  it('reports each offending number once, as written', () => {
    expect(offending('40 ngày, rồi 40 ngày, rồi **41** ngày')).toEqual(['40', '41']);
  });
});
