import { describe, expect, it } from 'vitest';
import { cellText, decodeCsv, decodeStatement, decodeStatementRows } from './decode';
import type { DetectedHeader } from './layouts';

describe('decodeCsv', () => {
  it('reads comma-separated rows with a BOM, CRLF line ends and a trailing newline', () => {
    expect(decodeCsv('﻿a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps delimiters, doubled quotes and line breaks inside quoted fields', () => {
    expect(decodeCsv('x,y\n"3,500,000","he said ""hi""\nthen left"')).toEqual([
      ['x', 'y'],
      ['3,500,000', 'he said "hi"\nthen left'],
    ]);
  });

  it.each([
    ['semicolons', 'a;b;c\n1;2;3', ['1', '2', '3']],
    ['tabs', 'a\tb\tc\n1\t2\t3', ['1', '2', '3']],
    ['commas when all three appear', 'a,b;c\td\n1,2;3\t4', ['1', '2;3\t4']],
  ])('detects %s from the first line', (_label, text, secondRow) => {
    expect(decodeCsv(text)[1]).toEqual(secondRow);
  });

  it('returns no rows for empty text and keeps empty fields', () => {
    expect(decodeCsv('')).toEqual([]);
    expect(decodeCsv('a,,c\n,,\n')).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
    ]);
  });
});

describe('cellText', () => {
  it('trims text, writes numbers plainly and blanks nulls', () => {
    expect(cellText('  ESTA 7K2QX9MP ')).toBe('ESTA 7K2QX9MP');
    expect(cellText(3500000)).toBe('3500000');
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
  });
});

const signedHeader: DetectedHeader = {
  headerRow: 0,
  mapping: { date: 0, description: 3, bankRef: 1, amount: { kind: 'signed', amount: 2 } },
};
const splitHeader: DetectedHeader = {
  headerRow: 0,
  mapping: { date: 0, description: 4, bankRef: 1, amount: { kind: 'split', credit: 3, debit: 2 } },
};

describe('decodeStatementRows with a signed amount column', () => {
  it('reads dot grouping, comma grouping, cents and signs as integer VND', () => {
    const grid = [
      [],
      ['07/10/2026 08:15:00', 'FT26280001', '3.500.000', 'ESTA 7K2QX9MP'],
      ['08/10/2026', 'FT26280002', '-120.000', 'PHI SMS'],
      ['2026-10-09', 'FT26280003', '+1,500,000', 'CHUYEN TIEN'],
      ['10/10/2026', 'FT26280004', '2,750,000.00', 'TIEN PHONG'],
      ['11/10/2026', 'FT26280005', 850000, 'NUMBER CELL'],
    ];
    expect(decodeStatementRows(grid, signedHeader)).toEqual({
      rows: [
        { index: 1, date: '2026-10-07', amount: 3_500_000, description: 'ESTA 7K2QX9MP', bankRef: 'FT26280001' },
        { index: 2, date: '2026-10-08', amount: -120_000, description: 'PHI SMS', bankRef: 'FT26280002' },
        { index: 3, date: '2026-10-09', amount: 1_500_000, description: 'CHUYEN TIEN', bankRef: 'FT26280003' },
        { index: 4, date: '2026-10-10', amount: 2_750_000, description: 'TIEN PHONG', bankRef: 'FT26280004' },
        { index: 5, date: '2026-10-11', amount: 850_000, description: 'NUMBER CELL', bankRef: 'FT26280005' },
      ],
      rejected: [],
    });
  });

  it('reports a fractional amount, a bad date and an unreadable amount by row and keeps going', () => {
    const grid = [
      [],
      ['07/10/2026', 'A', '1.500.000,50', 'half a dong'],
      ['31/09/2026', 'B', '100.000', 'no such day'],
      ['Tổng cộng', '', '5.000.000', ''],
      ['08/10/2026', 'C', 'n/a', 'words'],
      ['09/10/2026', 'D', 1e21, 'exponent'],
      ['10/10/2026', 'E', '200.000', 'fine'],
    ];
    expect(decodeStatementRows(grid, signedHeader)).toEqual({
      rows: [{ index: 6, date: '2026-10-10', amount: 200_000, description: 'fine', bankRef: 'E' }],
      rejected: [
        { index: 1, field: 'amount', reason: 'fractional' },
        { index: 2, field: 'date', reason: 'impossible' },
        { index: 3, field: 'date', reason: 'invalid' },
        { index: 4, field: 'amount', reason: 'invalid' },
        { index: 5, field: 'amount', reason: 'invalid' },
      ],
    });
  });

  it('skips blank rows, trims text and blanks a missing reference column', () => {
    const grid = [[], ['', '', '', ''], ['  07/10/2026 ', ' FT1 ', ' 1.000 ', '  tien  '], [null, null, null, null]];
    expect(decodeStatementRows(grid, signedHeader).rows).toEqual([
      { index: 2, date: '2026-10-07', amount: 1_000, description: 'tien', bankRef: 'FT1' },
    ]);
    const noRef: DetectedHeader = { headerRow: 0, mapping: { ...signedHeader.mapping, bankRef: null } };
    expect(decodeStatementRows(grid, noRef).rows[0]?.bankRef).toBe('');
  });
});

describe('decodeStatementRows with credit and debit columns', () => {
  it('signs by column, reads numbers, and treats a zero in the other column as empty', () => {
    const grid = [
      [],
      ['07/10/2026', 'T1', null, 3500000, 'credit as a number'],
      ['07/10/2026', 'T2', 120000, null, 'debit as a number'],
      ['07/10/2026', 'T3', '-120.000', '0', 'debit written negative'],
      ['07/10/2026', 'T4', '0', '2.000.000', 'zero debit'],
    ];
    expect(decodeStatementRows(grid, splitHeader).rows.map((row) => row.amount)).toEqual([3_500_000, -120_000, -120_000, 2_000_000]);
  });

  it('refuses a row with both a credit and a debit, with neither, or with a fractional cell', () => {
    const grid = [
      [],
      ['07/10/2026', 'T1', '100.000', '200.000', 'both'],
      ['07/10/2026', 'T2', '', '', 'neither'],
      ['07/10/2026', 'T3', null, 1500000.5, 'half'],
      ['07/10/2026', 'T4', 'x', '', 'bad debit'],
    ];
    expect(decodeStatementRows(grid, splitHeader)).toEqual({
      rows: [],
      rejected: [
        { index: 1, field: 'amount', reason: 'credit_and_debit' },
        { index: 2, field: 'amount', reason: 'empty' },
        { index: 3, field: 'amount', reason: 'fractional' },
        { index: 4, field: 'amount', reason: 'invalid' },
      ],
    });
  });
});

describe('decodeStatement', () => {
  it('detects the header and decodes the rows under it', () => {
    const grid = [['Sao kê tài khoản'], ['Ngày', 'Số tiền', 'Nội dung'], ['07/10/2026', '3.500.000', 'ESTA 7K2QX9MP']];
    expect(decodeStatement(grid)).toEqual({
      ok: true,
      value: {
        headerRow: 1,
        mapping: { date: 0, description: 2, bankRef: null, amount: { kind: 'signed', amount: 1 } },
        rows: [{ index: 2, date: '2026-10-07', amount: 3_500_000, description: 'ESTA 7K2QX9MP', bankRef: '' }],
        rejected: [],
      },
    });
  });

  it('refuses a grid without a header', () => {
    expect(decodeStatement([['07/10/2026', '3.500.000', 'ESTA 7K2QX9MP']])).toEqual({ ok: false, reason: 'no_header' });
  });
});
