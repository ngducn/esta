import type { Result } from '../result';

declare const otpBrand: unique symbol;

/** The 6-digit code from the sign-in email (SPEC D8). */
export type OtpCode = string & { readonly [otpBrand]: true };

const OTP = /^\d{6}$/;

/** Phones paste codes as `123 456` or with a trailing newline, so whitespace anywhere is dropped. */
export function parseOtpInput(text: string): Result<OtpCode, 'invalid'> {
  const compact = text.replace(/\s/g, '');
  return OTP.test(compact) ? { ok: true, value: compact as OtpCode } : { ok: false, reason: 'invalid' };
}
