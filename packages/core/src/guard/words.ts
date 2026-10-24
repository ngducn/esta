export type WordKind = 'amount' | 'currency' | 'number' | 'date';

/**
 * A word the model may not write, keyed by its NFKC lowercase form. It still passes after a word in `allowBefore`
 * or before a word in `allowAfter` (the compound `hợp đồng`), and next to a placeholder when `nearPlaceholder`.
 */
export type WordRow = {
  readonly kind: WordKind;
  readonly allowBefore?: readonly string[];
  readonly allowAfter?: readonly string[];
  readonly nearPlaceholder?: true;
};

const plain = (kind: WordKind, words: string): Array<[string, WordRow]> => words.split(' ').map((word) => [word, { kind }]);

const EXCEPTIONS: Readonly<Record<string, WordRow>> = {
  ty: { kind: 'amount', allowBefore: ['công'] },
  ti: { kind: 'amount', allowAfter: ['vi'] },
  tỷ: { kind: 'amount', allowAfter: ['lệ'] },
  tỉ: { kind: 'amount', allowAfter: ['lệ'] },
  đồng: { kind: 'currency', allowBefore: ['hợp', 'cộng', 'hội'], allowAfter: ['hồ', 'ý', 'thời', 'bộ', 'nghĩa', 'đều', 'nghiệp'] },
  đô: { kind: 'currency', allowBefore: ['thủ'], allowAfter: ['thị'] },
  tư: { kind: 'number', allowBefore: ['đầu', 'riêng'], allowAfter: ['nhân', 'vấn', 'cách', 'liệu', 'duy', 'pháp'] },
  năm: {
    kind: 'number',
    nearPlaceholder: true,
    allowBefore: ['hằng', 'hàng', 'mỗi', 'cả', 'trong', 'cuối', 'đầu', 'giữa', 'của', 'các', 'nhiều', 'theo', 'từng'],
    allowAfter: ['nay', 'ngoái', 'sau', 'tới', 'trước'],
  },
  linh: { kind: 'number', allowAfter: ['hoạt', 'kiện'] },
  lẻ: { kind: 'number', allowBefore: ['bán'] },
  đôi: { kind: 'number', allowAfter: ['khi', 'chút'] },
};

const MONTHS = 'january february march april june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec';

export const WORDS: ReadonlyMap<string, WordRow> = new Map([
  ...plain('amount', 'triệu trieu tr trđ trd nghìn nghin ngàn ngan trăm tram chục chuc vạn củ lít xị tỏi cành bil k m b bn mn mil mio mln mm'),
  ...plain('amount', 'thousand thousands million millions billion billions trillion trillions hundred hundreds grand'),
  ...plain('currency', 'dong dongs đ d vnd vnđ usd eur dollar dollars euro euros cent cents xu percent percentage pct bp bps pp'),
  ...plain('number', 'hai ba bốn lăm nhăm sáu bảy bẩy tám chín mười mươi mốt rưỡi rưởi nửa tá nhì'),
  ...plain('number', 'zero two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'),
  ...plain('number', 'twenty thirty forty fifty sixty seventy eighty ninety dozen dozens half halves quarter quarters twice thrice double triple'),
  ...plain('number', 'second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth'),
  ...plain('date', `${MONTHS} monday tuesday wednesday thursday friday saturday sunday giêng chạp`),
  ...Object.entries(EXCEPTIONS),
]);
