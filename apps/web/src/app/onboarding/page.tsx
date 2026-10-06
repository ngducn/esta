import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';
import { LanguageSwitch } from '../language-switch';
import { CreateHouseholdForm, InviteForm } from './forms';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding');
  return { title: t('title') };
}

/** An invite sent after this user signed in is claimed here instead of creating a second household. */
async function claimedLateInvite(): Promise<boolean> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc('claim_pending_invites');
  if (error) throw new Error(`claim_pending_invites failed: ${error.message}`);
  return data > 0;
}

export default async function OnboardingPage() {
  const [t, messages, member] = await Promise.all([getTranslations('onboarding'), getMessages(), getCurrentMember()]);
  if (member === null && (await claimedLateInvite())) redirect('/');
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
              <h1 className="text-3xl font-semibold">{t('title')}</h1>
              <p>{t('intro')}</p>
            </div>
            <CreateHouseholdForm />
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-xl font-semibold">{member.household.name}</p>
              <h1 className="text-3xl font-semibold">{t('inviteTitle')}</h1>
              <p>{t('inviteIntro', { household: member.household.name })}</p>
            </div>
            <InviteForm />
            <Link href="/" className="flex min-h-11 items-center justify-center underline underline-offset-4">
              {t('done')}
            </Link>
          </>
        )}
      </NextIntlClientProvider>
    </main>
  );
}
