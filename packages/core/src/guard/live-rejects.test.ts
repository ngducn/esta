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
/** Written here: the words that put a quantity in front of a context (`Đã có tổng cộng hai bên ký`, `Mẹ cho hai bên cùng thuê`). */
const QUANTIFIERS = ['thêm', 'tới', 'đến', 'được', 'chỉ', 'tổng cộng', 'là', 'với', 'cho', 'từ', 'có', 'còn', 'Có', 'Còn'];
/**
 * Contexts with the act or particle that may follow them, and the number word each holds. `lead` is set for a context that
 * a clause may end after once giữa or của stands in front (`tài sản của cả hai.`), which is an idiom and no count.
 */
const HEADS: ReadonlyArray<{ readonly text: string; readonly act: string; readonly numbers: readonly string[]; readonly idiomEnd?: true }> = [
  { text: 'hai bên', act: 'ký', numbers: ['hai'] },
  { text: 'giữa hai bên', act: 'ký', numbers: ['hai'], idiomEnd: true },
  { text: 'của hai bên', act: 'ký', numbers: ['hai'], idiomEnd: true },
  { text: 'cả hai bên', act: 'ký', numbers: ['hai'] },
  { text: 'cả hai', act: 'đều', numbers: ['hai'] },
  { text: 'ba mẹ', act: 'vẫn', numbers: ['ba'] },
  { text: 'ba và mẹ', act: 'vẫn', numbers: ['ba'] },
  { text: 'ba hoặc mẹ', act: 'vẫn', numbers: ['ba'] },
  { text: 'mẹ và ba', act: 'vẫn', numbers: ['ba'] },
  { text: 'mẹ hoặc ba', act: 'vẫn', numbers: ['ba'] },
];
/** Whole sentences in which a context states no figure. */
const PASSING = [
  'Hai bên ký',
  'Hai bên thỏa thuận',
  'Hai bên thống nhất',
  'Hai bên đồng ý',
  'Hai bên cam kết',
  'Hai bên xác nhận',
  'Hai bên thương lượng',
  'Hai bên cùng',
  'Nên để hai bên ký',
  'Chỉ đổi giá khi hai bên cùng đồng ý',
  'Nếu hai bên đồng ý',
  'Giữa hai bên,',
  'Hợp đồng của hai bên,',
  'Ý kiến của cả hai bên,',
  'Ba mẹ vẫn',
  'Ba mẹ không',
  'Ba mẹ muốn',
  'Nhưng ba mẹ không',
  'Tài sản của ba mẹ,',
  'Ba và mẹ đều',
  'Ba hoặc mẹ đứng',
  'Mẹ và ba đều',
  'Tài sản của ba hoặc mẹ,',
  'Cả hai đều',
  'Cả hai cùng',
  'Tài sản chung của cả hai,',
  'Nếu cả hai đều',
];
const NUMBER_WORDS = ['hai', 'sáu', 'mười', 'twelve', 'seven', 'bảy'] as const;
/** `một` is also an article, so it is rejected before phần trăm and nowhere else, and `không` is zero percent. */
const BEFORE_PERCENT = [...NUMBER_WORDS, 'một', 'ba', 'không'] as const;

const sentence = (words: readonly string[]) => `${words.filter((word) => word !== '').join(' ')}.`;
const filler = fc.array(fc.constantFrom(...FILLER), { minLength: 0, maxLength: 4 });
/** Whole sentences of filler, so a context that follows them starts one. */
const sentences = fc.array(filler.map((words) => sentence(['Mẹ', ...words])), { minLength: 0, maxLength: 2 }).map((all) => all.join(' '));
const head = fc.constantFrom(...HEADS);
const quantifier = fc.constantFrom(...QUANTIFIERS);
const counted = fc.constantFrom(...COUNTED);

/** The context of `shape` is rejected when the guard names the number word in it. */
const namesNumber = (note: string, { numbers }: { readonly numbers: readonly string[] }) => named(note).some((text) => numbers.includes(text.toLowerCase()));

describe('the non-quantity contexts of the number guard (P5-10d)', () => {
  it('passes every context among ordinary words', () => {
    fc.assert(
      fc.property(sentences, fc.constantFrom(...PASSING), filler, (before, text, after) => {
        const note = `${before} ${text} ${after.join(' ')}.`.trim();
        expect(named(note), note).toEqual([]);
      }),
      params,
    );
  });

  it('rejects a counted noun after the whole context, with or without a word in front', () => {
    fc.assert(
      fc.property(sentences, fc.constantFrom('', ...QUANTIFIERS), head, counted, filler, (before, lead, context, noun, after) => {
        const note = `${before} ${sentence([lead, context.text, noun, ...after])}`;
        expect(namesNumber(note, context), note).toBe(true);
      }),
      params,
    );
  });

  it('rejects a quantifier before a context, then the act that would pass it, a clause end or a counted noun', () => {
    fc.assert(
      fc.property(sentences, quantifier, head, counted, filler, (before, lead, context, noun, after) => {
        for (const note of [
          `${before} ${sentence([lead, context.text, context.act, ...after])}`,
          `${before} ${sentence([lead + ',', context.text, context.act, ...after])}`,
          `${before} ${sentence([lead, context.text + ',', noun, ...after])}`,
          `${before} ${sentence([lead, `“${context.text}”`, noun, ...after])}`,
        ]) {
          expect(namesNumber(note, context), note).toBe(true);
        }
      }),
      params,
    );
  });

  it('rejects a clause end or a quote after a context that no giữa or của leads', () => {
    fc.assert(
      fc.property(sentences, head, counted, filler, (before, context, noun, after) => {
        fc.pre(context.idiomEnd !== true);
        for (const note of [`${before} ${sentence([context.text + ',', noun, ...after])}`, `${before} ${sentence([`“${context.text}”`, noun, ...after])}`, `${before} ${context.text}.`]) {
          expect(namesNumber(note, context), note).toBe(true);
        }
      }),
      params,
    );
  });

  it('rejects a number word before phần trăm, one and zero included', () => {
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
      fc.property(fc.constantFrom(...PASSING), fc.constantFrom(...NUMBER_WORDS), fc.boolean(), (text, number, before) => {
        const note = sentence(before ? [number, text] : [text, number]);
        expect(named(note), note).toContain(number);
      }),
      params,
    );
  });
});
