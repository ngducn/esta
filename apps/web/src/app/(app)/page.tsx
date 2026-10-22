import { getTranslations } from 'next-intl/server';
import { Suspense, type ReactNode } from 'react';
import { OfflineNotice } from '@/components/collections/offline-notice';
import { HomeMapStrip } from '@/components/home/HomeMapStrip';
import { MonthCollection } from '@/components/home/MonthCollection';
import { PortfolioFigure } from '@/components/home/PortfolioFigure';
import { TodayList } from '@/components/home/TodayList';
import { SectionErrorBoundary } from '@/components/section-error-boundary';
import { SkeletonHome } from '@/components/skeleton';
import { ToastHost } from '@/components/undo-toast';
import { getClock } from '@/server/clock';
import { loadHome } from '@/server/home/load';
import { requireMember } from '@/server/member';
import { loadPortfolio } from '@/server/valuations/load';
import { mapIslandIntl, paymentIslandIntl } from '@/server/properties/island-messages';
import { getThemePreference } from '@/server/theme';

/** The place P5-04 fills with the morning brief note. It renders nothing until then, so Home never shows an empty box. */
type HomeSlots = { readonly brief: ReactNode };
const SLOTS: HomeSlots = { brief: null };

async function Home() {
  const [member, clock, t, onboarding, toast] = await Promise.all([
    requireMember(),
    getClock(),
    getTranslations('home'),
    getTranslations('onboarding'),
    getTranslations('components.toast'),
  ]);
  const asOf = clock.today();
  const canRecord = member.role !== 'viewer';
  const [home, portfolio, paymentIntl, mapIntl, theme] = await Promise.all([
    loadHome(member.household.id, asOf, canRecord),
    loadPortfolio(member.household.id, asOf),
    canRecord ? paymentIslandIntl() : null,
    mapIslandIntl(),
    getThemePreference(),
  ]);
  const payment = home.payment === null || paymentIntl === null ? null : { ...home.payment, intl: paymentIntl };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h2 break-words lg:text-h1">{member.household.name}</h1>
      <OfflineNotice message={t('offline')} testId="home-offline" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <ToastHost labels={{ region: toast('region'), undo: toast('undo') }}>
          <TodayList today={home.today} asOf={asOf} payment={payment} />
        </ToastHost>
        <div className="flex flex-col gap-5">
          <MonthCollection month={home.month} board={home.board} collected={home.collected} />
          {SLOTS.brief}
          <PortfolioFigure portfolio={portfolio} />
        </div>
      </div>
      {home.pins.length === 0 ? null : (
        <HomeMapStrip title={t('mapTitle')} openLabel={t('mapOpen')} map={{ ...mapIntl, theme, label: t('mapLabel', { count: home.pins.length }), pins: home.pins }} />
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-small">
        <p className="text-ink-2">{member.displayName === null ? t('signedIn') : t('signedInAs', { name: member.displayName })}</p>
        <p className="rounded-full border border-rule bg-surface px-3 py-1 font-semibold text-ink-muted">{t('role', { role: onboarding(`roles.${member.role}`) })}</p>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const t = await getTranslations('home');
  return (
    <SectionErrorBoundary labels={{ title: t('errorTitle'), body: t('errorBody'), retry: t('retry') }}>
      <Suspense fallback={<SkeletonHome />}>
        <Home />
      </Suspense>
    </SectionErrorBoundary>
  );
}
