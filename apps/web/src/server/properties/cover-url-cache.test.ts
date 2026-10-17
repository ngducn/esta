import { describe, expect, test, vi } from 'vitest';
import { coverUrlCache, type SignedPath } from './cover-url-cache';

const TTL_SECONDS = 100;
let token = 0;
const signer = () => vi.fn(async (paths: string[]): Promise<SignedPath[]> => paths.map((path) => ({ path, signedUrl: `${path}?token=${++token}` })));

describe('coverUrlCache', () => {
  test('a second render inside half the TTL returns the same URL without signing again', async () => {
    const sign = coverUrlCache(TTL_SECONDS);
    const signMissing = signer();

    const first = await sign('m1', ['h/p/a.avif', 'h/p/a.avif'], 0, signMissing);
    const second = await sign('m1', ['h/p/a.avif'], 49_999, signMissing);

    expect(second.get('h/p/a.avif')).toBe(first.get('h/p/a.avif'));
    expect(signMissing).toHaveBeenCalledTimes(1);
    expect(signMissing).toHaveBeenCalledWith(['h/p/a.avif']);
  });

  test('a render at half the TTL signs a fresh URL', async () => {
    const sign = coverUrlCache(TTL_SECONDS);
    const signMissing = signer();

    const first = await sign('m1', ['h/p/a.avif'], 0, signMissing);
    const later = await sign('m1', ['h/p/a.avif'], 50_000, signMissing);

    expect(later.get('h/p/a.avif')).not.toBe(first.get('h/p/a.avif'));
    expect(signMissing).toHaveBeenCalledTimes(2);
  });

  test('another member never receives a URL signed on someone else’s session', async () => {
    const sign = coverUrlCache(TTL_SECONDS);
    const signMissing = signer();

    const mine = await sign('m1', ['h/p/a.avif'], 0, signMissing);
    const theirs = await sign('m2', ['h/p/a.avif'], 1, signMissing);

    expect(theirs.get('h/p/a.avif')).not.toBe(mine.get('h/p/a.avif'));
    expect(signMissing).toHaveBeenLastCalledWith(['h/p/a.avif']);
  });

  test('only missing paths are signed, and a path Storage refuses gets no URL and is asked again next time', async () => {
    const sign = coverUrlCache(TTL_SECONDS);
    const signMissing = vi.fn(async (paths: string[]): Promise<SignedPath[]> =>
      paths.map((path) => ({ path, signedUrl: path.endsWith('gone.avif') ? null : `${path}?token=${++token}` })),
    );

    await sign('m1', ['h/p/a.avif'], 0, signMissing);
    const urls = await sign('m1', ['h/p/a.avif', 'h/q/gone.avif'], 1, signMissing);
    await sign('m1', ['h/q/gone.avif'], 2, signMissing);

    expect([...urls.keys()]).toEqual(['h/p/a.avif']);
    expect(signMissing.mock.calls).toEqual([[['h/p/a.avif']], [['h/q/gone.avif']], [['h/q/gone.avif']]]);
  });
});
