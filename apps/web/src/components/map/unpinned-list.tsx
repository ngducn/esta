'use client';

import { MapPinPlus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button-variants';
import type { MapProperty } from './types';

/** Beside the map: the properties it cannot show yet, each one tap from its location panel. */
export function UnpinnedList({ properties, locateHref }: { properties: readonly MapProperty[]; locateHref: ((id: string) => string) | null }) {
  const t = useTranslations('map');
  return (
    <section aria-labelledby="unpinned-title" data-testid="unpinned-list" className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-4 shadow-card lg:p-5">
      <h2 id="unpinned-title" className="text-lead font-bold text-ink">
        {properties.length === 0 ? t('allPinned') : t('unpinned', { count: properties.length })}
      </h2>
      {properties.length === 0 ? null : (
        <ul className="flex flex-col divide-y divide-rule">
          {properties.map((property) => (
            <li key={property.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-body font-semibold break-words text-ink">{property.nickname}</p>
                <p className="text-small break-words text-ink-muted">{property.address}</p>
              </div>
              {locateHref === null ? null : (
                <Link
                  href={locateHref(property.id)}
                  scroll={false}
                  aria-label={t('setLocationFor', { nickname: property.nickname })}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  <MapPinPlus aria-hidden="true" />
                  {t('setLocation')}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
