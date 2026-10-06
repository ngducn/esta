import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
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
    resend: t('resend'),
    resendIn: around(t('resendIn', { seconds: SLOT })),
    changeEmail: t('changeEmail'),
  };
  const google = env.ESTA_GOOGLE_AUTH === 'on';
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xl font-semibold">{app('name')}</p>
          <p>{app('tagline')}</p>
        </div>
        <LanguageSwitch />
      </header>
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      {google && error === 'google' && (
        <p role="alert" className="font-semibold">
          {t('googleFailed')}
        </p>
      )}
      <SignInForm copy={copy} />
      {google && (
        <form action={signInWithGoogle} className="flex flex-col gap-4">
          <p className="text-center">{t('or')}</p>
          <button type="submit" className="min-h-11 w-full rounded-md border border-current px-4">
            {t('google')}
          </button>
        </form>
      )}
    </main>
  );
}
