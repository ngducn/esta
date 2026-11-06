import { describe, expect, it } from 'vitest';
import { checkEnv } from './check-env.ts';

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (role: string) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', ref: 'demo', role })}.c2ln`;

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
    expect(checkEnv('preview', complete, 'web')).toEqual([]);
  });

  it('names a missing CRON_SECRET', () => {
    const { CRON_SECRET: _omitted, ...rest } = complete;
    const problems = checkEnv('preview', rest, 'web');
    expect(problems.join('\n')).toContain('CRON_SECRET');
  });

  it('refuses a frozen clock in production', () => {
    const problems = checkEnv('production', { ...complete, ESTA_ENV: 'production', ESTA_FROZEN_NOW: '2026-11-01T10:00:00+07:00' }, 'web');
    expect(problems.join('\n')).toContain('ESTA_FROZEN_NOW');
  });

  it('refuses a service role key in a NEXT_PUBLIC_ variable', () => {
    const problems = checkEnv('production', { ...complete, ESTA_ENV: 'production', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'service-demo' }, 'web');
    expect(problems.join('\n')).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    const renamed = ['NEXT', 'PUBLIC', 'SERVICE', 'ROLE', 'KEY'].join('_');
    expect(checkEnv('production', { ...complete, ESTA_ENV: 'production', [renamed]: 'x' }, 'web').join('\n')).toContain(renamed);
  });

  it('refuses a file whose ESTA_ENV does not match the target', () => {
    expect(checkEnv('production', complete, 'web').join('\n')).toContain('ESTA_ENV');
  });

  it('refuses a replay worker in production', () => {
    expect(checkEnv('production', { ...complete, ESTA_ENV: 'production', ESTA_AGENT_MODE: 'replay' }, 'agent').join('\n')).toContain('ESTA_AGENT_MODE');
  });

  const web = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://demo.supabase.co',
    CRON_SECRET: 'cron-demo',
    SUPABASE_URL: 'https://demo.supabase.co',
    ESTA_ENV: 'production',
  };

  it('refuses swapped keys: a service_role JWT in the anon slot', () => {
    const problems = checkEnv('production', { ...web, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('service_role'), SUPABASE_SERVICE_ROLE_KEY: jwt('anon') }, 'web');
    expect(problems.join('\n')).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('refuses a new-format secret key in a NEXT_PUBLIC_ variable', () => {
    const problems = checkEnv('production', { ...web, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_demo0123456789', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_other' }, 'web');
    expect(problems.join('\n')).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('accepts a real anon key beside a service key', () => {
    expect(checkEnv('production', { ...web, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon'), SUPABASE_SERVICE_ROLE_KEY: jwt('service_role') }, 'web')).toEqual([]);
  });

  const worker = {
    SUPABASE_URL: 'https://demo.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'),
    ESTA_ENV: 'production',
    ESTA_AGENT_MODE: 'live',
    ESTA_AUTH_MODE: 'subscription',
    CLAUDE_CODE_OAUTH_TOKEN: 'demo-token',
    ESTA_MODEL_ROUTINE: 'demo-model',
    ESTA_MODEL_DEEP: 'demo-model',
    ESTA_BACKUP_DIR: '/Users/demo/backups',
  };

  it('accepts the worker file DEPLOY.md section 6 step 1 describes', () => {
    expect(checkEnv('production', worker, 'agent')).toEqual([]);
  });

  it('names a live worker file with no credential', () => {
    const { CLAUDE_CODE_OAUTH_TOKEN: _omitted, ...rest } = worker;
    expect(checkEnv('production', rest, 'agent').join('\n')).toContain('CLAUDE_CODE_OAUTH_TOKEN');
  });

  it('names a live worker file with no routine model', () => {
    const { ESTA_MODEL_ROUTINE: _omitted, ...rest } = worker;
    expect(checkEnv('production', rest, 'agent').join('\n')).toContain('ESTA_MODEL_ROUTINE');
  });

  it('names a production worker file with no backup folder', () => {
    const { ESTA_BACKUP_DIR: _omitted, ...rest } = worker;
    expect(checkEnv('production', rest, 'agent').join('\n')).toContain('ESTA_BACKUP_DIR');
  });

  it('does not ask a preview worker for a backup folder', () => {
    const { ESTA_BACKUP_DIR: _omitted, ...rest } = worker;
    expect(checkEnv('preview', { ...rest, ESTA_ENV: 'preview' }, 'agent')).toEqual([]);
  });

  it('does not ask the worker file for web variables, or the web file for worker ones', () => {
    expect(checkEnv('production', worker, 'agent').join('\n')).not.toContain('CRON_SECRET');
    expect(checkEnv('production', { ...web, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon'), SUPABASE_SERVICE_ROLE_KEY: jwt('service_role') }, 'web')).toEqual([]);
  });

  it('never prints a secret from a malformed SMTP_URL', () => {
    const problems = checkEnv('production', { ...web, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon'), SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'), SMTP_URL: 'smtp://user:hunter2-secret@ host' }, 'web');
    expect(problems.join('\n')).not.toContain('hunter2');
  });
});
