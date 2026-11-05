import { readLivePropertyIds } from '@esta/ops';
import { PageHeader } from '@/components/page-header';
import { getTranslations } from 'next-intl/server';
import { businessDate } from '@esta/core';
import { wallClockStamp } from '@esta/core/agent';
import { Suspense } from 'react';
import { OfflineNotice } from '@/components/collections/offline-notice';
import { FirstRunChecklist } from '@/components/home/FirstRunChecklist';
import { HomeBrief } from '@/components/home/HomeBrief';
import { HomeMapStrip } from '@/components/home/HomeMapStrip';
import { MonthCollection } from '@/components/home/MonthCollection';
import { PortfolioFigure } from '@/components/home/PortfolioFigure';
import { RegistryEmptyState } from '@/components/registry-empty-state';
import { TodayList } from '@/components/home/TodayList';
import { sectionIcons } from '@/components/shell/section-icons';
import { SectionErrorBoundary } from '@/components/section-error-boundary';
import { SkeletonHome } from '@/components/skeleton';
import { ToastHost } from '@/components/undo-toast';
import { latestBrief } from '@/server/agent/items';
import { getClock } from '@/server/clock';
import { env } from '@/server/env';
import { loadHome } from '@/server/home/load';
import { loadFirstRun } from '@/server/onboarding/load-first-run';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';
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
  const [home, portfolio, paymentIntl, mapIntl, theme, brief, propertyIds, firstRun, firstRunT] = await Promise.all([
    loadHome(member.household.id, asOf, canRecord),
    loadPortfolio(member.household.id, asOf),
    canRecord ? paymentIslandIntl() : null,
    mapIslandIntl(),
    getThemePreference(),
    latestBrief(member.household.id, clock.now()),
    createSessionClient().then((db) => readLivePropertyIds(db, member.household.id)),
    loadFirstRun(member.household.id, member.role),
    getTranslations('firstRun'),
  ]);
  const signedIn = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-body-sm">
      <p className="text-text-secondary">{member.displayName === null ? t('signedIn') : t('signedInAs', { name: member.displayName })}</p>
      <p className="rounded-full border border-border bg-surface px-3 py-1 font-medium text-text-muted">{t('role', { role: onboarding(`roles.${member.role}`) })}</p>
    </div>
  );
  const checklist = firstRun?.visible ? (
    <FirstRunChecklist
      rows={firstRun.steps.map((step) => ({ id: step.id, title: firstRunT(step.titleKey), action: firstRunT(step.actionKey), href: step.href, done: step.done }))}
      labels={{ title: firstRunT('title'), hide: firstRunT('hide'), hidden: firstRunT('hidden'), hideFailed: firstRunT('hideFailed'), restoreFailed: firstRunT('restoreFailed'), done: firstRunT('done') }}
    />
  ) : null;
  if (propertyIds.length === 0) {
    return (
      <ToastHost labels={{ region: toast('region'), undo: toast('undo') }}>
        <div className="flex flex-col gap-stack">
          <PageHeader title={member.household.name} />
          <OfflineNotice message={t('offline')} testId="home-offline" />
          {checklist ?? <RegistryEmptyState surface="home" ctx={{ canWrite: canRecord }} icon={sectionIcons.properties} className="max-w-3xl" />}
          {signedIn}
        </div>
      </ToastHost>
    );
  }
  const todaysBrief = brief !== null && businessDate(brief.createdAt, env.ESTA_TIMEZONE) === asOf ? brief : null;
  const payment = home.payment === null || paymentIntl === null ? null : { ...home.payment, intl: paymentIntl };

  return (
    <ToastHost labels={{ region: toast('region'), undo: toast('undo') }}>
      <div className="flex flex-col gap-stack">
        <PageHeader title={member.household.name} />
        <OfflineNotice message={t('offline')} testId="home-offline" />
        {checklist}
        <div className="grid grid-cols-1 gap-stack md:grid-cols-2 md:items-start">
          <MonthCollection month={home.month} board={home.board} collected={home.collected} />
          <PortfolioFigure portfolio={portfolio} />
        </div>
        <div className={home.pins.length === 0 ? 'flex flex-col gap-stack' : 'grid grid-cols-1 gap-stack lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start'}>
          <div className="flex min-w-0 flex-col gap-stack">
            <TodayList today={home.today} asOf={asOf} payment={payment} />
            <HomeBrief
              summary={todaysBrief?.title ?? null}
              briefId={todaysBrief?.id ?? null}
              lastRun={brief === null ? null : wallClockStamp(brief.createdAt, clock.now(), env.ESTA_TIMEZONE)}
            />
          </div>
          {home.pins.length === 0 ? null : (
            <HomeMapStrip title={t('mapTitle')} openLabel={t('mapOpen')} map={{ ...mapIntl, theme, label: t('mapLabel', { count: home.pins.length }), pins: home.pins }} />
          )}
        </div>
        {signedIn}
      </div>
    </ToastHost>
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
