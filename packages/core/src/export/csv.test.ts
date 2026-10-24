import { describe, expect, it } from 'vitest';
import { vnd } from '../money/vnd';
import { toCsv } from './csv';
import { countCell, textCell, vndCell, type ExportTable } from './table';

const table: ExportTable = {
  columns: [
    { id: 'month', label: 'Tháng' },
    { id: 'note', label: 'Ghi chú' },
    { id: 'income', label: 'Thu' },
  ],
  rows: [
    { key: '2026-09', cells: [textCell('09/2026'), textCell('Sửa mái, sơn tường'), vndCell(vnd(3_000_000))] },
    { key: '2026-10', cells: [textCell('10/2026'), textCell('Nguye\u0302\u0303n "Demo"'), vndCell(vnd(-750_000))] },
  ],
  totals: { key: 'total', cells: [textCell('Cả năm'), textCell(''), vndCell(vnd(2_250_000))] },
};

describe('toCsv', () => {
  const csv = toCsv(table);
  const lines = csv.slice(1).split('\r\n');

  it('starts with the UTF-8 byte order mark so Excel reads Vietnamese', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('writes the header, each row and the totals line, ended with CRLF', () => {
    expect(lines).toEqual([
      'Tháng,Ghi chú,Thu',
      '09/2026,"Sửa mái, sơn tường",3000000',
      '10/2026,"Nguyễn ""Demo""",-750000',
      'Cả năm,,2250000',
      '',
    ]);
  });

  it('normalizes text to NFC', () => {
    expect(lines[2]).toContain('Nguyễn'.normalize('NFC'));
    expect(csv).toBe(csv.normalize('NFC'));
  });

  it('writes amounts as plain integers and the totals line from the table totals', () => {
    expect(lines[3]?.split(',').at(-1)).toBe(String(table.totals.cells[2]?.value));
  });

  it('writes a count of days as a plain integer', () => {
    expect(toCsv({ columns: [{ id: 'vacant', label: 'Ngày trống' }], rows: [], totals: { key: 'total', cells: [countCell(1_028)] } }).endsWith('1028\r\n')).toBe(true);
  });

  it.each(['=1+1', '+84 90', '-cmd', '@SUM(A1)', '\tTab', '\rReturn', '=HYPERLINK("http://x","y")'])('writes typed text %j as text, not a formula', (typed) => {
    const [header, row] = toCsv({ columns: [{ id: 'c', label: typed }], rows: [], totals: { key: 'total', cells: [textCell(typed)] } }).slice(1).split('\r\n');
    const written = (line: string | undefined) => line?.replace(/^"|"$/g, '').replaceAll('""', '"');
    expect(written(header)).toBe(`'${typed}`);
    expect(written(row)).toBe(`'${typed}`);
  });

  it('leaves negative amounts and ordinary text alone', () => {
    const csv = toCsv({ columns: [{ id: 'c', label: 'Thu' }], rows: [{ key: 'a', cells: [vndCell(vnd(-750_000))] }], totals: { key: 'total', cells: [textCell('Tổng - cả năm')] } });
    expect(csv.slice(1)).toBe('Thu\r\n-750000\r\nTổng - cả năm\r\n');
  });
});
