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
    const found = named(sentence);
    if (kind === 'true') expect(found.some((found_) => found_.includes(text))).toBe(true);
    else expect(found.some((found_) => found_.includes(text))).toBe(false);
  });
});

const params = { seed: 20261107, numRuns: 400 };
const FILLER = ['Mẹ', 'nên', 'hỏi', 'văn phòng', 'trước khi', 'giấy tờ', 'nhà', 'luật sư', 'vẫn', 'giữ', 'quyền', 'đất'];
/** Written here, not read from the guard: the nouns and classifiers that make a number word before them a count. */
const COUNTED = ['người', 'căn', 'phòng', 'con', 'chủ', 'thuê', 'cái', 'chiếc', 'mảnh', 'lô', 'tên', 'loại', 'trang', 'chỗ', 'khách', 'hộ', 'đứa', 'cô', 'anh'];
/** The word before a context: none, or one that turns `hai bên` into "there are two sides" (`Có hai bên thuê`). */
const LEADS = ['', 'Có', 'Còn'];
/** Contexts that state a count when a counted noun comes right after the whole of them, and the number words in them. */
const HEADS: ReadonlyArray<{ readonly text: string; readonly numbers: readonly string[] }> = [
  { text: 'hai bên', numbers: ['hai'] },
  { text: 'giữa hai bên', numbers: ['hai'] },
  { text: 'của hai bên', numbers: ['hai'] },
  { text: 'cả hai bên', numbers: ['hai'] },
  { text: 'cả hai', numbers: ['hai'] },
  { text: 'ba mẹ', numbers: ['ba'] },
  { text: 'ba và mẹ', numbers: ['ba'] },
  { text: 'ba hoặc mẹ', numbers: ['ba'] },
  { text: 'mẹ và ba', numbers: ['ba'] },
  { text: 'mẹ hoặc ba', numbers: ['ba'] },
];
/** Contexts that state no figure when nothing but an act or the end of the clause follows. */
const PASSING = [
  'hai bên ký',
  'hai bên thỏa thuận',
  'hai bên thống nhất',
  'hai bên đồng ý',
  'hai bên cam kết',
  'hai bên xác nhận',
  'hai bên thương lượng',
  'hai bên cùng',
  'giữa hai bên,',
  'của hai bên,',
  'cả hai bên,',
  'ba mẹ vẫn',
  'ba mẹ không',
  'ba mẹ muốn',
  'ba mẹ,',
  'ba và mẹ đều',
  'ba hoặc mẹ,',
  'mẹ và ba đều',
  'mẹ hoặc ba,',
  'cả hai đều',
  'cả hai cùng',
  'cả hai,',
];
const NUMBER_WORDS = ['hai', 'sáu', 'mười', 'twelve', 'seven', 'bảy'] as const;
/** `một` is also an article, so it is rejected before phần trăm and nowhere else. */
const BEFORE_PERCENT = [...NUMBER_WORDS, 'một', 'ba'] as const;

const sentence = (words: readonly string[]) => `${words.filter((word) => word !== '').join(' ')}.`;
const filler = fc.array(fc.constantFrom(...FILLER), { minLength: 0, maxLength: 4 });
const passing = fc.constantFrom(...PASSING);

describe('the non-quantity contexts of the number guard (P5-10d)', () => {
  it('passes every context among ordinary words', () => {
    fc.assert(
      fc.property(filler, passing, filler, (before, text, after) => {
        const note = sentence([...before, text, ...after]);
        expect(named(note), note).toEqual([]);
      }),
      params,
    );
  });

  it('rejects a counted noun after the whole context, with no word, Có or Còn in front', () => {
    fc.assert(
      fc.property(filler, fc.constantFrom(...LEADS), fc.constantFrom(...HEADS), fc.constantFrom(...COUNTED), filler, (before, lead, head, counted, after) => {
        const note = sentence([...before, lead, head.text, counted, ...after]);
        expect(named(note).some((text) => head.numbers.includes(text.toLowerCase())), note).toBe(true);
      }),
      params,
    );
  });

  it('rejects a context that Có or Còn comes before, whatever follows it', () => {
    fc.assert(
      fc.property(filler, fc.constantFrom('Có', 'Còn'), passing, filler, (before, lead, text, after) => {
        const note = sentence([...before, lead, text, ...after]);
        expect(named(note), note).not.toEqual([]);
      }),
      params,
    );
  });

  it('rejects a number word before phần trăm, one included', () => {
    fc.assert(
      fc.property(filler, fc.constantFrom(...BEFORE_PERCENT), filler, (before, number, after) => {
        const note = sentence([...before, number, 'phần trăm', ...after]);
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

  it('still rejects a real number word placed beside a context', () => {
    fc.assert(
      fc.property(passing, fc.constantFrom(...NUMBER_WORDS), fc.boolean(), (text, number, before) => {
        const note = sentence(before ? [number, text] : [text, number]);
        expect(named(note), note).toContain(number);
      }),
      params,
    );
  });
});
