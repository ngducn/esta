import { beforeEach, describe, expect, test, vi } from 'vitest';

const session = vi.hoisted(() => ({ user: null as { id: string; email: string | null } | null }));
const resolver = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/server/member', () => ({ getSessionUser: async () => session.user }));
vi.mock('./resolve-short-maps-link', () => ({ resolveShortMapsLink: resolver }));
const { resolveMapsLink } = await import('./actions');

const PLACE = 'https://www.google.com/maps/place/Demo/@10.9,106.9,17z/data=!3d10.5331!4d106.4052';

describe('resolveMapsLink', () => {
  beforeEach(() => {
    session.user = { id: 'demo-user', email: 'me.lane1@demo.esta.test' };
    resolver.mockReset();
  });

  test('refuses a caller without a session before parsing or fetching anything', async () => {
    session.user = null;
    expect(await resolveMapsLink('https://maps.app.goo.gl/5EGXC5WSBATiA4av8')).toEqual({ ok: false, reason: 'signed_out' });
    expect(resolver).not.toHaveBeenCalled();
  });

  test('returns a long link parse directly, preferring the !3d!4d place over the viewport', async () => {
    expect(await resolveMapsLink(PLACE)).toEqual({ ok: true, lat: 10.5331, lng: 106.4052, outsideVietnam: false });
    expect(resolver).not.toHaveBeenCalled();
  });

  test('flags a point outside Vietnam', async () => {
    expect(await resolveMapsLink('https://www.google.com/maps/@48.8584,2.2945,17z')).toEqual({
      ok: true,
      lat: 48.8584,
      lng: 2.2945,
      outsideVietnam: true,
    });
  });

  test('sends only a short link to the resolver and passes its refusal through', async () => {
    resolver.mockResolvedValue({ ok: false, reason: 'timeout' });
    expect(await resolveMapsLink('Chợ Demo https://maps.app.goo.gl/Demo1')).toEqual({ ok: false, reason: 'timeout' });
    expect(resolver).toHaveBeenCalledExactlyOnceWith('https://maps.app.goo.gl/Demo1');
  });

  test('returns the point a short link resolves to', async () => {
    resolver.mockResolvedValue({ ok: true, value: { kind: 'point', point: { lat: 10.7725, lng: 106.698 }, source: 'place', outsideVietnam: false } });
    expect(await resolveMapsLink('https://maps.app.goo.gl/Demo2')).toEqual({ ok: true, lat: 10.7725, lng: 106.698, outsideVietnam: false });
  });

  test('refuses a shape that only looks like a short link without fetching', async () => {
    expect(await resolveMapsLink('https://maps.app.goo.gl@127.0.0.1/x')).toEqual({ ok: false, reason: 'not_maps' });
    expect(resolver).not.toHaveBeenCalled();
  });

  test('refuses input that is not a string or is too long', async () => {
    expect(await resolveMapsLink(42)).toEqual({ ok: false, reason: 'not_a_url' });
    expect(await resolveMapsLink(`${PLACE}${'x'.repeat(2048)}`)).toEqual({ ok: false, reason: 'too_long' });
    expect(resolver).not.toHaveBeenCalled();
  });
});
