import { PropertyCard, photoPriority, propertyGrid, type PropertyCardData } from './property-card';
import { LazyVirtualPropertyList } from './lazy-virtual-property-list';

/** SPEC §7.2: lists stay interactive up to 1,000 rows by rendering only the rows near the viewport above 100. */
const VIRTUALIZE_ABOVE = 100;

export function PropertyList({ cards }: { cards: readonly PropertyCardData[] }) {
  if (cards.length > VIRTUALIZE_ABOVE) return <LazyVirtualPropertyList cards={cards} />;
  return (
    <ul className={propertyGrid}>
      {cards.map((card, index) => (
        <li key={card.id}>
          <PropertyCard card={card} priority={photoPriority(index)} />
        </li>
      ))}
    </ul>
  );
}
