import type { LegalStatus, PropertyKind, UseMode } from '@esta/core/properties';
import {
  BedDouble,
  Briefcase,
  Building,
  Building2,
  CirclePause,
  Hammer,
  Hotel,
  House,
  KeyRound,
  LandPlot,
  MapPin,
  Sprout,
  Store,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { StatusShape, statusMarks, type MarkStatus } from '@/components/status-mark';
import { cn } from '@/lib/utils';
import { CoverPhoto, type CoverPhotoPriority } from './cover-photo';

export const kindIcons = {
  townhouse: House,
  apartment: Building2,
  villa: Hotel,
  rooming_house: BedDouble,
  commercial_space: Store,
  warehouse: Warehouse,
  residential_land: LandPlot,
  agricultural_land: Sprout,
  mixed: Building,
  other: MapPin,
} as const satisfies Record<PropertyKind, LucideIcon>;

const useIcons = {
  rental: KeyRound,
  owner_occupied: House,
  family_use: Users,
  own_business: Briefcase,
  held: CirclePause,
  under_renovation: Hammer,
} as const satisfies Record<UseMode, LucideIcon>;

/** Legal status borrows the status shapes: a certificate is settled, a pending or paper-only one needs attention. */
const legalMarks = {
  certified: 'paid',
  certificate_pending: 'due',
  paper_only: 'due',
  shared_certificate: 'vacant',
  in_dispute: 'overdue',
  unknown: 'draft',
} as const satisfies Record<LegalStatus, MarkStatus>;

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
};

const pill = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-small font-semibold';

export function PropertyCard({ card, priority }: { card: PropertyCardData; priority: CoverPhotoPriority }) {
  const KindIcon = kindIcons[card.kind];
  const UseIcon = useIcons[card.useMode];
  const legal = legalMarks[card.legalStatus];
  return (
    <article data-testid="property-card" className="flex h-full flex-col overflow-hidden rounded-lg border border-rule bg-surface shadow-card">
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
          <span data-use={card.useMode} className={cn(pill, 'border border-rule bg-surface-2 text-ink-2')}>
            <UseIcon className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
            {card.useLabel}
          </span>
          <span data-legal={card.legalStatus} className={cn(pill, statusMarks[legal].pill)}>
            <StatusShape status={legal} className="size-4" />
            {card.legalLabel}
          </span>
        </div>
        <h2 className="text-lead font-bold break-words text-ink">{card.nickname}</h2>
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
      </div>
    </article>
  );
}
