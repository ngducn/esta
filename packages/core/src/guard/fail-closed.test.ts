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
