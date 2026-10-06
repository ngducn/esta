import type { Env } from './env';

export function isDevSurfaceEnabled(env: Pick<Env, 'ESTA_ENV'>): boolean {
  return env.ESTA_ENV !== 'production';
}
