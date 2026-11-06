import type { Locale } from '@esta/core/format';
import { foldVietnamese } from '@esta/core/search';

/**
 * When a message is English (#348). Mẹ writes Vietnamese with English words mixed in and often types without marks,
 * and an English reply to her is the worse mistake. So a message is English only when English clearly outnumbers
 * Vietnamese: at least `minEnglishWords` English words, and `englishPerVietnameseWord` of them for each Vietnamese one.
 */
const RULE = { minEnglishWords: 3, englishPerVietnameseWord: 2 } as const;

const wordSet = (list: string): ReadonlySet<string> => new Set(list.split(' '));

/**
 * Words that show a message is English. A word is left out when Mẹ borrows it (bill, check, ok, app, deadline, due,
 * overdue, paid, update, file) or when it is also a Vietnamese syllable typed without its marks (be, it, that, than,
 * but, not, can, do, the, to, in, on, no, me, my, an, so, at, he, say, day, go, let, long, loan, don).
 */
const ENGLISH = wordSet(
  [
    'what which who whom whose when where why how is are was were been being have has had will would should could shall might must did does done doing please',
    'of for with without from about after before during over under between against through within around per by into out off your you yours our ours their theirs them they she her his its we there these those this all any some each every both other another same such more most less much many few several enough often only just very also still again already yet once never always maybe really soon today yesterday tomorrow ago and or if because while until since although whether',
    'tell show write give make send draft explain remind reminder reminding message letter short summarize summary compare calculate estimate need want know think find take come look use keep hold move call ask try work live stay leave end start',
    'buy sell selling sold buyer seller sale rent rents rented renting tenant tenants lease leases leased landlord room rooms house apartment property properties land income tax taxes bank mortgage insurance contract deposit notarized notary procedure transfer book price prices market rate rates owner owners owe owed owes money pay pays paying payment payments unpaid vacant renew renewal invest investment document documents certificate ownership legal lawyer broker value worth profit expense expenses cost costs total late help',
    'second third first last next new old good best safe right wrong red cheap cheaper expensive higher lower increase raise reduce small large month months year years week weeks opinion advice',
  ].join(' '),
);

/**
 * English grammar words that are no Vietnamese syllable typed without marks (so not it, to, in, on, no, do, can, the).
 * A message that carries two of them is an English sentence, whatever names it holds (#364).
 */
const FUNCTION_WORDS = wordSet(
  'i you your we they she should could would will shall is are was were has have had does did of for with from about what which who when where why how there these those and or'
);
const MIN_FUNCTION_WORDS = 2;

/** Vietnamese words typed without their marks. A word with a mark needs no entry: any mark makes a word Vietnamese. */
const VIETNAMESE = wordSet(
  'khong co la cua va bao nhieu nao gi thi duoc cho nay da chua nen hay voi cac nhung toi thu tien thang nam viet tin nhan dong nhac gia han ban sao ai dau gio muon lam giup hoi tra tu lai roi khach thue phong nha ngay xem gui nop dien nuoc tre loi vao ra xin vui con anh chi em bac chu cau di mot ba nguoi ve tai san dat',
);

const VIETNAMESE_MARK = /[\u0300-\u0303\u0306\u0309\u031b\u0323]|đ/u;
const hasMark = (word: string): boolean => VIETNAMESE_MARK.test(word.normalize('NFD'));

const TOKEN = /[\p{L}\p{N}]+/gu;
const tokensOf = (text: string): string[] => text.normalize('NFC').toLowerCase().match(TOKEN) ?? [];

/**
 * The tokens of a message without the household's own labels. A name such as "Căn hộ Thủ Đức" or "Phòng 5" is neither
 * language, but each of its marked words would count as Vietnamese. A label matches whole tokens, whatever the case
 * and the marks, and the longest label takes its tokens first.
 */
function withoutLabels(tokens: readonly string[], labels: readonly string[]): { readonly kept: string[]; readonly names: number } {
  const folded = tokens.map(foldVietnamese);
  const names = labels
    .map((label) => tokensOf(label).map(foldVietnamese))
    .filter((name) => name.length > 0)
    .toSorted((a, b) => b.length - a.length);
  const taken = new Set<number>();
  let found = 0;
  for (const name of names) {
    for (let at = 0; at + name.length <= folded.length; at++) {
      if (!name.every((token, offset) => folded[at + offset] === token && !taken.has(at + offset))) continue;
      for (let offset = 0; offset < name.length; offset++) taken.add(at + offset);
      found++;
      at += name.length - 1;
    }
  }
  return { kept: tokens.filter((_, index) => !taken.has(index)), names: found };
}

/**
 * What a message asks for when it opens with a Vietnamese instruction of two words or more, a colon and
 * pasted text, as in
 * `Dịch giúp mẹ: your rent is due tomorrow please pay` (#359): the instruction alone picks the language. A quoted
 * passage is dropped the same way when the words around it hold Vietnamese. Anything else is read whole.
 */
function instruction(message: string, labels: readonly string[]): string {
  const vietnameseWords = (text: string) => withoutLabels(tokensOf(text), labels).kept.filter((token) => hasMark(token) || VIETNAMESE.has(token)).length;
  const unquoted = message.replace(/["“«][^"”»]*["”»]/gu, ' ');
  const [head = '', ...rest] = unquoted.split(':');
  if (rest.length > 0 && vietnameseWords(head) >= 2) return head;
  return vietnameseWords(unquoted) > 0 ? unquoted : message;
}

/**
 * The language to reply in: English when the message is clearly English, Vietnamese when it holds a Vietnamese word
 * (marked or not), and otherwise `fallback`, the language the household reads. `labels` are the household's own
 * property nicknames, unit labels, party names and place names, which count as neither language. Names found count as
 * one Vietnamese word in all, never one each, in a household that reads Vietnamese, unless the message holds two
 * English grammar words (#364): a full English sentence naming a record stays English.
 */
export function replyLanguage(message: string, fallback: Locale, labels: readonly string[] = []): Locale {
  const { kept, names } = withoutLabels(tokensOf(instruction(message, labels)), labels);
  const words = kept.flatMap((token) => token.match(/\p{L}+/gu) ?? []);
  const english = words.filter((word) => ENGLISH.has(word)).length;
  const functionWords = words.filter((word) => FUNCTION_WORDS.has(word)).length;
  const vietnamese = words.filter((word) => hasMark(word) || VIETNAMESE.has(word)).length + (names > 0 && fallback === 'vi' && functionWords < MIN_FUNCTION_WORDS ? 1 : 0);
  if (english >= RULE.minEnglishWords && english >= RULE.englishPerVietnameseWord * vietnamese) return 'en';
  return vietnamese > 0 ? 'vi' : fallback;
}
