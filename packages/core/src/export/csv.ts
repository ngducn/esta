import type { ExportCell, ExportTable } from './table';

const BOM = '\uFEFF';

/** OWASP CSV injection: a spreadsheet reads a cell that starts with one of these as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

const field = (text: string) => {
  const value = FORMULA_START.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
};

/** Only text gets the formula guard: money and counts are numbers, so a negative amount keeps its minus sign. */
const cell = (value: ExportCell) => (value.kind === 'text' ? field(value.value) : String(value.value));

/** RFC 4180 with CRLF lines, behind a UTF-8 byte order mark so Excel opens Vietnamese text as written. */
export function toCsv(table: ExportTable): string {
  const lines = [table.columns.map((column) => field(column.label)), ...[...table.rows, table.totals].map((row) => row.cells.map(cell))];
  return BOM + lines.map((line) => `${line.join(',')}\r\n`).join('');
}
