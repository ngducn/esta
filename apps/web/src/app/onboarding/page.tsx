import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { UserPlus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthFrame } from '@/components/auth-frame';
import { buttonVariants } from '@/components/ui/button';
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
  const [t, shell, app, messages, member, user] = await Promise.all([
    getTranslations('onboarding'),
    getTranslations('shell'),
    getTranslations('app'),
    getMessages(),
    getCurrentMember(),
    getSessionUser(),
  ]);
  if (member === null && (await claimLateInvites())) redirect('/');
  if (member !== null && member.role !== 'admin') redirect('/');

  return (
    <AuthFrame brand={app('name')} photoAlt={app('heroAlt')} aside={<LanguageSwitch />}>
      <NextIntlClientProvider messages={{ onboarding: messages.onboarding }}>
        {member === null ? (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="text-h2 lg:text-h1">{t('title')}</h1>
              <p className="text-ink-2">{t('intro')}</p>
            </div>
            <CreateHouseholdForm />
            <div className="flex flex-col gap-2 border-t border-rule pt-5 text-small text-ink-muted">
              {user?.email && <p className="break-all">{t('signedInEmail', { email: user.email })}</p>}
              <p>{t('invitedElsewhere')}</p>
              <form action={signOut}>
                <button type="submit" className="min-h-touch font-medium text-ink underline decoration-ink-muted underline-offset-4">
                  {shell('signOut')}
                </button>
              </form>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 font-medium text-ink-muted">
                <UserPlus className="size-5 text-accent" strokeWidth={1.8} aria-hidden="true" />
                {member.household.name}
              </p>
              <h1 className="text-h2 lg:text-h1">{t('inviteTitle')}</h1>
              <p className="text-ink-2">{t('inviteIntro', { household: member.household.name })}</p>
            </div>
            <InviteForm />
            <Link href="/" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
              {t('done')}
            </Link>
          </>
        )}
      </NextIntlClientProvider>
    </AuthFrame>
  );
}
