import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentMember, getSessionUser } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';
import { signOut } from '../home-actions';
import { LanguageSwitch } from '../language-switch';
import { CreateHouseholdForm, InviteForm } from './forms';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding');
  return { title: t('title') };
}

async function claimLateInvites(): Promise<boolean> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc('claim_pending_invites');
  if (error) throw new Error(`claim_pending_invites failed: ${error.message}`);
  return data > 0;
}

export default async function OnboardingPage() {
  const [t, shell, messages, member, user] = await Promise.all([
    getTranslations('onboarding'),
    getTranslations('shell'),
    getMessages(),
    getCurrentMember(),
    getSessionUser(),
  ]);
  if (member === null && (await claimLateInvites())) redirect('/');
  if (member !== null && member.role !== 'admin') redirect('/');

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8">
      <div className="flex justify-end">
        <LanguageSwitch />
      </div>
      <NextIntlClientProvider messages={{ onboarding: messages.onboarding }}>
        {member === null ? (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="text-h1 font-semibold">{t('title')}</h1>
              <p>{t('intro')}</p>
            </div>
            <CreateHouseholdForm />
            <div className="flex flex-col gap-2">
              {user?.email && <p className="break-all">{t('signedInEmail', { email: user.email })}</p>}
              <p>{t('invitedElsewhere')}</p>
              <form action={signOut}>
                <button type="submit" className="min-h-touch underline underline-offset-4">
                  {shell('signOut')}
                </button>
              </form>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-h3 font-semibold">{member.household.name}</p>
              <h1 className="text-h1 font-semibold">{t('inviteTitle')}</h1>
              <p>{t('inviteIntro', { household: member.household.name })}</p>
            </div>
            <InviteForm />
            <Link href="/" className="flex min-h-touch items-center justify-center underline underline-offset-4">
              {t('done')}
            </Link>
          </>
        )}
      </NextIntlClientProvider>
    </main>
  );
}
