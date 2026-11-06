import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkNote } from './index';
import { WORDS, type WordRow } from './words';

const params = { seed: 20261007, numRuns: 300 };
const NUMBER_WORDS = ['hai', 'sáu', 'mười', 'twelve', 'seven', 'bảy'] as const;

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

function compoundsOf(word: string, row: WordRow): string[] {
  return [
    ...(row.passesAfter ?? []).map((other) => `${other} ${word}`),
    ...(row.passesAfterPhrase ?? []).map((phrase) => `${phrase} ${word}`),
    ...(row.passesBefore ?? []).map((other) => `${word} ${other}`),
    ...(row.passesBeforeCapitalized ?? []).map((other) => `${word} ${capitalize(other)}`),
  ];
}

const COMPOUNDS = [...WORDS].flatMap(([word, row]) => compoundsOf(word, row).map((compound) => ({ word, compound })));

const rejectedWords = (text: string): string[] => {
  const result = checkNote(text, new Map());
  return result.ok ? [] : result.reason.map((violation) => violation.text);
};

describe('the number guard beside a word that is allowed in a compound', () => {
  it('reads the compound table, so the property below covers every entry', () => {
    expect(COMPOUNDS.length).toBeGreaterThan(100);
  });

  it('still rejects a real number word placed before or after any compound', () => {
    fc.assert(
      fc.property(fc.constantFrom(...COMPOUNDS), fc.constantFrom(...NUMBER_WORDS), fc.boolean(), ({ compound }, number, before) => {
        const text = before ? `Tòa nhà Demo có ${number} ${compound} mới.` : `Tòa nhà Demo có ${compound} ${number} mới.`;
        expect(rejectedWords(text), text).toContain(number);
      }),
      params,
    );
  });
});
