import { foldVietnamese } from '../search/fold';

type NameParts = { given: string; middle: string; family: string };

function nameParts(fullName: string): NameParts {
  const words = fullName.trim().split(/\s+/).filter((word) => word !== '');
  if (words.length <= 1) return { given: words[0] ?? '', middle: '', family: '' };
  return { given: words.at(-1) ?? '', middle: words.slice(1, -1).join(' '), family: words[0] ?? '' };
}

/** The name a person is called by, the last word of a Vietnamese full name: `Hường` in `Nguyễn Thị Hường`. */
export function givenName(fullName: string): string {
  return nameParts(fullName).given;
}

/** Vietnamese names are written family, middle, given; this key reads given, middle, family. */
export function sortKeyVietnameseName(fullName: string): string {
  const { given, middle, family } = nameParts(fullName);
  return [given, middle, family].filter((part) => part !== '').join(' ');
}

const collator = new Intl.Collator('vi');

export function compareVietnameseNames(a: string, b: string): number {
  const left = nameParts(a);
  const right = nameParts(b);
  return (
    collator.compare(left.given, right.given) ||
    collator.compare(left.middle, right.middle) ||
    collator.compare(left.family, right.family)
  );
}

/** NFC, one space, lower case: `Nguyễn  Thị Demo` and `NGUYỄN THỊ DEMO` are one name. */
export function normalizeName(name: string): string {
  return name.normalize('NFC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('vi');
}

const TITLE = /^(?:hộ )?(?:ông|bà) ?:? /u;
const TONE = /[\u0300\u0301\u0303\u0309\u0323]/u;
const TONES = new RegExp(TONE, 'gu');

/**
 * Each word with its tone mark moved to its end, so the old placement (`hoà`, `thuỷ`) and the new (`hòa`, `thủy`)
 * read alike, after a leading `Ông`, `Bà`, `Hộ ông` or `Hộ bà` is dropped.
 */
function nameKey(name: string): string {
  return normalizeName(name)
    .replace(TITLE, '')
    .split(' ')
    .map((word) => {
      const marked = word.normalize('NFD');
      return marked.replace(TONES, '') + (TONE.exec(marked)?.[0] ?? '');
    })
    .join(' ');
}

/**
 * Whether two writings name one person, whatever their case, spacing, title or tone placement, and with no
 * diacritics at all when one side was written without them (`Nguyen Thi Lan`, `NGUYỄN THỊ LAN`).
 */
export function sameName(a: string, b: string): boolean {
  const left = nameKey(a);
  const right = nameKey(b);
  if (left === right) return true;
  const plain = (key: string) => foldVietnamese(key) === key;
  return (plain(left) || plain(right)) && foldVietnamese(left) === foldVietnamese(right);
}

/** SPEC D11: a pasted or typed ID number keeps only its last four digits, so the full number is never held. */
export function idLast4(text: string): string {
  return text.replace(/[^0-9]/g, '').slice(-4);
}
