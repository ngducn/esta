import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { connect, createServer, type AddressInfo } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIVE_TEST_SLOTS } from './slot.ts';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

function listening(port: number): Promise<boolean> {
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

function killGroup(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

type Web = { pid: number | undefined; port: number; exited: Promise<unknown>; stop: () => void; output: () => string };

async function startWeb(slot: number): Promise<Web> {
  const port = await freePort();
  let output = '';
  const web = spawn(process.execPath, [join(import.meta.dirname, 'web.ts'), 'dev'], {
    env: { ...process.env, ESTA_SLOT: String(slot), PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  for (const stream of [web.stdout, web.stderr]) stream.on('data', (chunk: Buffer) => (output += chunk.toString()));
  return { pid: web.pid, port, exited: once(web, 'exit'), stop: () => web.kill('SIGTERM'), output: () => output };
}

describe('scripts/web.ts', () => {
  it('stops next-server when it is stopped, so no listener outlives it', { timeout: 60_000 }, async () => {
    const web = await startWeb(LIVE_TEST_SLOTS[0]);
    try {
      expect(await until(() => listening(web.port), 45_000), `next dev listens on ${web.port}. Output:\n${web.output()}`).toBe(
        true,
      );
      web.stop();
      await web.exited;
      expect(await until(async () => !(await listening(web.port)), 10_000), `nothing listens on ${web.port} after the stop`).toBe(
        true,
      );
    } finally {
      killGroup(web.pid);
    }
  });

  it('serves two slots from one checkout at once', { timeout: 60_000 }, async () => {
    const webs = [await startWeb(LIVE_TEST_SLOTS[0]), await startWeb(LIVE_TEST_SLOTS[1])];
    try {
      for (const web of webs) {
        expect(await until(() => listening(web.port), 45_000), `next dev listens on ${web.port}. Output:\n${web.output()}`).toBe(
          true,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      for (const web of webs) expect(await listening(web.port), `next dev still listens on ${web.port}. Output:\n${web.output()}`).toBe(true);
    } finally {
      for (const web of webs) killGroup(web.pid);
    }
  });
});
