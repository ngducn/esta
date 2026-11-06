import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { slotPorts, slotWorkdir } from './slot.ts';

export type Env = Record<string, string>;

const STATUS_KEYS = { ANON_KEY: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', SERVICE_ROLE_KEY: 'SUPABASE_SERVICE_ROLE_KEY' } as const;

function readEnvLocal(repoRoot: string, app: 'web' | 'agent'): Env {
  const file = join(repoRoot, 'apps', app, '.env.local');
  return existsSync(file) ? (parseEnv(readFileSync(file, 'utf8')) as Env) : {};
}

/** `supabase status -o env` of the slot's stack, or `undefined` when it is not running. */
export function stackStatus(repoRoot: string, slot: number): Env | undefined {
  const result = spawnSync('supabase', ['status', '-o', 'env', '--workdir', slotWorkdir(repoRoot, slot)], {
    encoding: 'utf8',
  });
  return result.status === 0 ? (parseEnv(result.stdout) as Env) : undefined;
}

/** The values CI keeps out of a public log and of uploaded reports. The anon and publishable keys are left out because every browser request carries them. */
const SECRET_STATUS_KEYS = ['SERVICE_ROLE_KEY', 'SECRET_KEY', 'JWT_SECRET', 'S3_PROTOCOL_ACCESS_KEY_SECRET'] as const;

export const secretValues = (status: Env): string[] => SECRET_STATUS_KEYS.flatMap((key) => (status[key] ? [status[key]] : []));

function statusKeys(repoRoot: string, slot: number): Env {
  const status = stackStatus(repoRoot, slot);
  if (status === undefined) {
    console.error(`ESTA_SLOT=${slot}: local Supabase is not running, so the web app gets no slot keys`);
    return {};
  }
  return Object.fromEntries(
    Object.entries(STATUS_KEYS).flatMap(([from, to]) => (status[from] ? [[to, status[from]]] : [])),
  );
}

export function slotEnv(repoRoot: string, slot: number, { withKeys = true, app = 'web' as 'web' | 'agent' } = {}): Env {
  const ports = slotPorts(slot);
  const apiUrl = `http://127.0.0.1:${ports.api}`;
  const fromShell = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  return {
    ...readEnvLocal(repoRoot, app),
    PORT: String(ports.web),
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    SUPABASE_URL: apiUrl,
    ...(withKeys ? statusKeys(repoRoot, slot) : {}),
    ...fromShell,
  };
}
