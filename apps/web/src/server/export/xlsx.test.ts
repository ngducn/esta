import { textCell, vndCell, type ExportTable } from '@esta/core/export';
import { vnd } from '@esta/core/money';
import { readSheet } from 'read-excel-file/node';
import { describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { toXlsx } = await import('./xlsx');

const typed = ['=1+1', '+84 90', '-cmd', '@SUM(A1)'];
const table: ExportTable = {
  columns: typed.map((label, index) => ({ id: String(index), label })),
  rows: [{ key: 'a', cells: [...typed.map(textCell)] }],
  totals: { key: 'total', cells: [vndCell(vnd(-750_000)), ...typed.slice(1).map(textCell)] },
};

describe('toXlsx', () => {
  test('stores typed text as text, so Excel never runs it as a formula', async () => {
    const rows = await readSheet(await toXlsx(table, 'Demo'));
    expect(rows[0]).toEqual(typed);
    expect(rows[1]).toEqual(typed);
  });

  test('keeps a negative amount a number', async () => {
    const rows = await readSheet(await toXlsx(table, 'Demo'));
    expect(rows[2]?.[0]).toBe(-750_000);
  });
});
