import { spawn, spawnSync } from 'node:child_process';
import { expect } from 'vitest';
import { env } from './connector';

const container = () => `supabase_db_esta-${env.ESTA_SLOT}`;

/**
 * One psql connection to the slot's database as postgres, kept open across statements so a test can hold a
 * transaction while another connection runs. `run` resolves with what the statement printed once it finishes.
 */
export function psqlSession() {
  const child = spawn('docker', ['exec', '-i', container(), 'psql', '-U', 'postgres', '-tAq', '-v', 'ON_ERROR_STOP=0'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  let waiting: (() => void) | null = null;
  const read = (chunk: Buffer) => {
    output += chunk.toString('utf8');
    waiting?.();
  };
  child.stdout.on('data', read);
  child.stderr.on('data', read);
  let statements = 0;
  return {
    run(sql: string): Promise<string> {
      const mark = `done-${++statements}`;
      child.stdin.write(`${sql}\n\\echo ${mark}\n`);
      return new Promise((resolve) => {
        const check = () => {
          const at = output.indexOf(`${mark}\n`);
          if (at === -1) return;
          const printed = output.slice(0, at).trim();
          output = output.slice(at + mark.length + 1);
          waiting = null;
          resolve(printed);
        };
        waiting = check;
        check();
      });
    },
    close: () => new Promise<void>((resolve) => child.on('close', () => resolve()).stdin.end()),
  };
}

/** Starts a transaction acting as a signed-in user, the way PostgREST runs a request. */
export const actAs = (userId: string) =>
  `begin; select set_config('request.jwt.claims', json_build_object('sub', '${userId}', 'role', 'authenticated')::text, true); set local role authenticated;`;

/** Waits until some connection is blocked on a lock while running a statement that contains `text`. */
export async function blockedOn(text: string) {
  const sql = `select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query like '%${text}%' and pid <> pg_backend_pid()`;
  for (let tries = 0; tries < 100; tries++) {
    const count = spawnSync('docker', ['exec', container(), 'psql', '-U', 'postgres', '-tAc', sql], { encoding: 'utf8' }).stdout.trim();
    if (count !== '0') return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect.fail(`nothing blocked on a lock running ${text}`);
}
