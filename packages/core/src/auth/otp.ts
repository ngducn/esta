import type { Result } from '../result';

declare const otpBrand: unique symbol;

export type OtpCode = string & { readonly [otpBrand]: true };

const OTP = /^\d{6}$/;

export function parseOtpInput(text: string): Result<OtpCode, 'invalid'> {
  const compact = text.replace(/\s/g, '');
  return OTP.test(compact) ? { ok: true, value: compact as OtpCode } : { ok: false, reason: 'invalid' };
}
