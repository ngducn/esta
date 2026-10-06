import { describe, expect, it } from 'vitest';
import { parseDateInput } from './date-input';
import { parseStatementAmount, parseStatementDate } from './statement';
import { parseVndInput } from './vnd-input';

describe('parseVndInput', () => {
  it.each([
    ['3tr5', 3_500_000],
    ['3,5tr', 3_500_000],
    ['3.500.000', 3_500_000],
    ['1ty2', 1_200_000_000],
    ['850k', 850_000],
    ['15 triệu', 15_000_000],
  ])('parses the DESIGN-BRIEF §7 example %s', (text, value) => {
    expect(parseVndInput(text)).toEqual({ ok: true, value });
  });

  it.each([
    ['3500000', 3_500_000],
    ['  3500000  ', 3_500_000],
    ['0', 0],
    ['3 500 000', 3_500_000],
    ['3,500,000', 3_500_000],
    ['3.500', 3_500],
    ['1500000.00', 1_500_000],
    ['3.500.000 ₫', 3_500_000],
    ['3.500.000đ', 3_500_000],
    ['3.500.000 VND', 3_500_000],
    ['3.500.000 đồng', 3_500_000],
    ['3.5tr', 3_500_000],
    ['3TR5', 3_500_000],
    ['3 tr 5', 3_500_000],
    ['3tr500', 3_500_000],
    ['3 triệu 500 nghìn', 3_500_000],
    ['3tr500k', 3_500_000],
    ['1 tỷ 200 triệu', 1_200_000_000],
    ['1 tỉ 2', 1_200_000_000],
    ['1ty25', 1_250_000_000],
    ['1ty250', 1_250_000_000],
    ['1,25 tỷ', 1_250_000_000],
    ['1,250 tỷ', 1_250_000_000],
    ['3,500tr', 3_500_000],
    ['1,25tỷ', 1_250_000_000],
    ['2,750 triệu', 2_750_000],
    ['0,5tr', 500_000],
    ['1,500k', 1_500],
    ['1.500tr', 1_500_000_000],
    ['850 nghìn', 850_000],
    ['850 ngàn', 850_000],
    ['850K', 850_000],
    ['3k5', 3_500],
    ['2 triệu rưỡi', 2_500_000],
    ['1tr2 đ', 1_200_000],
  ])('parses %s', (text, value) => {
    expect(parseVndInput(text)).toEqual({ ok: true, value });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['abc', 'invalid'],
    ['tr5', 'invalid'],
    ['3tr5tr', 'invalid'],
    ['500k3tr', 'invalid'],
    ['3tr1500', 'invalid'],
    ['-3tr', 'invalid'],
    ['3..5tr', 'invalid'],
    ['3,5', 'fractional'],
    ['1500000.50', 'fractional'],
    ['1,2345k', 'fractional'],
    ['99999999999 tỷ', 'too_large'],
  ])('rejects %s as %s', (text, reason) => {
    expect(parseVndInput(text)).toEqual({ ok: false, reason });
  });
});

describe('parseDateInput', () => {
  it.each([
    ['07/10/2026', '2026-10-07'],
    ['7/10/2026', '2026-10-07'],
    [' 29/02/2024 ', '2024-02-29'],
    ['31/12/2026', '2026-12-31'],
  ])('parses %s', (text, value) => {
    expect(parseDateInput(text)).toEqual({ ok: true, value });
  });

  it.each([
    ['', 'empty'],
    ['2026-10-07', 'invalid'],
    ['07/10/26', 'invalid'],
    ['07-10-2026x', 'invalid'],
    ['31/04/2026', 'impossible'],
    ['29/02/2026', 'impossible'],
    ['00/10/2026', 'impossible'],
    ['07/13/2026', 'impossible'],
  ])('rejects %s as %s', (text, reason) => {
    expect(parseDateInput(text)).toEqual({ ok: false, reason });
  });
});

describe('parseStatementAmount', () => {
  it.each([
    ['1.500.000', 1_500_000],
    ['1,500,000', 1_500_000],
    ['1500000.00', 1_500_000],
    ['+1.500.000', 1_500_000],
    ['-1.500.000', -1_500_000],
    ['-1,500,000', -1_500_000],
    [' 1.500.000 VND ', 1_500_000],
    ['1500000', 1_500_000],
    ['1.500.000,00', 1_500_000],
  ])('parses %s', (text, value) => {
    expect(parseStatementAmount(text)).toEqual({ ok: true, value });
  });

  it.each([
    ['1.500.000,50', 'fractional'],
    ['1500000.5', 'fractional'],
    ['', 'empty'],
    ['abc', 'invalid'],
    ['1.500.000-', 'invalid'],
  ])('rejects %s as %s', (text, reason) => {
    expect(parseStatementAmount(text)).toEqual({ ok: false, reason });
  });
});

describe('parseStatementDate', () => {
  it.each([
    ['07/10/2026', '2026-10-07'],
    ['07/10/2026 14:32:05', '2026-10-07'],
    ['2026-10-07', '2026-10-07'],
  ])('parses the DOMAIN-VN §9 format %s', (text, value) => {
    expect(parseStatementDate(text)).toEqual({ ok: true, value });
  });

  it.each([
    ['31/09/2026', 'impossible'],
    ['2026-02-30', 'impossible'],
    ['07/10/2026 25:00:00', 'invalid'],
    ['10/7/2026 2:32 PM', 'invalid'],
    ['', 'empty'],
  ])('rejects %s as %s', (text, reason) => {
    expect(parseStatementDate(text)).toEqual({ ok: false, reason });
  });
});
