import { PropertyCard, photoPriority, type PropertyCardData } from './property-card';
import { LazyVirtualPropertyList } from './lazy-virtual-property-list';

/** SPEC §7.2: lists stay interactive up to 1,000 rows by rendering only the rows near the viewport above 100. */
const VIRTUALIZE_ABOVE = 100;

const cardGrid = 'grid gap-4 md:grid-cols-2 lg:gap-5 xl:grid-cols-3';

export function PropertyList({ cards }: { cards: readonly PropertyCardData[] }) {
  if (cards.length > VIRTUALIZE_ABOVE) return <LazyVirtualPropertyList cards={cards} />;
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
