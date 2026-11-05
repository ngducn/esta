export type EmptyContext = {
  readonly canWrite: boolean;
  readonly propertyId?: string;
};

export type EmptyValues = Readonly<Record<string, string | number>>;

export type Translate = (key: string, values?: EmptyValues) => string;

export const looseTranslate = (t: unknown): Translate => t as Translate;

type EmptyAction = {
  readonly label: string;
  readonly href: ((ctx: EmptyContext) => string) | null;
  readonly write: boolean;
};

type EmptyEntry = {
  readonly ns: string;
  readonly title: string;
  readonly body?: string;
  readonly viewerTitle?: string;
  readonly viewerBody?: string;
  readonly action: EmptyAction;
};

const propertyHref = (tail: string) => (ctx: EmptyContext) => `/properties/${ctx.propertyId ?? ''}${tail}`;
const report = (key: string): EmptyEntry => ({ ns: 'reports', title: `${key}Empty`, action: { label: 'emptyAction', href: () => '/properties', write: false } });

export const EMPTY_STATES = {
  home: { ns: 'home', title: 'emptyTitle', body: 'emptyBody', action: { label: 'emptyAction', href: () => '/properties/new', write: true } },
  properties: { ns: 'properties', title: 'empty', body: 'emptyBody', action: { label: 'add', href: () => '/properties/new', write: true } },
  propertiesArchived: { ns: 'properties', title: 'archivedEmpty', action: { label: 'archivedEmptyAction', href: () => '/properties', write: false } },
  propertyLegalCertificates: {
    ns: 'propertyLegal',
    title: 'certificatesEmpty',
    body: 'certificatesEmptyBody',
    action: { label: 'addCertificate', href: propertyHref('/legal/certificates/new'), write: true },
  },
  propertyLegalParcels: {
    ns: 'propertyLegal',
    title: 'parcelsEmpty',
    body: 'parcelsEmptyBody',
    action: { label: 'addParcel', href: propertyHref('/legal/parcels/new'), write: true },
  },
  propertyLegalStructures: {
    ns: 'propertyLegal',
    title: 'structuresEmpty',
    body: 'structuresEmptyBody',
    action: { label: 'addStructure', href: propertyHref('/legal/structures/new'), write: true },
  },
  propertyRentalAccounts: {
    ns: 'propertyRental',
    title: 'accountsEmpty',
    body: 'accountsEmptyBody',
    action: { label: 'addAccount', href: propertyHref('/rental/accounts/new'), write: true },
  },
  propertyMeters: { ns: 'meters', title: 'empty', body: 'emptyBody', action: { label: 'emptyAction', href: propertyHref('/rental'), write: true } },
  propertyDocuments: { ns: 'documents', title: 'empty', body: 'emptyBodyProperty', action: { label: 'add', href: null, write: true } },
  propertyActivity: { ns: 'propertyDetail', title: 'activityEmpty', body: 'activityEmptyBody', action: { label: 'activityEmptyAction', href: propertyHref('/edit'), write: true } },
  leaseDocuments: { ns: 'leases', title: 'documentsEmpty', body: 'documentsEmptyBody', viewerBody: 'documentsViewerEmpty', action: { label: 'uploadContract', href: null, write: true } },
  collections: { ns: 'collections', title: 'empty', body: 'emptyBody', action: { label: 'emptyAction', href: () => '/properties', write: false } },
  statementImport: { ns: 'statements', title: 'noAccountTitle', body: 'noAccountBody', action: { label: 'noAccountAction', href: () => '/collections', write: false } },
  documents: { ns: 'documents', title: 'empty', body: 'emptyBody', action: { label: 'emptyAction', href: () => '/properties', write: true } },
  assistantThread: { ns: 'assistant', title: 'threadEmpty', body: 'threadEmptyBody', action: { label: 'threadEmptyAction', href: () => '/assistant#composer', write: false } },
  assistantMarket: { ns: 'assistant', title: 'market.empty', action: { label: 'threadEmptyAction', href: () => '/assistant#composer', write: false } },
  reportsPnl: report('pnl'),
  reportsRentRoll: report('rentRoll'),
  reportsCollections: report('collections'),
  reportsOwners: report('owners'),
  reportsOccupancy: report('occupancy'),
  reportsPortfolio: report('portfolio'),
  settingsAccounts: { ns: 'settings', title: 'accountsEmpty', viewerTitle: 'accountsEmptyReadOnly', action: { label: 'accountAdd', href: null, write: true } },
  settingsHistory: { ns: 'history', title: 'empty', action: { label: 'emptyAction', href: () => '/settings', write: false } },
} as const satisfies Record<string, EmptyEntry>;

export type EmptySurface = keyof typeof EMPTY_STATES;

export type ResolvedEmpty = {
  readonly title: string;
  readonly body?: string;
  readonly action?: { readonly label: string; readonly href: string | null };
};

const entries: Readonly<Record<EmptySurface, EmptyEntry>> = EMPTY_STATES;

export function emptyState(surface: EmptySurface, t: Translate, ctx: EmptyContext, values?: EmptyValues): ResolvedEmpty {
  const entry = entries[surface];
  const readOnly = !ctx.canWrite;
  const title = readOnly && entry.viewerTitle !== undefined ? entry.viewerTitle : entry.title;
  const body = readOnly && entry.viewerBody !== undefined ? entry.viewerBody : entry.body;
  return {
    title: t(title, values),
    ...(body === undefined ? {} : { body: t(body, values) }),
    ...(entry.action.write && readOnly ? {} : { action: { label: t(entry.action.label), href: entry.action.href === null ? null : entry.action.href(ctx) } }),
  };
}
