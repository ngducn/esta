import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { workerStatus } from '@esta/core/agent';
import { formatDateLong } from '@esta/core/format';
import { WorkerStatusLine } from '@/components/assistant/worker-status-line';
import { BrandMark } from '@/components/brand-mark';
import { AccountTrigger, AvatarMenu } from '@/components/shell/avatar-menu';
import { accountSections, operatorSections, primarySections, type NavItem } from '@/components/shell/nav';
import { PrefetchTabs } from '@/components/shell/prefetch-tabs';
import { Sidebar } from '@/components/shell/sidebar';
import { TabBar } from '@/components/shell/tab-bar';
import { getWorkerHeartbeat } from '@/server/assistant';
import { getClock } from '@/server/clock';
import { env } from '@/server/env';
import { requireMember } from '@/server/member';

/** Vietnamese names put the given name last, so the monogram takes its first letter. */
function monogram(displayName: string | null): string | null {
  const given = displayName?.trim().split(/\s+/).at(-1);
  return given ? given.charAt(0).toLocaleUpperCase('vi') : null;
}

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [member, clock, heartbeat, locale, nav, shell, language, onboarding, app] = await Promise.all([
    requireMember(),
    getClock(),
    getClock().then((current) => getWorkerHeartbeat(current.now())),
    getLocale(),
    getTranslations('nav'),
    getTranslations('shell'),
    getTranslations('language'),
    getTranslations('onboarding'),
    getTranslations('app'),
  ]);

  const worker = workerStatus(heartbeat, clock.now(), env.ESTA_TIMEZONE);
  const toItem = ({ key, href }: { key: NavItem['key']; href: string }): NavItem => ({ key, href, label: nav(key) });
  const items = primarySections.map(toItem);
  // A phone's five tabs share 390 px, and the English section names need 490 at 130% text, so the tabs take short ones (FND-8).
  const tabs = primarySections.map(({ key, href }): NavItem => ({ key, href, label: nav(`${key}Tab`) }));
  const more = accountSections.map(toItem);
  const menu = member.isOperator ? [...more, ...operatorSections.map(toItem)] : more;
  const name = member.displayName ?? shell('account');
  const initial = monogram(member.displayName);
  const role = onboarding(`roles.${member.role}`);

  return (
    <div className="lg:flex">
      <Sidebar
        items={items}
        more={more}
        label={shell('sections')}
        moreLabel={shell('more')}
        header={
          <>
            <BrandMark name={app('name')} className="px-2 pt-1" />
            <p className="rounded-md border border-rule bg-surface-2 px-3 py-2.5 font-medium break-words text-ink">{member.household.name}</p>
          </>
        }
        footer={<AccountTrigger initial={initial} label={name} detail={role} accessibleName={shell('accountOf', { name })} className="w-full" />}
      />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 px-4 pt-3 lg:px-8 lg:pt-6">
          <p data-testid="date-line" className="text-small font-medium text-ink-muted">
            {formatDateLong(clock.today(), locale)}
          </p>
          <div className="lg:hidden">
            <AccountTrigger initial={initial} label={shell('account')} accessibleName={shell('account')} compact />
          </div>
        </header>
        <main className="w-full max-w-content flex-1 px-4 pt-3 pb-10 lg:px-8 lg:pt-4">
          {worker.kind === 'offline' || worker.kind === 'paused' ? (
            <div className="mb-5">
              <WorkerStatusLine status={worker} />
            </div>
          ) : null}
          {children}
        </main>
        <TabBar items={tabs} label={shell('sections')} />
      </div>
      <PrefetchTabs />
      <AvatarMenu
        name={name}
        household={member.household.name}
        role={role}
        links={menu}
        switchLanguage={{ locale: locale === 'vi' ? 'en' : 'vi', label: language('switchTo') }}
        signOut={shell('signOut')}
      />
    </div>
  );
}
