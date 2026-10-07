import type { Result } from '../result';

declare const phoneBrand: unique symbol;

/** A Vietnamese number in E.164 form, such as `+84903123456`. */
export type Phone = string & { readonly [phoneBrand]: true };

export type PhoneReason = 'empty' | 'invalid';

const SEPARATORS = /[\s.()-]/g;
const PREFIXED = /^(?:\+84|0084|84)0?(\d{9,10})$/;
const NATIONAL = /^0(\d{9,10})$/;
const MOBILE = /^[35789]\d{8}$/;
const LANDLINE = /^2\d{9}$/;

export function normalizePhone(text: string): Result<Phone, PhoneReason> {
  const compact = text.replace(SEPARATORS, '');
  if (compact === '') return { ok: false, reason: 'empty' };
  const subscriber = (PREFIXED.exec(compact) ?? NATIONAL.exec(compact))?.[1];
  if (subscriber === undefined || !(MOBILE.test(subscriber) || LANDLINE.test(subscriber))) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, value: `+84${subscriber}` as Phone };
}

function national(phone: Phone): string {
  return `0${phone.slice(3)}`;
}

/** Mobiles read `0903 123 456`; landlines read `028 3823 4567`. */
export function formatPhone(phone: Phone): string {
  const digits = national(phone);
  return digits.length === 10
    ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
    : `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
}

/** [verify] DOMAIN-VN §9: `https://zalo.me/{phone}` takes the local form; confirm in LSE-11. */
export function phoneForZaloLink(phone: Phone): string {
  return national(phone);
}
