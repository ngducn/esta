import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { requireMember } from '@/server/member';

export default async function HomePage() {
  const [t, onboarding, member] = await Promise.all([
    getTranslations('home'),
    getTranslations('onboarding'),
    requireMember(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h2 break-words lg:text-h1">{member.household.name}</h1>
        <p>{member.displayName === null ? t('signedIn') : t('signedInAs', { name: member.displayName })}</p>
        <p>{t('role', { role: onboarding(`roles.${member.role}`) })}</p>
      </div>
      <p className="max-w-prose text-lead text-ink-muted">{t('later')}</p>
      {member.role === 'admin' && (
        <Link href="/onboarding" className="flex min-h-touch items-center self-start underline underline-offset-4">
          {onboarding('inviteTitle')}
        </Link>
      )}
    </div>
  );
}
