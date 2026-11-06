import { describe, expect, it } from 'vitest';
import { checkEnv } from './check-env.ts';

const complete = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://demo.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-demo',
  SUPABASE_URL: 'https://demo.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-demo',
  CRON_SECRET: 'cron-demo',
  ESTA_ENV: 'preview',
  ESTA_AGENT_MODE: 'live',
};

describe('checkEnv', () => {
  it('accepts a complete preview file', () => {
    expect(checkEnv('preview', complete)).toEqual([]);
  });

  it('names a missing CRON_SECRET', () => {
    const { CRON_SECRET: _omitted, ...rest } = complete;
    const problems = checkEnv('preview', rest);
    expect(problems.join('\n')).toContain('CRON_SECRET');
  });

  it('refuses a frozen clock in production', () => {
    const problems = checkEnv('production', { ...complete, ESTA_ENV: 'production', ESTA_FROZEN_NOW: '2026-11-01T10:00:00+07:00' });
    expect(problems.join('\n')).toContain('ESTA_FROZEN_NOW');
  });

  it('refuses a service role key in a NEXT_PUBLIC_ variable', () => {
    const problems = checkEnv('production', { ...complete, ESTA_ENV: 'production', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'service-demo' });
    expect(problems.join('\n')).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    const renamed = ['NEXT', 'PUBLIC', 'SERVICE', 'ROLE', 'KEY'].join('_');
    expect(checkEnv('production', { ...complete, ESTA_ENV: 'production', [renamed]: 'x' }).join('\n')).toContain(renamed);
  });

  it('refuses a file whose ESTA_ENV does not match the target', () => {
    expect(checkEnv('production', complete).join('\n')).toContain('ESTA_ENV');
  });

  it('refuses a replay worker in production', () => {
    expect(checkEnv('production', { ...complete, ESTA_ENV: 'production', ESTA_AGENT_MODE: 'replay' }).join('\n')).toContain('ESTA_AGENT_MODE');
  });
});
