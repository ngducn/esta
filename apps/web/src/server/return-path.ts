export const RETURN_COOKIE = 'esta_return';
export const RETURN_MAX_AGE_SECONDS = 30 * 60;

/** A place to land after sign-in: a path on this app, never another origin, a protocol-relative link or a sign-in page. */
export function safeReturnPath(value: string | undefined): string | null {
  if (value === undefined || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || [...value].some((character) => (character.codePointAt(0) ?? 0) < 32)) return null;
  return /^\/(sign-in|sign-up|forgot-password)(\/|\?|$)/.test(value) ? null : value;
}
