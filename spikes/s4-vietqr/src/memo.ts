export const MEMO_PREFIX = 'ESTA';
export const MEMO_CODE_LENGTH = 8;

export function memoText(code: string): string {
  return `${MEMO_PREFIX} ${code}`;
}

export function normalizeDescription(description: string): string {
  return description.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function findMemoCodes(description: string, householdCodes: ReadonlySet<string>): string[] {
  const text = normalizeDescription(description);
  const found = new Set<string>();
  for (let i = text.indexOf(MEMO_PREFIX); i !== -1; i = text.indexOf(MEMO_PREFIX, i + 1)) {
    const candidate = text.slice(i + MEMO_PREFIX.length, i + MEMO_PREFIX.length + MEMO_CODE_LENGTH);
    if (householdCodes.has(candidate)) found.add(candidate);
  }
  return [...found];
}
