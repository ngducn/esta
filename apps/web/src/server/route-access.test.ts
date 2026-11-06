import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPublicPath } from './public-paths';
import { hiddenWithout, ROUTE_ACCESS, routePattern } from './route-access';

const APP = join(import.meta.dirname, '..', 'app');

/** The URL pattern of every page and route file under src/app, route groups left out. */
function routesOnDisk(dir: string = APP): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routesOnDisk(path);
    if (!/^(page|route)\.tsx?$/.test(entry.name)) return [];
    const segments = relative(APP, dir).split(sep).filter((segment) => segment !== '' && !/^\(.*\)$/.test(segment));
    return [`/${segments.join('/')}`];
  });
}

const onDisk = routesOnDisk();

describe('the route access table', () => {
  it('finds the app directory', () => {
    expect(onDisk.length).toBeGreaterThan(40);
  });

  it('lists every page and route under src/app', () => {
    expect(onDisk.filter((route) => !(route in ROUTE_ACCESS))).toEqual([]);
  });

  it('lists no route that has no file', () => {
    expect(Object.keys(ROUTE_ACCESS).filter((route) => !onDisk.includes(route))).toEqual([]);
  });

  const example = (route: string) => route.replace(/\[[^\]]+\]/g, 'x');

  it('marks a route public exactly when the proxy lets a signed-out visit through', () => {
    const mismatched = Object.entries(ROUTE_ACCESS).filter(([route, access]) => (access === 'public') !== isPublicPath(example(route)));
    expect(mismatched.map(([route]) => route)).toEqual([]);
  });

  it('hides each not-found route from the proxy without its capability and no other route', () => {
    for (const [route, access] of Object.entries(ROUTE_ACCESS)) {
      const expected = typeof access === 'object' && access.denied === 'not-found' ? access.needs : null;
      expect(hiddenWithout(example(route)), route).toBe(expected);
    }
  });

  it('matches a route pattern against one segment per parameter only', () => {
    expect(routePattern('/tenants/[partyId]').test('/tenants/a/b')).toBe(false);
    expect(hiddenWithout('/tenants/abc')).toBe('tenants');
    expect(hiddenWithout('/properties/abc/edit')).toBe('edit');
    expect(hiddenWithout('/properties/abc')).toBeNull();
  });
});
