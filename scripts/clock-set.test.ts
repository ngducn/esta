import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkClockSet } from './clock-set.ts';

const USAGE = 'Usage: pnpm clock:set <iso date-time with offset> | off';
const LOCAL_URL = 'http://127.0.0.1:54321';
const REMOTE_URL = 'https://demo-project.supabase.invalid';
const REFUSAL = 'Refusing to write test_clock on demo-project.supabase.invalid: SUPABASE_URL must point at a local stack';

describe('checkClockSet', () => {
  it.each(['2026-10-07T09:00:00', '2026-10-07T09:00:00+99:99'])('answers %j with the usage line', (arg) => {
    expect(checkClockSet(arg, LOCAL_URL)).toEqual({
      exitCode: 2,
      message: `Not an ISO date-time with an offset: "${arg}"\n${USAGE}`,
    });
  });

  it('answers a missing argument with the usage line', () => {
    expect(checkClockSet(undefined, LOCAL_URL)).toEqual({ exitCode: 2, message: USAGE });
  });

  it.each(['2026-10-07T09:00:00+07:00', 'off'])('refuses %j outside the local stack', (arg) => {
    expect(checkClockSet(arg, REMOTE_URL)).toEqual({ exitCode: 1, message: REFUSAL });
  });

  it.each([LOCAL_URL, 'http://localhost:54321'])('accepts a target on %s', (url) => {
    expect(checkClockSet('2026-10-07T09:00:00+07:00', url)).toEqual({ target: '2026-10-07T02:00:00.000Z' });
    expect(checkClockSet('off', url)).toEqual({ target: 'off' });
  });
});

describe('scripts/clock-set.ts', () => {
  it('exits 1 with only the refusal before it reads the slot keys', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/clock-set.ts', '2026-10-07T09:00:00+07:00'], {
      cwd: join(import.meta.dirname, '..'),
      encoding: 'utf8',
      env: {
        ...process.env,
        ESTA_SLOT: '99',
        SUPABASE_URL: REMOTE_URL,
        SUPABASE_SERVICE_ROLE_KEY: 'demo-service-role-key',
      },
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`${REFUSAL}\n`);
  });
});
