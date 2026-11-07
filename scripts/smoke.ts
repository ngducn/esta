import { readFileSync } from 'node:fs';
import { z } from 'zod';

const vercelConfig = z
  .object({ regions: z.array(z.string()).min(1), crons: z.array(z.object({ path: z.string() })) })
  .parse(JSON.parse(readFileSync(new URL('../apps/web/vercel.json', import.meta.url), 'utf8')));

/** The routes Vercel schedules, read from apps/web/vercel.json so a new cron cannot be left out of the check. */
export const CRON_PATHS: readonly string[] = vercelConfig.crons.map((cron) => cron.path);

/**
 * `x-vercel-id` reads `<edge>::<function region>::<id>` when a function answered. A CLI deploy on 2026-11-07 ran in
 * iad1 although vercel.json said sin1, until the project's own function region was set (DEPLOY.md section 4).
 */
function functionRegion(vercelId: string): string | undefined {
  const parts = vercelId.split('::');
  return parts.length >= 3 ? parts.at(-2) : undefined;
}

const REQUIRED_HEADERS = ['strict-transport-security', 'x-content-type-options', 'referrer-policy', 'permissions-policy'];

export type SmokeResult = { readonly name: string; readonly ok: boolean; readonly detail: string };

type BuildEnv = 'production' | 'test';

/** GET only, and a redirect stays a redirect: following one could land on a page that happens to pass. */
async function status(base: string, path: string): Promise<number> {
  return (await fetch(new URL(path, base), { redirect: 'manual' })).status;
}

export async function runSmoke(base: string, buildEnv: BuildEnv): Promise<SmokeResult[]> {
  const signIn = await fetch(new URL('/sign-in', base), { redirect: 'manual' });
  const html = await signIn.text();
  const missing = REQUIRED_HEADERS.filter((name) => !signIn.headers.has(name));
  const csp = signIn.headers.get('content-security-policy') ?? '';
  const results: SmokeResult[] = [
    { name: 'security headers', ok: missing.length === 0, detail: missing.length === 0 ? REQUIRED_HEADERS.join(', ') : `missing ${missing.join(', ')}` },
    { name: 'content security policy', ok: csp.includes("frame-ancestors 'none'"), detail: csp === '' ? 'no header' : "frame-ancestors 'none'" },
    { name: 'sign-in page', ok: signIn.status === 200 && html.includes('Đăng nhập'), detail: `${signIn.status}, Đăng nhập ${html.includes('Đăng nhập') ? 'shown' : 'not found'}` },
  ];
  const vercelId = signIn.headers.get('x-vercel-id');
  if (vercelId !== null) {
    const region = functionRegion(vercelId);
    results.push({ name: 'function region', ok: region !== undefined && vercelConfig.regions.includes(region), detail: `ran in ${region ?? 'no function'}, expected ${vercelConfig.regions.join(' or ')}` });
  }
  if (buildEnv === 'production') {
    const dev = await status(base, '/dev');
    const clock = await status(base, '/api/test/clock');
    results.push(
      { name: '/dev is hidden', ok: dev === 404, detail: String(dev) },
      { name: '/api/test/clock is hidden', ok: clock === 404, detail: clock === 404 ? '404, hidden' : `${clock}, ${clock === 401 || clock === 405 ? 'visible, the route answers' : 'not hidden'}` },
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
