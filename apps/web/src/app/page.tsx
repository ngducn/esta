import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentMember } from '@/server/member';
import { signOut } from './home-actions';
import { LanguageSwitch } from './language-switch';

export default async function HomePage() {
  const [t, app, onboarding, member] = await Promise.all([
    getTranslations('home'),
    getTranslations('app'),
    getTranslations('onboarding'),
    getCurrentMember(),
  ]);
  if (member === null) redirect('/onboarding');

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex items-start justify-between gap-4">
        <p className="text-xl font-semibold">{app('name')}</p>
        <LanguageSwitch />
      </header>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold break-words">{member.household.name}</h1>
        <p>{member.displayName === null ? t('signedIn') : t('signedInAs', { name: member.displayName })}</p>
        <p>{t('role', { role: onboarding(`roles.${member.role}`) })}</p>
      </div>
      {member.role === 'admin' && (
        <Link href="/onboarding" className="flex min-h-11 items-center underline underline-offset-4">
          {onboarding('inviteTitle')}
        </Link>
      )}
      <form action={signOut}>
        <button type="submit" className="min-h-11 underline underline-offset-4">
          {t('signOut')}
        </button>
      </form>
    </main>
  );
}
