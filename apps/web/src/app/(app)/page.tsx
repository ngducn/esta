import { House, SlidersHorizontal, UserPlus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState, type EmptyStateAction } from '@/components/empty-state';
import { requireMember } from '@/server/member';

export default async function HomePage() {
  const [t, onboarding, sections, member] = await Promise.all([
    getTranslations('home'),
    getTranslations('onboarding'),
    getTranslations('sections'),
    requireMember(),
  ]);

  const action: EmptyStateAction =
    member.role === 'admin'
      ? { label: onboarding('inviteTitle'), href: '/onboarding', icon: UserPlus }
      : { label: sections('adjustDisplay'), href: '/settings', icon: SlidersHorizontal };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h2 break-words lg:text-h1">{member.household.name}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-ink-2">{member.displayName === null ? t('signedIn') : t('signedInAs', { name: member.displayName })}</p>
          <p className="rounded-full border border-rule bg-surface px-3 py-1 text-small font-semibold text-ink-muted">
            {t('role', { role: onboarding(`roles.${member.role}`) })}
          </p>
        </div>
      </div>
      <EmptyState icon={House} title={sections('soonTitle')} body={t('later')} action={action} className="max-w-3xl" />
    </div>
  );
}
