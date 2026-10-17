import { foldVietnamese } from '../search/fold';

export const PROPERTY_CODE_MAX_LENGTH = 8;

const FALLBACK = 'TS';

function baseCode(nickname: string): string {
  const words = foldVietnamese(nickname.normalize('NFC'))
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((word) => word !== '');
  const numbered = words.findLastIndex((word) => /[0-9]/.test(word));
  if (numbered !== -1) {
    const word = words[numbered] ?? '';
    const previous = words[numbered - 1];
    return /^[0-9]+$/.test(word) && previous !== undefined ? `${previous[0]}${word}` : word;
  }
  if (words.length === 1) return words[0] ?? FALLBACK;
  return words.length === 0 ? FALLBACK : words.map((word) => word[0]).join('');
}

/**
 * The code invoice numbers carry, read from the nickname the way the family already says it: the numbered word when
 * there is one (`Nhà phố Q7` gives `Q7`, `Mặt bằng Quận 1` gives `Q1`), else the initials (`Kho Biên Hòa` gives
 * `KBH`). A code already in the household gets the first free numeric suffix, trimmed so it stays within 8 characters.
 */
export function suggestPropertyCode(nickname: string, existingCodes: Iterable<string>): string {
  const taken = new Set(Array.from(existingCodes, (code) => code.toUpperCase()));
  const base = baseCode(nickname).slice(0, PROPERTY_CODE_MAX_LENGTH);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = String(n);
    const candidate = `${base.slice(0, PROPERTY_CODE_MAX_LENGTH - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
