import { describe, expect, it } from 'vitest';
import { extractNumbers } from './index';
import { amount, count, ratio, date, values, offending } from './fixtures';

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

  it.each(['(25) triệu', '“25” triệu', '"25" tr'])('reads %s, a unit after the number\u2019s closing mark, as unreadable', (text) => {
    expect(values(text)).toEqual([null]);
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

describe('a number the guard cannot read whole is unreadable, never a smaller number (#309 review)', () => {
  it.each([
    '3 triệu 5 nghìn',
    '3 triệu 5 ngàn đồng',
    '3 triệu 5 trăm',
    '3 triệu 5 trăm nghìn',
    '3 triệu 5 đồng',
    '3 triệu 5 ₫',
    '3 triệu 5k',
    '3 triệu 5 k',
    '3 triệu rưỡi nghìn',
    '1 tỷ 2 triệu',
    '1 tỷ 2 nghìn',
    '2 tỷ 5 triệu',
    '1 tỷ 25 triệu',
    '1.5 tỷ 2 triệu',
    '1,5 tỷ rưỡi',
    '2,5 rưỡi',
    'từ 3 triệu đến 4',
  ])('reads %s, an amount word the grammar did not take, as unreadable', (text) => {
    expect(values(text)).toEqual([null]);
  });

  it.each([
    '3 triệu mấy',
    '5 chục triệu',
    '5 mươi ngàn',
    '5 vạn',
    '5 củ',
    '12 củ',
    '5 bil',
    '5 tỏi',
    '5 lít',
    '12 lít',
    '5 USD',
    '5 cây vàng',
    '3,5 m ₫',
    '5 – đ',
    '5 _triệu',
    '5 `triệu',
    '5 ~triệu',
    '12 • triệu',
    '5 /₫',
  ])('reads %s, a word that changes the number beside it, as unreadable', (text) => {
    expect(values(text)).toEqual([null]);
  });

  it.each(['mỗi tháng 10 triệu', 'Mỗi tháng 12 triệu', 'Tiền thuê tháng 10 triệu', 'Giá 25/9 tỷ', 'Giá 1/2 tỷ'])(
    'reads %s, a date or fraction followed by an amount word, as unreadable',
    (text) => {
      expect(values(text)).toEqual([null]);
    },
  );

  it('flags a month a reader takes as an amount even when today is that month', () => {
    expect(offending('Phòng 5 thu mỗi tháng 10 triệu.')).toEqual(['tháng 10 triệu']);
  });

  it('gives every bare number of a list the unit of the number after it', () => {
    expect(values('Giá 3 hoặc 3,5 triệu.')).toEqual([amount(3_000_000), amount(3_500_000)]);
    expect(values('Giá khoảng 3, 3,5 triệu.')).toEqual([amount(3_000_000), amount(3_500_000)]);
    expect(values('Giá 3 hay 4 triệu.')).toEqual([amount(3_000_000), amount(4_000_000)]);
    expect(offending('Giá khoảng 3 hoặc 3,5 triệu.', [{ vacant_units: 3, outstanding_vnd: 3_500_000 }])).toEqual(['3 hoặc 3,5 triệu']);
  });

  it('reads a half after a count, and rưởi as rưỡi', () => {
    expect(values('3 triệu rưởi')).toEqual([amount(3_500_000)]);
    expect(values('Phòng 8 đã trống 2 tháng rưỡi.')).toEqual([count(8), count('2.5')]);
    expect(values('gần 2 năm rưỡi')).toEqual([count('2.5')]);
    expect(offending('Phòng 8 đã trống 2 tháng rưỡi.', [{ unit_label: 'Phòng 8', invoices: 2 }])).toEqual(['2 tháng rưỡi']);
  });

  it('flags every word holding a bidi control, which reorders what Mẹ sees', () => {
    expect(offending('Quá hạn ‮12‬ ngày.')).toEqual(['U+202E12U+202C']);
    expect(offending('Quá hạn ‭‮21 ngày')).toEqual(['U+202DU+202E21', '21']);
    expect(offending('Quá hạn ⁧ 12 ngày.')).toEqual(['U+2067']);
  });
});

describe('labels and blocks keep their numbers apart (#309 review)', () => {
  it.each([
    '**Phòng 5** — quá hạn 12 ngày.',
    'Phòng 5 - quá hạn 12 ngày',
    'Phòng 5 – 3.500.000 ₫',
    '**Phòng 5** – 3.500.000 ₫, quá hạn 12 ngày.',
    '- **Phòng 5** — 3,5 tr (quá hạn 12 ngày)',
    'Phòng 5 đồng thời quá hạn 12 ngày',
    'Phòng 5 ~ 12 ngày',
    '3.500.000 ₫ – 12 ngày quá hạn',
    '- Phòng 5\n- 3.500.000 ₫',
    '## Phòng 5\n\n12 ngày quá hạn',
    '**Phòng 5**\n\n3.500.000 ₫',
  ])('passes %j', (markdown) => {
    expect(offending(markdown)).toEqual([]);
  });

  it('joins a soft line break, so digits on the next line still read as one number', () => {
    expect(values('Phòng 5\n350.000 ₫')).toEqual([null]);
  });

  it('reads a d/m as a date only after a date word or alone, and as two counts otherwise', () => {
    expect(values('7/10 phòng đã cho thuê')).toEqual([count(7), count(10)]);
    expect(offending('7/10 phòng đã cho thuê', [])).toEqual(['7/10']);
    expect(values('Hạn đóng 25/09.')).toEqual([date('--09-25')]);
    expect(values('Phòng 7 kết thúc 15/9.')).toEqual([count(7), date('--09-15')]);
  });

  it('reads tháng and năm after a number as a duration, not a date', () => {
    expect(values('Trống 2 tháng 10 ngày.')).toEqual([count(2), count(10)]);
    expect(values('Hợp đồng 2 năm, giá 3 triệu năm 2026.')).toEqual([count(2), amount(3_000_000), date('2026')]);
  });

  it('reads a day of the month without its month as unreadable', () => {
    expect(values('ngày 12 hết hạn')).toEqual([null]);
  });

  it('reads năm with four digits as a year, and allows today’s year', () => {
    expect(values('năm 2026')).toEqual([date('2026')]);
    expect(offending('Trong năm 2026, Phòng 5 quá hạn 12 ngày.')).toEqual([]);
    expect(offending('Doanh thu năm 2025.', [])).toEqual(['năm 2025']);
    expect(offending('Doanh thu năm 2025.', [{ tax_year: 2025 }])).toEqual([]);
  });
});
