import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthFrame } from '@/components/auth-frame';
import { buttonVariants } from '@/components/ui/button';
import { getCurrentMember, getSessionUser } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';
import { signOut } from '../home-actions';
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
  if (member !== null && !member.can('household')) redirect('/');

  const creating = member === null;
  return (
    <AuthFrame
      eyebrow={creating ? t('eyebrow') : member.household.name}
      title={creating ? t('title') : t('inviteTitle')}
      titleEnd={creating ? t('titleEnd') : t('inviteTitleEnd')}
    >
      <NextIntlClientProvider messages={{ onboarding: messages.onboarding }}>
        {creating ? (
          <>
            <p className="text-text-secondary">{t('intro')}</p>
            <CreateHouseholdForm />
            <div className="flex flex-col gap-2 border-t border-border pt-5 text-body-sm text-text-muted">
              {user?.email && <p className="break-all">{t('signedInEmail', { email: user.email })}</p>}
              <p>{t('invitedElsewhere')}</p>
              <form action={signOut}>
                <button type="submit" className="min-h-touch font-medium text-text underline decoration-text-muted underline-offset-4">
                  {shell('signOut')}
                </button>
              </form>
            </div>
          </>
        ) : (
          <>
            <p className="text-text-secondary">{t('inviteIntro', { household: member.household.name })}</p>
            <InviteForm />
            <Link href="/" className={buttonVariants({ variant: 'secondary', className: 'w-full rounded-full' })}>
              {t('done')}
            </Link>
          </>
        )}
      </NextIntlClientProvider>
    </AuthFrame>
  );
}
