import { describe, expect, it } from 'vitest';
import { devCaDir, trustInstructions } from './dev-ca.ts';

describe('devCaDir', () => {
  it('defaults to one user-level directory shared by every worktree', () => {
    expect(devCaDir({}, '/Users/ryan')).toBe('/Users/ryan/.local/share/esta/dev-ca');
  });

  it('follows XDG_DATA_HOME', () => {
    expect(devCaDir({ XDG_DATA_HOME: '/data' }, '/Users/ryan')).toBe('/data/esta/dev-ca');
  });

  it('lets ESTA_DEV_CA_DIR override the location', () => {
    expect(devCaDir({ ESTA_DEV_CA_DIR: '/secure/ca', XDG_DATA_HOME: '/data' }, '/Users/ryan')).toBe('/secure/ca');
  });
});

describe('trustInstructions', () => {
  const text = trustInstructions({
    web: 'https://192.168.1.7:3443',
    caDir: '/Users/ryan/.local/share/esta/dev-ca',
    fingerprint: 'AB:CD:EF',
  });

  it('prints the fingerprint to compare on each device', () => {
    expect(text).toContain('SHA-256 fingerprint: AB:CD:EF');
    expect(text).toMatch(/same SHA-256 fingerprint/);
  });

  it('warns that the CA key can intercept HTTPS and must stay private', () => {
    expect(text).toMatch(/intercept/);
    expect(text).toContain('/Users/ryan/.local/share/esta/dev-ca');
  });

  it('gives removal steps for the Mac, iPhone and Android', () => {
    const removal = text.slice(text.indexOf('Remove the CA'));
    expect(removal).toContain('CAROOT="/Users/ryan/.local/share/esta/dev-ca" mkcert -uninstall');
    expect(removal).toMatch(/iPhone .*Remove Profile/);
    expect(removal).toMatch(/Android .*Trusted credentials > User/s);
  });
});
