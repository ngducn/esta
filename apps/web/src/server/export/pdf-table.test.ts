import { countCell, textCell, vndCell, type ExportTable } from '@esta/core/export';
import { vnd } from '@esta/core/money';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { pdfText } from '../../../../../scripts/receipt-text';
import { toPdfTable } from './pdf-table';

vi.mock('server-only', () => ({}));

const owners = Array.from({ length: 60 }, (_, index) => `Chủ sở hữu Demo ${String(index + 1).padStart(2, '0')}`);

/** The owner summary's shape, the first owner typed decomposed as some phone keyboards send it. */
const table: ExportTable = {
  columns: [
    { id: 'owner', label: 'Chủ sở hữu' },
    { id: 'revenue', label: 'Doanh thu cho thuê dự kiến cả năm' },
    { id: 'days', label: 'Số ngày trống' },
  ],
  rows: [
    { key: 'me', cells: [textCell('Nguyễn Thị Demo'.normalize('NFD')), vndCell(vnd(452_500_000)), countCell(70)] },
    ...owners.map((name, index) => ({ key: name, cells: [textCell(name), vndCell(vnd(1_000_000 * (index + 1))), countCell(index)] })),
  ],
  totals: { key: 'total', cells: [textCell('Tổng cộng'), vndCell(vnd(452_500_000 + 1_830_000_000)), countCell(70 + 1_770)] },
};

describe('toPdfTable (FIN-4)', () => {
  it('prints the title, the rows in NFC and the totals on A4 landscape, the column header on every page and the totals once, last', async () => {
    const bytes = await toPdfTable(table, { title: 'Tổng kết năm 2026 theo chủ sở hữu', notes: ['Ước tính, không phải tư vấn thuế'], locale: 'vi' });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(pdf.getPages().map((page) => page.getSize())).toEqual(pdf.getPages().map(() => ({ width: 841.89, height: 595.28 })));

    const pages = (await pdfText(bytes)).replaceAll('\u00a0', ' ').split('\n\n');
    expect(pages).toHaveLength(pdf.getPageCount());
    expect(pages[0]).toContain('Tổng kết năm 2026 theo chủ sở hữu');
    expect(pages[0]).toContain('Ước tính, không phải tư vấn thuế');
    expect(pages[0]).toContain('Nguyễn Thị Demo');
    expect(pages[0]).toContain('452.500.000 ₫');
    for (const page of pages) expect(page.split('\n')).toContain('Chủ sở hữu');
    expect(pages.filter((page) => page.includes('Tổng cộng'))).toEqual([pages.at(-1)]);
    expect(pages.at(-1)?.split('\n').slice(-3)).toEqual(['Tổng cộng', '2.282.500.000 ₫', '1.840']);
    expect(pages.join('\n')).toContain('Chủ sở hữu Demo 60');
  });
});
