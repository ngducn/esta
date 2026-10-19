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
