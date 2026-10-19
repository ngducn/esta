import { describe, expect, it } from 'vitest';
import { cellText, decodeStatement, decodeStatementCsv, decodeStatementRows } from './decode';
import type { DetectedHeader } from './layouts';
import { matchRows } from './match';
import { SCENARIO_INVOICES } from './statement-scenario';

describe('decodeStatementCsv', () => {
  const header = 'Date,Reference,Amount,Description\r\n';
  const r2 = { index: 2, date: '2026-10-06', amount: 3_500_000, description: 'ESTA 7K2QX9MP NGUYEN THI HUONG', bankRef: 'R2' };
  const r3 = { index: 3, date: '2026-10-07', amount: -50_000, description: 'PHI', bankRef: 'R3' };

  it('refuses a row with a stray quote and keeps every row after it', () => {
    const text = `${header}2026-10-05,R1,100000,CK "PHONG 5\r\n2026-10-06,R2,3500000,ESTA 7K2QX9MP NGUYEN THI HUONG\r\n2026-10-07,R3,-50000,PHI\r\n`;
    expect(decodeStatementCsv(text)).toMatchObject({ ok: true, value: { rows: [r2, r3], rejected: [{ index: 1, field: 'row', reason: 'stray_quote' }] } });
  });

  it('refuses a row whose quote never closes and keeps every row after it', () => {
    const text = `${header}2026-10-05,R1,100000,"CK PHONG 5\r\n2026-10-06,R2,3500000,ESTA 7K2QX9MP NGUYEN THI HUONG\r\n2026-10-07,R3,-50000,PHI\r\n`;
    expect(decodeStatementCsv(text)).toMatchObject({
      ok: true,
      value: { rows: [r2, r3], rejected: [{ index: 1, field: 'row', reason: 'unterminated_quote' }] },
    });
  });

  it('refuses a row with more or fewer cells than the header, so an unquoted 1,500,000 is never read as 1', () => {
    const text = 'Date,Description,Amount\r\n2026-10-05,ESTA 7K2QX9MP,1,500,000\r\n2026-10-06,SHORT\r\n2026-10-07,QUOTED,"1,500,000"\r\n';
    expect(decodeStatementCsv(text)).toEqual({
      ok: true,
      value: {
        headerRow: 0,
        mapping: { date: 0, description: 1, bankRef: null, amount: { kind: 'signed', amount: 2 } },
        rows: [{ index: 3, date: '2026-10-07', amount: 1_500_000, description: 'QUOTED', bankRef: '' }],
        rejected: [
          { index: 1, field: 'row', reason: 'cell_count' },
          { index: 2, field: 'row', reason: 'cell_count' },
        ],
      },
    });
  });

  it('reads account lines of any width above the header, skips blank lines and lists every refusal in file order', () => {
    const text = `Sao kê tài khoản\r\nSố tài khoản: 0123\r\n${header}\r\n2026-10-05,R1,"1.500.000,50",HALF\r\n,,,\r\n2026-10-06,R2,10,"X"Y\r\n2026-10-07,R3,20,FINE\r\n`;
    expect(decodeStatementCsv(text)).toMatchObject({
      ok: true,
      value: {
        headerRow: 2,
        rows: [{ index: 7, amount: 20, bankRef: 'R3' }],
        rejected: [
          { index: 4, field: 'amount', reason: 'fractional' },
          { index: 6, field: 'row', reason: 'stray_quote' },
        ],
      },
    });
  });

  it('refuses text without a header', () => {
    expect(decodeStatementCsv('07/10/2026,3.500.000,ESTA 7K2QX9MP\r\n')).toEqual({ ok: false, reason: 'no_header' });
  });
});

describe('a statement whose quote does not close on its line', () => {
  function decodedAndMatched(lines: readonly string[]) {
    const decoded = decodeStatementCsv(lines.map((line) => `${line}\r\n`).join(''));
    if (!decoded.ok) throw new Error(decoded.reason);
    return {
      matched: matchRows(decoded.value.rows, SCENARIO_INVOICES).map(({ row, match }) => [row.index, row.bankRef, row.amount, match]),
      rejected: decoded.value.rejected,
    };
  }
  const memo = (invoiceId: string, memoCode: string) => ({ status: 'memo_match', invoiceId, memoCode });

  it('refuses only the opening line when a later row opens a quoted field (C4)', () => {
    expect(
      decodedAndMatched([
        'Date,Reference,Amount,Description',
        '2026-10-05,R1,100000,"CK PHONG 5',
        '2026-10-06,R2,3500000,ESTA 7K2QX9MP',
        '2026-10-07,R3,4200000,"ESTA Q4N8R2TV"',
        '2026-10-08,R4,2800000,ESTA B7C3D9EF',
      ]),
    ).toEqual({
      matched: [
        [2, 'R2', 3_500_000, memo('inv-dian-p3-202610', '7K2QX9MP')],
        [3, 'R3', 4_200_000, memo('inv-dian-p5-202610', 'Q4N8R2TV')],
        [4, 'R4', 2_800_000, memo('inv-dian-p7-202610', 'B7C3D9EF')],
      ],
      rejected: [{ index: 1, field: 'row', reason: 'unterminated_quote' }],
    });
  });

  it('loses no row of an all-quoted export with an unescaped trailing quote (C4d)', () => {
    expect(
      decodedAndMatched([
        '"Date","Reference","Amount","Description"',
        '"2026-10-05","R1","-5000000","TIVI 32""',
        '"2026-10-06","R2","3500000","ESTA 7K2QX9MP"',
        '"2026-10-07","R3","4200000","ESTA Q4N8R2TV"',
      ]),
    ).toEqual({
      matched: [
        [2, 'R2', 3_500_000, memo('inv-dian-p3-202610', '7K2QX9MP')],
        [3, 'R3', 4_200_000, memo('inv-dian-p5-202610', 'Q4N8R2TV')],
      ],
      rejected: [{ index: 1, field: 'row', reason: 'unterminated_quote' }],
    });
  });

  it('never joins the opening line to a later field that ends in a quote, so its amount takes no memo code from the next row (C4e)', () => {
    expect(
      decodedAndMatched([
        'Date,Reference,Amount,Description',
        '2026-10-05,R1,100000,"CK PHONG 5',
        '2026-10-06,R2,3500000,ESTA 7K2QX9MP',
        '2026-10-07,R3,-50000,PHI TIVI 32"',
        '2026-10-08,R4,2800000,ESTA B7C3D9EF',
      ]),
    ).toEqual({
      matched: [
        [2, 'R2', 3_500_000, memo('inv-dian-p3-202610', '7K2QX9MP')],
        [4, 'R4', 2_800_000, memo('inv-dian-p7-202610', 'B7C3D9EF')],
      ],
      rejected: [
        { index: 1, field: 'row', reason: 'unterminated_quote' },
        { index: 3, field: 'row', reason: 'stray_quote' },
      ],
    });
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
