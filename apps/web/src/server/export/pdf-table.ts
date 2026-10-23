import 'server-only';
import { formatCell, numericColumns, type ExportRow, type ExportTable } from '@esta/core/export';
import type { Locale } from '@esta/core/format';
import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import type { ColorToken } from '@/design/tokens';
import { openPdf, tone, wrap } from '@/server/receipts/pdf';

export type PdfHeader = { readonly title: string; readonly notes: readonly string[]; readonly locale: Locale };

const POINTS_PER_MM = 72 / 25.4;
const A4_LANDSCAPE = { width: 297 * POINTS_PER_MM, height: 210 * POINTS_PER_MM } as const;
const MARGIN = 36;
const SIZE = 9;
const LEADING = 1.35;
const PAD = 4;
const FIRST_COLUMN_SHARE = 2;

type Pen = { pdf: PDFDocument; page: PDFPage; y: number };

function heading(pen: Pen, value: string, font: PDFFont, size: number, color: ColorToken): void {
  for (const line of wrap(value.normalize('NFC'), font, size, A4_LANDSCAPE.width - 2 * MARGIN)) {
    pen.page.drawText(line, { x: MARGIN, y: pen.y - size, size, font, color: tone(color) });
    pen.y -= size * LEADING;
  }
}

/**
 * FIN-4: the report table the screen shows on A4 landscape pages, with the title and notes first, the column header
 * repeated on every page, amounts and counts right-aligned as the screen sets them, and the totals row last. The fonts are
 * the receipt's static instances, embedded and subset, so the text extracts in NFC as written.
 */
export async function toPdfTable(table: ExportTable, header: PdfHeader): Promise<Uint8Array> {
  const { pdf, regular, bold } = await openPdf(header.title, header.locale);

  const numeric = numericColumns(table);
  const shares = table.columns.map((_, index) => (index === 0 ? FIRST_COLUMN_SHARE : 1));
  const unit = (A4_LANDSCAPE.width - 2 * MARGIN) / shares.reduce((sum, share) => sum + share, 0);
  const columns = shares.map((share, index) => ({
    left: MARGIN + unit * shares.slice(0, index).reduce((sum, before) => sum + before, 0),
    width: unit * share,
    numeric: numeric[index] ?? false,
  }));
  const right = A4_LANDSCAPE.width - MARGIN;

  const pen: Pen = { pdf, page: pdf.addPage([A4_LANDSCAPE.width, A4_LANDSCAPE.height]), y: A4_LANDSCAPE.height - MARGIN };
  const rule = (color: ColorToken, thickness: number) => pen.page.drawLine({ start: { x: MARGIN, y: pen.y }, end: { x: right, y: pen.y }, thickness, color: tone(color) });

  const wrapped = (values: readonly string[], font: PDFFont) => values.map((value, index) => wrap(value, font, SIZE, (columns[index]?.width ?? 0) - 2 * PAD));
  const rowHeight = (cells: readonly string[][]) => Math.max(1, ...cells.map((lines) => lines.length)) * SIZE * LEADING + 2 * PAD;
  const drawRow = (cells: readonly string[][], font: PDFFont, color: ColorToken) => {
    cells.forEach((lines, index) => {
      const column = columns[index];
      if (column === undefined) return;
      lines.forEach((line, k) => {
        const x = column.numeric ? column.left + column.width - PAD - font.widthOfTextAtSize(line, SIZE) : column.left + PAD;
        pen.page.drawText(line, { x, y: pen.y - PAD - SIZE - k * SIZE * LEADING, size: SIZE, font, color: tone(color) });
      });
    });
    pen.y -= rowHeight(cells);
  };

  const columnHeader = wrapped(
    table.columns.map((column) => column.label),
    bold,
  );
  const drawColumnHeader = () => {
    drawRow(columnHeader, bold, 'ink-2');
    rule('ink', 1);
  };
  const row = (line: ExportRow, font: PDFFont) => {
    const cells = wrapped(
      line.cells.map((cell) => formatCell(cell, header.locale)),
      font,
    );
    if (pen.y - rowHeight(cells) < MARGIN) {
      pen.page = pdf.addPage([A4_LANDSCAPE.width, A4_LANDSCAPE.height]);
      pen.y = A4_LANDSCAPE.height - MARGIN;
      drawColumnHeader();
    }
    drawRow(cells, font, 'ink');
  };

  heading(pen, header.title, bold, 14, 'ink');
  for (const note of header.notes) heading(pen, note, regular, SIZE, 'ink-2');
  pen.y -= 8;
  drawColumnHeader();
  for (const line of table.rows) {
    row(line, regular);
    rule('rule-strong', 0.5);
  }
  row(table.totals, bold);
  return pdf.save({ useObjectStreams: true });
}
