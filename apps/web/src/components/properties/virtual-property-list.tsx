'use client';

import { useWindowVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PropertyCard, photoPriority, type PropertyCardData } from './property-card';

/** The grid's breakpoints: one column below md (48rem), two below xl (80rem), three from there. */
const COLUMN_QUERIES = [
  ['(min-width: 80rem)', 3],
  ['(min-width: 48rem)', 2],
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

const ESTIMATED_ROW_PX = 440;

export function VirtualPropertyList({ cards }: { cards: readonly PropertyCardData[] }) {
  const columns = useSyncExternalStore(subscribeColumns, readColumns, () => 1);
  const list = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState<number | null>(null);
  useLayoutEffect(() => {
    setScrollMargin(list.current?.offsetTop ?? 0);
  }, []);

  const rows = Math.ceil(cards.length / columns);
  const virtualizer = useWindowVirtualizer({
    count: rows,
    estimateSize: () => ESTIMATED_ROW_PX,
    overscan: 2,
    scrollMargin: scrollMargin ?? 0,
  });
  // The server knows no window and so no rows. It renders the first row alone, which puts the likely LCP photo in the
  // HTML; the cards that join it after mount appear beside and below it, so nothing on screen moves.
  const items: readonly Pick<VirtualItem, 'key' | 'index' | 'start'>[] =
    scrollMargin === null ? [{ key: 0, index: 0, start: 0 }] : virtualizer.getVirtualItems();

  return (
    <div ref={list} data-testid="virtual-property-list" className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {items.map((row) => (
        <ul
          key={row.key}
          data-index={row.index}
          ref={virtualizer.measureElement}
          className="absolute inset-x-0 top-0 grid gap-4 pb-4 md:grid-cols-2 lg:gap-5 lg:pb-5 xl:grid-cols-3"
          style={{ transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)` }}
        >
          {cards.slice(row.index * columns, (row.index + 1) * columns).map((card, column) => (
            <li key={card.id}>
              <PropertyCard card={card} priority={photoPriority(row.index * columns + column)} />
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
