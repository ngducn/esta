import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { formatDateLong } from '@esta/core/format';
import { AccountTrigger, AvatarMenu } from '@/components/shell/avatar-menu';
import { accountSections, primarySections, type NavItem } from '@/components/shell/nav';
import { Sidebar } from '@/components/shell/sidebar';
import { TabBar } from '@/components/shell/tab-bar';
import { getClock } from '@/server/clock';
import { requireMember } from '@/server/member';

/** Vietnamese names put the given name last, so the monogram takes its first letter. */
function monogram(displayName: string | null): string | null {
  const given = displayName?.trim().split(/\s+/).at(-1);
  return given ? given.charAt(0).toLocaleUpperCase('vi') : null;
}

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [member, clock, locale, nav, shell, language, onboarding, app] = await Promise.all([
    requireMember(),
    getClock(),
    getLocale(),
    getTranslations('nav'),
    getTranslations('shell'),
    getTranslations('language'),
    getTranslations('onboarding'),
    getTranslations('app'),
  ]);

  const items: NavItem[] = primarySections.map(({ key, href, icon }) => ({ key, href, icon, label: nav(key) }));
  const name = member.displayName ?? shell('account');
  const initial = monogram(member.displayName);

  return (
    <div className="lg:flex">
      <Sidebar
        items={items}
        label={shell('sections')}
        header={
          <>
            <p className="font-figure text-h3 font-semibold text-lacquer">{app('name')}</p>
            <p className="text-small text-ink-muted break-words">{member.household.name}</p>
          </>
        }
        footer={<AccountTrigger initial={initial} label={name} accessibleName={shell('accountOf', { name })} />}
      />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 px-4 pt-2 lg:px-8 lg:pt-6">
          <p data-testid="date-line" className="text-small text-ink-muted">
            {formatDateLong(clock.today(), locale)}
          </p>
          <div className="lg:hidden">
            <AccountTrigger initial={initial} label={shell('account')} accessibleName={shell('account')} />
          </div>
        </header>
        <main className="w-full max-w-content flex-1 px-4 pt-4 pb-10 lg:px-8 lg:pt-6">{children}</main>
        <TabBar items={items} label={shell('sections')} />
      </div>
      <AvatarMenu
        name={name}
        household={member.household.name}
        role={onboarding(`roles.${member.role}`)}
        links={accountSections.map(({ key, href }) => ({ key, href, label: nav(key) }))}
        switchLanguage={{ locale: locale === 'vi' ? 'en' : 'vi', label: language('switchTo') }}
        signOut={shell('signOut')}
      />
    </div>
  );
}
