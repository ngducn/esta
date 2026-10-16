'use client';

import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PropertyCard, type PropertyCardData } from './property-card';

/** The column count `cardGrid` draws: one below md (48rem), two below xl (80rem), three from there. */
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
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    setScrollMargin(list.current?.offsetTop ?? 0);
  }, []);

  const rows = Math.ceil(cards.length / columns);
  const virtualizer = useWindowVirtualizer({
    count: rows,
    estimateSize: () => ESTIMATED_ROW_PX,
    overscan: 2,
    scrollMargin,
  });

  return (
    <div ref={list} data-testid="virtual-property-list" className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((row) => (
        <ul
          key={row.key}
          data-index={row.index}
          ref={virtualizer.measureElement}
          className="absolute inset-x-0 top-0 grid gap-4 pb-4 md:grid-cols-2 lg:gap-5 lg:pb-5 xl:grid-cols-3"
          style={{ transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)` }}
        >
          {cards.slice(row.index * columns, (row.index + 1) * columns).map((card) => (
            <li key={card.id}>
              <PropertyCard card={card} priority={row.index === 0 ? 'eager' : 'lazy'} />
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
