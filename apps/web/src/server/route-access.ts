import type { Capability } from '@/server/access';

/**
 * Who may open each page and route under `src/app`, by URL pattern (route groups left out). The proxy answers 404 for a
 * `not-found` route from this table, and `route-access.test.ts` fails when a page or route file is in neither this table nor
 * the public list.
 *
 * - `public`: reachable signed out; `public-paths.ts` holds the paths.
 * - `member`: any signed-in member. A record page below it is hidden by RLS and the proxy's record lookups.
 * - `needs`: a capability, and what a member without it gets: `not-found` (the proxy's 404), `in-page` (the page shows a note
 *   or leaves the control out) or `forbidden` (an API route's 403).
 */
export type RouteAccess =
  | 'public'
  | 'member'
  | { readonly needs: Capability; readonly denied: 'not-found' | 'in-page' | 'forbidden' };

const hidden = (needs: Capability): RouteAccess => ({ needs, denied: 'not-found' });
const inPage = (needs: Capability): RouteAccess => ({ needs, denied: 'in-page' });
const forbidden = (needs: Capability): RouteAccess => ({ needs, denied: 'forbidden' });

export const ROUTE_ACCESS: Readonly<Record<string, RouteAccess>> = {
  '/': 'member',
  '/assistant': 'member',
  '/assistant/ask/[conversationId]': 'member',
  '/assistant/diagnostics': hidden('operate'),
  '/assistant/market': 'member',
  '/collections': 'member',
  '/collections/import': inPage('import'),
  '/collections/import/[id]': hidden('import'),
  '/collections/invoices/[invoiceId]': 'member',
  '/documents': 'member',
  '/documents/[documentId]': 'member',
  '/documents/[documentId]/review': 'member',
  '/open/[type]/[id]': 'member',
  '/properties': 'member',
  '/properties/archived': 'member',
  '/properties/new': hidden('edit'),
  '/properties/[id]': 'member',
  '/properties/[id]/activity': 'member',
  '/properties/[id]/documents': 'member',
  '/properties/[id]/edit': hidden('edit'),
  '/properties/[id]/finance': 'member',
  '/properties/[id]/legal': 'member',
  '/properties/[id]/legal/[kind]/[itemId]': hidden('edit'),
  '/properties/[id]/rental': 'member',
  '/properties/[id]/rental/accounts/[accountId]': hidden('edit'),
  '/properties/[id]/rental/leases/[leaseId]': 'member',
  '/properties/[id]/rental/meters': 'member',
  '/reports': 'member',
  '/reports/tax': 'member',
  '/settings': 'member',
  '/settings/history': hidden('operate'),
  '/tenants/[partyId]': hidden('tenants'),
  '/onboarding': 'member',
  '/api/answers/[answerId]': 'member',
  '/api/documents/[documentId]/view': 'member',
  '/api/export/[report]': 'member',
  '/api/export/party/[partyId]': forbidden('export'),
  '/api/export': forbidden('export'),
  '/api/invoices/[invoiceId]/receipt': 'member',
  '/map-worker': 'member',
  '/api/cron/document-sweep': 'public',
  '/api/cron/invoices': 'public',
  '/api/cron/keep-alive': 'public',
  '/api/cron/lease-status': 'public',
  '/api/test/clock': 'public',
  '/dev': 'public',
  '/dev/components': 'public',
  '/dev/core': 'public',
  '/dev/glyphs': 'public',
  '/dev/i18n': 'public',
  '/forgot-password': 'public',
  '/q/[token]': 'public',
  '/sign-in': 'public',
  '/sign-in/callback': 'public',
  '/sign-in/code': 'public',
  '/sign-up': 'public',
};

function patternOf(route: string): RegExp {
  const segments = route.split('/').filter((segment) => segment !== '');
  const body = segments.map((segment) => (segment.startsWith('[') ? '[^/]+' : segment.replace(/[.*+?^${}()|\\]/g, '\\$&'))).join('/');
  return new RegExp(`^/${body}/?$`);
}

const NOT_FOUND_ROUTES = Object.entries(ROUTE_ACCESS).flatMap(([route, access]) =>
  typeof access === 'object' && access.denied === 'not-found' ? [{ route, needs: access.needs, pattern: patternOf(route) }] : [],
);

/** The capability a visit to `pathname` needs for the proxy to let it through, or null when the table asks for none. */
export function hiddenWithout(pathname: string): Capability | null {
  return NOT_FOUND_ROUTES.find(({ pattern }) => pattern.test(pathname))?.needs ?? null;
}

export function routePattern(route: string): RegExp {
  return patternOf(route);
}
