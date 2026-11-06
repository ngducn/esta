import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { NATIONAL_ID_CASES, NATIONAL_ID_JOINERS, NATIONAL_ID_LABELLED_JOINERS, NATIONAL_ID_SURROUNDS } from './national-id.cases';
import { DATE, reduceNationalIds } from './reduce-national-ids';

const leaf = (value: unknown) => ({ value, confidence: 0.95, page: 1 });
const reduce = (text: string): string => String(reduceNationalIds({ notes_text: leaf(text) }).notes_text.value);

describe('the national ID reducer on its case table', () => {
  it.each(NATIONAL_ID_CASES)('%s', (_name, text, reduced) => {
    expect(reduce(text)).toBe(reduced);
    expect(reduce(reduce(text))).toBe(reduced);
  });
});

const digits = fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 12, maxLength: 12 });
const joiners = fc.array(fc.constantFrom(...NATIONAL_ID_JOINERS), { minLength: 11, maxLength: 11 });
const labelledJoiners = fc.array(fc.constantFrom(...NATIONAL_ID_JOINERS, ...NATIONAL_ID_LABELLED_JOINERS), { minLength: 11, maxLength: 11 });
const surround = fc.constantFrom(...NATIONAL_ID_SURROUNDS);
const digitsOf = (text: string) => text.replace(/\D/gu, '');

describe('the national ID reducer on generated numbers', () => {
  it('leaves no run of nine or more digits, and keeps the last four', () => {
    fc.assert(
      fc.property(digits, fc.boolean(), joiners, labelledJoiners, surround, (ds, labelled, plain, withSlashes, [before, after]) => {
        const js = labelled ? withSlashes : plain;
        const number = ds.map((d, i) => `${d}${js[i] ?? ''}`).join('');
        const text = `${labelled ? 'cccd ' : before}${number}${after}`;
        fc.pre(!new RegExp(DATE.source, 'u').test(text.normalize('NFKD').replaceAll(String.fromCodePoint(0x200b), '')));
        const out = reduce(text);
        for (const run of out.match(/\d+/gu) ?? []) expect(run.length).toBeLessThan(9);
        expect(digitsOf(out)).not.toContain(ds.join(''));
        expect(out).toContain(ds.slice(-4).join(''));
      }),
      { seed: 20261007, numRuns: 1500 },
    );
  });

  it('reducing twice changes nothing more', () => {
    fc.assert(
      fc.property(digits, joiners, surround, (ds, js, [before, after]) => {
        const once = reduce(`${before}${ds.map((d, i) => `${d}${js[i] ?? ''}`).join('')}${after}`);
        expect(reduce(once)).toBe(once);
      }),
      { seed: 20261007, numRuns: 600 },
    );
  });
});
