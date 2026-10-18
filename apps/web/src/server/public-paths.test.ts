import { describe, expect, it } from 'vitest';
import { isAuthPage, isPublicPath } from './public-paths';

describe('isPublicPath', () => {
  it.each(['/sign-in', '/sign-in/code', '/sign-up', '/forgot-password', '/sign-in/callback', '/api/cron/keep-alive', '/api/test/clock', '/dev', '/dev/core', '/dev/i18n', '/manifest.webmanifest'])(
    'lets a signed-out request reach %s',
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it.each(['/', '/onboarding', '/sign-in/extra', '/sign-inx', '/sign-up/extra', '/forgot-password/x', '/developer', '/api/cron', '/api/other', '/devices'])(
    'sends a signed-out request for %s to sign-in',
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );

  it.each(['/sign-in', '/sign-in/code', '/sign-up', '/forgot-password'])('sends a signed-in visitor on from %s', (path) => {
    expect(isAuthPage(path)).toBe(true);
  });

  it.each(['/sign-in/callback', '/onboarding', '/', '/dev'])('lets a signed-in visitor stay on %s', (path) => {
    expect(isAuthPage(path)).toBe(false);
  });
});
