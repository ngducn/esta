import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { EMPTY_STATES, emptyState, type EmptySurface, type Translate } from './empty-states';

const surfaces = Object.keys(EMPTY_STATES) as EmptySurface[];

const has = (messages: unknown, path: string) => path.split('.').reduce<unknown>((node, key) => (typeof node === 'object' && node !== null ? Reflect.get(node, key) : undefined), messages) !== undefined;

const keys = (surface: EmptySurface) => {
  const { ns, title, action, ...rest } = EMPTY_STATES[surface] as Record<string, unknown> & { ns: string; title: string; action: { label: string } | null };
  const named = [title, ...(action === null ? [] : [action.label]), ...Object.values(rest).filter((value): value is string => typeof value === 'string')];
  return named.map((key) => `${ns}.${key}`);
};

describe('EMPTY_STATES', () => {
  test.each(surfaces)('%s names messages that exist in vi and en', (surface) => {
    for (const path of keys(surface)) {
      expect(has(vi, path), `vi ${path}`).toBe(true);
      expect(has(en, path), `en ${path}`).toBe(true);
    }
  });

  const echo: Translate = (key) => key;

  test.each(surfaces)('%s offers at most one action, and a viewer is offered none that edits', (surface) => {
    const member = emptyState(surface, echo, { canWrite: true, propertyId: 'p1' });
    const viewer = emptyState(surface, echo, { canWrite: false, propertyId: 'p1' });
    const { action } = EMPTY_STATES[surface];
    if (action === null) {
      expect(member.action).toBeUndefined();
      return;
    }
    expect(member.action).toBeDefined();
    if (action.write) expect(viewer.action).toBeUndefined();
    else expect(viewer.action).toEqual(member.action);
  });

  test('a month with no bills in a household that has leases says so and offers nothing', () => {
    const { action, body } = emptyState('collectionsMonth', echo, { canWrite: true });
    expect(action).toBeUndefined();
    expect(body).toBeUndefined();
  });

  test('links point into the property they name', () => {
    expect(emptyState('propertyLegalParcels', echo, { canWrite: true, propertyId: 'p1' }).action?.href).toBe('/properties/p1/legal/parcels/new');
  });
});

const ROUTES: Readonly<Record<string, readonly EmptySurface[] | string>> = {
  'assistant/ask/[conversationId]': 'one conversation opened by id; a missing one is a not-found',
  'assistant/diagnostics': 'diagnostics for the operator, never Mẹ',
  'assistant/market': ['assistantMarket'],
  assistant: ['assistantThread'],
  'collections/import/[id]': 'one statement preview opened by id',
  'collections/import': ['statementImport'],
  'collections/invoices/[invoiceId]': 'one bill opened by id',
  collections: ['collections', 'collectionsMonth'],
  'documents/(vault)/(list)': ['documents'],
  'documents/(vault)/[documentId]': 'one document opened by id',
  'documents/[documentId]/review': 'one document opened by id',
  'open/[type]/[id]': 'a redirect',
  '.': ['home'],
  'properties/[id]/activity': ['propertyActivity'],
  'properties/[id]/documents': ['propertyDocuments'],
  'properties/[id]/edit': 'a form',
  'properties/[id]/finance': ['propertyFinance', 'propertyExpenses'],
  'properties/[id]/legal/[kind]/[itemId]': 'a form',
  'properties/[id]/legal': ['propertyLegalCertificates', 'propertyLegalParcels', 'propertyLegalStructures'],
  'properties/[id]': 'the overview always lists what is missing',
  'properties/[id]/rental/accounts/[accountId]': 'a form',
  'properties/[id]/rental/leases/[leaseId]': ['leaseDocuments'],
  'properties/[id]/rental/meters': ['propertyMeters'],
  'properties/[id]/rental': ['propertyRentalAccounts'],
  'properties/archived': ['propertiesArchived'],
  'properties/new': 'a form',
  properties: ['properties'],
  reports: ['reportsPnl', 'reportsRentRoll', 'reportsCollections', 'reportsOwners', 'reportsOccupancy', 'reportsPortfolio'],
  'reports/tax': ['taxNoOwners'],
  'settings/history': ['settingsHistory'],
  settings: ['settingsAccounts'],
};

const APP = join(import.meta.dirname, '(app)');

function pagesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pagesUnder(path);
    return entry.name === 'page.tsx' ? [path] : [];
  });
}

describe('every route under (app)', () => {
  const pages = pagesUnder(APP).map((file) => ({ file, route: relative(APP, join(file, '..')) || '.' }));

  test('is mapped to the surfaces it can show empty, or listed with the reason it never does', () => {
    expect(pages.map(({ route }) => route).sort()).toEqual(Object.keys(ROUTES).sort());
  });

  test('keeps an empty branch on the registry', () => {
    const outside = pages.filter(({ file }) => /(testid|testId)="[a-z-]*empty"/.test(readFileSync(file, 'utf8')) && !readFileSync(file, 'utf8').includes('RegistryEmptyState'));
    expect(outside.map(({ route }) => route), 'a page renders its own empty message instead of the registry').toEqual([]);
  });

  test('names only registered surfaces, and every registered surface is on a route', () => {
    const named = Object.values(ROUTES).flatMap((value) => (typeof value === 'string' ? [] : value));
    expect([...new Set(named)].sort()).toEqual([...surfaces].sort());
  });
});
