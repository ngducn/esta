import { describe, expect, it } from 'vitest';
import { resolveLocale } from './locale';

describe('resolveLocale', () => {
  it('prefers the member locale over the cookie', () => {
    expect(resolveLocale({ memberLocale: 'en', cookieLocale: 'vi' })).toBe('en');
    expect(resolveLocale({ memberLocale: 'vi', cookieLocale: 'en' })).toBe('vi');
  });

  it('uses a valid cookie when the member has no locale', () => {
    expect(resolveLocale({ memberLocale: null, cookieLocale: 'en' })).toBe('en');
  });

  it('falls back to vi for an unknown cookie value', () => {
    expect(resolveLocale({ memberLocale: null, cookieLocale: 'fr' })).toBe('vi');
    expect(resolveLocale({ memberLocale: null, cookieLocale: 'EN' })).toBe('vi');
    expect(resolveLocale({ memberLocale: null, cookieLocale: '' })).toBe('vi');
  });

  it('defaults to vi with no member locale and no cookie', () => {
    expect(resolveLocale({ memberLocale: null, cookieLocale: undefined })).toBe('vi');
  });
});
