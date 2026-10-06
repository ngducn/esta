import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderCaddyfile } from './caddyfile.ts';

const template = readFileSync(join(import.meta.dirname, '..', 'infra', 'caddy', 'Caddyfile.template'), 'utf8');
const LAN = '192.168.1.7';

function render(slot: number): string {
  return renderCaddyfile(template, {
    lan: LAN,
    slot,
    certFile: '/repo/.certs/lan-192.168.1.7.pem',
    keyFile: '/repo/.certs/lan-192.168.1.7-key.pem',
    publicDir: '/repo/.certs/public',
  });
}

function siteAddresses(caddyfile: string): string[] {
  return [...caddyfile.matchAll(/^(\S+) \{$/gm)].map((match) => match[1] ?? '').filter((address) => address.includes('://'));
}

function upstreams(caddyfile: string): string[] {
  return [...caddyfile.matchAll(/reverse_proxy (\S+)/g)].map((match) => match[1] ?? '');
}

describe('renderCaddyfile', () => {
  it.each([
    [0, [3443, 8443, 9443], [3000, 54321, 54324]],
    [7, [4143, 9143, 10143], [3700, 55021, 55024]],
  ])('offsets every port by 100 per slot for slot %i', (slot, lanPorts, localPorts) => {
    const caddyfile = render(slot);
    expect(siteAddresses(caddyfile)).toEqual(lanPorts.map((port) => `https://${LAN}:${port}`));
    expect(upstreams(caddyfile)).toEqual(localPorts.map((port) => `127.0.0.1:${port}`));
  });

  it('binds every site to the LAN address only', () => {
    const caddyfile = render(0);
    const binds = [...caddyfile.matchAll(/^\s*bind (.+)$/gm)].map((match) => match[1]);
    expect(binds).toEqual([LAN]);
    expect(caddyfile.match(/^\s*import lan$/gm)).toHaveLength(siteAddresses(caddyfile).length);
    expect(caddyfile).not.toContain('0.0.0.0');
    expect(caddyfile).not.toMatch(/^:\d+|^https?:\/\/:|\[::\]/m);
  });

  it('turns off automatic HTTPS, the admin API and trust store installs', () => {
    const caddyfile = render(0);
    for (const option of ['admin off', 'auto_https off', 'skip_install_trust', 'ocsp_stapling off']) {
      expect(caddyfile).toContain(option);
    }
  });

  it('leaves no placeholder behind and rejects an unknown one', () => {
    expect(render(0)).not.toContain('{{');
    expect(() => renderCaddyfile('{{NOPE}}', { lan: LAN, slot: 0, certFile: '', keyFile: '', publicDir: '' })).toThrow(
      /unknown placeholder \{\{NOPE\}\}/,
    );
  });
});
