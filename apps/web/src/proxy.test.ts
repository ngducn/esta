import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

const signedPaths = ['/storage/v1/object/sign/property-photos/h/p/nha-pho.avif?token=signed', '/storage/v1/object/sign/documents/h/d/thumb.webp?token=signed'];

describe('proxy signed Storage rewrite', () => {
  it.each(signedPaths)('sends %s to Storage without the session cookie or a bearer', async (path) => {
    const request = new NextRequest(`http://localhost:3500${path}`, {
      headers: {
        cookie: 'sb-127-auth-token=base64-access-and-refresh',
        authorization: 'Bearer user-jwt',
        accept: 'image/avif',
      },
    });

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-rewrite')).toBe(`http://127.0.0.1:54321${path}`);
    const forwarded = (response.headers.get('x-middleware-override-headers') ?? '').split(',');
    expect(forwarded).toContain('accept');
    expect(forwarded).not.toContain('cookie');
    expect(forwarded).not.toContain('authorization');
    expect(response.headers.get('x-middleware-request-cookie')).toBeNull();
    expect(response.headers.get('x-middleware-request-authorization')).toBeNull();
  });
});

describe('proxy signed Storage previews stay out of shared caches and accept only reads', () => {
  it.each(signedPaths)('keeps %s out of every shared cache', async (path) => {
    const response = await proxy(new NextRequest(`http://localhost:3500${path}`));

    expect(response.headers.get('cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('cache-control')).toBe('private');
  });

  it.each(['GET', 'HEAD'])('rewrites a %s to Storage', async (method) => {
    const response = await proxy(new NextRequest(`http://localhost:3500${signedPaths[1]}`, { method }));

    expect(response.headers.get('x-middleware-rewrite')).not.toBeNull();
  });

  it.each(signedPaths.flatMap((path) => ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map((method) => [method, path] as const)))(
    'answers a %s to %s with 405 and never reaches Storage',
    async (method, path) => {
      const response = await proxy(new NextRequest(`http://localhost:3500${path}`, { method, body: method === 'OPTIONS' ? undefined : 'x' }));

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, HEAD');
      expect(response.headers.get('x-middleware-rewrite')).toBeNull();
      expect(response.headers.get('cdn-cache-control')).toBe('no-store');
    },
  );
});

describe('proxy signed-out redirect', () => {
  it('sends a signed-out visit to sign-in and remembers the page, so a notice link opens its note after sign-in', async () => {
    const url = 'http://localhost:3500/assistant?note=0b0a1c2e-1111-4222-8333-444455556666';
    const response = await proxy(new NextRequest(url, { headers: { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' } }));

    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/sign-in');
    expect(response.cookies.get('esta_return')?.value).toBe('/assistant?note=0b0a1c2e-1111-4222-8333-444455556666');
  });

  it('remembers nothing for a background fetch of a page', async () => {
    const response = await proxy(new NextRequest('http://localhost:3500/collections', { headers: { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty', rsc: '1' } }));

    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/sign-in');
    expect(response.cookies.get('esta_return')).toBeUndefined();
  });

  it('remembers nothing for Home', async () => {
    const response = await proxy(new NextRequest('http://localhost:3500/'));

    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/sign-in');
    expect(response.cookies.get('esta_return')).toBeUndefined();
  });
});
