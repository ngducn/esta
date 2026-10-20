import { decodeStatement, decodeStatementCsv, renderCsv, STATEMENT_LAYOUTS, type ColumnPreset } from '@esta/core/matching';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import { scenarioGrid, UNRECOGNIZED_COLUMNS, unrecognizedGrid } from '../../../../../packages/core/src/matching/statement-scenario';
import { decodeStatementFile, fileColumns, firstPicks, headerCells, holdsLines, MAX_STATEMENT_BYTES, pickedHeader, picksOf, type StatementFile } from './decodeStatementFile';

const FIXTURES = join(import.meta.dirname, '..', '..', '..', '..', '..', 'fixtures', 'statements');
const bytesOf = (text: string) => new TextEncoder().encode(text);
const BOM = String.fromCodePoint(0xfeff);

async function xlsx(grid: readonly (readonly (string | number | null | Date)[])[]): Promise<Uint8Array<ArrayBuffer>> {
  const data = grid.map((row) =>
    row.map((cell) => (cell === null ? null : cell instanceof Date ? { value: cell, type: Date, format: 'dd/mm/yyyy' } : { value: cell })),
  );
  const buffer = await writeXlsxFile(data, {}).toBuffer();
  return new Uint8Array(buffer);
}

async function read(bytes: Uint8Array<ArrayBuffer>, name: string): Promise<StatementFile> {
  const file = await decodeStatementFile(bytes, name);
  if (!file.ok) throw new Error(file.reason);
  return file.value;
}

describe('decodeStatementFile', () => {
  it.each(['layout-a.csv', 'layout-c.csv'])('reads %s as decodeStatementCsv does, with its header cells', async (name) => {
    const text = readFileSync(join(FIXTURES, name), 'utf8');
    const file = await read(bytesOf(text), name);
    expect(file.decode()).toEqual(decodeStatementCsv(text));
    expect(headerCells(file.grid, 0)).toEqual(text.split('\r\n')[0]?.split(','));
    expect(fileColumns(file, undefined)).toEqual({ kind: 'detected', header: { headerRow: 0, mapping: expect.any(Object) } });
  });

  it('reads an XLSX sheet in the browser build exactly as decodeStatement reads its grid, fractional row refused', async () => {
    const grid = scenarioGrid(STATEMENT_LAYOUTS.b);
    const file = await read(await xlsx(grid), 'sao-ke.xlsx');
    const decoded = file.decode();
    expect(decoded).toEqual(decodeStatement(grid));
    expect(headerCells(file.grid, 0)).toEqual(STATEMENT_LAYOUTS.b.columns.map((column) => column.header));
    expect(decoded.ok && decoded.value.rejected).toEqual([{ index: 15, field: 'amount', reason: 'fractional' }]);
  });

  it('reads a date cell as its calendar day', async () => {
    const sheet = await xlsx([
      ['Ngày GD', 'Ghi có', 'Ghi nợ', 'Diễn giải'],
      [new Date(Date.UTC(2026, 9, 2)), 3_500_000, null, 'ESTA 7K2QX9MP'],
    ]);
    const decoded = (await read(sheet, 'sao-ke.xlsx')).decode();
    expect(decoded.ok && decoded.value.rows).toEqual([{ index: 1, date: '2026-10-02', amount: 3_500_000, description: 'ESTA 7K2QX9MP', bankRef: '' }]);
  });

  it('strips a byte order mark from a CSV export', async () => {
    const text = renderCsv([
      ['Ngày giao dịch', 'Số tiền', 'Nội dung'],
      ['02/10/2026', '3.500.000', 'ESTA 7K2QX9MP'],
    ]);
    const decoded = (await read(bytesOf(`${BOM}${text}`), 'SAO-KE.CSV')).decode();
    expect(decoded.ok && decoded.value.rows.map((row) => row.amount)).toEqual([3_500_000]);
  });

  it('refuses a file it cannot read, with the reason, and leaves a header it does not know to be mapped', async () => {
    const notes = await read(bytesOf('Hello,World\r\n1,2\r\n'), 'notes.csv');
    expect(notes.decode()).toEqual({ ok: false, reason: 'no_header' });
    expect(fileColumns(notes, undefined)).toEqual({ kind: 'unknown', mismatch: false });
    expect(holdsLines(notes.grid)).toBe(true);
    expect(holdsLines((await read(bytesOf('Ngày,Nội dung,Số tiền\r\n\r\n'), 'empty.csv')).grid)).toBe(false);
    expect(await decodeStatementFile(bytesOf('%PDF-1.7'), 'sao-ke.pdf')).toEqual({ ok: false, reason: 'unsupported' });
    expect(await decodeStatementFile(new Uint8Array([0x4e, 0x67, 0xe0, 0x79, 0x0a]), 'sao-ke.csv')).toEqual({ ok: false, reason: 'unreadable' });
    expect(await decodeStatementFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0]), 'sao-ke.xlsx')).toEqual({ ok: false, reason: 'unreadable' });
    expect(await decodeStatementFile(new Uint8Array(MAX_STATEMENT_BYTES + 1), 'sao-ke.csv')).toEqual({ ok: false, reason: 'too_large' });
  });
});

describe('a bank Esta does not recognize (P3-21)', () => {
  const grid = unrecognizedGrid();
  const text = renderCsv(grid);
  const preset: ColumnPreset = { ...UNRECOGNIZED_COLUMNS, header: headerCells(grid, UNRECOGNIZED_COLUMNS.headerRow) };

  it('opens the mapping on the header row under the account lines, with nothing it cannot name picked', async () => {
    const file = await read(bytesOf(text), 'sao-ke-demo.csv');
    expect(fileColumns(file, undefined)).toEqual({ kind: 'unknown', mismatch: false });
    const picks = firstPicks(file.grid, undefined);
    expect(picks).toEqual({ headerRow: 4, date: null, description: null, bankRef: null, split: false, amount: null, credit: null, debit: null });
    expect(pickedHeader(file.grid, picks)).toEqual({ ok: false, reason: 'incomplete' });
  });

  it('reads the CSV and the workbook alike under the columns picked, with core’s decoder', async () => {
    const csv = await read(bytesOf(text), 'sao-ke-demo.csv');
    const sheet = await read(await xlsx(grid), 'sao-ke-demo.xlsx');
    const picked = pickedHeader(csv.grid, picksOf(UNRECOGNIZED_COLUMNS));
    if (!picked.ok) throw new Error(picked.reason);
    expect(csv.decode(picked.value)).toEqual(decodeStatementCsv(text, UNRECOGNIZED_COLUMNS));
    const fromCsv = csv.decode(picked.value);
    const fromSheet = sheet.decode(picked.value);
    expect(fromSheet.ok && fromSheet.value.rows).toEqual(fromCsv.ok && fromCsv.value.rows);
  });

  it('reads the next file from the account under its saved columns, and maps again once a label changes', async () => {
    const file = await read(bytesOf(text), 'sao-ke-demo.csv');
    expect(fileColumns(file, preset)).toEqual({ kind: 'preset', header: UNRECOGNIZED_COLUMNS });
    const renamed = await read(bytesOf(text.replace('Tiền gửi vào', 'Số tiền gửi vào')), 'sao-ke-demo.csv');
    expect(fileColumns(renamed, preset)).toEqual({ kind: 'unknown', mismatch: true });
    expect(firstPicks(renamed.grid, preset)).toEqual({ headerRow: 4, date: 0, description: 2, bankRef: 1, split: true, amount: null, credit: null, debit: 4 });
  });

  it('refuses picks that name one column twice', () => {
    expect(pickedHeader(grid, { ...picksOf(UNRECOGNIZED_COLUMNS), debit: 3 })).toEqual({ ok: false, reason: 'same_column' });
  });
});
