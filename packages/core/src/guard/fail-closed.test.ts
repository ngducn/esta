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
