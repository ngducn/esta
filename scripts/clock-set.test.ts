import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..');
const USAGE = 'Usage: pnpm clock:set <iso date-time with offset> | off';

function clockSet(arg: string, env: Record<string, string> = {}) {
  const result = spawnSync('pnpm', ['exec', 'tsx', 'scripts/clock-set.ts', arg], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ESTA_SLOT: '99', ...env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('pnpm clock:set', () => {
  it.each(['2026-10-07T09:00:00', '2026-10-07T09:00:00+99:99'])('prints the usage line for %j', (arg) => {
    const { status, stdout, stderr } = clockSet(arg);
    expect(status).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain(`Not an ISO date-time with an offset: "${arg}"`);
    expect(stderr).toContain(USAGE);
    expect(stderr).not.toMatch(/^\s+at /m);
  });

  it('refuses to write a test clock outside the local stack', () => {
    const { status, stdout, stderr } = clockSet('2026-10-07T09:00:00+07:00', {
      SUPABASE_URL: 'https://demo-project.supabase.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'demo-service-role-key',
    });
    expect(status).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('Refusing to write test_clock on demo-project.supabase.invalid');
  });
});
