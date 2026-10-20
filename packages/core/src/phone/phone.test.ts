import { describe, expect, it } from 'vitest';
import { formatPhone, normalizePhone, phoneForZaloLink, phoneText, zaloChatUrl, type Phone } from './index';

function phone(text: string): Phone {
  const result = normalizePhone(text);
  if (!result.ok) throw new Error(`expected ${text} to normalize`);
  return result.value;
}

describe('normalizePhone', () => {
  it.each(['0903123456', '+84903123456', '84903123456'])('normalizes the DOMAIN-VN §9 form %s', (text) => {
    expect(normalizePhone(text)).toEqual({ ok: true, value: '+84903123456' });
  });

  it.each([
    ['0903 123 456', '+84903123456'],
    ['0903.123.456', '+84903123456'],
    ['(+84) 903-123-456', '+84903123456'],
    ['+84 0903 123 456', '+84903123456'],
    ['0084903123456', '+84903123456'],
    ['028 3823 4567', '+842838234567'],
  ])('normalizes %s', (text, value) => {
    expect(normalizePhone(text)).toEqual({ ok: true, value });
  });

  it.each([
    ['', 'empty'],
    ['abc', 'invalid'],
    ['903123456', 'invalid'],
    ['090312345', 'invalid'],
    ['09031234567', 'invalid'],
    ['0103123456', 'invalid'],
    ['+1 415 555 0100', 'invalid'],
  ])('rejects %s as %s', (text, reason) => {
    expect(normalizePhone(text)).toEqual({ ok: false, reason });
  });
});

describe('formatPhone', () => {
  it('matches DOMAIN-VN §9', () => {
    expect(formatPhone(phone('+84903123456'))).toBe('0903 123 456');
  });

  it('groups landlines as area code, then two groups of four', () => {
    expect(formatPhone(phone('02838234567'))).toBe('028 3823 4567');
  });
});

describe('phoneText', () => {
  it('shows a stored phone as Mẹ reads it, one stored some other way as it was, and none as none', () => {
    expect(phoneText('+84903123456')).toBe('0903 123 456');
    expect(phoneText('Zalo 0901')).toBe('Zalo 0901');
    expect(phoneText(null)).toBeNull();
  });
});

describe('phoneForZaloLink', () => {
  it('matches DOMAIN-VN §9', () => {
    expect(phoneForZaloLink(phone('+84903123456'))).toBe('0903123456');
  });
});

describe('zaloChatUrl', () => {
  it('opens the chat with the local number (LSE-11)', () => {
    expect(zaloChatUrl(phone('+84 901 111 005'))).toBe('https://zalo.me/0901111005');
    expect(zaloChatUrl(phone('0283 812 3456'))).toBe('https://zalo.me/02838123456');
  });
});
