import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { stdioConnector } from '../../apps/connector/src/test/stdio.ts';
import { parseSlot } from '../../scripts/slot.ts';
import { DEMO_PASSWORD } from './password';

const repoRoot = join(import.meta.dirname, '..', '..');
const slot = String(parseSlot(process.env.ESTA_SLOT));

export function connectorLogin(sessionFile: string, email: string) {
  const child = spawn('pnpm', ['--silent', '--dir', repoRoot, 'connector:login'], { env: { ...process.env, ESTA_SLOT: slot, ESTA_SESSION_FILE: sessionFile }, stdio: ['pipe', 'ignore', 'inherit'] });
  child.stdin.end(`${email}\n${DEMO_PASSWORD}\n`);
  return new Promise<number | null>((resolve) => child.on('exit', resolve));
}

export function connectorFor(sessionFile: string, env: Record<string, string> = {}) {
  return stdioConnector({ command: 'pnpm', args: ['--silent', '--dir', repoRoot, 'connector'], env: { ESTA_SLOT: slot, ESTA_SESSION_FILE: sessionFile, ...env } });
}
