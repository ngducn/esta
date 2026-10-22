/**
 * A cell as the file stored it. `text` is what it holds: a number exactly as written in the file, never rounded
 * through a float; a date as `YYYY-MM-DD`, with the time after a `T` when it has one; a CSV cell always as text.
 * What a text cell means, such as "9tr" or "15/3/2026", is for the parsers beside this one to say.
 */
export type SheetCell = { readonly type: 'text' | 'number' | 'date' | 'boolean'; readonly text: string } | null;

type StoredNumber = { readonly stored: string };

/**
 * The options every read-excel-file reader passes, the browser's and Node's alike. Without `parseNumber` a 20-digit
 * reference such as `20261005123456789012` comes back as the float `20261005123456790000`.
 */
export const SHEET_READ_OPTIONS = { parseNumber: (stored: string): StoredNumber => ({ stored }) };

const isStoredNumber = (value: unknown): value is StoredNumber => typeof value === 'object' && value !== null && 'stored' in value && typeof value.stored === 'string';

/** read-excel-file hands back a string, a boolean, a `Date` for a date-formatted number, or what `parseNumber` made; a CSV reader a string. */
export function sheetCell(value: unknown): SheetCell {
  if (typeof value === 'string') return value === '' ? null : { type: 'text', text: value };
  if (typeof value === 'boolean') return { type: 'boolean', text: String(value) };
  if (value instanceof Date) {
    const iso = value.toISOString();
    return { type: 'date', text: iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 19) };
  }
  return isStoredNumber(value) ? { type: 'number', text: value.stored } : null;
}
