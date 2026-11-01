import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LanguageSwitch } from '@/app/language-switch';
import { interDisplay } from '@/app/display-font';
import { BrandMark } from '@/components/brand-mark';
import { BrandFrame, Eyebrow, PhotoLines, ReversedLogo, SplitHeadline } from '@/components/brand-layer';
import { Photo } from '@/components/photo';
import hero from '@/photos/sign-in-hero.webp';

type AuthFrameProps = { eyebrow: string; title: string; titleEnd: string; children: ReactNode };

/**
 * The pages before the app, in the design system's brand layer: the form in a double frame under a split headline,
 * and from `lg` (64rem) a photo with fine lines and the reversed logo. The photo is the largest paint on a desktop, so
 * from there it loads at once and at high priority. A phone never requests it, so the headline stays the LCP element.
 * Inter Display loads here and nowhere in the app.
 */
export async function AuthFrame({ eyebrow, title, titleEnd, children }: AuthFrameProps) {
  const app = await getTranslations('app');
  return (
    <div className={`${interDisplay.variable} min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`}>
      <main className="mx-auto flex w-full max-w-md flex-col gap-8 lg:max-w-lg px-4 py-6 sm:py-10 lg:justify-center">
        <header className="flex items-center justify-between gap-4">
          <BrandMark name={app('name')} />
          <LanguageSwitch />
        </header>
        <div className="flex flex-col gap-3">
          <Eyebrow>{eyebrow}</Eyebrow>
          <SplitHeadline title={title} end={titleEnd} />
        </div>
        <BrandFrame>{children}</BrandFrame>
      </main>
      <div className="relative hidden p-4 lg:block">
        <div className="es-mk-photo relative h-full overflow-hidden rounded-2xl bg-skeleton">
          <Photo src={hero} alt={app('heroAlt')} sizes="50vw" eagerFrom="64rem" className="object-cover" />
          <PhotoLines />
          <ReversedLogo className="absolute top-8 left-8 z-10 h-7" />
          <p className="absolute bottom-8 left-8 z-10 max-w-[16ch] font-display text-[2.5rem] leading-[1.2] font-[300] tracking-[-0.02em] whitespace-pre-line">
            {app('heroCaption')}
          </p>
        </div>
      </div>
    </div>
  );
}
