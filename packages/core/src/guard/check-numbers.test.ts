import { describe, expect, it } from 'vitest';
import { onScreenText } from './index';
import { amount, count, ratio, values, offending } from './fixtures';

describe('checkNumbers against one run (AGENT.md §6.3)', () => {
  it('passes a note made of the run’s numbers and display strings', () => {
    expect(offending('**Phòng 5** ở Nhà trọ Dĩ An quá hạn 12 ngày, còn nợ 3.500.000 ₫ (3,5 triệu), hạn 25/09/2026.')).toEqual([]);
    expect(offending('Hợp đồng Căn hộ Thủ Đức hết hạn ngày 01/11/2026, còn 25 ngày.')).toEqual([]);
  });

  it('allows an amount field quoted as a bare number', () => {
    expect(offending('Còn nợ 3.500.000.', [{ outstanding_vnd: 3_500_000 }])).toEqual([]);
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
    expect(onScreenText('Trước ![5 tỷ](https://example.com/a.png) sau')).toEqual(['Trước sau']);
    expect(offending('Diện tích 125,5 m².', [{ area_m2: 125.5 }])).toEqual([]);
  });

  it('ends a number at a comma or period, so the next word is never its unit', () => {
    expect(offending('Phòng 5, đồng thời Căn hộ Thủ Đức còn 25 ngày.')).toEqual([]);
    expect(offending('Căn hộ Thủ Đức còn 25, đồng thời Phòng 5 quá hạn 12 ngày.')).toEqual([]);
  });

  it('reports each offending number once, as written', () => {
    expect(offending('40 ngày, rồi 40 ngày, rồi **41** ngày')).toEqual(['40', '41']);
  });
});

describe('the allowed set keeps every value exact (#309 review)', () => {
  it('allows a percent field written with a percent sign (W11)', () => {
    expect(offending('Hồ sơ Đất Long An mới đủ 55%.', [{ rule_id: 'W11', numbers: { completeness_percent: 55 } }])).toEqual([]);
  });

  it('reads a price per area and an area written m2', () => {
    expect(values('Giá thuê 120 triệu/m², 120tr/m2, 120.000 ₫/m²')).toEqual([amount(120_000_000), amount(120_000_000), amount(120_000)]);
    expect(values('Diện tích 25 m2')).toEqual([count(25)]);
  });

  it('folds only a word written without diacritics, so vấn is not vạn', () => {
    expect(values('Có 5 vấn đề, 5 van')).toEqual([count(5), null]);
  });

  it('reads a percent written as a word', () => {
    expect(values('12 pct, 12 phan tram, 12 per cent')).toEqual([ratio(1200), ratio(1200), ratio(1200)]);
  });

  it('keys counts by their exact digits, leading zeros and all', () => {
    expect(offending('Số điện thoại 0901234567', [{ phone: '901234567' }])).toEqual(['0901234567']);
    expect(offending('Tài khoản 12345678901234567892', [{ account: '12345678901234567891' }])).toEqual(['12345678901234567892']);
    expect(offending('Tài khoản 12345678901234567892', [{ account: '12345678901234567892' }])).toEqual([]);
    expect(offending('Thanh toán 9.007.199.254.740.993 ₫', [{ amount_display: '9.007.199.254.740.992 ₫' }])).toEqual(['9.007.199.254.740.993 ₫']);
  });

  it('reads an amount field sent as a digit string or a bigint', () => {
    expect(offending('Còn nợ 3.500.000 ₫', [{ outstanding_vnd: '3500000' }])).toEqual([]);
    expect(offending('Còn nợ 3.500.000 ₫', [{ outstanding_vnd: 3_500_000n }])).toEqual([]);
  });
});
