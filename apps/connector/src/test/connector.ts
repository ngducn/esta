import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'vitest';
import { z } from 'zod';
import { readClock, type Db, type OpContext } from '@esta/ops';
import { DEMO_PASSWORD } from '../../../../supabase/seed/generator/households.ts';
import { seedId } from '../../../../supabase/seed/generator/ids.ts';
import { logIn } from '../login';
import { batchClient, connectorClient } from '../session';
import { fileStore } from '../store';
import { stdioConnector } from './stdio';

export { call } from './stdio';

/** `pnpm --filter @esta/connector test:integration` (scripts/connector-integration.ts) passes the slot's stack. */
export const env = z.object({ ESTA_SLOT: z.string(), ESTA_IT_SUPABASE_URL: z.url(), ESTA_IT_ANON_KEY: z.string().min(1) }).parse(process.env);
export const ROOT = join(import.meta.dirname, '..', '..', '..', '..');

const storeAt = (file: string) => fileStore(env.ESTA_IT_SUPABASE_URL, file);
const stack = { ESTA_SUPABASE_URL: env.ESTA_IT_SUPABASE_URL, ESTA_SUPABASE_ANON_KEY: env.ESTA_IT_ANON_KEY };
export const clientAt = (file: string) => connectorClient(stack, storeAt(file));
export const batchClientFor = (session: Db, batchId: string) => batchClient(stack, session, batchId);

/** Session files in folders of their own; `discard` signs each out and deletes it, so no session outlives the run. */
export function sessionFiles() {
  const files: string[] = [];
  return {
    make() {
      const file = join(mkdtempSync(join(tmpdir(), 'esta-connector-it-')), 'session.json');
      files.push(file);
      return file;
    },
    async discard() {
      for (const file of files) {
        if (storeAt(file).getItem('session') !== null) expect((await clientAt(file).auth.signOut({ scope: 'local' })).error).toBeNull();
        rmSync(join(file, '..'), { recursive: true, force: true });
      }
    },
  };
}

export function signIn(email: string, file: string) {
  return logIn(clientAt(file), { email, password: DEMO_PASSWORD });
}

/** The server started exactly as the README tells Claude Code to start it. */
export async function startConnector(file: string, extraEnv: Record<string, string> = {}) {
  const connector = stdioConnector({ command: 'pnpm', args: ['--silent', '--dir', ROOT, 'connector'], env: { ESTA_SLOT: env.ESTA_SLOT, ESTA_SESSION_FILE: file, ...extraEnv } });
  await connector.connect();
  return connector;
}

export type Connector = Awaited<ReturnType<typeof startConnector>>;

export const plannedSchema = z.object({ planId: z.string(), items: z.array(z.object({ status: z.string(), id: z.string().nullable(), change: z.unknown().optional() })) });
export const appliedSchema = z.object({ status: z.string(), items: z.array(z.object({ status: z.string(), refusal: z.unknown().optional() })) });

export function setClock(instant: string) {
  expect(spawnSync('pnpm', ['--silent', 'clock:set', instant], { cwd: ROOT, env: { ...process.env, ESTA_SLOT: env.ESTA_SLOT } }).status).toBe(0);
}

export async function laneContext(db: Db, lane: number): Promise<OpContext> {
  return { db, householdId: seedId(`seed:household:lane-${lane}`), clock: await readClock(db, { ESTA_TIMEZONE: 'Asia/Ho_Chi_Minh' }) };
}
