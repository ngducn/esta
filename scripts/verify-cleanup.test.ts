import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const cleanup = join(import.meta.dirname, '..', '.claude', 'skills', 'verify', 'scripts', 'cleanup.sh');
// No lane uses slot 97, and a refused cleanup touches nothing on it.
const slot = '97';
const runDir = `/tmp/esta-verify/slot-${slot}`;
const marker = join(runDir, 'stack');

const fake = mkdtempSync(join(tmpdir(), 'esta-cleanup-'));
const browseCalls = join(fake, 'calls.log');
const browse = join(fake, 'browse');
writeFileSync(browse, `#!/usr/bin/env bash\necho "$*" >> "${browseCalls}"\n`);
chmodSync(browse, 0o755);
afterAll(() => {
  rmSync(fake, { recursive: true, force: true });
  rmSync(runDir, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(browseCalls, { force: true });
  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(runDir, { recursive: true });
});

function runCleanup() {
  return spawnSync('bash', [cleanup], { env: { ...process.env, ESTA_SLOT: slot, B: browse }, encoding: 'utf8' });
}

const calls = () => (existsSync(browseCalls) ? readFileSync(browseCalls, 'utf8').trim().split('\n') : []);

describe('verify cleanup.sh on a slot it refuses to clean', () => {
  it('leaves the browse daemon running when no launch marker exists', () => {
    const result = runCleanup();
    expect(result.stdout).toContain('Cleanup leaves its stack, web server and browser running');
    expect(calls()).not.toContain('stop');
    expect(result.status, 'a refused cleanup exits 1').toBe(1);
  });

  it("leaves the browse daemon and the marker of another checkout's launch", () => {
    writeFileSync(marker, 'checkout=/elsewhere/esta\nconfig=0\n');
    const result = runCleanup();
    expect(result.stdout).toContain('Slot 97 was launched from /elsewhere/esta');
    expect(calls()).not.toContain('stop');
    expect(result.status, 'a refused cleanup exits 1').toBe(1);
    expect(readFileSync(marker, 'utf8')).toContain('checkout=/elsewhere/esta');
  });
});
