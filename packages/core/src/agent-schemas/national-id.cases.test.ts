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
const SLASHES = new Set(['/', '\u2044', '\u2215', '\u29f8', '\uff0f']);
const NOT_LETTER_OR_DIGIT = bmp.filter((char) => /^[^\p{L}\p{N}\p{C}\p{M}\s]$/u.test(char) && char !== '\u20ab');
const BRACKETS_AND_QUOTES = bmp.filter((char) => /^[\p{Ps}\p{Pe}\p{Pi}\p{Pf}]$/u.test(char));
const SPACES = bmp.filter((char) => /^\p{Zs}$/u.test(char));
/** Every punctuation mark, symbol and space separator, drawn from Unicode's classes and not from the reducer's pattern. */
const ANY_JOINER = bmp.filter((char) => /^[\p{P}\p{S}\p{Zs}]$/u.test(char));
/** The dong sign is the one symbol left out: a digit run it leads is a price, which the money property holds. */
const NOT_A_PRICE_SIGN = (char: string) => char !== '\u20ab';
const UNLABELLED = ['', ' ', '\u00a0', '\u200b', ...ANY_JOINER.filter((char) => !SLASHES.has(char) && NOT_A_PRICE_SIGN(char))];

const digits = fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 12, maxLength: 12 });
const joiners = fc.array(fc.constantFrom(...UNLABELLED), { minLength: 11, maxLength: 11 });
const labelledJoiners = fc.array(fc.constantFrom(...UNLABELLED, ...NOT_LETTER_OR_DIGIT), { minLength: 11, maxLength: 11 });
const surround = fc.constantFrom(...NATIONAL_ID_SURROUNDS);
const digitsOf = (text: string) => text.replace(/\D/gu, '');

const AFTER = ['₫', 'đ', 'đồng', 'VND', 'vnđ', 'VNĐ', 'tỷ', 'triệu', 'Đ', 'ĐỒNG', 'vnd'];
const BEFORE = ['₫', 'đ', 'VND', 'vnđ', 'VNĐ', 'Đ', 'vnd'];
const groupings = fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 12 });
const groupSeparators = fc.constantFrom('', ' ', '.', ',', '\u00b7', '\u00a0', '  ');

describe('the national ID reducer on money', () => {
  it('never cuts a figure of nine to twelve digits that a currency marker follows or leads, in any grouping', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 9, maxLength: 12 }),
        groupings,
        groupSeparators,
        fc.constantFrom(...AFTER, ...BEFORE),
        fc.constantFrom('', ' '),
        fc.boolean(),
        fc.constantFrom('Giá ', 'cccd ', ''),
        (ds, sizes, sep, marker, gap, before, lead) => {
          const parts: string[] = [];
          let at = 0;
          for (const size of sizes) {
            if (at >= ds.length) break;
            parts.push(ds.slice(at, at + size).join(''));
            at += size;
          }
          if (at < ds.length) parts.push(ds.slice(at).join(''));
          const figure = parts.join(sep);
          const leads = before && BEFORE.includes(marker);
          const text = leads ? `${lead}${marker}${gap}${figure}` : `${lead}${figure}${gap}${marker}`;
          fc.pre(!/^0[^.,\u00b7]*$/u.test(figure));
          fc.pre(!new RegExp(DATE.source, 'u').test(text));
          expect(reduce(text)).toBe(text);
        },
      ),
      { seed: 20261007, numRuns: 1500 },
    );
  });
});

describe('the national ID reducer on generated numbers', () => {
  it('cuts an unlabelled number whose groups brackets, quotes or spaces join', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 12, maxLength: 12 }),
        fc.array(fc.constantFrom(...BRACKETS_AND_QUOTES, ...SPACES), { minLength: 11, maxLength: 11 }),
        (ds, js) => {
          const out = reduce(`Số ${ds.map((d, i) => `${d}${js[i] ?? ''}`).join('')}`);
          expect(digitsOf(out)).not.toContain(ds.join(''));
          expect(out).toContain(ds.slice(-4).join(''));
        },
      ),
      { seed: 20261007, numRuns: 600 },
    );
  });


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
