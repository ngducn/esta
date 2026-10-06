type NameParts = { given: string; middle: string; family: string };

function nameParts(fullName: string): NameParts {
  const words = fullName.trim().split(/\s+/).filter((word) => word !== '');
  if (words.length <= 1) return { given: words[0] ?? '', middle: '', family: '' };
  return { given: words.at(-1) ?? '', middle: words.slice(1, -1).join(' '), family: words[0] ?? '' };
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
