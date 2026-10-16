import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { decodeCsv, decodeStatement, type StatementRow } from './decode';
import { STATEMENT_LAYOUTS } from './layouts';
import { renderDate, renderMagnitude, renderStatementCsv, renderStatementGrid, type RenderableRow } from './render';

const rows: RenderableRow[] = [
  { date: isoDate('2026-10-07'), amount: vnd(3_500_000), description: 'ESTA 7K2QX9MP', bankRef: 'FT1' },
  { date: isoDate('2026-10-08'), amount: vnd(-120_000), description: 'PHI SMS, thang 10', bankRef: 'FT2' },
];

describe('renderMagnitude and renderDate', () => {
  it.each([
    [3_500_000, 'dot_grouped', '3.500.000'],
    [500, 'dot_grouped', '500'],
    [0, 'dot_grouped', '0'],
    [3_500_000, 'comma_grouped_cents', '3,500,000.00'],
    [1_000, 'comma_grouped_cents', '1,000.00'],
    [3_500_000, 'number', 3_500_000],
  ] as const)('writes %d in the %s style as %j', (magnitude, style, cell) => {
    expect(renderMagnitude(magnitude, style)).toBe(cell);
  });

  it.each([
    ['dd/MM/yyyy', '07/10/2026'],
    ['dd/MM/yyyy HH:mm:ss', '07/10/2026 00:00:00'],
    ['yyyy-MM-dd', '2026-10-07'],
  ] as const)('writes a date in the %s style as %j', (style, text) => {
    expect(renderDate(isoDate('2026-10-07'), style)).toBe(text);
  });
});

describe('renderStatementGrid', () => {
  it('writes layout A with signed dot-grouped amounts and a zero time', () => {
    expect(renderStatementGrid(STATEMENT_LAYOUTS.a, rows)).toEqual([
      ['Ngày giao dịch', 'Số tham chiếu', 'Số tiền (VND)', 'Nội dung'],
      ['07/10/2026 00:00:00', 'FT1', '3.500.000', 'ESTA 7K2QX9MP'],
      ['08/10/2026 00:00:00', 'FT2', '-120.000', 'PHI SMS, thang 10'],
    ]);
  });

  it('writes layout B with numbers split by direction and an empty balance', () => {
    expect(renderStatementGrid(STATEMENT_LAYOUTS.b, rows)).toEqual([
      ['Ngày GD', 'Mã giao dịch', 'Ghi nợ', 'Ghi có', 'Số dư', 'Diễn giải'],
      ['07/10/2026', 'FT1', null, 3_500_000, null, 'ESTA 7K2QX9MP'],
      ['08/10/2026', 'FT2', 120_000, null, null, 'PHI SMS, thang 10'],
    ]);
  });
});

describe('renderStatementCsv', () => {
  it('quotes fields that hold a comma or a quote and ends every line with CRLF', () => {
    const row = { date: isoDate('2026-10-08'), amount: vnd(-120_000), description: 'say "hi", then', bankRef: 'FT2' };
    expect(renderStatementCsv(STATEMENT_LAYOUTS.c, [row])).toBe(
      'Date,Reference,Amount,Description\r\n2026-10-08,FT2,"-120,000.00","say ""hi"", then"\r\n',
    );
  });
});

const amount = fc.integer({ min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }).map(vnd);
const date = fc
  .date({ min: new Date('1900-01-01T00:00:00Z'), max: new Date('2199-12-31T00:00:00Z'), noInvalidDate: true })
  .map((d) => isoDate(d.toISOString().slice(0, 10)));
const text = fc.string({ unit: 'grapheme', maxLength: 40 }).map((s) => s.trim());
const renderableRow: fc.Arbitrary<RenderableRow> = fc.record({ date, amount, description: text, bankRef: text });
const layout = fc.constantFrom(...Object.values(STATEMENT_LAYOUTS));
const params = { seed: 20261007, numRuns: 500 };

function decodedRows(grid: Parameters<typeof decodeStatement>[0]): StatementRow[] {
  const decoded = decodeStatement(grid);
  if (!decoded.ok) throw new Error(decoded.reason);
  expect(decoded.value.rejected).toEqual([]);
  return decoded.value.rows;
}

describe('decode is the inverse of render', () => {
  it('through the grid, for every layout', () => {
    fc.assert(
      fc.property(layout, fc.array(renderableRow, { maxLength: 8 }), (chosen, input) => {
        expect(decodedRows(renderStatementGrid(chosen, input))).toEqual(input.map((row, i) => ({ index: i + 1, ...row })));
      }),
      params,
    );
  });

  it('through CSV text, for every layout', () => {
    fc.assert(
      fc.property(layout, fc.array(renderableRow, { maxLength: 8 }), (chosen, input) => {
        expect(decodedRows(decodeCsv(renderStatementCsv(chosen, input)))).toEqual(input.map((row, i) => ({ index: i + 1, ...row })));
      }),
      params,
    );
  });
});
