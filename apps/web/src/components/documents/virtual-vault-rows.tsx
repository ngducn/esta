'use client';

import { useWindowVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { VaultTile } from '@/server/documents/list';
import type { VaultGroup } from './vault-groups';

/** The tile grid's breakpoints: one column below sm (40rem), two below lg (64rem), three from there. */
const COLUMN_QUERIES = [
  ['(min-width: 64rem)', 3],
  ['(min-width: 40rem)', 2],
] as const;

function readColumns(): number {
  return COLUMN_QUERIES.find(([query]) => window.matchMedia(query).matches)?.[1] ?? 1;
}

function subscribeColumns(onChange: () => void): () => void {
  const lists = COLUMN_QUERIES.map(([query]) => window.matchMedia(query));
  for (const list of lists) list.addEventListener('change', onChange);
  return () => {
    for (const list of lists) list.removeEventListener('change', onChange);
  };
}

type Row =
  | { readonly kind: 'group'; readonly key: string; readonly label: string; readonly count: number }
  | { readonly kind: 'tiles'; readonly key: string; readonly tiles: readonly VaultTile[] };

/** Each group's heading, then its tiles in rows of one tile per column. */
function flatten(groups: readonly VaultGroup[], columns: number): Row[] {
  return groups.flatMap((group): Row[] => [
    { kind: 'group', key: group.key, label: group.label, count: group.tiles.length },
    ...Array.from({ length: Math.ceil(group.tiles.length / columns) }, (_, row) => ({
      kind: 'tiles' as const,
      key: `${group.key}:${row}`,
      tiles: group.tiles.slice(row * columns, (row + 1) * columns),
    })),
  ]);
}

const estimate = (row: Row | undefined) => (row?.kind === 'tiles' ? 420 : 48);

/** The P1-04 window virtualizer over the vault's rows, so a vault of 1,000 documents mounts only what is on screen. */
export function VirtualVaultRows({
  groups,
  renderTile,
  countLabel,
}: {
  groups: readonly VaultGroup[];
  renderTile: (tile: VaultTile) => ReactNode;
  countLabel: (count: number) => string;
}) {
  const columns = useSyncExternalStore(subscribeColumns, readColumns, () => 1);
  const list = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState<number | null>(null);
  useLayoutEffect(() => {
    setScrollMargin(list.current?.offsetTop ?? 0);
  }, []);
  const rows = flatten(groups, columns);
  const virtualizer = useWindowVirtualizer({ count: rows.length, estimateSize: (index) => estimate(rows[index]), overscan: 4, scrollMargin: scrollMargin ?? 0 });
  const items: readonly Pick<VirtualItem, 'key' | 'index' | 'start'>[] =
    scrollMargin === null ? rows.slice(0, 2).map((_, index) => ({ key: index, index, start: 0 })) : virtualizer.getVirtualItems();

  return (
    <div ref={list} data-testid="virtual-vault" className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {items.map((item) => {
        const row = rows[item.index];
        if (row === undefined) return null;
        return (
          <div
            key={row.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            className="absolute inset-x-0 top-0 pb-4"
            style={{ transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)` }}
          >
            {row.kind === 'group' ? (
              <h3 data-testid="vault-group" data-group={row.key} className="flex flex-wrap items-baseline gap-x-2 pt-2 text-lead font-semibold break-words text-ink">
                <span data-testid="group-label">{row.label}</span>
                <span data-testid="group-count" className="text-small font-normal text-ink-muted">
                  {countLabel(row.count)}
                </span>
              </h3>
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{row.tiles.map(renderTile)}</ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
