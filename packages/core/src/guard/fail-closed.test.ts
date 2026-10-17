import { describe, expect, it } from 'vitest';
import { checkNumbers } from './checkNumbers';
import { collectAllowed } from './collectAllowed';
import { extractNumbers } from './extractNumbers';
import { CONTEXT, RUN } from './fixtures/run';
import type { ExtractedValue } from './normalize';

const run = collectAllowed(RUN, CONTEXT);
const allowedFor = (result: unknown) => (result === undefined ? run : collectAllowed([{ tool: 'tool', result }], CONTEXT));
const offending = (text: string, result?: unknown): string[] =>
  checkNumbers(text, allowedFor(result)).violations.map((violation) => `${violation.text}:${violation.status}`);
const passes = (text: string, result?: unknown): boolean => checkNumbers(text, allowedFor(result)).ok;
const values = (text: string): ExtractedValue[] => extractNumbers(text).map((number) => number.value);

describe('magnitude and percent words make an amount or a percentage, never a bare count', () => {
  it.each<[string, unknown, string[]]>([
    ['Rent is 25 million VND.', undefined, ['25 million VND:unknown']],
    ['Worth 2 billion dong.', undefined, ['2 billion dong:unknown']],
    ['Water bill 850 thousand VND.', { v: 850 }, ['850 thousand VND:unknown']],
    ['Up 5 percent.', undefined, ['5 percent:unknown']],
    ['Tăng 5 phần trăm.', undefined, ['5 phần trăm:unknown']],
    ['Rent 15 M ₫.', { days: 15 }, ['15 M ₫:unknown']],
  ])('%s', (text, result, expected) => {
    expect(offending(text, result)).toEqual(expected);
  });

  it('reads each word as its unit', () => {
    expect(values('25 million VND, 2 billion, 850 thousand, 3 bn, 7 K, 5 percent, 5 phần trăm')).toEqual([
      { kind: 'compact', vnd: 25_000_000, unit: 'tr' },
      { kind: 'compact', vnd: 2_000_000_000, unit: 'ty' },
      { kind: 'compact', vnd: 850_000, unit: 'nghin' },
      { kind: 'compact', vnd: 3_000_000_000, unit: 'ty' },
      { kind: 'compact', vnd: 7_000, unit: 'nghin' },
      { kind: 'ratio', bp: 500 },
      { kind: 'ratio', bp: 500 },
    ]);
  });

  it('still passes the run values written with words', () => {
    expect(passes('Rent is 12 million VND, 82,4 percent of the 500 million threshold.')).toBe(true);
    expect(passes('Đã thu 31,2 triệu, lấp đầy 78,57 phần trăm.')).toBe(true);
  });
});

describe('space-grouped digits are one number', () => {
  const NBSP = ' ';
  const NNBSP = ' ';
  const THIN = ' ';

  it.each<[string, unknown, string[]]>([
    ['Phòng 5 còn nợ 5 000 000 ₫.', undefined, ['5 000 000 ₫:unknown']],
    [`Phòng 5 còn nợ 5${NBSP}000${NBSP}000${NBSP}₫.`, undefined, [`5${NBSP}000${NBSP}000${NBSP}₫:unknown`]],
    [`Phòng 5 còn nợ 5${NNBSP}000${NNBSP}000 ₫.`, undefined, [`5${NNBSP}000${NNBSP}000 ₫:unknown`]],
    [`Phòng 5 còn nợ 5${THIN}000${THIN}000 ₫.`, undefined, [`5${THIN}000${THIN}000 ₫:unknown`]],
    ['Nợ 12 000 000 ₫.', { days_overdue: 12, paid: 0 }, ['12 000 000 ₫:unknown']],
  ])('%s', (text, result, expected) => {
    expect(offending(text, result)).toEqual(expected);
  });

  it('reads any other spacing before a currency sign as unparseable', () => {
    expect(offending('Nợ 12 00 ₫.', { days_overdue: 12, paid: 0 })).toEqual(['12 00 ₫:unparseable']);
    expect(offending('Nợ 1 2000 ₫.', { member_count: 1, paid: 2000 })).toEqual(['1 2000 ₫:unparseable']);
  });

  it('still passes a run amount grouped with spaces', () => {
    expect(passes(`Hợp đồng Nhà Thủ Đức thu 12 000 000 ₫, đã cọc 42${NBSP}000${NBSP}000${NBSP}₫.`)).toBe(true);
  });
});

describe('the unit of a range applies to both bounds', () => {
  it.each<[string, unknown, string[]]>([
    ['Giá thuê thị trường khoảng 8–12 triệu.', undefined, ['8–12 triệu:unknown']],
    ['Khoảng 8-12 triệu.', undefined, ['8-12 triệu:unknown']],
    ['Từ 8 đến 12 triệu.', undefined, ['8 đến 12 triệu:unknown']],
    ['Between 8 and 12M ₫.', undefined, ['8 and 12M ₫:unknown']],
    ['Giá thuê thị trường 10–12 triệu.', { days_overdue: 10, rent: 12_000_000 }, ['10–12 triệu:unknown']],
    ['Lợi suất 5–7%.', { unit_label: 'Phòng 5', yield_bp: 700 }, ['5–7%:unknown']],
  ])('%s', (text, result, expected) => {
    expect(offending(text, result)).toEqual(expected);
  });

  it('still passes a range whose bounds are both in the run', () => {
    expect(passes('Tiền thuê từ 3,5 tr đến 12 triệu.')).toBe(true);
    expect(passes('Trống 67–70 ngày.')).toBe(true);
  });
});

describe('digits mixed with number words read as their whole value or as unparseable', () => {
  it.each<[string, unknown, string[]]>([
    ['Phòng 5 còn nợ 3 trăm nghìn.', undefined, ['3 trăm nghìn:unknown']],
    ['Còn nợ 1 trăm triệu.', { member_count: 1 }, ['1 trăm triệu:unknown']],
    ['Tiền điện 5 trăm nghìn.', { unit_label: 'Phòng 5' }, ['5 trăm nghìn:unknown']],
    ['Tiền thuê 3 triệu rưỡi.', { rent: 3_000_000 }, ['3 triệu rưỡi:unknown']],
    ['Tiền thuê 3 triệu 5.', { rent: 3_000_000, unit_label: 'Phòng 5' }, ['3 triệu 5:unknown']],
    ['Tiền điện 5 trăm.', { unit_label: 'Phòng 5' }, ['5 trăm:unparseable']],
    ['Tiền thuê 3 triệu tư.', { rent: 3_000_000 }, ['3 triệu tư:unparseable']],
    ['Giá 1,2 nghìn tỷ.', { v: 1_200_000 }, ['1,2 nghìn tỷ:unparseable']],
  ])('%s', (text, result, expected) => {
    expect(offending(text, result)).toEqual(expected);
  });

  it('reads the whole value with the smallest unit for tolerance', () => {
    expect(values('3 triệu rưỡi, 3 triệu 5, 3 trăm nghìn, 1 tỷ 250 triệu, 12 triệu 500 nghìn')).toEqual([
      { kind: 'compact', vnd: 3_500_000, unit: 'tr' },
      { kind: 'compact', vnd: 3_500_000, unit: 'tr' },
      { kind: 'compact', vnd: 300_000, unit: 'nghin' },
      { kind: 'compact', vnd: 1_250_000_000, unit: 'tr' },
      { kind: 'compact', vnd: 12_500_000, unit: 'nghin' },
    ]);
  });

  it('passes the run value written with words', () => {
    expect(passes('Tiền thuê 3 triệu rưỡi, tức 3 triệu 5.', { rent: 3_500_000 })).toBe(true);
    expect(passes('Giá 1 tỷ 250 triệu, cọc 3 trăm nghìn.', { price: 1_250_000_000, deposit: 300_000 })).toBe(true);
    expect(passes('Doanh thu 412 triệu năm 2026.')).toBe(true);
  });
});
