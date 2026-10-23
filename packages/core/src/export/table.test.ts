import { describe, expect, it } from 'vitest';
import { vnd } from '../money/vnd';
import { countCell, formatCell, numericColumns, textCell, vndCell, type ExportTable } from './table';

describe('formatCell', () => {
  it('prints money with the dong sign, a count as a bare number, and text as written', () => {
    expect(formatCell(vndCell(vnd(452_500_000)), 'vi')).toBe('452.500.000 ₫');
    expect(formatCell(vndCell(vnd(452_500_000)), 'en')).toBe('452,500,000 ₫');
    expect(formatCell(countCell(1_770), 'vi')).toBe('1.770');
    expect(formatCell(countCell(1_770), 'en')).toBe('1,770');
    expect(formatCell(textCell('Nguyễn Thị Demo'), 'vi')).toBe('Nguyễn Thị Demo');
    expect(formatCell(undefined, 'vi')).toBe('');
  });
});

describe('numericColumns', () => {
  it('marks a column numeric when any row or the totals holds money or a count in it', () => {
    const table: ExportTable = {
      columns: [
        { id: 'owner', label: 'Chủ sở hữu' },
        { id: 'revenue', label: 'Doanh thu' },
        { id: 'days', label: 'Số ngày' },
        { id: 'note', label: 'Ghi chú' },
      ],
      rows: [
        { key: 'me', cells: [textCell('Nguyễn Thị Demo'), textCell('Chưa có quy định thuế'), countCell(3), textCell('')] },
        { key: 'ryan', cells: [textCell('Trần Minh Demo'), vndCell(vnd(0)), textCell(''), textCell('')] },
      ],
      totals: { key: 'total', cells: [textCell('Tổng cộng'), textCell('Chưa có quy định thuế'), countCell(3), textCell('')] },
    };
    expect(numericColumns(table)).toEqual([false, true, true, false]);
    expect(numericColumns({ ...table, rows: [] })).toEqual([false, false, true, false]);
  });
});
