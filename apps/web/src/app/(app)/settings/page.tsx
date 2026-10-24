import { ChevronRight, History } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { DisplaySettingsForm, type SaveStatus } from '@/components/shell/display-settings-form';
import { IntentLink } from '@/components/shell/intent-link';
import { sectionMetadata } from '@/components/shell/section-page';
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
      <div className="flex flex-col gap-2">
        <h1 className="text-h2 break-words lg:text-h1">{nav('settings')}</h1>
        <p className="max-w-prose text-ink-2">{sections('settings')}</p>
      </div>
      <DisplaySettingsForm
        settings={{ locale, textScale: member.textScale, density: member.density, theme }}
        status={parseStatus(status)}
      />
      {member.isOperator ? (
        <IntentLink
          href="/settings/history"
          data-testid="history-link"
          className="flex max-w-3xl items-center gap-3 rounded-lg border border-rule bg-surface p-4 shadow-card hover:bg-surface-2 sm:px-5"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-2">
            <History className="size-5" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-lead font-semibold">{history('settingsLink')}</span>
            <span className="text-small text-ink-muted">{history('settingsLinkHint')}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
        </IntentLink>
      ) : null}
    </div>
  );
}
