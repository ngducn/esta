import type { LegalStatus, PropertyKind, UseMode } from '@esta/core/properties';
import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { AddressBlock } from '@/components/address-block';
import { CompletenessRingView } from '@/components/completeness-ring';
import { buttonVariants } from '@/components/ui/button';
import { CoverPhoto } from './cover-photo';
import { kindIcons } from './kind-icons';
import { LegalPill, StatusPill, UsePill } from './property-pills';
import type { StatusPillData } from './status-pills';

export type PropertyHeaderData = {
  nickname: string;
  kind: PropertyKind;
  kindLabel: string;
  useMode: UseMode;
  useLabel: string;
  legalStatus: LegalStatus;
  legalLabel: string;
  currentAddress: string | null;
  certificateAddress: string | null;
  photoUrl: string | null;
  /** The `propertyStatus` pills, such as `Quá hạn 12 ngày`, `Đang cho thuê 6/8` and `Trống từ 01/08`. */
  statuses: readonly StatusPillData[];
  /** `null` for a viewer, who cannot edit. */
  edit: { href: string; label: string } | null;
  /** The score, already translated: `title` is the word `Mức đầy đủ`, `score` such as `29%`. */
  completeness: { title: string; percent: number; score: string };
};

/** The photo leads, because Mẹ knows a house by sight before its nickname; the kind tile stands in when there is none. */
export function PropertyHeader({ property }: { property: PropertyHeaderData }) {
  const KindIcon = kindIcons[property.kind];
  return (
    <header
      data-testid="property-header"
      className="overflow-hidden rounded-lg border border-rule bg-surface shadow-card md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]"
    >
      <div data-testid="property-cover" className="relative aspect-[16/10] bg-surface-2 md:aspect-auto md:min-h-60">
        <CoverPhoto
          src={property.photoUrl}
          alt={property.nickname}
          priority="high"
          fallback={
            <div data-testid="property-icon-tile" data-kind={property.kind} className="flex size-full items-center justify-center text-ink-muted">
              <KindIcon className="size-16" strokeWidth={1.25} aria-hidden="true" />
            </div>
          }
        />
        <span className="absolute top-3 left-3 rounded-full bg-surface px-2.5 py-1 text-small font-semibold text-ink shadow-card">
          {property.kindLabel}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-4 p-5 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="min-w-0 text-h2 break-words text-balance text-ink lg:text-h1">{property.nickname}</h1>
          {property.edit === null ? null : (
            <Link href={property.edit.href} data-testid="edit-property" className={buttonVariants({ variant: 'outline' })}>
              <Pencil aria-hidden="true" />
              {property.edit.label}
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <UsePill useMode={property.useMode} label={property.useLabel} />
          <LegalPill legalStatus={property.legalStatus} label={property.legalLabel} />
          {property.statuses.map((pill) => (
            <StatusPill key={pill.label} status={pill.status} label={pill.label} />
          ))}
          <p data-testid="property-completeness" className="flex items-center gap-2 px-1 text-small text-ink-2">
            <span className="sr-only sm:not-sr-only">{property.completeness.title}</span>
            <CompletenessRingView percent={property.completeness.percent} label={property.completeness.score} />
          </p>
        </div>
        <div data-testid="property-addresses">
          <AddressBlock current={property.currentAddress} legal={property.certificateAddress} />
        </div>
      </div>
    </header>
  );
}
