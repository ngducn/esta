import type { Result } from '../result';

declare const passwordBrand: unique symbol;

/** NFC, so a Vietnamese letter typed as one code point on a phone and as base plus mark on a laptop is one password. */
export type Password = string & { readonly [passwordBrand]: true };

export const PASSWORD_MIN_CHARACTERS = 8;
/** bcrypt reads at most 72 bytes, and Supabase Auth refuses a longer password. */
const PASSWORD_MAX_BYTES = 72;

export function parsePassword(text: string): Result<Password, 'missing'> {
  const password = text.normalize('NFC');
  return password === '' ? { ok: false, reason: 'missing' } : { ok: true, value: password as Password };
}

export function parseNewPassword(text: string): Result<Password, 'short' | 'long'> {
  const password = text.normalize('NFC');
  if ([...password].length < PASSWORD_MIN_CHARACTERS) return { ok: false, reason: 'short' };
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return { ok: false, reason: 'long' };
  return { ok: true, value: password as Password };
}
