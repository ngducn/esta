import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { NATIONAL_ID_CASES, NATIONAL_ID_KEPT, NATIONAL_ID_SURROUNDS } from './national-id.cases';
import { DATE, reduceNationalIds } from './reduce-national-ids';

const leaf = (value: unknown) => ({ value, confidence: 0.95, page: 1 });
const reduce = (text: string): string => String(reduceNationalIds({ notes_text: leaf(text) }).notes_text.value);

describe('the national ID reducer on its case table', () => {
  it.each(NATIONAL_ID_CASES)('%s', (_name, text, reduced) => {
    expect(reduce(text)).toBe(reduced);
    expect(reduce(reduce(text))).toBe(reduced);
  });
});

describe('the national ID reducer on numbers that are no ID', () => {
  it.each(NATIONAL_ID_KEPT)('%s', (_name, text) => {
    expect(reduce(text)).toBe(text);
  });
});

/** A symbol that NFKD turns into letters or digits, such as the square `㏖` that reads `mol`, is a word between the groups, not a mark. */
const bmp = Array.from({ length: 0xffff }, (_, code) => String.fromCharCode(code)).filter((char) => !/[\p{L}\p{N}]/u.test(char.normalize('NFKD')) || /^[\p{L}\p{N}]$/u.test(char));
/** Every mark a person or an OCR pass may put between two groups, drawn from Unicode's classes and not from the reducer's pattern. */
const MARKS = bmp.filter((char) => /^[\p{Pd}\p{Pc}\p{Po}\p{S}]$/u.test(char));
const SLASHES = new Set(['/', '\u2044', '\u2215', '\u29f8', '\uff0f']);
const NOT_LETTER_OR_DIGIT = bmp.filter((char) => /^[^\p{L}\p{N}\p{C}\p{M}\s]$/u.test(char));
const UNLABELLED = ['', ' ', '\u00a0', '\u200b', ...MARKS.filter((char) => !SLASHES.has(char))];

const digits = fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 12, maxLength: 12 });
const joiners = fc.array(fc.constantFrom(...UNLABELLED), { minLength: 11, maxLength: 11 });
const labelledJoiners = fc.array(fc.constantFrom(...UNLABELLED, ...NOT_LETTER_OR_DIGIT), { minLength: 11, maxLength: 11 });
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
