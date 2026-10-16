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

function statusKeys(repoRoot: string, slot: number): Env {
  const result = spawnSync('supabase', ['status', '-o', 'env', '--workdir', slotWorkdir(repoRoot, slot)], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(`ESTA_SLOT=${slot}: local Supabase is not running, so the web app gets no slot keys`);
    return {};
  }
  const status = parseEnv(result.stdout);
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
