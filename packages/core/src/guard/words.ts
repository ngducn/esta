export type WordKind = 'amount' | 'currency' | 'number' | 'date';

export type WordRow = {
  readonly kind: WordKind;
  readonly passesAfter?: readonly string[];
  /** Two words before it, as `bên thứ` before `ba` (a third party), where the one word before alone is a date (`thứ ba`). */
  readonly passesAfterPhrase?: readonly string[];
  readonly passesBefore?: readonly string[];
  readonly passesBeforeCapitalized?: readonly string[];
  readonly passesNearDate?: true;
  readonly bannedOnlyAfter?: readonly string[];
  readonly bannedBesideDateMask?: true;
  /** The `passesAfter` words after which a classifier from `countedNouns` makes the word a count (`cả năm phòng`). */
  readonly countedAfter?: readonly string[];
  readonly countedNouns?: readonly string[];
  /** Only the capitalized word is a violation: `may` is a common verb. */
  readonly passesLowercase?: true;
  /** A capitalized word after it reads as a person (`from May Demo`), since a month name holds no figure. */
  readonly passesBeforeName?: readonly string[];
  readonly bannedOnlyNearNumber?: true;
  /**
   * The only contexts where the word states no figure (`hai bên ký`, parties to a contract; `ba mẹ vẫn`, parents), one
   * phrase of lower-case words each, and the table names what may stand around it, never what may not. A first
   * `@^|để` entry is the list of words that may come right before the phrase: `^` is a sentence start (the text start, after
   * `.`, `!`, `?` or a line break), and `,` and `:` mean right after that mark (a bold label's colon reads as `:` in the shown text); a quote mark or any other
   * punctuation between that word and the phrase fails it. A last `+ký|thỏa|$` is the list of words that may come next,
   * and `$` lets the clause end there; with no `$`, a word from the list must follow (`hai bên thuê`, `mẹ và ba căn`
   * and `hai bên.` are counts). A `-có|#` entry names the words that may not come before (`#` is any
   * number word), alone for a phrase that a noun can lead (`hợp đồng giữa hai bên`) and so has no list to name, and beside a
   * `@` list where a comma lead must not follow a quantifier (`thêm, cả hai bên ký`).
   */
  readonly passesInPhrases?: readonly string[];
};

const plain = (kind: WordKind, words: string): Array<[string, WordRow]> => words.split(' ').map((word) => [word, { kind }]);
const letters = (kind: WordKind, words: string): Array<[string, WordRow]> => words.split(' ').map((word) => [word, { kind, bannedOnlyNearNumber: true }]);

const CLASSIFIERS = 'phòng căn lô thửa tầng dãy tòa gian ngày tuần tháng giờ lần'.split(' ');

/** What may come before `hai bên`, and before `cả hai` and `ba mẹ` (`nhưng ba mẹ`, `nếu cả hai`). A count has a quantifier before it, and none is here. */
const LEAD_PARTIES = '^|để|khi|nếu';
const LEAD_BOTH = '^|,|nhưng|vì|nếu|khi|để';
const LEAD_PARENTS = '^|:|nhưng|vì|nếu|khi|để';
/** After these a clause may end (`tài sản của cả hai.`); `Tổng số bên thuê là hai bên.` has none of them. */
const LEAD_ENDS = 'của|giữa';
/** Before `giữa hai bên` and `của hai bên` stands a noun (`hợp đồng giữa hai bên`), so only the words that put a count there are named. */
const COUNTING = 'có|còn|thêm|tới|đến|được|chỉ|tổng|cộng|là|với|cho|từ|đã';
/** The first words of what two parties do together: `hai bên thuê` counts tenants, so no verb that opens a count is here. */
const PARTY_ACTS = 'ký thỏa thống đồng cam xác thương bàn cùng đều tự'.split(' ').join('|');
/** What parents or both do next, none of which can be counted (`ba mẹ căn`, `mẹ và ba người`, `ba và mẹ con` are counts). */
const PARENT_NEXT = 'vẫn không còn muốn cũng đều đã sẽ đang luôn thì và của để cho đứng'.split(' ').join('|');
const BOTH_NEXT = 'đều cùng đã không phải có sẽ cũng nên thì'.split(' ').join('|');
const END = '|$';
const PARENTS = ['ba mẹ', 'ba hoặc mẹ', 'ba và mẹ', 'mẹ hoặc ba', 'mẹ và ba'];

const EXCEPTIONS: Readonly<Record<string, WordRow>> = {
  ty: { kind: 'amount', passesAfter: ['công'] },
  ti: { kind: 'amount', passesBefore: ['vi'] },
  tỷ: { kind: 'amount', passesBefore: ['lệ', 'suất', 'giá'] },
  tỉ: { kind: 'amount', passesBefore: ['lệ', 'suất', 'giá', 'mỉ'] },
  đồng: {
    kind: 'currency',
    passesAfter: ['hợp', 'cộng', 'hội', 'bất', 'tương', 'cánh'],
    passesBefore: ['hồ', 'ý', 'thời', 'bộ', 'nghĩa', 'đều', 'nghiệp', 'sở', 'thừa', 'thuận', 'tình', 'chủ', 'thuê', 'bằng', 'phục', 'nai', 'tháp', 'xoài', 'hới', 'hành'],
  },
  đô: { kind: 'currency', passesAfter: ['thủ'], passesBefore: ['thị'] },
  xu: { kind: 'currency', passesBefore: ['hướng', 'thế'] },
  tư: { kind: 'number', passesAfter: ['đầu', 'riêng', 'thông'], passesBefore: ['nhân', 'vấn', 'cách', 'liệu', 'duy', 'pháp'] },
  năm: {
    kind: 'number',
    passesNearDate: true,
    passesAfter: ['hằng', 'hàng', 'mỗi', 'cả', 'trong', 'cuối', 'đầu', 'giữa', 'của', 'các', 'nhiều', 'theo', 'từng', 'lâu', 'vài', 'mấy', 'quanh', 'một'],
    countedAfter: ['cả', 'trong', 'các', 'của'],
    countedNouns: CLASSIFIERS,
    passesBefore: ['nay', 'ngoái', 'sau', 'tới', 'trước', 'qua', 'rồi', 'mới', 'kia', 'đó', 'này', 'dương', 'âm', 'tính', 'tài', 'học', 'đầu', 'cuối', 'thuế', 'vừa'],
    passesBeforeCapitalized: ['Căn'],
  },
  một: {
    kind: 'number',
    bannedOnlyAfter: ['mùng', 'mồng', 'tháng', 'quận', 'số'],
    passesAfterPhrase: ['tiên số', 'đề số', 'lo số', 'tố số', 'là số'],
    passesBefore: ['lần', 'số', 'vài', 'phần', 'cách', 'chút', 'ít'],
  },
  mốt: { kind: 'number', passesAfter: ['ngày'] },
  nhất: { kind: 'number', bannedOnlyAfter: ['thứ'] },
  nhật: { kind: 'date', bannedOnlyAfter: ['chủ'] },
  linh: { kind: 'number', passesBefore: ['hoạt', 'kiện', 'tinh'] },
  ba: {
    kind: 'number',
    passesAfterPhrase: ['bên thứ'],
    passesInPhrases: PARENTS.flatMap((parents) => [`@${LEAD_PARENTS} ${parents} +${PARENT_NEXT}`, `@${LEAD_ENDS}|cả ${parents} +${PARENT_NEXT}${END}`]),
  },
  hai: {
    kind: 'number',
    passesInPhrases: [
      `@${LEAD_PARTIES} hai bên +${PARTY_ACTS}`,
      ...['giữa', 'của'].flatMap((lead) => [`-${COUNTING} ${lead} hai bên +${PARTY_ACTS}${END}`, `-${COUNTING} ${lead} hai bên có thỏa`]),
      `@${LEAD_BOTH} -${COUNTING} cả hai bên +${PARTY_ACTS}`,
      `@${LEAD_ENDS} cả hai bên +${PARTY_ACTS}${END}`,
      `@${LEAD_BOTH} -${COUNTING} cả hai bên có thể cùng`,
      `@${LEAD_BOTH} -${COUNTING} cả hai +${BOTH_NEXT}`,
      `@${LEAD_ENDS} cả hai +${BOTH_NEXT}${END}`,
    ],
  },
  trăm: { kind: 'amount', passesInPhrases: ['-#|không phần trăm'] },
  chín: { kind: 'number', passesBefore: ['chắn'] },
  second: { kind: 'number', passesBefore: ['opinion', 'opinions'] },
  double: { kind: 'number', passesBefore: ['check', 'checks', 'checked', 'checking'] },
  lẻ: { kind: 'number', passesAfter: ['bán'] },
  may: {
    kind: 'date',
    bannedOnlyAfter: ['in', 'on', 'of', 'by', 'until', 'till', 'since', 'during', 'from', 'last', 'next', 'mid', 'before', 'after', 'tháng', 'for', 'this', 'to', 'through', 'early', 'late', 'vào', 'từ', 'đến'],
    passesBeforeName: ['by', 'from', 'to', 'for', 'từ', 'đến'],
    passesLowercase: true,
    bannedBesideDateMask: true,
  },
  đôi: { kind: 'number', passesBefore: ['khi', 'chút'] },
};

const MONTHS = 'january february march april june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec';

export const WORDS: ReadonlyMap<string, WordRow> = new Map([
  ...plain('amount', 'triệu trieu tr trđ trd nghìn nghin ngàn ngan trăm tram chục chuc vạn củ lít xị tỏi cành bil bn mn mil mio mln mm'),
  ...plain('amount', 'thousand thousands million millions billion billions trillion trillions hundred hundreds grand score'),
  ...letters('amount', 'k m b'),
  ...plain('currency', 'dong dongs đ vnd vnđ usd eur dollar dollars euro euros cent cents percent percentage pct bp bps pp'),
  ...letters('currency', 'd'),
  ...plain('number', 'hai bốn lăm nhăm sáu bảy bẩy tám mười mươi hăm rưỡi rưởi nửa tá nhì'),
  ...plain('number', 'zero nought nil two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'),
  ...plain('number', 'twenty thirty forty fifty sixty seventy eighty ninety dozen dozens half halves quarter quarters twice thrice triple twofold threefold'),
  ...plain('number', 'third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth'),
  ...plain('number', 'eighteenth nineteenth twentieth thirtieth hundredth thousandth millionth billionth'),
  ...plain('number', 'twofold threefold fourfold fivefold tenfold hundredfold thousandfold'),
  ...plain('date', `${MONTHS} monday tuesday wednesday thursday friday saturday sunday fortnight giêng chạp rằm`),
  ...Object.entries(EXCEPTIONS),
]);

/** The reading of one `passesInPhrases` entry around a token; `gap(i)` is the text between token `i - 1` and token `i`, led by a line break when `i` is the first token. */
export type PhraseReader<T extends { readonly lower: string }> = {
  readonly tokens: readonly T[];
  readonly at: number;
  readonly gap: (index: number) => string;
  /** Whether two tokens touch with a space or a hyphen only. */
  readonly spaced: (left: T | undefined, right: T | undefined) => boolean;
  readonly isNumber: (token: T) => boolean;
};

const SENTENCE_START = /[.!?\n][\s*_#>\-"'“”‘’()[\]]*$/u;
const AFTER_MARK: Readonly<Record<string, RegExp>> = { ',': /^,\s*$/u, ':': /^:\s*$/u };

/** Whether the `passesInPhrases` entry `phrase` reads around the token at `at`. */
export function phraseAround<T extends { readonly lower: string }>(phrase: string, { tokens, at, gap, spaced, isNumber }: PhraseReader<T>): boolean {
  const parts = phrase.split(' ');
  const heads: string[] = [];
  while (/^[@-]/u.test(parts[0] ?? '')) heads.push(parts.shift() ?? '');
  const tail = parts.at(-1)?.startsWith('+') === true ? (parts.pop() ?? '').slice(1).split('|') : undefined;
  return parts.some((word, k) => {
    const start = at - k;
    if (word !== tokens[at]?.lower || !parts.every((expected, j) => tokens[start + j]?.lower === expected && (j === 0 || spaced(tokens[start + j - 1], tokens[start + j])))) return false;
    const [before, between] = [tokens[start - 1], gap(start)];
    const allowed = heads.find((head) => head.startsWith('@'))?.slice(1).split('|');
    const denied = heads.find((head) => head.startsWith('-'))?.slice(1).split('|');
    const touching = spaced(before, tokens[start]) ? before : undefined;
    if (allowed !== undefined && !allowed.some((lead) => (lead === '^' ? SENTENCE_START.test(between) : AFTER_MARK[lead]?.test(between) ?? lead === touching?.lower))) return false;
    if (denied !== undefined && before !== undefined && !/[.!?\n]/u.test(between) && denied.some((lead) => (lead === '#' ? isNumber(before) : lead === before.lower))) return false;
    if (tail === undefined) return true;
    const [last, after] = [tokens[start + parts.length - 1], tokens[start + parts.length]];
    const follows = after !== undefined && spaced(last, after);
    return follows ? tail.includes(after.lower) : tail.includes('$');
  });
}

export const ROMAN_LABELS: ReadonlySet<string> = new Set('quý tầng dãy khu phòng điều khoản phần đoạn quận phase part article section room floor'.split(' '));
export const ROMAN_ACRONYMS: ReadonlySet<string> = new Set('MIX CD CV DC MC MD XL'.split(' '));
/** Lower-case `vi` and `xi` are also words (`vi phạm`, `xi măng`), so they are numerals only with no word after them. */
export const ROMAN_WORDS: ReadonlySet<string> = new Set(['vi', 'xi']);

const SEGMENT_KINDS: ReadonlySet<WordKind> = new Set(['number', 'amount', 'currency']);
const NON_ASCII = /\P{ASCII}/u;
/** `grand` would make `Grandeur` a number word glued to `eur`. */
const NOT_SEGMENTS: ReadonlySet<string> = new Set(['grand']);
const SEGMENTS: ReadonlySet<string> = new Set([
  ...[...WORDS]
    .filter(([word, row]) => SEGMENT_KINDS.has(row.kind) && row.bannedOnlyNearNumber !== true && !NOT_SEGMENTS.has(word) && (word.length >= 3 || word === 'ba' || NON_ASCII.test(word)))
    .map(([word]) => word),
  'một',
  'one',
]);
/** Words that serve as articles or names, so a run of only these (`oneone`, `baba`) is not a number. */
const WEAK_SEGMENTS: ReadonlySet<string> = new Set(['một', 'one', 'ba']);
const LONGEST_SEGMENT = Math.max(...[...SEGMENTS].map((word) => word.length));

/** Two or more table words with nothing between them, at least one of which is not an article or `ba` (`batriệu`, `haitỷ`, `ba'triệu`). */
export function isGluedNumber(token: string): boolean {
  const word = token.replace(/['’]/gu, '');
  if (word.length < 4) return false;
  const reaches = [true];
  const reachesCounting = [false];
  for (let end = 1; end <= word.length; end += 1) {
    for (let start = Math.max(0, end - LONGEST_SEGMENT); start < end; start += 1) {
      const segment = word.slice(start, end);
      if (reaches[start] !== true || !SEGMENTS.has(segment)) continue;
      reaches[end] = true;
      if (reachesCounting[start] === true || !WEAK_SEGMENTS.has(segment)) reachesCounting[end] = true;
    }
  }
  return reachesCounting[word.length] === true;
}
