'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, type ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';

/** In the page flow under the map on a phone, beside it on a wide screen, so the map stays visible for dragging and drawing. */
export function LocationPanel({
  nickname,
  address,
  closeHref,
  children,
}: {
  nickname: string;
  address: string;
  closeHref: string;
  children: ReactNode;
}) {
  const t = useTranslations('map');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <section
      aria-labelledby="location-panel-title"
      data-testid="location-panel"
      className="flex flex-col gap-5 rounded-lg border border-rule bg-surface p-4 shadow-sheet lg:p-5 lg:shadow-card"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
          <h2 id="location-panel-title" ref={heading} tabIndex={-1} className="text-lead font-bold break-words text-ink outline-none">
            {t('panelTitle', { nickname })}
          </h2>
          <p className="text-small break-words text-ink-muted">{address}</p>
        </div>
        <Link href={closeHref} scroll={false} className={buttonVariants({ variant: 'secondary' })}>
          <Check aria-hidden="true" />
          {t('done')}
        </Link>
      </header>
      <div className="flex flex-col gap-6 [&>*+*]:border-t [&>*+*]:border-rule [&>*+*]:pt-5">{children}</div>
    </section>
  );
}
