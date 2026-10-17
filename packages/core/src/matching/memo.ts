import { foldVietnamese } from '../search/fold';

export const MEMO_PREFIX = 'ESTA';
export const MEMO_CODE_LENGTH = 8;

const MEMO_CODE = new RegExp(`^[A-Z0-9]{${MEMO_CODE_LENGTH}}$`);

/** The form P3-05 issues memo codes in: 8 characters of A to Z and 0 to 9. */
export function isMemoCode(code: string): boolean {
  return MEMO_CODE.test(code);
}

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
