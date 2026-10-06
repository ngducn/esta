import { describe, expect, test } from 'vitest';
import { FROZEN_CLOCK_REFUSAL } from '@esta/core';
import { parseEnv } from './env-schema';

const required = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  CRON_SECRET: 'cron-secret',
};

describe('parseEnv', () => {
  test('outside NODE_ENV=production, defaults ESTA_ENV to development and fills the documented defaults', () => {
    expect(parseEnv(required)).toEqual({
      ...required,
      EMAIL_TRANSPORT: 'smtp',
      ESTA_SIGNED_URL_TTL_SECONDS: 300,
      ESTA_GOOGLE_AUTH: 'off',
      ESTA_ENV: 'development',
      ESTA_TIMEZONE: 'Asia/Ho_Chi_Minh',
    });
  });

  test('treats an empty value as unset', () => {
    expect(parseEnv({ ...required, ESTA_ENV: '' }).ESTA_ENV).toBe('development');
  });

  test.each([undefined, ''])('requires ESTA_ENV when NODE_ENV=production (ESTA_ENV=%j)', (estaEnv) => {
    expect(() => parseEnv({ ...required, NODE_ENV: 'production', ESTA_ENV: estaEnv })).toThrow(
      /ESTA_ENV[\s\S]*NODE_ENV=production/,
    );
  });

  test.each(['development', 'test', 'preview', 'production'])(
    'accepts an explicit ESTA_ENV=%s when NODE_ENV=production',
    (estaEnv) => {
      expect(parseEnv({ ...required, NODE_ENV: 'production', ESTA_ENV: estaEnv }).ESTA_ENV).toBe(estaEnv);
    },
  );

  test('rejects a missing required variable and names it', () => {
    const { NEXT_PUBLIC_SUPABASE_URL: _omitted, ...rest } = required;
    expect(() => parseEnv(rest)).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  test('rejects an unknown ESTA_ENV and lists the allowed values', () => {
    expect(() => parseEnv({ ...required, ESTA_ENV: 'staging' })).toThrow(
      /"development"\|"test"\|"preview"\|"production"[\s\S]*ESTA_ENV/,
    );
  });

  test('rejects an unknown ESTA_TIMEZONE', () => {
    expect(() => parseEnv({ ...required, ESTA_TIMEZONE: 'Mars/Olympus' })).toThrow(/ESTA_TIMEZONE/);
  });

  test('refuses ESTA_FROZEN_NOW in production', () => {
    const frozen = { ...required, ESTA_FROZEN_NOW: '2026-10-07T09:00:00+07:00' };
    expect(parseEnv({ ...frozen, ESTA_ENV: 'test' }).ESTA_FROZEN_NOW).toBe(frozen.ESTA_FROZEN_NOW);
    expect(() => parseEnv({ ...frozen, ESTA_ENV: 'production' })).toThrow(FROZEN_CLOCK_REFUSAL);
  });
});
