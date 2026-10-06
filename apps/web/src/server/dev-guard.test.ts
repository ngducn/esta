import { describe, expect, test } from 'vitest';
import { isDevSurfaceEnabled } from './dev-guard';
import type { EstaEnv } from './env-schema';

const expected: Record<EstaEnv, boolean> = {
  development: true,
  test: true,
  preview: true,
  production: false,
};

describe('isDevSurfaceEnabled', () => {
  test.each(Object.entries(expected) as [EstaEnv, boolean][])('ESTA_ENV=%s gives %s', (estaEnv, enabled) => {
    expect(isDevSurfaceEnabled({ ESTA_ENV: estaEnv })).toBe(enabled);
  });
});
