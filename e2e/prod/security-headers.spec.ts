import { expect, test } from '@playwright/test';
import { parseCsp } from '../../apps/web/src/server/security/csp';

const STATIC_HEADERS = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(self), geolocation=(), microphone=()',
};
const PATHS = ['/sign-in', '/', '/api/cron/keep-alive', '/manifest.webmanifest'];

for (const path of PATHS) {
  test(`${path} answers with the security headers and a CSP`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    for (const [name, value] of Object.entries(STATIC_HEADERS)) expect(response.headers()[name], name).toBe(value);
    const csp = parseCsp(response.headers()['content-security-policy'] ?? '');
    expect(csp['script-src']).toEqual(expect.arrayContaining(["'self'", "'strict-dynamic'"]));
    expect(csp['script-src']?.some((source) => /^'nonce-[A-Za-z0-9+/=]{16,}'$/.test(source))).toBe(true);
    expect(csp['script-src']).not.toContain("'unsafe-inline'");
    expect(csp['script-src']).not.toContain("'unsafe-eval'");
    for (const name of ['default-src', 'worker-src', 'frame-ancestors', 'base-uri', 'form-action', 'object-src', 'font-src', 'img-src', 'connect-src']) expect(csp[name], name).toBeDefined();
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
  });
}

test('every request gets a new nonce, and the page runs its scripts under it', async ({ request }) => {
  const nonceOf = async () => /'nonce-([^']+)'/.exec((await request.get('/sign-in')).headers()['content-security-policy'] ?? '')?.[1];
  const [first, second] = [await nonceOf(), await nonceOf()];
  expect(first).toBeDefined();
  expect(first).not.toBe(second);
  const html = await (await request.get('/sign-in')).text();
  expect(html).toMatch(/<script[^>]*nonce="[^"]+"/);
});
