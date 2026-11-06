import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CSV_CASES } from './csv.cases';
import { parseCsv } from './csv';

describe('the CSV reader on its case table', () => {
  it.each(CSV_CASES)('$name', ({ text, spanLines, rows }) => {
    expect(parseCsv(text, { spanLines })).toEqual(rows.map((value) => ({ ok: true, value })));
  });
});

const cell = fc.string({ unit: fc.constantFrom('a', 'b', ' ', ',', ';', '\t', '"', 'é'), maxLength: 8 });
const quote = (text: string) => `"${text.replaceAll('"', '""')}"`;

describe('the CSV reader on generated files', () => {
  it('reads back every header and row it was written from, whatever separators the cells hold', () => {
    fc.assert(
      fc.property(fc.constantFrom(',', ';', '\t'), fc.array(cell, { minLength: 2, maxLength: 5 }), fc.array(cell, { minLength: 2, maxLength: 5 }), (separator, header, row) => {
        const width = Math.min(header.length, row.length);
        const head = header.slice(0, width);
        const body = row.slice(0, width);
        const text = `${head.map(quote).join(separator)}\n${body.map(quote).join(separator)}\n`;
        expect(parseCsv(text, { spanLines: false })).toEqual([
          { ok: true, value: head },
          { ok: true, value: body },
        ]);
      }),
      { seed: 20261007, numRuns: 1000 },
    );
  });
});
