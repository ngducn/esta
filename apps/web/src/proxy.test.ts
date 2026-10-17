import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

const coverUrl = 'http://localhost:3500/storage/v1/object/sign/property-photos/h/p/nha-pho.avif?token=signed';

describe('proxy cover rewrite', () => {
  it('sends the signed URL to Storage without the session cookie or a bearer', async () => {
    const request = new NextRequest(coverUrl, {
      headers: {
        cookie: 'sb-127-auth-token=base64-access-and-refresh',
        authorization: 'Bearer user-jwt',
        accept: 'image/avif',
      },
    });

    const response = await proxy(request);

    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://127.0.0.1:54321/storage/v1/object/sign/property-photos/h/p/nha-pho.avif?token=signed',
    );
    const forwarded = (response.headers.get('x-middleware-override-headers') ?? '').split(',');
    expect(forwarded).toContain('accept');
    expect(forwarded).not.toContain('cookie');
    expect(forwarded).not.toContain('authorization');
    expect(response.headers.get('x-middleware-request-cookie')).toBeNull();
    expect(response.headers.get('x-middleware-request-authorization')).toBeNull();
  });
});
