import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkLaneOtp, fetchLaneOtp, projectRef } from './lane-otp.ts';
import { parseSlot, slotPorts } from './slot.ts';
import { slotEnv } from './slot-env.ts';

const PREVIEW = {
  ESTA_ENV: 'preview',
  ESTA_PREVIEW_PROJECT_REF: 'abcdefghijklmnopqrst',
  SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
};

describe('projectRef', () => {
  it('reads the first label of a cloud host and keeps a local host whole', () => {
    expect(projectRef('https://abcdefghijklmnopqrst.supabase.co')).toBe('abcdefghijklmnopqrst');
    expect(projectRef('http://127.0.0.1:54321')).toBe('127.0.0.1');
    expect(projectRef('not a url')).toBeUndefined();
  });
});

describe('checkLaneOtp', () => {
  it('asks for an email address', () => {
    expect(checkLaneOtp(undefined, PREVIEW)).toEqual({ exitCode: 2, message: 'Usage: pnpm lane:otp <email>' });
  });

  it.each([['production'], ['test'], [undefined]])('refuses ESTA_ENV=%s', (env) => {
    const check = checkLaneOtp('me@demo.esta.test', { ...PREVIEW, ESTA_ENV: env });
    expect(check).toMatchObject({ exitCode: 1 });
    expect('message' in check && check.message).toMatch(/ESTA_ENV/);
  });

  it('refuses a project other than the preview one', () => {
    const check = checkLaneOtp('me@demo.esta.test', { ...PREVIEW, SUPABASE_URL: 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co' });
    expect(check).toEqual({
      exitCode: 1,
      message: 'Refusing: SUPABASE_URL points at project zzzzzzzzzzzzzzzzzzzz, not the preview project abcdefghijklmnopqrst',
    });
  });

  it.each(['ESTA_PREVIEW_PROJECT_REF', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])('refuses a missing %s', (name) => {
    expect(checkLaneOtp('me@demo.esta.test', { ...PREVIEW, [name]: undefined })).toMatchObject({ exitCode: 1 });
  });

  it('accepts the preview project', () => {
    expect(checkLaneOtp('me@demo.esta.test', PREVIEW)).toEqual({
      target: { url: PREVIEW.SUPABASE_URL, serviceRoleKey: 'service-key' },
    });
  });
});

describe('fetchLaneOtp', () => {
  const target = { url: PREVIEW.SUPABASE_URL, serviceRoleKey: 'service-key' };

  it('asks generate_link for a magic link and returns its code', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const stub: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json({ email_otp: '123456' });
    };
    await expect(fetchLaneOtp('me@demo.esta.test', target, stub)).resolves.toBe('123456');
    expect(calls[0]?.url).toBe(`${target.url}/auth/v1/admin/generate_link`);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ type: 'magiclink', email: 'me@demo.esta.test' });
  });

  it('fails on an error answer and on a body without a 6-digit code', async () => {
    await expect(fetchLaneOtp('x@y.z', target, async () => new Response('nope', { status: 422 }))).rejects.toThrow(/422/);
    await expect(fetchLaneOtp('x@y.z', target, async () => Response.json({ email_otp: 'abc' }))).rejects.toThrow();
  });
});

const repoRoot = join(import.meta.dirname, '..');
const slot = parseSlot(process.env.ESTA_SLOT);
const localKey = (() => {
  try {
    return slotEnv(repoRoot, slot).SUPABASE_SERVICE_ROLE_KEY;
  } catch {
    return undefined;
  }
})();
const stackUp = await fetch(`http://127.0.0.1:${slotPorts(slot).api}/auth/v1/health`, { signal: AbortSignal.timeout(500) })
  .then((response) => response.status > 0)
  .catch(() => false);

describe.skipIf(!stackUp || !localKey)('lane-otp against the local stack', () => {
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, [join(import.meta.dirname, 'lane-otp.ts'), 'me.lane1@demo.esta.test'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', ...env },
    });
  const local = {
    ESTA_ENV: 'preview',
    ESTA_PREVIEW_PROJECT_REF: '127.0.0.1',
    SUPABASE_URL: `http://127.0.0.1:${slotPorts(slot).api}`,
    SUPABASE_SERVICE_ROLE_KEY: localKey ?? '',
  };

  it('prints a 6-digit code that signs the seeded member in', async () => {
    const result = run(local);
    expect(result.status, result.stderr).toBe(0);
    const code = result.stdout.trim();
    expect(code).toMatch(/^\d{6}$/);
    const verify = await fetch(`${local.SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: local.SUPABASE_SERVICE_ROLE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', email: 'me.lane1@demo.esta.test', token: code }),
    });
    expect(verify.status).toBe(200);
  });

  it('refuses production and a mismatched project ref', () => {
    expect(run({ ...local, ESTA_ENV: 'production' }).status).toBe(1);
    expect(run({ ...local, ESTA_PREVIEW_PROJECT_REF: 'abcdefghijklmnopqrst' }).status).toBe(1);
  });
});
