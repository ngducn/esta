import type { ExportCell, ExportTable } from './table';

const BOM = '\uFEFF';

const field = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

const cell = (value: ExportCell) => (value.kind === 'text' ? field(value.value) : String(value.value));

/** RFC 4180 with CRLF lines, behind a UTF-8 byte order mark so Excel opens Vietnamese text as written. */
export function toCsv(table: ExportTable): string {
  const lines = [table.columns.map((column) => field(column.label)), ...[...table.rows, table.totals].map((row) => row.cells.map(cell))];
  return BOM + lines.map((line) => `${line.join(',')}\r\n`).join('');
}
