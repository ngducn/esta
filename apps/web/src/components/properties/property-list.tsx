import type { CoverPhotoPriority } from './cover-photo';
import { PropertyCard, type PropertyCardData } from './property-card';
import { VirtualPropertyList } from './virtual-property-list';

/** SPEC §7.2: lists stay interactive up to 1,000 rows by rendering only the rows near the viewport above 100. */
const VIRTUALIZE_ABOVE = 100;

export const cardGrid = 'grid gap-4 md:grid-cols-2 lg:gap-5 xl:grid-cols-3';

/** The first card is the likely LCP, the second shares the first screen on a phone, the rest wait for the scroll. */
export function photoPriority(index: number): CoverPhotoPriority {
  if (index === 0) return 'high';
  return index === 1 ? 'eager' : 'lazy';
}

export function PropertyList({ cards }: { cards: readonly PropertyCardData[] }) {
  if (cards.length > VIRTUALIZE_ABOVE) return <VirtualPropertyList cards={cards} />;
  return (
    <ul className={cardGrid}>
      {cards.map((card, index) => (
        <li key={card.id}>
          <PropertyCard card={card} priority={photoPriority(index)} />
        </li>
      ))}
    </ul>
  );
}
