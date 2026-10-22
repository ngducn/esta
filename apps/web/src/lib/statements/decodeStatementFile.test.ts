import { decodeStatement, decodeStatementCsv, planImport, renderCsv, STATEMENT_LAYOUTS, type ColumnPreset, type StatementRow, type StoredLine } from '@esta/core/matching';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
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

type SheetValue = string | { readonly stored: string };

function storedXlsx(rows: readonly (readonly SheetValue[])[]): Uint8Array<ArrayBuffer> {
  const cell = (value: SheetValue, column: number, row: number) => {
    const at = `${String.fromCodePoint(65 + column)}${row + 1}`;
    return typeof value === 'string' ? `<c r="${at}" t="inlineStr"><is><t>${value}</t></is></c>` : `<c r="${at}"><v>${value.stored}</v></c>`;
  };
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const relationships = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const parts = {
    'xl/workbook.xml': `<workbook xmlns="${main}" xmlns:r="${relationships}"><sheets><sheet name="Sao kê" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationships}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${main}"><sheetData>${rows.map((row, r) => `<row>${row.map((value, c) => cell(value, c, r)).join('')}</row>`).join('')}</sheetData></worksheet>`,
  };
  const entries: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const [path, text] of Object.entries(parts)) {
    const name = Buffer.from(path);
    const data = Buffer.from(text);
    const header = (fields: Buffer, signature: number, at: number) => {
      fields.writeUInt32LE(signature, 0);
      fields.writeUInt32LE(crc32(data), at);
      fields.writeUInt32LE(data.length, at + 4);
      fields.writeUInt32LE(data.length, at + 8);
      fields.writeUInt16LE(name.length, at + 12);
      return fields;
    };
    const local = header(Buffer.alloc(30), 0x04034b50, 14);
    const central = header(Buffer.alloc(46), 0x02014b50, 16);
    central.writeUInt32LE(offset, 42);
    entries.push(local, name, data);
    directory.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const listing = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(directory.length / 2, 8);
  end.writeUInt16LE(directory.length / 2, 10);
  end.writeUInt32LE(listing.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...entries, listing, end]));
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

  const transfers: (readonly SheetValue[])[] = [
    ['Ngày GD', 'Số tham chiếu', 'Số tiền', 'Diễn giải'],
    ['05/10/2026', { stored: '20261005123456789012' }, { stored: '3500000' }, 'ESTA 7K2QX9MP'],
    ['06/10/2026', { stored: '20261006123456789034' }, { stored: '2800000' }, 'CK TIEN PHONG DEMO'],
  ];

  it('keeps every digit of a long reference stored as a number', async () => {
    const decoded = (await read(storedXlsx(transfers), 'sao-ke.xlsx')).decode();
    expect(decoded.ok && decoded.value.rows.map((row) => [row.bankRef, row.amount])).toEqual([
      ['20261005123456789012', 3_500_000],
      ['20261006123456789034', 2_800_000],
    ]);
  });

  it('plans the lines of one statement once when its workbook and then its CSV are imported', async () => {
    const rowsOf = async (bytes: Uint8Array<ArrayBuffer>, name: string): Promise<StatementRow[]> => {
      const decoded = (await read(bytes, name)).decode();
      return decoded.ok ? decoded.value.rows : [];
    };
    const sheetRows = await rowsOf(storedXlsx(transfers), 'sao-ke.xlsx');
    const csvRows = await rowsOf(bytesOf(renderCsv(transfers.map((row) => row.map((cell) => (typeof cell === 'string' ? cell : cell.stored))))), 'sao-ke.csv');
    const stored: StoredLine[] = planImport(sheetRows, [], []).rows.map(({ row: { date, amount, bankRef, description }, fingerprint }) => ({
      date,
      amount,
      bankRef,
      description,
      fingerprint,
      importId: 'import-xlsx',
      sameAccount: true,
    }));
    expect(stored).toHaveLength(2);
    expect(planImport(csvRows, [], stored)).toEqual({ rows: [], known: ['import-xlsx', 'import-xlsx'] });
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
