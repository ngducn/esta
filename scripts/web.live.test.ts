import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { connect, createServer, type AddressInfo } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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

describe('scripts/web.ts', () => {
  it('stops next-server when it is stopped, so no listener outlives it', { timeout: 60_000 }, async () => {
    const port = await freePort();
    let output = '';
    const web = spawn(process.execPath, [join(import.meta.dirname, 'web.ts'), 'dev'], {
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    for (const stream of [web.stdout, web.stderr]) stream.on('data', (chunk: Buffer) => (output += chunk.toString()));
    try {
      expect(await until(() => listening(port), 45_000), `next dev listens on ${port}. Output:\n${output}`).toBe(true);
      web.kill('SIGTERM');
      await once(web, 'exit');
      expect(await until(async () => !(await listening(port)), 10_000), `nothing listens on ${port} after the stop`).toBe(
        true,
      );
    } finally {
      killGroup(web.pid);
    }
  });
});
