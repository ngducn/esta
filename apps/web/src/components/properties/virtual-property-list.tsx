'use client';

import { useWindowVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef, useState } from 'react';
import { PropertyCard, photoPriority, propertyGrid, type PropertyCardData } from './property-card';

const MIN_COLUMN_REM = 19;
const GAP_REM = 1.5;

function columnsFor(widthPx: number, remPx: number): number {
  return Math.max(1, Math.floor((widthPx / remPx + GAP_REM) / (MIN_COLUMN_REM + GAP_REM)));
}

const ESTIMATED_ROW_PX = 440;

export function VirtualPropertyList({ cards }: { cards: readonly PropertyCardData[] }) {
  const list = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState<number | null>(null);
  const [columns, setColumns] = useState(1);
  useLayoutEffect(() => {
    const element = list.current;
    if (element === null) return;
    const measure = () => {
      setScrollMargin(element.offsetTop);
      setColumns(columnsFor(element.clientWidth, Number.parseFloat(getComputedStyle(document.documentElement).fontSize)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
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
          className={`${propertyGrid} absolute inset-x-0 top-0 pb-stack`}
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
