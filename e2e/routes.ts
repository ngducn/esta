import { seedId } from '../supabase/seed/generator/ids.ts';

/** Who opens the route: a seeded member, the seeded operator, nobody, or an address with no household yet. */
export type Viewer = 'member' | 'operator' | 'signed-out' | 'newcomer';

/** `page` is the folder of the `page.tsx` under `apps/web/src/app`; `path` is null for a route the seed cannot open, with the reason in `skip`. */
export type AppRoute = { id: string; page: string; path: string | null; viewer: Viewer; skip?: string };

export const MEMBER = 'me@demo.esta.test';
export const OPERATOR = 'ryan@demo.esta.test';

const HOUSEHOLD = 'demo';
const property = (key: string) => seedId(`seed:property:${HOUSEHOLD}:${key}`);
const DI_AN = property('di-an');
const Q7 = property('q7');
const lease = seedId(`seed:lease:${HOUSEHOLD}:di-an:1`);
const invoice = seedId(`seed:invoice:${HOUSEHOLD}:di-an:1:2026-10-25`);
const document = (key: string) => seedId(`seed:document:${HOUSEHOLD}:${key}`);
const parcel = seedId(`seed:parcel:${HOUSEHOLD}:q7:1`);
const statementImport = seedId(`seed:statement-import:${HOUSEHOLD}`);
const conversation = seedId(`seed:conversation:${HOUSEHOLD}`);
const utilityAccount = seedId(`seed:utility-account:${HOUSEHOLD}:di-an:electricity`);

const route = (page: string, path: string, viewer: Viewer = 'member'): AppRoute => ({ id: path === '/' ? 'home' : path.slice(1).replace(/[/?=&]/g, '-'), page, path, viewer });

export const APP_ROUTES: readonly AppRoute[] = [
  route('(app)', '/'),
  route('(app)/properties', '/properties'),
  route('(app)/properties/archived', '/properties/archived'),
  route('(app)/properties/new', '/properties/new'),
  route('(app)/properties/[id]', `/properties/${DI_AN}`),
  route('(app)/properties/[id]/edit', `/properties/${DI_AN}/edit`),
  route('(app)/properties/[id]/legal', `/properties/${Q7}/legal`),
  route('(app)/properties/[id]/legal/[kind]/[itemId]', `/properties/${Q7}/legal/parcels/${parcel}`),
  route('(app)/properties/[id]/rental', `/properties/${DI_AN}/rental`),
  route('(app)/properties/[id]/rental/meters', `/properties/${DI_AN}/rental/meters`),
  route('(app)/properties/[id]/rental/leases/[leaseId]', `/properties/${DI_AN}/rental/leases/${lease}`),
  route('(app)/properties/[id]/rental/accounts/[accountId]', `/properties/${DI_AN}/rental/accounts/${utilityAccount}`),
  route('(app)/properties/[id]/documents', `/properties/${Q7}/documents`),
  route('(app)/properties/[id]/finance', `/properties/${DI_AN}/finance`),
  route('(app)/properties/[id]/activity', `/properties/${DI_AN}/activity`),
  route('(app)/collections', '/collections'),
  route('(app)/collections/import', '/collections/import'),
  route('(app)/collections/invoices/[invoiceId]', `/collections/invoices/${invoice}`),
  route('(app)/collections/import/[id]', `/collections/import/${statementImport}`),
  route('(app)/documents/(vault)/(list)', '/documents'),
  route('(app)/documents/(vault)/[documentId]', `/documents/${document('q7:certificate')}`),
  route('(app)/documents/[documentId]/review', `/documents/${document('di-an:lease-phong-8')}/review`),
  route('(app)/assistant', '/assistant'),
  route('(app)/assistant/market', '/assistant/market'),
  route('(app)/assistant/diagnostics', '/assistant/diagnostics', 'operator'),
  route('(app)/assistant/ask/[conversationId]', `/assistant/ask/${conversation}`),
  route('(app)/open/[type]/[id]', `/open/property/${DI_AN}`),
  route('(app)/reports', '/reports'),
  route('(app)/reports', '/reports?report=rent-roll'),
  route('(app)/reports', '/reports?report=collections'),
  route('(app)/reports', '/reports?report=owners'),
  route('(app)/reports', '/reports?report=occupancy'),
  route('(app)/reports', '/reports?report=portfolio'),
  route('(app)/reports/tax', '/reports/tax'),
  route('(app)/settings', '/settings'),
  route('(app)/settings/history', '/settings/history', 'operator'),
  route('sign-in', '/sign-in', 'signed-out'),
  route('sign-in/code', '/sign-in/code', 'signed-out'),
  route('sign-up', '/sign-up', 'signed-out'),
  route('forgot-password', '/forgot-password', 'signed-out'),
  route('onboarding', '/onboarding', 'newcomer'),
];

export type OpenRoute = AppRoute & { path: string };

export const OPEN_ROUTES: readonly OpenRoute[] = APP_ROUTES.filter((entry): entry is OpenRoute => entry.path !== null);
