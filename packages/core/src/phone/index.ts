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

/** The first stored number that reads as a Vietnamese phone, such as a tenant's Zalo number before their phone. */
export function firstPhone(stored: readonly (string | null)[]): Phone | null {
  for (const text of stored) {
    const phone = text === null ? null : normalizePhone(text);
    if (phone?.ok) return phone.value;
  }
  return null;
}

/** A stored phone as Mẹ reads it, `0903 123 456`; one stored some other way shows as it was typed. */
export function phoneText(stored: string | null): string | null {
  if (stored === null) return null;
  const phone = normalizePhone(stored);
  return phone.ok ? formatPhone(phone.value) : stored;
}

/** DOMAIN-VN §9, `Giả định`: `https://zalo.me/{phone}` takes the local form. Zalo publishes no page that confirms it. */
export function phoneForZaloLink(phone: Phone): string {
  return national(phone);
}

/** LSE-11: the link that opens Zalo on the chat with this number. */
export function zaloChatUrl(phone: Phone): string {
  return `https://zalo.me/${phoneForZaloLink(phone)}`;
}
