import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_CELLS, readSpreadsheet } from './spreadsheet';

const DEMO = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'connector-demo', 'Demo');
const tracker = { name: 'theo-doi-tai-san-demo.xlsx', bytes: readFileSync(join(DEMO, 'theo-doi-tai-san-demo.xlsx')) };
const csv = (text: string, name = 'tai-san.csv') => ({ name, bytes: Buffer.from(text) });

describe('readSpreadsheet', () => {
  it('reads the Demo tracker with the type each cell was stored as', async () => {
    const read = await readSpreadsheet(tracker);
    expect(read.ok).toBe(true);
    const [sheet] = read.ok ? read.value : [];
    expect(sheet).toMatchObject({ name: 'Tài sản', truncated: false });
    const [header, q3, cuChi] = sheet?.rows ?? [];
    expect(header?.[9]).toEqual({ type: 'text', text: 'Giá mua' });
    expect(q3?.slice(7, 10)).toEqual([{ type: 'date', text: '2008-06-20' }, { type: 'text', text: 'Mua' }, { type: 'text', text: '4,85 tỷ' }]);
    expect(cuChi?.slice(7, 11)).toEqual([{ type: 'text', text: '15/08/2005' }, { type: 'text', text: 'Thừa kế' }, { type: 'number', text: '1250000000' }, null]);
  });

  it('reads a CSV as one sheet of text cells, empty cells as null', async () => {
    expect(await readSpreadsheet(csv('Mã;Giá mua;Ghi chú\nDEMOQ3;4,85 tỷ;\n'))).toEqual({
      ok: true,
      value: [
        {
          name: 'tai-san.csv',
          rows: [
            [{ type: 'text', text: 'Mã' }, { type: 'text', text: 'Giá mua' }, { type: 'text', text: 'Ghi chú' }],
            [{ type: 'text', text: 'DEMOQ3' }, { type: 'text', text: '4,85 tỷ' }, null],
          ],
          truncated: false,
        },
      ],
    });
  });

  it('keeps a quoted line break inside its cell, and refuses a CSV whose quotes it cannot split rather than guess its cells', async () => {
    const read = await readSpreadsheet(csv('Mã,Ghi chú\nDEMOQ3,"dòng 1\ndòng 2"\n'));
    expect(read.ok && read.value[0]?.rows[1]).toEqual([{ type: 'text', text: 'DEMOQ3' }, { type: 'text', text: 'dòng 1\ndòng 2' }]);
    expect(await readSpreadsheet(csv('Mã,Ghi chú\nDEMOQ3,nhà "Demo\nDEMOGV,x\n'))).toEqual({ ok: false, reason: 'stray_quote' });
  });

  it('cuts a sheet past the cell limit at a whole row and says so', async () => {
    const read = await readSpreadsheet(csv(`${'a,b\n'.repeat(MAX_CELLS / 2 + 5)}`));
    expect(read.ok && read.value[0]).toMatchObject({ truncated: true, rows: { length: MAX_CELLS / 2 } });
  });

  it('refuses a file that is neither a workbook nor a CSV, and a broken workbook', async () => {
    expect(await readSpreadsheet(csv('Demo', 'ghi-chu.txt'))).toEqual({ ok: false, reason: 'unsupported_type' });
    expect(await readSpreadsheet({ name: 'hong.xlsx', bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]) })).toEqual({ ok: false, reason: 'unsupported_type' });
  });
});
