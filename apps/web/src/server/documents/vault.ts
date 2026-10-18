import 'server-only';
import { expiringSoon } from '@esta/core/documents';
import { getTranslations } from 'next-intl/server';
import type { ExpiringItem } from '@/components/documents/document-vault';
import { getClock } from '@/server/clock';
import type { DocumentStatuses } from './extraction-status';
import { listDocuments, vaultTiles, type VaultTile } from './list';
import { searchDocuments, type VaultSearch } from './search';
import { readDocumentStatuses } from './status';

/** The search as one state, so a result never shows beside a spinner or an error from an older query. */
export type SearchState =
  | { readonly step: 'idle' }
  | { readonly step: 'searching'; readonly query: string }
  | { readonly step: 'done'; readonly query: string; readonly tiles: readonly VaultTile[]; readonly capped: boolean }
  | { readonly step: 'failed'; readonly query: string };

function initialSearch(query: string, result: VaultSearch | null): SearchState {
  if (query === '' || result === null) return { step: 'idle' };
  return result.ok ? { step: 'done', query, tiles: result.tiles, capped: result.capped } : { step: 'failed', query };
}

export type VaultData = {
  readonly tiles: readonly VaultTile[];
  readonly expiring: readonly ExpiringItem[];
  readonly search: SearchState;
  readonly statuses: DocumentStatuses;
};

/** Everything the vault renders on first paint, for the household or one property, with `?q=` already searched. */
export async function loadVault(householdId: string, propertyId: string | null, query: string): Promise<VaultData> {
  const [items, statuses, search, clock, t] = await Promise.all([
    listDocuments(householdId, propertyId),
    propertyId === null ? readDocumentStatuses(householdId, 'household') : readDocumentStatuses(propertyId, 'property'),
    query === '' ? null : searchDocuments(query, propertyId),
    getClock(),
    getTranslations('documents'),
  ]);
  const today = clock.today();
  return {
    tiles: await vaultTiles(items, today),
    expiring: expiringSoon(items, today).map(({ document, days }) => ({
      id: document.id,
      title: document.title,
      propertyName: propertyId === null ? document.propertyName : null,
      text: t('expiry', { days }),
    })),
    search: initialSearch(query, search),
    statuses: statuses ?? { statuses: {}, workerOffline: false },
  };
}

export function queryParam(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value.trim().slice(0, 200) : '';
}
