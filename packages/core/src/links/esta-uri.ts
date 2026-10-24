import type { Result } from '../result';

/** The record each `esta://{type}/{id}` link names, by the table it lives in; a ledger link names its property. */
export const ESTA_LINK_TABLES = {
  property: 'properties',
  unit: 'units',
  lease: 'leases',
  invoice: 'invoices',
  document: 'documents',
  party: 'parties',
  meter: 'meters',
  ledger: 'properties',
} as const;

export type EstaLinkType = keyof typeof ESTA_LINK_TABLES;
export type EstaRoute = { readonly type: EstaLinkType; readonly id: string };

const ESTA_URI = /^esta:\/\/([a-z]+)\/([^/]*)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseEstaUri(uri: string): Result<EstaRoute, 'malformed' | 'unknown_type' | 'bad_id'> {
  const [, type = '', id = ''] = ESTA_URI.exec(uri) ?? [];
  if (type === '') return { ok: false, reason: 'malformed' };
  if (!Object.hasOwn(ESTA_LINK_TABLES, type)) return { ok: false, reason: 'unknown_type' };
  if (!UUID.test(id)) return { ok: false, reason: 'bad_id' };
  return { ok: true, value: { type: type as EstaLinkType, id } };
}

export const estaUri = ({ type, id }: EstaRoute): string => `esta://${type}/${id}`;
