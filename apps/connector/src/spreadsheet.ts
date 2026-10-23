import { parseCsv, type CsvReason } from '@esta/core/parse/csv';
import { SHEET_READ_OPTIONS, sheetCell, type SheetCell } from '@esta/core/parse/sheet';
import type { Result } from '@esta/core/result';
import readXlsxFile from 'read-excel-file/node';
import type { ReadFile } from './files';

export type Sheet = { readonly name: string; readonly rows: readonly (readonly SheetCell[])[]; readonly truncated: boolean };

/** Enough for a portfolio tracker; a sheet past it comes back cut, and says so. */
export const MAX_CELLS = 20_000;
export const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;

const ZIP = [0x50, 0x4b, 0x03, 0x04];

function capped(name: string, rows: readonly (readonly SheetCell[])[]): Sheet {
  const kept: (readonly SheetCell[])[] = [];
  let cells = 0;
  for (const row of rows) {
    if (cells + row.length > MAX_CELLS) return { name, rows: kept, truncated: true };
    cells += row.length;
    kept.push(row);
  }
  return { name, rows: kept, truncated: false };
}

export async function readSpreadsheet(file: ReadFile): Promise<Result<readonly Sheet[], 'unsupported_type' | CsvReason>> {
  if (ZIP.every((byte, index) => file.bytes[index] === byte)) {
    const sheets = await readXlsxFile(file.bytes, SHEET_READ_OPTIONS).catch(() => null);
    if (sheets === null) return { ok: false, reason: 'unsupported_type' };
    return { ok: true, value: sheets.map((sheet) => capped(sheet.sheet, sheet.data.map((row) => row.map(sheetCell)))) };
  }
  if (!file.name.toLowerCase().endsWith('.csv')) return { ok: false, reason: 'unsupported_type' };
  const rows: (readonly SheetCell[])[] = [];
  for (const record of parseCsv(new TextDecoder('utf-8').decode(file.bytes), { spanLines: true })) {
    if (!record.ok) return record;
    rows.push(record.value.map(sheetCell));
  }
  return { ok: true, value: [capped(file.name, rows)] };
}
