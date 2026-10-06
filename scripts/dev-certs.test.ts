import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureCertificates, type Mkcert } from './dev-certs.ts';

const fakeMkcert: Mkcert = (args, caRoot) => {
  const certFile = args[args.indexOf('-cert-file') + 1] ?? '';
  const keyFile = args[args.indexOf('-key-file') + 1] ?? '';
  try {
    if (!existsSync(join(caRoot, 'rootCA.pem'))) writeFileSync(join(caRoot, 'rootCA.pem'), 'root ca');
    writeFileSync(certFile, 'cert');
    writeFileSync(keyFile, 'key');
    return { status: 0, stderr: '' };
  } catch (error) {
    return { status: 1, stderr: `ERROR: failed to save certificate: ${(error as Error).message}` };
  }
};

describe('ensureCertificates', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'esta-dev-certs-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('creates the certificate directory on a checkout that never ran dev:lan', () => {
    const certsDir = join(root, 'repo', '.certs');
    const caRoot = join(root, 'home', 'dev-ca');

    const certs = ensureCertificates({ lan: '192.168.1.7', certsDir, caRoot, mkcert: fakeMkcert });

    expect(readFileSync(certs.certFile, 'utf8')).toBe('cert');
    expect(readFileSync(certs.keyFile, 'utf8')).toBe('key');
    expect(readFileSync(join(certs.publicDir, 'esta-dev-ca.crt'), 'utf8')).toBe('root ca');
  });

  it('reports the mkcert error when mkcert fails', () => {
    const failing: Mkcert = () => ({ status: 1, stderr: 'ERROR: boom' });

    expect(() =>
      ensureCertificates({ lan: '192.168.1.7', certsDir: join(root, '.certs'), caRoot: join(root, 'ca'), mkcert: failing }),
    ).toThrow('ERROR: boom');
  });
});
