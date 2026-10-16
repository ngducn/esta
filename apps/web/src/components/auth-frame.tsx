import type { ReactNode } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { Photo } from '@/components/photo';
import hero from '@/photos/sign-in-hero.webp';

/**
 * Sign-in and onboarding: the form in a card on the left, the photo on the right on desktop. Phones get no
 * photo, and the hidden image stays lazy so a phone never fetches it and the form stays the LCP element.
 */
export function AuthFrame({ brand, photoAlt, aside, children }: { brand: string; photoAlt: string; aside: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-6 sm:py-10 lg:justify-center">
        <header className="flex items-center justify-between gap-4">
          <BrandMark name={brand} />
          {aside}
        </header>
        <div className="flex flex-col gap-6 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-7">{children}</div>
      </main>
      <div className="relative hidden p-4 lg:block">
        <div className="relative h-full overflow-hidden rounded-lg bg-surface-2">
          <Photo src={hero} alt={photoAlt} sizes="50vw" className="object-cover" />
        </div>
      </div>
    </div>
  );
}
