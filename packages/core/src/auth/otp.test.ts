import { describe, expect, it } from 'vitest';
import { parseOtpInput } from './otp';

describe('parseOtpInput', () => {
  it.each([
    ['123456', '123456'],
    ['123 456', '123456'],
    [' 123456\n', '123456'],
    ['12 34 56', '123456'],
    ['000000', '000000'],
  ])('accepts %j as %s', (text, code) => {
    expect(parseOtpInput(text)).toEqual({ ok: true, value: code });
  });

  it.each(['', '12345', '1234567', '12345a', 'abcdef', '123-456', '１２３４５６'])('refuses %j', (text) => {
    expect(parseOtpInput(text)).toEqual({ ok: false, reason: 'invalid' });
  });
});
