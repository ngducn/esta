import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { connect } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { slotPorts } from './slot.ts';

const SLOT = 98;
const port = slotPorts(SLOT).web;

function listening(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function until(predicate: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return predicate();
}

describe('scripts/web.ts', () => {
  it('stops next-server when it is stopped, so no listener outlives it', { timeout: 60_000 }, async () => {
    expect(await listening(), `port ${port} is free before the run`).toBe(false);
    const web = spawn(process.execPath, [join(import.meta.dirname, 'web.ts'), 'dev'], {
      env: { ...process.env, ESTA_SLOT: String(SLOT) },
      stdio: 'ignore',
    });
    try {
      expect(await until(listening, 45_000), `next dev listens on ${port}`).toBe(true);
      web.kill('SIGTERM');
      await once(web, 'exit');
      expect(await until(async () => !(await listening()), 10_000), `nothing listens on ${port} after the stop`).toBe(true);
    } finally {
      web.kill('SIGKILL');
    }
  });
});
