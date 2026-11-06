import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { INPUT_KINDS } from './fields';
import { TERM_CASES } from './term.cases';

const params = { seed: 20261007, numRuns: 300 };

describe('the term parser on its case table', () => {
  it.each(TERM_CASES)('$name: $text', ({ text, end }) => {
    expect(INPUT_KINDS.term.parse(text)).toEqual(end === null ? { ok: false, reason: 'invalid' } : { ok: true, value: end });
  });
});

const day = fc.date({ min: new Date('1950-01-01T00:00:00Z'), max: new Date('2099-12-31T00:00:00Z'), noInvalidDate: true });
const joiner = fc.constantFrom(' - ', ' – ', ' — ', '–', ' đến ', ' den ', ' tới ', ' ĐẾN ');
const style = fc.constantFrom<'/' | '.' | '-'>('/', '.', '-');
const printed = (date: Date, sep: string) => {
  const [y = '', m = '', d = ''] = date.toISOString().slice(0, 10).split('-');
  return `${d}${sep}${m}${sep}${y}`;
};

describe('the term parser on generated ranges', () => {
  it('keeps the end of a range, never the start', () => {
    fc.assert(
      fc.property(day, day, joiner, style, fc.constantFrom('', 'Từ ', 'Tu ', 'Cấp '), (a, b, sep, dateSep, lead) => {
        fc.pre(a.toISOString() !== b.toISOString());
        const out = INPUT_KINDS.term.parse(`${lead}${printed(a, dateSep)}${sep}${printed(b, dateSep)}`);
        expect(out).toEqual({ ok: true, value: b.toISOString().slice(0, 10) });
      }),
      params,
    );
  });

  it('reads the date after hạn when an issue date comes first', () => {
    fc.assert(
      fc.property(day, day, fc.constantFrom(', hạn ', ' hạn ', ', thời hạn ', '; han '), (issued, expires, word) => {
        fc.pre(issued.toISOString() !== expires.toISOString());
        const out = INPUT_KINDS.term.parse(`Cấp ngày ${printed(issued, '/')}${word}${printed(expires, '/')}`);
        expect(out).toEqual({ ok: true, value: expires.toISOString().slice(0, 10) });
      }),
      params,
    );
  });

  it('refuses a text that names only a start', () => {
    fc.assert(
      fc.property(day, fc.constantFrom('Từ ', 'Tu ', '50 năm kể từ ngày ', 'Thời hạn 50 năm, từ '), (start, lead) => {
        expect(INPUT_KINDS.term.parse(`${lead}${printed(start, '/')}`).ok).toBe(false);
      }),
      params,
    );
  });
});
