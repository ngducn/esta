import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { workerStatus } from '@esta/core/agent';
import { formatDateLong } from '@esta/core/format';
import { WorkerStatusLine } from '@/components/assistant/worker-status-line';
import { BrandMark, BrandTile } from '@/components/brand-mark';
import { givenInitial } from '@/components/ui/avatar';
import { AccountTrigger, AvatarMenu } from '@/components/shell/avatar-menu';
import type { SettingGroup } from '@/components/shell/account-settings';
import { accountSections, operatorSections, primarySections, type NavItem } from '@/components/shell/nav';
import { PrefetchTabs } from '@/components/shell/prefetch-tabs';
import { Sidebar } from '@/components/shell/sidebar';
import { TabBar } from '@/components/shell/tab-bar';
import { getWorkerHeartbeat } from '@/server/assistant';
import { densityNames, textScales } from '@/design/tokens';
import { locales } from '@/i18n/locale';
import { getClock } from '@/server/clock';
import { env } from '@/server/env';
import { requireMember } from '@/server/member';
import { getThemePreference, themePreferences } from '@/server/theme';

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [member, clock, heartbeat, locale, theme, nav, shell, settings, onboarding, app] = await Promise.all([
    requireMember(),
    getClock(),
    getClock().then((current) => getWorkerHeartbeat(current.now())),
    getLocale(),
    getThemePreference(),
    getTranslations('nav'),
    getTranslations('shell'),
    getTranslations('settings'),
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
  const initial = givenInitial(member.displayName);
  const role = onboarding(`roles.${member.role}`);
  const settingGroups: SettingGroup[] = [
    { name: 'textScale', label: settings('textScale'), value: String(member.textScale), options: textScales.map((scale) => ({ value: String(scale), label: settings('textScaleOption', { scale }) })) },
    { name: 'theme', label: settings('theme'), value: theme, options: themePreferences.map((value) => ({ value, label: settings(`themes.${value}`) })) },
    { name: 'density', label: settings('density'), value: member.density, options: densityNames.map((value) => ({ value, label: settings(`densities.${value}`) })) },
    { name: 'locale', label: settings('language'), value: locale, options: locales.map((value) => ({ value, label: settings(`languages.${value}`), lang: value })) },
  ];

  return (
    <div className="md:flex">
      <Sidebar
        items={items}
        more={more}
        label={shell('sections')}
        moreLabel={shell('more')}
        header={
          <>
            <BrandMark name={app('name')} className="hidden px-2 pt-1 lg:block" />
            <BrandTile name={app('name')} className="mx-auto lg:hidden" />
            <p className="hidden rounded-md border border-border bg-bg-subtle px-3 py-2.5 text-label break-words text-text lg:block">{member.household.name}</p>
          </>
        }
        footer={<AccountTrigger initial={initial} label={name} detail={role} accessibleName={shell('accountOf', { name })} className="w-full" />}
      />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 px-4 pt-3 md:px-8 md:pt-6">
          <p data-testid="date-line" className="text-body-sm font-medium text-text-muted">
            {formatDateLong(clock.today(), locale)}
          </p>
          <div className="md:hidden">
            <AccountTrigger initial={initial} label={shell('account')} accessibleName={shell('account')} compact />
          </div>
        </header>
        <main className="w-full max-w-dashboard flex-1 px-4 pt-3 pb-10 md:px-8 md:pt-4">
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
        initial={initial}
        household={member.household.name}
        role={role}
        links={menu}
        settings={settingGroups}
        labels={{ close: shell('close'), saveFailed: settings('saveFailed'), signOut: shell('signOut') }}
      />
    </div>
  );
}
