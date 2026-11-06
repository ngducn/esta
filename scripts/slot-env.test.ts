import { describe, expect, it } from 'vitest';
import { secretValues } from './slot-env.ts';

describe('secretValues', () => {
  it('picks the secret keys and leaves the anon and publishable keys out', () => {
    const status = {
      ANON_KEY: 'anon',
      PUBLISHABLE_KEY: 'pub',
      SERVICE_ROLE_KEY: 'service',
      SECRET_KEY: 'secret',
      JWT_SECRET: 'jwt',
      S3_PROTOCOL_ACCESS_KEY_SECRET: 's3',
      API_URL: 'http://127.0.0.1:54321',
    };
    expect(secretValues(status)).toEqual(['service', 'secret', 'jwt', 's3']);
  });

  it('skips a key the stack does not report or reports empty', () => {
    expect(secretValues({ SERVICE_ROLE_KEY: 'service', JWT_SECRET: '' })).toEqual(['service']);
  });
});
