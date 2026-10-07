import { describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { parseThemePreference } = await import('./theme');

describe('parseThemePreference', () => {
  test.each(['light', 'dark', 'system'] as const)('keeps %s', (theme) => {
    expect(parseThemePreference(theme)).toBe(theme);
  });

  test.each([undefined, '', 'Dark', 'sepia'])('falls back to system for %j', (value) => {
    expect(parseThemePreference(value)).toBe('system');
  });
});
