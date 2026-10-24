import { getTranslations } from 'next-intl/server';
import { businessDate } from '@esta/core';
import { wallClockStamp } from '@esta/core/agent';
import { Suspense } from 'react';
import { OfflineNotice } from '@/components/collections/offline-notice';
import { HomeBrief } from '@/components/home/HomeBrief';
import { HomeMapStrip } from '@/components/home/HomeMapStrip';
import { MonthCollection } from '@/components/home/MonthCollection';
import { PortfolioFigure } from '@/components/home/PortfolioFigure';
import { TodayList } from '@/components/home/TodayList';
import { SectionErrorBoundary } from '@/components/section-error-boundary';
import { SkeletonHome } from '@/components/skeleton';
import { ToastHost } from '@/components/undo-toast';
import { latestBrief } from '@/server/agent/items';
import { getClock } from '@/server/clock';
import { env } from '@/server/env';
import { loadHome } from '@/server/home/load';
import { requireMember } from '@/server/member';
import { loadPortfolio } from '@/server/valuations/load';
import { mapIslandIntl, paymentIslandIntl } from '@/server/properties/island-messages';
import { getThemePreference } from '@/server/theme';

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
  const [home, portfolio, paymentIntl, mapIntl, theme, brief] = await Promise.all([
    loadHome(member.household.id, asOf, canRecord),
    loadPortfolio(member.household.id, asOf),
    canRecord ? paymentIslandIntl() : null,
    mapIslandIntl(),
    getThemePreference(),
    latestBrief(member.household.id),
  ]);
  const payment = home.payment === null || paymentIntl === null ? null : { ...home.payment, intl: paymentIntl };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h2 break-words lg:text-h1">{member.household.name}</h1>
      <OfflineNotice message={t('offline')} testId="home-offline" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="flex flex-col gap-5">
          <ToastHost labels={{ region: toast('region'), undo: toast('undo') }}>
            <TodayList today={home.today} asOf={asOf} payment={payment} />
          </ToastHost>
          <HomeBrief
            summary={brief !== null && businessDate(brief.createdAt, env.ESTA_TIMEZONE) === asOf ? brief.title : null}
            lastRun={brief === null ? null : wallClockStamp(brief.createdAt, clock.now(), env.ESTA_TIMEZONE)}
          />
        </div>
        <div className="flex flex-col gap-5">
          <MonthCollection month={home.month} board={home.board} collected={home.collected} />
          <PortfolioFigure portfolio={portfolio} />
        </div>
      </div>
      {home.pins.length === 0 ? null : (
        <HomeMapStrip title={t('mapTitle')} openLabel={t('mapOpen')} map={{ ...mapIntl, theme, label: t('mapLabel', { count: home.pins.length }), pins: home.pins }} />
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-small">
        <p className="text-ink-2">{member.displayName === null ? t('signedIn') : t('signedInAs', { name: member.displayName })}</p>
        <p className="rounded-full border border-rule bg-surface px-3 py-1 font-medium text-ink-muted">{t('role', { role: onboarding(`roles.${member.role}`) })}</p>
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
