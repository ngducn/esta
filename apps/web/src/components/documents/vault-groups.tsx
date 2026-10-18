'use client';

import { DOCUMENT_CATEGORY_IDS } from '@esta/core/documents';
import { compareVietnameseNames } from '@esta/core/names';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { VaultTile } from '@/server/documents/list';

export type GroupBy = 'property' | 'category';

export type VaultSection = { readonly key: string; readonly label: string | null; readonly tiles: readonly VaultTile[] };
export type VaultGroup = { readonly key: string; readonly label: string; readonly count: number; readonly sections: readonly VaultSection[] };

/** SPEC §7.2: a vault this large renders only the rows on screen. */
export const VIRTUALIZE_ABOVE = 100;

const categoryOrder = (tile: VaultTile) => DOCUMENT_CATEGORY_IDS.indexOf(tile.category);

function byKey(tiles: readonly VaultTile[], keyOf: (tile: VaultTile) => string): Map<string, VaultTile[]> {
  const groups = new Map<string, VaultTile[]>();
  for (const tile of tiles) groups.set(keyOf(tile), [...(groups.get(keyOf(tile)) ?? []), tile]);
  return groups;
}

/**
 * `Theo tài sản`: each property by name, documents without one last, and inside each the categories in the registry's
 * order. `Theo loại`: each category in that order. Every group carries its count.
 */
export function groupTiles(tiles: readonly VaultTile[], by: GroupBy, noProperty: string): VaultGroup[] {
  const sorted = tiles.toSorted((a, b) => categoryOrder(a) - categoryOrder(b));
  if (by === 'category') {
    return [...byKey(sorted, (tile) => tile.category)].map(([key, group]) => ({
      key,
      label: group[0]?.categoryLabel ?? key,
      count: group.length,
      sections: [{ key, label: null, tiles: group }],
    }));
  }
  return [...byKey(sorted, (tile) => tile.propertyId ?? '')]
    .toSorted(([a, x], [b, y]) => (a === '' ? 1 : b === '' ? -1 : compareVietnameseNames(x[0]?.propertyName ?? '', y[0]?.propertyName ?? '')))
    .map(([key, group]) => ({
      key: key === '' ? 'none' : key,
      label: group[0]?.propertyName ?? noProperty,
      count: group.length,
      sections: [...byKey(group, (tile) => tile.category)].map(([category, inside]) => ({ key: `${key}:${category}`, label: inside[0]?.categoryLabel ?? category, tiles: inside })),
    }));
}

const LazyVirtualVault = dynamic(() => import('./virtual-vault-rows').then((module) => module.VirtualVaultRows));

/** The vault below search, by property or by kind. The toggle is two pressed-state buttons, each with its word. */
export function VaultGroups({
  tiles,
  initialBy = 'property',
  renderTile,
}: {
  tiles: readonly VaultTile[];
  initialBy?: GroupBy;
  renderTile: (tile: VaultTile, showProperty: boolean) => ReactNode;
}) {
  const t = useTranslations('documents');
  const [by, setBy] = useState<GroupBy>(initialBy);
  const groups = groupTiles(tiles, by, t('noProperty'));

  return (
    <section aria-labelledby="vault-groups-title" data-testid="vault-groups" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="vault-groups-title" className="text-h3 text-ink">
          {t('allDocuments', { count: tiles.length })}
        </h2>
        <div role="group" aria-label={t('groupBy')} className="flex rounded-md border border-rule-strong bg-surface p-1">
          {(['property', 'category'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={by === option}
              data-testid={`group-by-${option}`}
              onClick={() => setBy(option)}
              className={cn(
                'flex min-h-touch flex-1 items-center justify-center rounded-sm px-4 text-body font-semibold whitespace-nowrap transition-colors duration-(--duration-fast) ease-standard',
                by === option ? 'bg-ink text-surface' : 'text-ink-2 hover:bg-surface-2',
              )}
            >
              {t(option === 'property' ? 'byProperty' : 'byCategory')}
            </button>
          ))}
        </div>
      </div>
      {tiles.length > VIRTUALIZE_ABOVE ? (
        <LazyVirtualVault groups={groups} renderTile={(tile) => renderTile(tile, by === 'category')} countLabel={(count) => t('groupCount', { count })} />
      ) : (
        groups.map((group) => (
          <section key={group.key} data-testid="vault-group" data-group={group.key} aria-labelledby={`group-${group.key}`} className="flex flex-col gap-3">
            <h3 id={`group-${group.key}`} className="flex flex-wrap items-baseline gap-x-2 text-lead font-bold break-words text-ink">
              <span data-testid="group-label">{group.label}</span>
              <span data-testid="group-count" className="text-small font-normal text-ink-muted">
                {t('groupCount', { count: group.count })}
              </span>
            </h3>
            {group.sections.map((section) => (
              <div key={section.key} className="flex flex-col gap-2">
                {section.label === null ? null : <h4 className="text-small font-semibold text-ink-2">{section.label}</h4>}
                <ul aria-label={section.label ?? group.label} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {section.tiles.map((tile) => renderTile(tile, by === 'category'))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}
    </section>
  );
}
