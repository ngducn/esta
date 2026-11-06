export const CRON_PATHS = ['/api/cron/lease-status', '/api/cron/invoices', '/api/cron/document-sweep', '/api/cron/keep-alive'];

const REQUIRED_HEADERS = ['strict-transport-security', 'x-content-type-options', 'referrer-policy', 'permissions-policy'];

export type SmokeResult = { readonly name: string; readonly ok: boolean; readonly detail: string };

type BuildEnv = 'production' | 'test';

async function status(base: string, path: string, init?: RequestInit): Promise<number> {
  return (await fetch(new URL(path, base), { redirect: 'manual', ...init })).status;
}

export async function runSmoke(base: string, buildEnv: BuildEnv): Promise<SmokeResult[]> {
  const signIn = await fetch(new URL('/sign-in', base));
  const html = await signIn.text();
  const missing = REQUIRED_HEADERS.filter((name) => !signIn.headers.has(name));
  const csp = signIn.headers.get('content-security-policy') ?? '';
  const results: SmokeResult[] = [
    { name: 'security headers', ok: missing.length === 0, detail: missing.length === 0 ? REQUIRED_HEADERS.join(', ') : `missing ${missing.join(', ')}` },
    { name: 'content security policy', ok: csp.includes("frame-ancestors 'none'"), detail: csp === '' ? 'no header' : "frame-ancestors 'none'" },
    { name: 'sign-in page', ok: signIn.status === 200 && html.includes('Đăng nhập'), detail: `${signIn.status}, Đăng nhập ${html.includes('Đăng nhập') ? 'shown' : 'not found'}` },
  ];
  if (buildEnv === 'production') {
    const dev = await status(base, '/dev');
    const clock = await status(base, '/api/test/clock', { method: 'POST' });
    results.push(
      { name: '/dev is hidden', ok: dev === 404, detail: String(dev) },
      { name: '/api/test/clock is hidden', ok: clock === 404, detail: String(clock) },
    );
  }
  for (const path of CRON_PATHS) {
    const code = await status(base, path);
    results.push({ name: `${path} needs the secret`, ok: code === 401, detail: String(code) });
  }
  return results;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const buildEnv: BuildEnv = args.includes('--env=test') ? 'test' : 'production';
  const base = args.find((arg) => !arg.startsWith('--'));
  if (base === undefined) {
    console.error('Usage: node scripts/smoke.ts <base-url> [--env=test]');
    process.exit(2);
  }
  const results = await runSmoke(base, buildEnv);
  for (const result of results) console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.name}: ${result.detail}`);
  if (results.some((result) => !result.ok)) process.exit(1);
  console.log(buildEnv === 'test' ? 'smoke ok (test build: hidden-route checks skipped)' : 'smoke ok');
}
