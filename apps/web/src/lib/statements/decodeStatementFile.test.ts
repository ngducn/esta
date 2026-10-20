import { decodeStatement, decodeStatementCsv, renderCsv, STATEMENT_LAYOUTS } from '@esta/core/matching';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import { scenarioGrid } from '../../../../../packages/core/src/matching/statement-scenario';
import { decodeStatementFile, MAX_STATEMENT_BYTES } from './decodeStatementFile';

const FIXTURES = join(import.meta.dirname, '..', '..', '..', '..', '..', 'fixtures', 'statements');
const bytesOf = (text: string) => new TextEncoder().encode(text);
const BOM = String.fromCodePoint(0xfeff);

async function xlsx(grid: readonly (readonly (string | number | null | Date)[])[]): Promise<Uint8Array<ArrayBuffer>> {
  const data = grid.map((row) =>
    row.map((cell) => (cell === null ? null : cell instanceof Date ? { value: cell, type: Date, format: 'dd/mm/yyyy' } : { value: cell })),
  );
  const buffer = await writeXlsxFile(data, {}).toBuffer();
  return new Uint8Array(buffer);
}

describe('decodeStatementFile', () => {
  it.each(['layout-a.csv', 'layout-c.csv'])('reads %s as decodeStatementCsv does, with its header cells', async (file) => {
    const text = readFileSync(join(FIXTURES, file), 'utf8');
    const decoded = await decodeStatementFile(bytesOf(text), file);
    const expected = decodeStatementCsv(text);
    if (!decoded.ok || !expected.ok) throw new Error('fixture did not decode');
    expect(decoded.value).toEqual({ ...expected.value, header: text.split('\r\n')[0]?.split(',') });
  });

  it('reads an XLSX sheet in the browser build exactly as decodeStatement reads its grid, fractional row refused', async () => {
    const grid = scenarioGrid(STATEMENT_LAYOUTS.b);
    const decoded = await decodeStatementFile(await xlsx(grid), 'sao-ke.xlsx');
    const expected = decodeStatement(grid);
    if (!decoded.ok || !expected.ok) throw new Error('layout B did not decode');
    expect(decoded.value).toEqual({ ...expected.value, header: STATEMENT_LAYOUTS.b.columns.map((column) => column.header) });
    expect(decoded.value.rejected).toEqual([{ index: 15, field: 'amount', reason: 'fractional' }]);
  });

  it('reads a date cell as its calendar day', async () => {
    const sheet = await xlsx([
      ['Ngày GD', 'Ghi có', 'Ghi nợ', 'Diễn giải'],
      [new Date(Date.UTC(2026, 9, 2)), 3_500_000, null, 'ESTA 7K2QX9MP'],
    ]);
    const decoded = await decodeStatementFile(sheet, 'sao-ke.xlsx');
    if (!decoded.ok) throw new Error(decoded.reason);
    expect(decoded.value.rows).toEqual([{ index: 1, date: '2026-10-02', amount: 3_500_000, description: 'ESTA 7K2QX9MP', bankRef: '' }]);
  });

  it('strips a byte order mark from a CSV export', async () => {
    const text = renderCsv([
      ['Ngày giao dịch', 'Số tiền', 'Nội dung'],
      ['02/10/2026', '3.500.000', 'ESTA 7K2QX9MP'],
    ]);
    const decoded = await decodeStatementFile(bytesOf(`${BOM}${text}`), 'SAO-KE.CSV');
    expect(decoded.ok && decoded.value.rows.map((row) => row.amount)).toEqual([3_500_000]);
  });

  it('refuses a file it cannot read, with the reason', async () => {
    expect(await decodeStatementFile(bytesOf('Hello,World\r\n1,2\r\n'), 'notes.csv')).toEqual({ ok: false, reason: 'no_header' });
    expect(await decodeStatementFile(bytesOf('%PDF-1.7'), 'sao-ke.pdf')).toEqual({ ok: false, reason: 'unsupported' });
    expect(await decodeStatementFile(new Uint8Array([0x4e, 0x67, 0xe0, 0x79, 0x0a]), 'sao-ke.csv')).toEqual({ ok: false, reason: 'unreadable' });
    expect(await decodeStatementFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0]), 'sao-ke.xlsx')).toEqual({ ok: false, reason: 'unreadable' });
    expect(await decodeStatementFile(new Uint8Array(MAX_STATEMENT_BYTES + 1), 'sao-ke.csv')).toEqual({ ok: false, reason: 'too_large' });
  });
});
