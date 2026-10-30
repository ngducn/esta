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

/** SPEC D11: a pasted or typed ID number keeps only its last four digits, so the full number is never held. */
export function idLast4(text: string): string {
  return text.replace(/[^0-9]/g, '').slice(-4);
}
