import 'server-only';
import type { ExportCell, ExportTable } from '@esta/core/export';
import writeXlsxFile, { type CellObject } from 'write-excel-file/node';

const cell = (value: ExportCell, bold: boolean): CellObject => ({
  ...(value.kind === 'text' ? { value: value.value, type: String } : { value: value.value, type: Number, format: '#,##0' }),
  ...(bold ? { fontWeight: 'bold' } : {}),
});

export function toXlsx(table: ExportTable, sheet: string): Promise<Buffer> {
  const header = table.columns.map((column): CellObject => ({ value: column.label, type: String, fontWeight: 'bold' }));
  const rows = table.rows.map((row) => row.cells.map((value) => cell(value, false)));
  const totals = table.totals.cells.map((value) => cell(value, true));
  return writeXlsxFile([header, ...rows, totals], { sheet, stickyRowsCount: 1, columns: table.columns.map((_, index) => ({ width: index === 0 ? 14 : 16 })) }).toBuffer();
}
