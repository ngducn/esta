import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type SlotPorts = {
  web: number;
  api: number;
  db: number;
  studio: number;
  inbucket: number;
  webLan: number;
  apiLan: number;
  inbucketLan: number;
};

const BASE_PORTS: SlotPorts = {
  web: 3000,
  api: 54321,
  db: 54322,
  studio: 54323,
  inbucket: 54324,
  webLan: 3443,
  apiLan: 8443,
  inbucketLan: 9443,
};

const SLOT_STRIDE = 100;
const MAX_SLOT = 99;
const SHARED_DIRS = ['migrations', 'seed', 'tests'] as const;

export function parseSlot(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 0;
  if (!/^\d+$/.test(raw) || Number(raw) > MAX_SLOT) {
    throw new Error(`ESTA_SLOT must be an integer from 0 to ${MAX_SLOT}, got "${raw}"`);
  }
  return Number(raw);
}

export function slotPorts(slot: number): SlotPorts {
  const offset = slot * SLOT_STRIDE;
  return {
    web: BASE_PORTS.web + offset,
    api: BASE_PORTS.api + offset,
    db: BASE_PORTS.db + offset,
    studio: BASE_PORTS.studio + offset,
    inbucket: BASE_PORTS.inbucket + offset,
    webLan: BASE_PORTS.webLan + offset,
    apiLan: BASE_PORTS.apiLan + offset,
    inbucketLan: BASE_PORTS.inbucketLan + offset,
  };
}

export function slotConfig(baseToml: string, slot: number, lan?: string): string {
  const offset = slot * SLOT_STRIDE;
  const ports = slotPorts(slot);
  let section = '';
  return baseToml
    .split('\n')
    .map((line) => {
      const header = /^\[([^\]]+)\]/.exec(line);
      if (header?.[1] !== undefined) {
        section = header[1];
        return line;
      }
      if (section === '' && line.startsWith('project_id =')) return `project_id = "esta-${slot}"`;
      if (lan !== undefined && line.startsWith('site_url =')) return `site_url = "https://${lan}:${ports.webLan}"`;
      if (/^(site_url|additional_redirect_urls) =/.test(line)) {
        const local = line.replaceAll(`127.0.0.1:${BASE_PORTS.web}`, `127.0.0.1:${ports.web}`);
        return lan === undefined ? local : local.replace(/\]$/, `, "https://${lan}:${ports.webLan}/**"]`);
      }
      const portsNameRemoteServers = section.startsWith('auth');
      if (portsNameRemoteServers) return line;
      const port = /^(\w*port)\s*=\s*(\d+)(.*)$/.exec(line);
      if (port?.[1] === undefined || port[2] === undefined) return line;
      return `${port[1]} = ${Number(port[2]) + offset}${port[3] ?? ''}`;
    })
    .join('\n');
}

function tomlStrings(toml: string, key: string): string {
  const line = new RegExp(`^${key} = (.*)$`, 'm').exec(toml)?.[1] ?? '';
  return [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1]).join(',');
}

export function authDrifts(slotToml: string, runningEnv: readonly string[]): boolean {
  const running = new Map(runningEnv.map((entry) => [entry.slice(0, entry.indexOf('=')), entry.slice(entry.indexOf('=') + 1)]));
  return (
    running.get('GOTRUE_SITE_URL') !== tomlStrings(slotToml, 'site_url') ||
    running.get('GOTRUE_URI_ALLOW_LIST') !== tomlStrings(slotToml, 'additional_redirect_urls')
  );
}

export function slotWorkdir(repoRoot: string, slot: number): string {
  return join(repoRoot, 'supabase', '.slots', String(slot));
}

export function writeSlotWorkdir(repoRoot: string, slot: number, lan?: string): string {
  const workdir = slotWorkdir(repoRoot, slot);
  const source = join(repoRoot, 'supabase');
  const target = join(workdir, 'supabase');
  mkdirSync(target, { recursive: true });
  const baseToml = readFileSync(join(source, 'config.toml'), 'utf8');
  writeFileSync(join(target, 'config.toml'), slotConfig(baseToml, slot, lan));
  for (const dir of SHARED_DIRS) {
    rmSync(join(target, dir), { recursive: true, force: true });
    cpSync(join(source, dir), join(target, dir), { recursive: true });
  }
  return workdir;
}
