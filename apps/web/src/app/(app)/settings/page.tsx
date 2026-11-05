import { ChevronRight, History } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { DisplaySettingsForm, type SaveStatus } from '@/components/shell/display-settings-form';
import { IntentLink } from '@/components/shell/intent-link';
import { PageHeader } from '@/components/page-header';
import { sectionMetadata } from '@/components/shell/section-page';
import { AssistantSection } from '@/components/settings/assistant-section';
import { HouseholdSection } from '@/components/settings/household-section';
import { MembersSection } from '@/components/settings/members-section';
import { ReceivingAccounts } from '@/components/settings/receiving-accounts';
import { requireMember } from '@/server/member';
import { getThemePreference } from '@/server/theme';

export const generateMetadata = () => sectionMetadata('settings');

function parseStatus(value: string | string[] | undefined): SaveStatus {
  return value === 'saved' || value === 'failed' ? value : null;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [nav, sections, history, member, locale, theme, { status }] = await Promise.all([
    getTranslations('nav'),
    getTranslations('sections'),
    getTranslations('history'),
    requireMember(),
    getLocale(),
    getThemePreference(),
    searchParams,
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={nav('settings')} meta={<p className="max-w-prose">{sections('settings')}</p>} />
      <HouseholdSection member={member} />
      <MembersSection member={member} />
      <ReceivingAccounts member={member} />
      <AssistantSection member={member} />
      <DisplaySettingsForm
        settings={{ locale, textScale: member.textScale, density: member.density, theme }}
        status={parseStatus(status)}
      />
      {member.isOperator ? (
        <IntentLink
          href="/settings/history"
          data-testid="history-link"
          className="flex max-w-3xl items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-xs hover:bg-fill-hover sm:px-5"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-bg-subtle text-text-secondary">
            <History className="size-5" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-headline font-semibold">{history('settingsLink')}</span>
            <span className="text-body-sm text-text-muted">{history('settingsLinkHint')}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-text-muted" aria-hidden="true" />
        </IntentLink>
      ) : null}
    </div>
  );
}
