'use client';

import { MapPin, MapPinPen, X } from 'lucide-react';
import Link from 'next/link';
import { IntentLink } from '@/components/shell/intent-link';
import { useTranslations } from 'next-intl';
import { CoverPhoto } from '@/components/properties/cover-photo';
import { kindIcons } from '@/components/properties/kind-icons';
import { buttonVariants } from '@/components/ui/button-variants';
import type { MapProperty } from './types';

/** Opens over the map when a pin is tapped: the photo first, because Mẹ knows a house by sight before its nickname. */
export function PinCard({ property, editHref, onClose }: { property: MapProperty; editHref: string | null; onClose: () => void }) {
  const t = useTranslations('map');
  const KindIcon = kindIcons[property.kind];
  return (
    <article
      data-testid="pin-card"
      aria-labelledby={`pin-card-${property.id}`}
      className="absolute inset-x-3 bottom-3 flex overflow-hidden rounded-lg border border-rule bg-surface shadow-sheet has-[h2_a:focus-visible]:outline-2 has-[h2_a:focus-visible]:outline-offset-2 has-[h2_a:focus-visible]:outline-accent sm:right-auto sm:w-[26rem]"
    >
      <div data-testid="pin-card-photo" className="relative w-28 shrink-0 bg-surface-2 sm:w-36">
        <CoverPhoto
          src={property.photoUrl}
          alt={property.nickname}
          priority="eager"
          fallback={
            <div className="flex size-full items-center justify-center text-ink-muted">
              <KindIcon className="size-9" strokeWidth={1.5} aria-hidden="true" />
            </div>
          }
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 sm:p-4">
        <h2 id={`pin-card-${property.id}`} className="text-lead font-bold break-words text-ink">
          <IntentLink href={`/properties/${property.id}`} className="outline-none after:absolute after:inset-0">
            {property.nickname}
          </IntentLink>
        </h2>
        <p className="flex items-start gap-1.5 text-small break-words text-ink-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-ink-muted" strokeWidth={2} aria-hidden="true" />
          <span className="min-w-0">{property.address}</span>
        </p>
        <div className="relative mt-auto flex flex-wrap items-center gap-2">
          {editHref === null ? null : (
            <Link href={editHref} scroll={false} className={buttonVariants({ variant: 'outline' })}>
              <MapPinPen aria-hidden="true" />
              {t('editLocation')}
            </Link>
          )}
          <button type="button" onClick={onClose} className={buttonVariants({ variant: 'quiet' })}>
            <X aria-hidden="true" />
            {t('close')}
          </button>
        </div>
      </div>
    </article>
  );
}
