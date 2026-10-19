import { parseCsv } from '@esta/core/parse/csv';
import type { Result } from '@esta/core/result';
import readXlsxFile from 'read-excel-file/node';
import type { ReadFile } from './files';

/**
 * A cell as the sheet stored it. `text` is what it holds: a number exactly as written in the file, never rounded
 * through a float; a date as `YYYY-MM-DD`, with the time after a `T` when it has one; a CSV cell always as text.
 * What a text cell means, such as "9tr" or "15/3/2026", is for `parse_money` and `parse_date` to say.
 */
export type Cell = { readonly type: 'text' | 'number' | 'date' | 'boolean'; readonly text: string } | null;
export type Sheet = { readonly name: string; readonly rows: readonly (readonly Cell[])[]; readonly truncated: boolean };

/** Enough for a portfolio tracker; a sheet past it comes back cut, and says so. */
export const MAX_CELLS = 20_000;
export const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;

const ZIP = [0x50, 0x4b, 0x03, 0x04];

type StoredNumber = { readonly stored: string };

const isStoredNumber = (value: unknown): value is StoredNumber => typeof value === 'object' && value !== null && 'stored' in value && typeof value.stored === 'string';

/** read-excel-file hands back a string, a boolean, a `Date` for a date-formatted number, or what `parseNumber` made. */
function cell(value: unknown): Cell {
  if (typeof value === 'string') return value === '' ? null : { type: 'text', text: value };
  if (typeof value === 'boolean') return { type: 'boolean', text: String(value) };
  if (value instanceof Date) {
    const iso = value.toISOString();
    return { type: 'date', text: iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 19) };
  }
  return isStoredNumber(value) ? { type: 'number', text: value.stored } : null;
}

function capped(name: string, rows: readonly (readonly Cell[])[]): Sheet {
  const kept: (readonly Cell[])[] = [];
  let cells = 0;
  for (const row of rows) {
    if (cells + row.length > MAX_CELLS) return { name, rows: kept, truncated: true };
    cells += row.length;
    kept.push(row);
  }
  return { name, rows: kept, truncated: false };
}

/** Every sheet of an xlsx workbook, or the one sheet of a CSV file, row by row. */
export async function readSpreadsheet(file: ReadFile): Promise<Result<readonly Sheet[], 'unsupported_type'>> {
  if (ZIP.every((byte, index) => file.bytes[index] === byte)) {
    const sheets = await readXlsxFile<StoredNumber>(file.bytes, { parseNumber: (stored) => ({ stored }) }).catch(() => null);
    if (sheets === null) return { ok: false, reason: 'unsupported_type' };
    return { ok: true, value: sheets.map((sheet) => capped(sheet.sheet, sheet.data.map((row) => row.map(cell)))) };
  }
  if (!file.name.toLowerCase().endsWith('.csv')) return { ok: false, reason: 'unsupported_type' };
  const rows = parseCsv(new TextDecoder('utf-8').decode(file.bytes)).map((row) => row.map(cell));
  return { ok: true, value: [capped(file.name, rows)] };
}
