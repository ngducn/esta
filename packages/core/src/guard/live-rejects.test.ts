import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LIVE_REJECTS } from './fixtures/live-rejects';
import { checkNote } from './index';
import { NON_QUANTITY_CONTEXTS } from './contexts.cases';
import { NON_QUANTITY_PHRASES } from './words';

/** The texts the guard names as a typed number or word in `note`; unknown placeholders are not the subject here. */
const named = (note: string): string[] => {
  const checked = checkNote(note, new Map());
  return checked.ok ? [] : checked.reason.filter(({ rule }) => rule === 'word' || rule === 'number').map(({ text }) => text);
};

describe('the live answers the Phase 5 probe rejected (P5-10d)', () => {
  it.each(LIVE_REJECTS)('$id, $kind reject of $text in $sentence', ({ kind, sentence, text }) => {
    const found = named(sentence);
    if (kind === 'true') expect(found.some((found_) => found_.includes(text))).toBe(true);
    else expect(found.some((found_) => found_.includes(text))).toBe(false);
  });
});

const params = { seed: 20261107, numRuns: 400 };
const FILLER = ['Mẹ', 'nên', 'hỏi', 'văn phòng', 'trước khi', 'ký', 'giấy tờ', 'nhà', 'luật sư', 'vẫn', 'giữ', 'quyền', 'đất'];
/** Counted nouns after a number word: `hai bên thuê` counts tenants. */
const COUNTED = ['thuê', 'phòng', 'người', 'chủ', 'tên', 'loại', 'trang', 'căn'];
const NUMBER_WORDS = ['hai', 'sáu', 'mười', 'twelve', 'seven', 'bảy'] as const;

const sentence = (words: readonly string[]) => `${words.join(' ')}.`;
const filler = fc.array(fc.constantFrom(...FILLER), { minLength: 0, maxLength: 4 });
const phrase = fc.constantFrom(...NON_QUANTITY_CONTEXTS);

describe('the non-quantity contexts of the number guard (P5-10d)', () => {
  it('lists in the cases every context the word table passes, so the properties below cover them', () => {
    const listed = new Set(NON_QUANTITY_CONTEXTS.map(({ text }) => text));
    expect(NON_QUANTITY_PHRASES.map(({ text }) => text).filter((text) => !listed.has(text))).toEqual([]);
  });

  it('passes every listed context among ordinary words', () => {
    fc.assert(
      fc.property(filler, phrase, filler, (before, { text, ends }, after) => {
        const note = ends ? `${before.join(' ')} ${text}, ${sentence(after)}` : sentence([...before, text, ...after]);
        expect(named(note), note).toEqual([]);
      }),
      params,
    );
  });

  it('still rejects the same words when a counted noun follows the number word', () => {
    fc.assert(
      fc.property(filler, phrase, fc.constantFrom(...COUNTED), (before, { word, text, ends }, counted) => {
        const words = text.split(' ');
        const at = words.indexOf(word);
        fc.pre(ends || at < words.length - 1);
        const note = sentence([...before, ...words.slice(0, at + 1), counted, ...words.slice(at + 1)]);
        expect(named(note), note).toContain(word);
      }),
      params,
    );
  });

  it('still rejects a real number word placed beside a listed context', () => {
    fc.assert(
      fc.property(phrase, fc.constantFrom(...NUMBER_WORDS), fc.boolean(), ({ text }, number, before) => {
        const note = sentence(before ? [number, text] : [text, number]);
        expect(named(note), note).toContain(number);
      }),
      params,
    );
  });
});
