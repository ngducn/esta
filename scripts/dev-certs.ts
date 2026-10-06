import { spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Mkcert = (args: readonly string[], caRoot: string) => { status: number | null; stderr: string };

export type LanCertificates = { certFile: string; keyFile: string; publicDir: string };

export function runMkcert(args: readonly string[], caRoot: string): { status: number | null; stderr: string } {
  return spawnSync('mkcert', args, { env: { ...process.env, CAROOT: caRoot }, encoding: 'utf8' });
}

export function ensureCertificates({
  lan,
  certsDir,
  caRoot,
  mkcert = runMkcert,
}: {
  lan: string;
  certsDir: string;
  caRoot: string;
  mkcert?: Mkcert;
}): LanCertificates {
  const caFile = join(caRoot, 'rootCA.pem');
  const certFile = join(certsDir, `lan-${lan}.pem`);
  const keyFile = join(certsDir, `lan-${lan}-key.pem`);
  const publicDir = join(certsDir, 'public');
  mkdirSync(publicDir, { recursive: true });
  const reusable =
    existsSync(certFile) &&
    existsSync(keyFile) &&
    existsSync(caFile) &&
    new X509Certificate(readFileSync(certFile)).verify(new X509Certificate(readFileSync(caFile)).publicKey);
  if (!reusable) {
    mkdirSync(caRoot, { recursive: true, mode: 0o700 });
    const result = mkcert(['-cert-file', certFile, '-key-file', keyFile, lan, 'localhost', '127.0.0.1'], caRoot);
    if (result.status !== 0) throw new Error(`mkcert failed: ${result.stderr}`);
  }
  copyFileSync(caFile, join(publicDir, 'esta-dev-ca.crt'));
  return { certFile, keyFile, publicDir };
}
