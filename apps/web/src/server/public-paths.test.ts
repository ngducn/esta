import { describe, expect, it } from 'vitest';
import { isPublicPath } from './public-paths';

describe('isPublicPath', () => {
  it.each(['/sign-in', '/sign-in/callback', '/api/cron/keep-alive', '/api/test/clock', '/dev', '/dev/core', '/dev/i18n'])(
    'lets a signed-out request reach %s',
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it.each(['/', '/onboarding', '/sign-in/extra', '/sign-inx', '/developer', '/api/cron', '/api/other', '/devices'])(
    'sends a signed-out request for %s to sign-in',
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );
});
