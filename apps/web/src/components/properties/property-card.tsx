import type { LegalStatus, PropertyKind, UseMode } from '@esta/core/properties';
import { MapPin } from 'lucide-react';
import { CompletenessRingView } from '@/components/completeness-ring';
import { IntentLink } from '@/components/shell/intent-link';
import { CoverPhoto, type CoverPhotoPriority } from './cover-photo';
import { kindIcons } from './kind-icons';
import { LegalPill, StatusPill, UsePill } from './property-pills';
import type { StatusPillData } from './status-pills';

/** Everything a card shows, already translated and signed on the server, so the card renders the same on either side. */
export type PropertyCardData = {
  id: string;
  nickname: string;
  kind: PropertyKind;
  kindLabel: string;
  useMode: UseMode;
  useLabel: string;
  legalStatus: LegalStatus;
  legalLabel: string;
  address: string;
  certificateLine: string | null;
  photoUrl: string | null;
  /** `Tiền thuê mỗi tháng` and the compact sum of the active leases' rents, `null` when none is active. */
  rent: { label: string; amount: string } | null;
  /** The `propertyStatus` pills, such as `Đang cho thuê 6/8` and `Trống từ 01/08`. */
  statuses: readonly StatusPillData[];
  completeness: { percent: number; label: string; srLabel: string };
};

/** The first card is the likely LCP, the second shares the first screen on a phone, the rest wait for the scroll. */
export function photoPriority(index: number): CoverPhotoPriority {
  if (index === 0) return 'high';
  return index === 1 ? 'eager' : 'lazy';
}

export function PropertyCard({ card, priority }: { card: PropertyCardData; priority: CoverPhotoPriority }) {
  const KindIcon = kindIcons[card.kind];
  return (
    <article
      data-testid="property-card"
      className="relative flex h-full flex-col overflow-hidden rounded-lg border border-rule bg-surface shadow-card transition-shadow duration-(--duration-fast) ease-standard has-[a:hover]:shadow-sheet has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent"
    >
      <div data-testid="property-cover" className="relative aspect-[16/10] bg-surface-2">
        <CoverPhoto
          src={card.photoUrl}
          alt={card.nickname}
          priority={priority}
          fallback={
            <div data-testid="property-icon-tile" className="flex size-full items-center justify-center text-ink-muted">
              <KindIcon className="size-12" strokeWidth={1.5} aria-hidden="true" />
            </div>
          }
        />
        <span className="absolute top-3 left-3 rounded-full bg-surface px-2.5 py-1 text-small font-semibold text-ink shadow-card">
          {card.kindLabel}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-4 lg:px-5">
        <div className="flex flex-wrap gap-1.5">
          <UsePill useMode={card.useMode} label={card.useLabel} />
          <LegalPill legalStatus={card.legalStatus} label={card.legalLabel} />
          {card.statuses.map((pill) => (
            <StatusPill key={pill.status} status={pill.status} label={pill.label} />
          ))}
        </div>
        <h2 className="text-lead font-bold break-words text-ink">
          <IntentLink href={`/properties/${card.id}`} className="outline-none after:absolute after:inset-0">
            {card.nickname}
          </IntentLink>
        </h2>
        <div className="flex flex-col gap-0.5 text-small">
          <p className="flex items-start gap-1.5 break-words text-ink-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-ink-muted" strokeWidth={2} aria-hidden="true" />
            <span className="min-w-0">{card.address}</span>
          </p>
          {card.certificateLine === null ? null : (
            <p data-testid="certificate-line" className="pl-5.5 break-words text-ink-muted">
              {card.certificateLine}
            </p>
          )}
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1">
          {card.rent === null ? null : (
            <p data-testid="property-rent" className="flex flex-wrap items-baseline gap-x-2 text-small text-ink-muted">
              {card.rent.label}
              <span className="figures text-lead font-bold text-ink">{card.rent.amount}</span>
            </p>
          )}
          <CompletenessRingView {...card.completeness} />
        </div>
      </div>
    </article>
  );
}
