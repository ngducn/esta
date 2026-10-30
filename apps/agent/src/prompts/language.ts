import type { Locale } from '@esta/core/format';

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

/** Vietnamese words typed without their marks. A word with a mark needs no entry: any mark makes a word Vietnamese. */
const VIETNAMESE = wordSet(
  'khong co la cua va bao nhieu nao gi thi duoc cho nay da chua nen hay voi cac nhung toi thu tien thang nam viet tin nhan dong nhac gia han ban sao ai dau gio muon lam giup hoi tra tu lai roi khach thue phong nha ngay xem gui nop dien nuoc tre loi vao ra xin vui con anh chi em bac chu cau di mot ba nguoi ve tai san dat',
);

const VIETNAMESE_MARK = /[\u0300-\u0303\u0306\u0309\u031b\u0323]|đ/u;
const hasMark = (word: string): boolean => VIETNAMESE_MARK.test(word.normalize('NFD'));

/**
 * The language to reply in: English when the message is clearly English, Vietnamese when it holds a Vietnamese word
 * (marked or not), and otherwise `fallback`, the language the household reads.
 */
export function replyLanguage(message: string, fallback: Locale): Locale {
  const words = message.normalize('NFC').toLowerCase().match(/\p{L}+/gu) ?? [];
  const english = words.filter((word) => ENGLISH.has(word)).length;
  const vietnamese = words.filter((word) => hasMark(word) || VIETNAMESE.has(word)).length;
  if (english >= RULE.minEnglishWords && english >= RULE.englishPerVietnameseWord * vietnamese) return 'en';
  return vietnamese > 0 ? 'vi' : fallback;
}
