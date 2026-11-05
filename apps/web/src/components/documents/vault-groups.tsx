'use client';

import { DOCUMENT_CATEGORY_IDS } from '@esta/core/documents';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { VaultTile } from '@/server/documents/list';
import type { CoverPhotoPriority } from '@/components/properties/cover-photo';
import { tilePriority } from './document-tile';

export type GroupBy = 'property' | 'category';

export type VaultGroup = { readonly key: string; readonly label: string; readonly tiles: readonly VaultTile[] };

/** SPEC §7.2: a vault this large renders only the rows on screen. */
export const VIRTUALIZE_ABOVE = 100;

const categoryOrder = (tile: VaultTile) => DOCUMENT_CATEGORY_IDS.indexOf(tile.category);

function byKey(tiles: readonly VaultTile[], keyOf: (tile: VaultTile) => string): Map<string, VaultTile[]> {
  const groups = new Map<string, VaultTile[]>();
  for (const tile of tiles) groups.set(keyOf(tile), [...(groups.get(keyOf(tile)) ?? []), tile]);
  return groups;
}

/**
 * `Theo tài sản`: each property by name, documents without one last, each property's tiles in the category registry's
 * order, since every tile names its category. `Theo loại`: each category in that order. Every group carries its count.
 */
export function groupTiles(tiles: readonly VaultTile[], by: GroupBy, noProperty: string): VaultGroup[] {
  const sorted = tiles.toSorted((a, b) => categoryOrder(a) - categoryOrder(b));
  if (by === 'category') {
    return [...byKey(sorted, (tile) => tile.category)].map(([key, group]) => ({ key, label: group[0]?.categoryLabel ?? key, tiles: group }));
  }
  return [...byKey(sorted, (tile) => tile.propertyId ?? '')]
    .toSorted(([a, x], [b, y]) => (a === '' ? 1 : b === '' ? -1 : (x[0]?.propertyName ?? '').localeCompare(y[0]?.propertyName ?? '', 'vi')))
    .map(([key, group]) => ({ key: key === '' ? 'none' : key, label: group[0]?.propertyName ?? noProperty, tiles: group }));
}

const LazyVirtualVault = dynamic(() => import('./virtual-vault-rows').then((module) => module.VirtualVaultRows));

export function GroupByToggle({ by, onChange }: { by: GroupBy; onChange: (by: GroupBy) => void }) {
  const t = useTranslations('documents');
  return (
    <div role="group" aria-label={t('groupBy')} className="inline-flex max-w-full gap-0.5 rounded-md bg-segment-track p-0.5">
      {(['property', 'category'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={by === option}
          data-testid={`group-by-${option}`}
          onClick={() => onChange(option)}
          className={cn(
            'inline-flex min-h-9 items-center rounded-sm px-3 text-label font-medium whitespace-nowrap transition-colors duration-(--duration-fast) ease-standard pointer-coarse:min-h-touch',
            by === option ? 'bg-segment-selected text-text shadow-xs ring-1 ring-border' : 'text-text-secondary hover:text-text',
          )}
        >
          {t(option === 'property' ? 'byProperty' : 'byCategory')}
        </button>
      ))}
    </div>
  );
}

export function VaultGroups({
  tiles,
  by,
  renderTile,
}: {
  tiles: readonly VaultTile[];
  by: GroupBy;
  renderTile: (tile: VaultTile, showProperty: boolean, priority?: CoverPhotoPriority) => ReactNode;
}) {
  const t = useTranslations('documents');
  const groups = groupTiles(tiles, by, t('noProperty'));

  return (
    <section aria-labelledby="vault-groups-title" data-testid="vault-groups" className="flex flex-col gap-4">
      <h2 id="vault-groups-title" className="text-title-3 text-text">
        {t('allDocuments', { count: tiles.length })}
      </h2>
      {tiles.length > VIRTUALIZE_ABOVE ? (
        <LazyVirtualVault groups={groups} renderTile={(tile) => renderTile(tile, by === 'category')} countLabel={(count) => t('groupCount', { count })} />
      ) : (
        groups.map((group, groupIndex) => (
          <section key={group.key} data-testid="vault-group" data-group={group.key} aria-labelledby={`group-${group.key}`} className="flex flex-col gap-3">
            <h3 id={`group-${group.key}`} className="flex flex-wrap items-baseline gap-x-2 text-headline font-semibold break-words text-text">
              <span data-testid="group-label">{group.label}</span>
              <span data-testid="group-count" className="text-body-sm font-normal text-text-muted">
                {t('groupCount', { count: group.tiles.length })}
              </span>
            </h3>
            <ul aria-label={group.label} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.tiles.map((tile, index) => renderTile(tile, by === 'category', groupIndex === 0 ? tilePriority(index) : 'lazy'))}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}
