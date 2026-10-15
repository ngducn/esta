import { getLocale, getTranslations } from 'next-intl/server';
import { DisplaySettingsForm, type SaveStatus } from '@/components/shell/display-settings-form';
import { sectionMetadata } from '@/components/shell/section-page';
import { requireMember } from '@/server/member';
import { getThemePreference } from '@/server/theme';

export const generateMetadata = () => sectionMetadata('settings');

function parseStatus(value: string | string[] | undefined): SaveStatus {
  return value === 'saved' || value === 'failed' ? value : null;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [nav, sections, member, locale, theme, { status }] = await Promise.all([
    getTranslations('nav'),
    getTranslations('sections'),
    requireMember(),
    getLocale(),
    getThemePreference(),
    searchParams,
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-h2 break-words lg:text-h1">{nav('settings')}</h1>
        <p className="max-w-prose text-lead text-ink-muted">{sections('settings')}</p>
      </div>
      <DisplaySettingsForm
        settings={{ locale, textScale: member.textScale, density: member.density, theme }}
        status={parseStatus(status)}
      />
    </div>
  );
}
