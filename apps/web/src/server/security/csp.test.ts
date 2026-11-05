import { describe, expect, it } from 'vitest';
import { buildCsp, parseCsp } from './csp';
import { SECURITY_HEADERS } from './headers';

const options = { nonce: 'abc123', supabaseUrl: 'https://abc.supabase.co', tileHost: 'https://tiles.openfreemap.org', development: false };
const directives = (overrides: Partial<typeof options> = {}) => parseCsp(buildCsp({ ...options, ...overrides }));

describe('buildCsp', () => {
  it('allows scripts from the app and this request only', () => {
    expect(directives()['script-src']).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
  });

  it.each([
    ['default-src', ["'self'"]],
    ['font-src', ["'self'"]],
    ['worker-src', ["'self'", 'blob:']],
    ['frame-ancestors', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['object-src', ["'none'"]],
  ])('sets %s', (name, values) => {
    expect(directives()[name]).toEqual(values);
  });

  it('lets the page reach Supabase over https and wss, and the tile host', () => {
    expect(directives()['connect-src']).toEqual(["'self'", 'https://abc.supabase.co', 'wss://abc.supabase.co', 'https://tiles.openfreemap.org']);
  });

  it('lets images come from the app, blob and data URLs, Supabase and the tile host', () => {
    expect(directives()['img-src']).toEqual(["'self'", 'blob:', 'data:', 'https://abc.supabase.co', 'https://tiles.openfreemap.org']);
  });

  it('keeps the port of a local Supabase URL and uses ws for http', () => {
    const local = directives({ supabaseUrl: 'http://127.0.0.1:54321' });
    expect(local['connect-src']).toContain('http://127.0.0.1:54321');
    expect(local['connect-src']).toContain('ws://127.0.0.1:54321');
    expect(local['img-src']).toContain('http://127.0.0.1:54321');
  });

  it('never allows unsafe-inline or unsafe-eval for scripts in production', () => {
    const all = buildCsp(options);
    const script = directives()['script-src'] ?? [];
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
    expect(all).not.toContain("'unsafe-eval'");
  });

  it('allows unsafe-eval only in development, for React debugging', () => {
    expect(directives({ development: true })['script-src']).toContain("'unsafe-eval'");
  });

  it('changes only the nonce between two requests', () => {
    expect(buildCsp({ ...options, nonce: 'other' })).toBe(buildCsp(options).replaceAll('abc123', 'other'));
  });
});

describe('SECURITY_HEADERS', () => {
  it('holds the four static headers of SPEC 7.1', () => {
    expect(Object.fromEntries(SECURITY_HEADERS.map(({ key, value }) => [key, value]))).toEqual({
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(self), geolocation=(), microphone=()',
    });
  });
});
