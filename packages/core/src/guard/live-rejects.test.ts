import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LIVE_REJECTS } from './fixtures/live-rejects';
import { checkNote } from './index';

/** The texts the guard names as a typed number or word in `note`; unknown placeholders are not the subject here. */
const named = (note: string): string[] => {
  const checked = checkNote(note, new Map());
  return checked.ok ? [] : checked.reason.filter(({ rule }) => rule === 'word' || rule === 'number').map(({ text }) => text);
};

describe('the live answers the Phase 5 probe rejected (P5-10d)', () => {
  it.each(LIVE_REJECTS)('$id, $kind reject of $text in $sentence', ({ kind, sentence, text }) => {
    const found = named(sentence).some((found_) => found_.includes(text));
    expect(found).toBe(kind !== 'false');
  });
});

const params = { seed: 20261107, numRuns: 400 };
const FILLER = ['Mẹ', 'nên', 'hỏi', 'văn phòng', 'trước khi', 'giấy tờ', 'nhà', 'luật sư', 'vẫn', 'giữ', 'quyền', 'đất'];
const NUMBER_WORDS = ['hai', 'sáu', 'mười', 'twelve', 'seven', 'bảy'] as const;
/** Written here: `một` is also an article, so it is rejected before phần trăm and nowhere else; `không` is zero percent, `dăm` and `vài` are a few. */
const BEFORE_PERCENT = [...NUMBER_WORDS, 'một', 'ba', 'không', 'dăm', 'vài'] as const;
/** Between the quantity and `phần trăm`: nothing, a soft line break, a paragraph break, a hyphen, a bracket. */
const BETWEEN = [' ', '\n', '\n\n', '-', ' (', '  \n'] as const;

const sentence = (words: readonly string[]) => `${words.join(' ')}.`;
const filler = fc.array(fc.constantFrom(...FILLER), { minLength: 0, maxLength: 4 });

describe('phần trăm in the number guard (P5-10d)', () => {
  it('rejects a number word before phần trăm, one, zero and a few included, across a break', () => {
    fc.assert(
      fc.property(filler, fc.constantFrom(...BEFORE_PERCENT), fc.constantFrom(...BETWEEN), filler, (before, number, between, after) => {
        const note = `${sentence([...before, number])}`.slice(0, -1) + `${between}phần trăm ${after.join(' ')}.`;
        expect(named(note), note).toContain('trăm');
      }),
      params,
    );
  });

  it('passes phần trăm as a noun', () => {
    fc.assert(
      fc.property(filler, fc.constantFrom('theo', 'tính', 'một khoản', 'hay'), filler, (before, word, after) => {
        const note = sentence([...before, word, 'phần trăm', ...after]);
        expect(named(note), note).not.toContain('trăm');
      }),
      params,
    );
  });
});
