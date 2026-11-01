import type { PropertyKind } from '@esta/core/properties';
import { Camera, LayoutGrid, MapPin } from 'lucide-react';
import Link from 'next/link';
import { CompletenessRingView } from '@/components/completeness-ring';
import { IntentLink } from '@/components/shell/intent-link';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';
import { CoverPhoto, type CoverPhotoPriority } from './cover-photo';
import { StatusPill } from './property-pills';
import type { StatusPillData } from './status-pills';

/** Columns of at least 19rem, one card per row on a phone. */
export const propertyGrid = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-stack';

/** Everything a card shows, already translated and signed on the server, so the card renders the same on either side. */
export type PropertyCardData = {
  id: string;
  nickname: string;
  kind: PropertyKind;
  kindLabel: string;
  address: string;
  certificateLine: string | null;
  photoUrl: string | null;
  /** Where a member who may edit adds the missing photo, `null` for a viewer. */
  addPhoto: { href: string; label: string } | null;
  /** The monthly rent of the active leases in full, with its `/tháng`; `null` when none is active. */
  rent: { amount: string; per: string } | null;
  noContract: string;
  /** The `propertyStatus` badges, most urgent first; the card shows two. */
  statuses: readonly StatusPillData[];
  /** Rooms and how many stand free, `null` for a property that is one unit. */
  rooms: string | null;
  completeness: { percent: number; label: string; srLabel: string };
};

/** The first card is the likely LCP, the second shares the first screen on a phone, the rest wait for the scroll. */
export function photoPriority(index: number): CoverPhotoPriority {
  if (index === 0) return 'high';
  return index === 1 ? 'eager' : 'lazy';
}

const MAX_BADGES = 2;

export function PropertyCard({ card, priority }: { card: PropertyCardData; priority: CoverPhotoPriority }) {
  return (
    <article
      data-testid="property-card"
      className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs transition-[box-shadow,border-color] duration-(--duration-fast) ease-standard has-[a[data-card-link]:hover]:border-border-strong has-[a[data-card-link]:hover]:shadow-sm has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-offset-2 has-[a[data-card-link]:focus-visible]:outline-focus-ring"
    >
      <div data-testid="property-cover" className="relative aspect-[16/10] flex-none overflow-hidden border-b border-border bg-bg-subtle">
        <CoverPhoto
          src={card.photoUrl}
          alt=""
          priority={priority}
          fallback={
            <div data-testid="property-icon-tile" className="flex size-full flex-col items-center justify-center gap-2 text-text-secondary">
              <Camera className="size-icon-lg" strokeWidth={1.75} aria-hidden="true" />
              {card.addPhoto === null ? null : (
                <Link href={card.addPhoto.href} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'relative z-10')}>
                  {card.addPhoto.label}
                </Link>
              )}
            </div>
          }
        />
        <span className="absolute top-3 left-3 inline-flex min-h-7 items-center rounded-full bg-surface px-3 py-0.5 text-caption font-medium text-text shadow-xs">
          {card.kindLabel}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 px-5 pt-4 pb-5">
        {card.statuses.length === 0 ? null : (
          <div className="flex flex-wrap gap-1.5">
            {card.statuses.slice(0, MAX_BADGES).map((pill) => (
              <StatusPill key={pill.label} status={pill.status} label={pill.label} />
            ))}
          </div>
        )}
        <h2 className="line-clamp-2 text-headline font-semibold break-words text-text" title={card.nickname}>
          <IntentLink href={`/properties/${card.id}`} data-card-link="" className="outline-none after:absolute after:inset-0 after:z-[1]">
            {card.nickname}
          </IntentLink>
        </h2>
        <div className="flex flex-col gap-0.5 text-body-sm">
          <p className="flex items-start gap-1.5 text-text-secondary" title={card.address}>
            <MapPin className="mt-0.5 size-icon-sm shrink-0 text-text-muted" aria-hidden="true" />
            <span className="line-clamp-2 min-w-0">{card.address}</span>
          </p>
          {card.certificateLine === null ? null : (
            <p data-testid="certificate-line" className="line-clamp-2 pl-5.5 text-text-muted" title={card.certificateLine}>
              {card.certificateLine}
            </p>
          )}
        </div>
        {card.rent === null ? (
          <p data-testid="property-rent-unknown" className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-body-sm text-text-secondary">
            <span className="text-figure-md text-text-muted" role="img" aria-label={card.noContract}>
              —
            </span>
            {card.noContract}
          </p>
        ) : (
          <p data-testid="property-rent" className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
            <span className="num text-figure-md text-text">{card.rent.amount}</span>
            <span className="text-body-sm text-text-secondary">{card.rent.per}</span>
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-body-sm text-text-secondary">
          {card.rooms === null ? null : (
            <span className="inline-flex items-center gap-1.5">
              <LayoutGrid className="size-icon-sm" aria-hidden="true" />
              {card.rooms}
            </span>
          )}
          <CompletenessRingView {...card.completeness} />
        </div>
      </div>
    </article>
  );
}
