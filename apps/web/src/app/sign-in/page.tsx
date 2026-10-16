import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthFrame } from '@/components/auth-frame';
import { env } from '@/server/env';
import { LanguageSwitch } from '../language-switch';
import { signInWithGoogle } from './actions';
import { SignInForm, type Around, type SignInCopy } from './sign-in-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('signIn');
  return { title: t('title') };
}

const SLOT = '\u0000';

function around(formatted: string): Around {
  const [before = '', after = ''] = formatted.split(SLOT);
  return [before, after];
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const [t, app, { error }] = await Promise.all([getTranslations('signIn'), getTranslations('app'), searchParams]);
  const copy: SignInCopy = {
    emailIntro: t('emailIntro'),
    emailLabel: t('emailLabel'),
    sendCode: t('sendCode'),
    sending: t('sending'),
    invalidEmail: t('invalidEmail'),
    sendFailed: t('sendFailed'),
    rateLimited: t('rateLimited'),
    codeSent: around(t('codeSent', { email: SLOT })),
    codeLabel: t('codeLabel'),
    verify: t('verify'),
    verifying: t('verifying'),
    wrongCode: t('wrongCode'),
    missingCode: t('missingCode'),
    resend: t('resend'),
    resendIn: around(t('resendIn', { seconds: SLOT })),
    changeEmail: t('changeEmail'),
  };
  const google = env.ESTA_GOOGLE_AUTH === 'on';
  return (
    <AuthFrame brand={app('name')} photoAlt={app('heroAlt')} aside={<LanguageSwitch />}>
      <div className="flex flex-col gap-1">
        <h1 className="text-h2 lg:text-h1">{t('title')}</h1>
        <p className="text-ink-muted">{app('tagline')}</p>
      </div>
      {google && error === 'google' && (
        <p role="alert" className="font-semibold text-overdue">
          {t('googleFailed')}
        </p>
      )}
      <SignInForm copy={copy} />
      {google && (
        <form action={signInWithGoogle} className="flex flex-col gap-4">
          <p className="text-center text-ink-muted">{t('or')}</p>
          <button
            type="submit"
            className="min-h-touch w-full rounded-sm border border-rule-strong bg-surface px-4 font-semibold text-ink transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-2"
          >
            {t('google')}
          </button>
        </form>
      )}
    </AuthFrame>
  );
}
