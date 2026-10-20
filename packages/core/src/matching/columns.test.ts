import { describe, expect, it } from 'vitest';
import { chosenHeader, guessColumns, guessHeaderRow, presetHeader, type ColumnPreset } from './columns';
import { decodeStatement, decodeStatementCsv } from './decode';
import { identifyRows } from './fingerprint';
import { STATEMENT_LAYOUTS, type DetectedHeader, type StatementGrid } from './layouts';
import { renderCsv } from './render';
import { scenarioGrid, UNRECOGNIZED_COLUMNS, UNRECOGNIZED_LAYOUT, UNRECOGNIZED_PREAMBLE, unrecognizedGrid } from './statement-scenario';

const grid = unrecognizedGrid();
const header = (grid[UNRECOGNIZED_COLUMNS.headerRow] ?? []).map(String);
const preset: ColumnPreset = { ...UNRECOGNIZED_COLUMNS, header };
const signed = (headerRow: number, date: number, description: number, amount: number, bankRef: number | null = null): DetectedHeader => ({
  headerRow,
  mapping: { date, description, bankRef, amount: { kind: 'signed', amount } },
});

describe('chosenHeader', () => {
  it('takes the columns a person picked under the account lines, credit and debit apart', () => {
    expect(chosenHeader(grid, UNRECOGNIZED_COLUMNS)).toEqual({ ok: true, value: UNRECOGNIZED_COLUMNS });
  });

  it('refuses one column for two roles, credit and debit included', () => {
    expect(chosenHeader(grid, signed(4, 0, 2, 2))).toEqual({ ok: false, reason: 'same_column' });
    expect(chosenHeader(grid, signed(4, 0, 2, 3, 0))).toEqual({ ok: false, reason: 'same_column' });
    expect(chosenHeader(grid, { headerRow: 4, mapping: { date: 0, description: 2, bankRef: null, amount: { kind: 'split', credit: 3, debit: 3 } } })).toEqual({
      ok: false,
      reason: 'same_column',
    });
  });

  it('refuses a column the header row does not have, and a header row below the first twenty', () => {
    expect(chosenHeader(grid, signed(4, 0, 2, 6))).toEqual({ ok: false, reason: 'no_column' });
    expect(chosenHeader(grid, signed(0, 0, 1, 2))).toEqual({ ok: false, reason: 'no_column' });
    expect(chosenHeader(grid, signed(4, -1, 2, 3))).toEqual({ ok: false, reason: 'no_column' });
    const long: StatementGrid = [...Array.from({ length: 20 }, () => ['NGÂN HÀNG DEMO']), ['Ngày', 'Nội dung', 'Số tiền']];
    expect(chosenHeader(long, signed(20, 0, 1, 2))).toEqual({ ok: false, reason: 'no_column' });
  });
});

describe('decoding under chosen columns', () => {
  const known = decodeStatement(scenarioGrid(STATEMENT_LAYOUTS.b));

  it('reads the unrecognized sheet with core’s one decoder: the same lines and fingerprints as a known layout, the half đồng refused', () => {
    const decoded = decodeStatement(grid, UNRECOGNIZED_COLUMNS);
    if (!decoded.ok || !known.ok) throw new Error('did not decode');
    expect(decoded.value.headerRow).toBe(4);
    expect(decoded.value.rows.map(({ index, ...row }) => ({ ...row, index: index - 4 }))).toEqual(known.value.rows);
    expect(identifyRows(decoded.value.rows)).toEqual(identifyRows(known.value.rows));
    expect(decoded.value.rejected).toEqual([{ index: 19, field: 'amount', reason: 'fractional' }]);
  });

  it('reads the same file as CSV the same way, with the CSV record checks under the chosen header', () => {
    const sheet = decodeStatement(grid, UNRECOGNIZED_COLUMNS);
    expect(decodeStatementCsv(renderCsv(grid), UNRECOGNIZED_COLUMNS)).toEqual(sheet);
    const text = `${renderCsv(grid)}03/10/2026,FT9,"CK, PHONG 5",1,500,000,,\r\n`;
    const decoded = decodeStatementCsv(text, UNRECOGNIZED_COLUMNS);
    expect(decoded.ok && decoded.value.rejected.at(-1)).toEqual({ index: 20, field: 'row', reason: 'cell_count' });
  });

  it('lists every line a wrong mapping cannot read, so picking the description as the amount reads no line', () => {
    const decoded = decodeStatement(grid, signed(4, 0, 3, 2));
    expect(decoded.ok && decoded.value.rows).toEqual([]);
    expect(decoded.ok && decoded.value.rejected.map((row) => `${row.field}:${row.reason}`)).toEqual(Array.from({ length: 15 }, () => 'amount:invalid'));
  });

  it('reads dates as DOMAIN-VN writes them under any label, and refuses another form', () => {
    const sheet: StatementGrid = [
      ['Thời điểm', 'Chi tiết', 'Phát sinh'],
      ['02/10/2026 08:15:00', 'ESTA 7K2QX9MP', '+3.500.000'],
      ['2026-10-03', 'PHI SMS', '-11.000'],
      ['10/3/2026', 'ESTA Q4N8R2TV', '4.200.000'],
    ];
    const decoded = decodeStatement(sheet, signed(0, 0, 1, 2));
    expect(decoded.ok && decoded.value.rows.map((row) => [row.date, row.amount])).toEqual([
      ['2026-10-02', 3_500_000],
      ['2026-10-03', -11_000],
    ]);
    expect(decoded.ok && decoded.value.rejected).toEqual([{ index: 3, field: 'date', reason: 'invalid' }]);
  });
});

describe('presetHeader', () => {
  it('finds the saved columns again by their labels, wherever the account lines leave the header', () => {
    expect(presetHeader(grid, preset)).toEqual(UNRECOGNIZED_COLUMNS);
    const shifted = [['NGÂN HÀNG TMCP DEMO'], ...grid.slice(UNRECOGNIZED_PREAMBLE.length)];
    expect(presetHeader(shifted, preset)).toEqual({ ...UNRECOGNIZED_COLUMNS, headerRow: 1 });
  });

  it('matches labels as foldHeader reads them, so case, marks, spacing and a trailing currency do not matter', () => {
    const relabelled = grid.map((row, index) => (index === 4 ? ['NGAY THUC HIEN', ' Số chứng từ ', 'diễn giải  chi tiết', 'Tiền gửi vào (VND)', 'Tiền rút ra', 'Số dư'] : row));
    expect(presetHeader(relabelled, preset)).toEqual(UNRECOGNIZED_COLUMNS);
  });

  it('finds nothing when the bank renamed or moved a column the preset reads, or in a known layout', () => {
    const renamed = grid.map((row, index) => (index === 4 ? ['Ngày thực hiện', 'Số chứng từ', 'Diễn giải chi tiết', 'Số tiền gửi vào', 'Tiền rút ra', 'Số dư'] : row));
    const moved = grid.map((row) => [row[2] ?? null, row[1] ?? null, row[0] ?? null, ...row.slice(3)]);
    expect(presetHeader(renamed, preset)).toBeUndefined();
    expect(presetHeader(moved, preset)).toBeUndefined();
    expect(presetHeader(scenarioGrid(STATEMENT_LAYOUTS.b), preset)).toBeUndefined();
  });

  it('ignores a column the preset did not read, and a preset whose role labels are all blank', () => {
    const balance = grid.map((row, index) => (index === 4 ? [...row.slice(0, 5), 'Số dư khả dụng'] : row));
    expect(presetHeader(balance, preset)).toEqual(UNRECOGNIZED_COLUMNS);
    expect(presetHeader([['', '', '', '', '']], { ...UNRECOGNIZED_COLUMNS, headerRow: 0, header: ['', '', '', '', ''] })).toBeUndefined();
  });
});

describe('guessHeaderRow and guessColumns', () => {
  it('guesses the first row with the most filled cells, under the account lines', () => {
    expect(guessHeaderRow(grid)).toBe(4);
    expect(guessHeaderRow(scenarioGrid(STATEMENT_LAYOUTS.a))).toBe(0);
    expect(guessHeaderRow([])).toBe(0);
  });

  it('prefills the roles whose labels Esta knows, and nothing for labels it does not', () => {
    expect(guessColumns(['STT', 'Ngày GD', 'Chi tiết', 'Phát sinh có', 'Phát sinh nợ'])).toEqual({ date: 1, credit: 3, debit: 4 });
    expect(guessColumns(header)).toEqual({});
  });

  it('prefills the rest from the labels a preset used, wherever the bank moved them', () => {
    expect(guessColumns(header, preset)).toEqual({ date: 0, bankRef: 1, description: 2, credit: 3, debit: 4 });
    const renamed = ['Số chứng từ', 'Ngày thực hiện', 'Diễn giải chi tiết', 'Số tiền gửi vào', 'Tiền rút ra'];
    expect(guessColumns(renamed, preset)).toEqual({ date: 1, bankRef: 0, description: 2, debit: 4 });
  });

  it('lets a label Esta knows win over the preset', () => {
    expect(guessColumns(['Ngày GD', 'Ngày thực hiện', 'Diễn giải chi tiết'], preset)).toEqual({ date: 0, description: 2 });
  });
});

describe('the unrecognized layout', () => {
  it('is no layout Esta recognizes', () => {
    expect(decodeStatement(grid)).toEqual({ ok: false, reason: 'no_header' });
    expect(UNRECOGNIZED_LAYOUT.columns.map((column) => column.header)).toEqual(header);
  });
});
