import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { runSmoke, CRON_PATHS } from './smoke.ts';

type Fault = 'header' | 'dev' | 'clock' | 'signin' | 'cron' | 'csp' | undefined;

let server: Server | undefined;
afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())));

async function stub(fault: Fault): Promise<string> {
  server = createServer((request, response) => {
    const path = request.url ?? '/';
    if (path === '/sign-in') {
      response.setHeader('content-security-policy', fault === 'csp' ? "default-src 'self'" : "default-src 'self'; frame-ancestors 'none'");
      response.setHeader('strict-transport-security', 'max-age=63072000; includeSubDomains');
      if (fault !== 'header') response.setHeader('x-content-type-options', 'nosniff');
      response.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
      response.setHeader('permissions-policy', 'camera=(self)');
      response.end(fault === 'signin' ? '<h1>Welcome</h1>' : '<h1>Đăng nhập</h1>');
      return;
    }
    if (path.startsWith('/dev')) return void response.writeHead(fault === 'dev' ? 200 : 404).end();
    if (path === '/api/test/clock') return void response.writeHead(fault === 'clock' ? 405 : 404).end();
    if (CRON_PATHS.includes(path)) return void response.writeHead(fault === 'cron' ? 200 : 401).end('{}');
    response.writeHead(404).end();
  });
  await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('runSmoke', () => {
  it('passes a healthy production server and lists every check', async () => {
    const results = await runSmoke(await stub(undefined), 'production');
    expect(results.filter((result) => !result.ok)).toEqual([]);
    expect(results.map((result) => result.name)).toEqual(
      expect.arrayContaining(['security headers', 'content security policy', '/dev is hidden', '/api/test/clock is hidden', 'sign-in page', ...CRON_PATHS.map((path) => `${path} needs the secret`)]),
    );
  });

  it.each([
    ['header', 'security headers'],
    ['csp', 'content security policy'],
    ['dev', '/dev is hidden'],
    ['clock', '/api/test/clock is hidden'],
    ['signin', 'sign-in page'],
    ['cron', `${CRON_PATHS[0]} needs the secret`],
  ] as const)('fails the %s fault on %s', async (fault, name) => {
    const results = await runSmoke(await stub(fault), 'production');
    expect(results.find((result) => result.name === name)?.ok).toBe(false);
  });

  it('skips the hidden-route checks for a test build', async () => {
    const results = await runSmoke(await stub('dev'), 'test');
    expect(results.find((result) => result.name === '/dev is hidden')).toBeUndefined();
  });

  it('checks every cron route vercel.json schedules', () => {
    const paths = (JSON.parse(readFileSync('apps/web/vercel.json', 'utf8')) as { crons: { path: string }[] }).crons.map((cron) => cron.path);
    expect([...CRON_PATHS].sort()).toEqual([...paths].sort());
  });

  it('sends only GET or HEAD to the target', async () => {
    const methods = new Set<string>();
    server = createServer((request, response) => {
      methods.add(request.method ?? '');
      response.writeHead(request.url === '/sign-in' ? 200 : 404).end('Đăng nhập');
    });
    await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done));
    await runSmoke(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, 'production');
    expect([...methods].filter((method) => method !== 'GET' && method !== 'HEAD')).toEqual([]);
  });

  it('does not pass a sign-in that redirects to another page holding Đăng nhập', async () => {
    server = createServer((request, response) => {
      if (request.url === '/sign-in') return void response.writeHead(307, { location: '/sign-up' }).end();
      if (request.url === '/sign-up') return void response.writeHead(200).end('<a>Đăng nhập</a>');
      response.writeHead(404).end();
    });
    await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done));
    const results = await runSmoke(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, 'production');
    expect(results.find((result) => result.name === 'sign-in page')?.ok).toBe(false);
  });

  it('says whether the clock route is visible and refusing, or hidden', async () => {
    const hidden = await runSmoke(await stub(undefined), 'production');
    expect(hidden.find((result) => result.name === '/api/test/clock is hidden')?.detail).toContain('404');
  });
});
