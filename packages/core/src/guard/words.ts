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
  readonly notPassIfCountedNounFollows?: readonly string[];
  readonly bannedOnlyNearNumber?: true;
};

const plain = (kind: WordKind, words: string): Array<[string, WordRow]> => words.split(' ').map((word) => [word, { kind }]);
const letters = (kind: WordKind, words: string): Array<[string, WordRow]> => words.split(' ').map((word) => [word, { kind, bannedOnlyNearNumber: true }]);

const COUNTED = 'phòng căn nhà người khách hợp lô thửa tầng dãy khu bên tòa đất sổ hộ cửa gian chỗ xe ngày tuần tháng giờ lần khoản bản trang dòng mục điều'.split(' ');

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
    notPassIfCountedNounFollows: COUNTED,
    passesBefore: ['nay', 'ngoái', 'sau', 'tới', 'trước', 'qua', 'rồi', 'mới', 'kia', 'đó', 'này', 'dương', 'âm', 'tính', 'tài', 'học', 'đầu', 'cuối', 'thuế', 'vừa'],
    passesBeforeCapitalized: ['Căn'],
  },
  một: { kind: 'number', bannedOnlyAfter: ['mùng', 'mồng', 'tháng', 'quận', 'số'], passesBefore: ['lần'] },
  mốt: { kind: 'number', passesAfter: ['ngày'] },
  nhất: { kind: 'number', bannedOnlyAfter: ['thứ'] },
  nhật: { kind: 'date', bannedOnlyAfter: ['chủ'] },
  linh: { kind: 'number', passesBefore: ['hoạt', 'kiện', 'tinh'] },
  ba: { kind: 'number', passesAfterPhrase: ['bên thứ'] },
  chín: { kind: 'number', passesBefore: ['chắn'] },
  second: { kind: 'number', passesBefore: ['opinion', 'opinions'] },
  double: { kind: 'number', passesBefore: ['check', 'checks', 'checked', 'checking'] },
  lẻ: { kind: 'number', passesAfter: ['bán'] },
  may: { kind: 'date', bannedOnlyAfter: ['in', 'of', 'by', 'until', 'till', 'since', 'during', 'from', 'last', 'next', 'mid', 'before', 'after'], bannedBesideDateMask: true },
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
  ...plain('number', 'eighteenth nineteenth twentieth thirtieth hundredth'),
  ...plain('date', `${MONTHS} monday tuesday wednesday thursday friday saturday sunday fortnight giêng chạp rằm`),
  ...Object.entries(EXCEPTIONS),
]);

export const ROMAN_LABELS: ReadonlySet<string> = new Set('quý tầng dãy khu phòng điều khoản phần đoạn quận phase part article section room floor'.split(' '));
export const ROMAN_ACRONYMS: ReadonlySet<string> = new Set('MIX CD CV DC MC MD XL'.split(' '));

const SEGMENT_KINDS: ReadonlySet<WordKind> = new Set(['number', 'amount', 'currency']);
const SEGMENTS: ReadonlySet<string> = new Set([
  ...[...WORDS].filter(([word, row]) => SEGMENT_KINDS.has(row.kind) && row.bannedOnlyNearNumber !== true && (word.length >= 3 || word === 'ba')).map(([word]) => word),
  'một',
  'one',
]);
const ARTICLES: ReadonlySet<string> = new Set(['một', 'one']);
const LONGEST_SEGMENT = Math.max(...[...SEGMENTS].map((word) => word.length));

export function isGluedNumber(word: string): boolean {
  if (word.length < 5 || WORDS.has(word)) return false;
  const reach: Array<readonly string[] | undefined> = [[]];
  for (let end = 1; end <= word.length; end += 1) {
    for (let start = Math.max(0, end - LONGEST_SEGMENT); start < end; start += 1) {
      const before = reach[start];
      const segment = word.slice(start, end);
      if (before !== undefined && SEGMENTS.has(segment)) {
        reach[end] = [...before, segment];
        break;
      }
    }
  }
  const parts = reach[word.length];
  return parts !== undefined && parts.length >= 2 && parts.some((part) => !ARTICLES.has(part));
}
