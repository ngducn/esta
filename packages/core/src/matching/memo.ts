import { foldVietnamese } from '../search/fold';

export const MEMO_PREFIX = 'ESTA';
export const MEMO_CODE_LENGTH = 8;

/** Uppercase ASCII letters and digits only, the form a bank may deliver a memo in (DOMAIN-VN §9). */
export function normalizeDescription(description: string): string {
  return foldVietnamese(description)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Every issued memo code that follows an `ESTA` in the description. Each occurrence is checked,
 * because with spaces removed `ESTA` also appears inside words such as `FIESTA`.
 */
export function findMemoCodes(description: string, issuedCodes: ReadonlySet<string>): string[] {
  const text = normalizeDescription(description);
  const found = new Set<string>();
  for (let at = text.indexOf(MEMO_PREFIX); at !== -1; at = text.indexOf(MEMO_PREFIX, at + 1)) {
    const start = at + MEMO_PREFIX.length;
    const candidate = text.slice(start, start + MEMO_CODE_LENGTH);
    if (issuedCodes.has(candidate)) found.add(candidate);
  }
  return [...found];
}
