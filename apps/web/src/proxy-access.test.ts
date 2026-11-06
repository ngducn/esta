import type { Database } from '@esta/db';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTE_ACCESS } from './server/route-access';

type Membership = { role: Database['public']['Enums']['member_role']; is_operator: boolean } | null;
const state: { membership: Membership } = { membership: null };

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => {
    const found = { maybeSingle: async () => ({ data: { id: 'x' }, error: null }) };
    const query = { select: () => ({ eq: () => found }) };
    return { auth: { getClaims: async () => ({ data: { claims: { sub: 'user' } } }) }, from: () => query };
  },
}));
vi.mock('@esta/ops', async (importOriginal) => ({ ...(await importOriginal<object>()), readMembership: async () => state.membership }));

const { proxy } = await import('./proxy');

const hiddenRoutes = Object.entries(ROUTE_ACCESS).flatMap(([route, access]) =>
  typeof access === 'object' && access.denied === 'not-found' ? [{ route, path: route.replace(/\[[^\]]+\]/g, '11111111-1111-4111-8111-111111111111'), needs: access.needs }] : [],
);

const asRole = (role: NonNullable<Membership>['role'], is_operator = false) => {
  state.membership = { role, is_operator };
};

describe('proxy answers 404 for a page the member has no capability for', () => {
  beforeEach(() => {
    state.membership = null;
  });

  it.each(hiddenRoutes.filter(({ needs }) => needs === 'edit'))('hides $route from a viewer and not from a member', async ({ path }) => {
    asRole('viewer');
    expect((await proxy(new NextRequest(`http://localhost:3500${path}`))).status).toBe(404);
    asRole('member');
    expect((await proxy(new NextRequest(`http://localhost:3500${path}`))).status).not.toBe(404);
  });

  it.each(hiddenRoutes.filter(({ needs }) => needs === 'import'))('hides $route from a member and not from an admin', async ({ path }) => {
    asRole('member');
    expect((await proxy(new NextRequest(`http://localhost:3500${path}`))).status).toBe(404);
    asRole('admin');
    expect((await proxy(new NextRequest(`http://localhost:3500${path}`))).status).not.toBe(404);
  });

  it.each(hiddenRoutes.filter(({ needs }) => needs === 'operate'))('hides $route from an admin without the operator flag', async ({ path }) => {
    asRole('admin');
    expect((await proxy(new NextRequest(`http://localhost:3500${path}`))).status).toBe(404);
    asRole('admin', true);
    expect((await proxy(new NextRequest(`http://localhost:3500${path}`))).status).not.toBe(404);
  });

  it('hides a page from a signed-in visitor who belongs to no household', async () => {
    state.membership = null;
    expect((await proxy(new NextRequest('http://localhost:3500/properties/new'))).status).toBe(404);
  });

  it('lets a viewer open a page the table does not hide', async () => {
    asRole('viewer');
    expect((await proxy(new NextRequest('http://localhost:3500/properties'))).status).not.toBe(404);
  });

  it.each([
    ['/settings/histor%79', 'one encoded letter'],
    ['/settings/%68%69%73%74%6f%72%79', 'a fully encoded segment'],
    ['/assistant/diagnostic%73', 'one encoded letter'],
    ['/properties/%4eew', 'upper-case hex'],
    ['/assistant/%64iagnostics', 'encoded first letter'],
    ['/settings%2Fhistory', 'an encoded slash'],
    ['/assistant%2fdiagnostics', 'an encoded slash in lower hex'],
    ['/properties/%6eew', 'a page that needs edit'],
  ])('hides %s (%s) in its encoded form from a member who lacks the capability', async (path) => {
    asRole('viewer');
    expect((await proxy(new NextRequest(`http://localhost:3500${path}`))).status).toBe(404);
  });

  it('hides an encoded operator page from an admin without the flag and not from the operator', async () => {
    asRole('admin');
    expect((await proxy(new NextRequest('http://localhost:3500/settings/histor%79'))).status).toBe(404);
    asRole('admin', true);
    expect((await proxy(new NextRequest('http://localhost:3500/settings/histor%79'))).status).not.toBe(404);
  });

  it('does not fail on a path that does not decode', async () => {
    asRole('admin');
    expect((await proxy(new NextRequest('http://localhost:3500/settings/%E0%A4%A'))).status).not.toBe(500);
  });
});
