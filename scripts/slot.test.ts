import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { authDrifts, parseSlot, slotConfig, slotPorts, writeSlotWorkdir } from './slot.ts';

const repoRoot = join(import.meta.dirname, '..');
const baseToml = readFileSync(join(repoRoot, 'supabase', 'config.toml'), 'utf8');

function boundPorts(toml: string): number[] {
  let section = '';
  const ports: number[] = [];
  for (const line of toml.split('\n')) {
    const header = /^\[([^\]]+)\]/.exec(line);
    if (header?.[1] !== undefined) section = header[1];
    const port = /^\w*port\s*=\s*(\d+)/.exec(line);
    if (port?.[1] !== undefined && !section.startsWith('auth')) ports.push(Number(port[1]));
  }
  return ports;
}

describe('slotPorts', () => {
  it('returns the Supabase and Next.js defaults for slot 0', () => {
    expect(slotPorts(0)).toEqual({
      web: 3000,
      webProd: 3917,
      api: 54321,
      db: 54322,
      studio: 54323,
      inbucket: 54324,
      webLan: 3443,
      apiLan: 8443,
      inbucketLan: 9443,
    });
  });

  it('adds 100 per slot', () => {
    expect(slotPorts(1)).toMatchObject({ web: 3100, api: 54421, db: 54422, studio: 54423, inbucket: 54424 });
    expect(slotPorts(7)).toMatchObject({ webLan: 4143, apiLan: 9143, inbucketLan: 10143 });
    expect(slotPorts(13)).toMatchObject({ web: 4300, webProd: 5217 });
    expect(slotPorts(10)).toMatchObject({ web: 4000, api: 55321, db: 55322, studio: 55323, inbucket: 55324 });
  });
});

describe('webProd', () => {
  it('never collides with another port of any slot, so e2e:prod runs beside a lane dev server', () => {
    const slots = Array.from({ length: 100 }, (_, slot) => slotPorts(slot));
    const prod = new Set(slots.map((ports) => ports.webProd));
    const others = slots.flatMap(({ webProd: _, ...rest }) => Object.values(rest));
    expect(prod.size).toBe(100);
    expect(others.filter((port) => prod.has(port))).toEqual([]);
  });
});

describe('parseSlot', () => {
  it('treats an unset ESTA_SLOT as slot 0', () => {
    expect(parseSlot(undefined)).toBe(0);
    expect(parseSlot('')).toBe(0);
    expect(parseSlot('10')).toBe(10);
  });

  it('rejects values that are not a slot', () => {
    for (const bad of ['-1', '1.5', 'two', '100']) expect(() => parseSlot(bad)).toThrow(/ESTA_SLOT/);
  });
});

describe('slotConfig', () => {
  it.each([0, 1, 10])('names the project and offsets every bound port for slot %i', (slot) => {
    const toml = slotConfig(baseToml, slot);
    const ports = slotPorts(slot);
    expect(toml).toContain(`project_id = "esta-${slot}"`);
    expect(toml).toMatch(new RegExp(`\\[api\\][^[]*\\nport = ${ports.api}\\n`));
    expect(toml).toMatch(new RegExp(`\\[db\\][^[]*\\nport = ${ports.db}\\n`));
    expect(toml).toMatch(new RegExp(`\\[studio\\][^[]*\\nport = ${ports.studio}\\n`));
    expect(toml).toMatch(new RegExp(`\\[inbucket\\][^[]*\\nport = ${ports.inbucket}\\n`));
    expect(toml).toContain(`site_url = "http://127.0.0.1:${ports.web}"`);
    expect(toml).toContain(`additional_redirect_urls = ["https://127.0.0.1:${ports.web}"]`);
    expect(boundPorts(toml)).toEqual(boundPorts(baseToml).map((port) => port + slot * 100));
  });

  it('keeps LAN origins out of the base config', () => {
    expect(baseToml).not.toMatch(/https:\/\/(10|172|192)\./);
    expect(slotConfig(baseToml, 13)).not.toMatch(/https:\/\/(10|172|192)\./);
  });

  it('points auth at the LAN origins only for a dev:lan run', () => {
    const toml = slotConfig(baseToml, 13, '192.168.1.7');
    expect(toml).toContain('site_url = "https://192.168.1.7:4743"');
    expect(toml).toContain('additional_redirect_urls = ["https://127.0.0.1:4300", "https://192.168.1.7:4743/**"]');
    expect(toml).not.toContain('external_url');
    expect(toml).not.toContain('*.*');
  });

  it('keeps slots 0, 1 and 10 on disjoint ports', () => {
    const all = [0, 1, 10].flatMap((slot) => boundPorts(slotConfig(baseToml, slot)));
    expect(new Set(all).size).toBe(all.length);
  });

  it('offsets a port line with other spacing or a trailing comment', () => {
    expect(slotConfig('[db]\nport=54322 # host\n', 1)).toBe('[db]\nport = 54422 # host\n');
  });

  it('leaves the remote SMTP port in [auth.email.smtp] alone', () => {
    const toml = slotConfig('[auth.email.smtp]\nport = 587\n[db]\nport = 54322\n', 2);
    expect(toml).toBe('[auth.email.smtp]\nport = 587\n[db]\nport = 54522\n');
  });
});

describe('writeSlotWorkdir', () => {
  it('writes a workdir with the slot config and copies of migrations, seed and tests', () => {
    const root = mkdtempSync(join(tmpdir(), 'esta-slot-'));
    cpSync(join(repoRoot, 'supabase'), join(root, 'supabase'), {
      recursive: true,
      filter: (src) => !src.includes('.slots'),
    });
    const workdir = writeSlotWorkdir(root, 2);
    expect(workdir).toBe(join(root, 'supabase', '.slots', '2'));
    expect(readFileSync(join(workdir, 'supabase', 'config.toml'), 'utf8')).toContain('project_id = "esta-2"');
    for (const dir of ['migrations', 'seed', 'tests']) {
      expect(existsSync(join(workdir, 'supabase', dir))).toBe(true);
    }
    rmSync(root, { recursive: true });
  });
});

describe('authDrifts', () => {
  const lanToml = slotConfig(baseToml, 13, '192.168.1.7');
  const localEnv = ['GOTRUE_SITE_URL=http://127.0.0.1:4300', 'GOTRUE_URI_ALLOW_LIST=https://127.0.0.1:4300', 'PATH=/bin'];
  const lanEnv = [
    'GOTRUE_SITE_URL=https://192.168.1.7:4743',
    'GOTRUE_URI_ALLOW_LIST=https://127.0.0.1:4300,https://192.168.1.7:4743/**',
  ];

  it('reports drift when the running auth service has the other origins', () => {
    expect(authDrifts(lanToml, localEnv)).toBe(true);
    expect(authDrifts(slotConfig(baseToml, 13), lanEnv)).toBe(true);
  });

  it('reports no drift when the running auth service matches', () => {
    expect(authDrifts(lanToml, lanEnv)).toBe(false);
    expect(authDrifts(slotConfig(baseToml, 13), localEnv)).toBe(false);
  });
});
