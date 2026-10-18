import { describe, expect, it } from 'vitest';
import { parseNewPassword, parsePassword } from './password';

describe('parseNewPassword', () => {
  it.each([
    ['12345678', '12345678'],
    ['  spaces  ', '  spaces  '],
    ['mật khẩu', 'mật khẩu'],
    ['a'.repeat(72), 'a'.repeat(72)],
  ])('accepts %j as is', (text, password) => {
    expect(parseNewPassword(text)).toEqual({ ok: true, value: password });
  });

  it('stores a decomposed Vietnamese letter as the precomposed one', () => {
    const decomposed = 'mật-khau-01';
    expect(parseNewPassword(decomposed)).toEqual({ ok: true, value: 'mật-khau-01' });
  });

  it.each(['', '1234567', 'ăâêôơư1'])('refuses %j as shorter than 8 characters', (text) => {
    expect(parseNewPassword(text)).toEqual({ ok: false, reason: 'short' });
  });

  it('counts characters, not bytes, toward the minimum', () => {
    expect(parseNewPassword('ăâêôơưđ1')).toEqual({ ok: true, value: 'ăâêôơưđ1' });
  });

  it.each(['a'.repeat(73), 'ư'.repeat(37)])('refuses a password over 72 bytes', (text) => {
    expect(parseNewPassword(text)).toEqual({ ok: false, reason: 'long' });
  });
});

describe('parsePassword', () => {
  it('refuses an empty password', () => {
    expect(parsePassword('')).toEqual({ ok: false, reason: 'missing' });
  });

  it('keeps spaces and normalizes to NFC the same way a new password is stored', () => {
    const typed = ' mật-khau-01 ';
    const stored = parseNewPassword(typed);
    expect(parsePassword(typed)).toEqual(stored);
  });
});
