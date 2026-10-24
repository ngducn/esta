import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AuthFrame } from '@/components/auth-frame';
import { env } from '@/server/env';
import { LanguageSwitch } from '../language-switch';
import { signInWithGoogle } from './actions';
import { linkClass, outlineClass } from './auth-fields';
import { passwordCopy } from './copy';
import { PasswordSignInForm, type PasswordSignInCopy } from './password-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('signIn');
  return { title: t('title') };
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const [t, app, password, { error }] = await Promise.all([getTranslations('signIn'), getTranslations('app'), passwordCopy(), searchParams]);
  const copy: PasswordSignInCopy = {
    emailLabel: t('emailLabel'),
    passwordLabel: t('passwordLabel'),
    password,
    forgotPassword: t('forgotPassword'),
    submit: t('signInSubmit'),
    submitting: t('signingIn'),
    invalidEmail: t('invalidEmail'),
    missingPassword: t('missingPassword'),
    wrongPassword: t('wrongPassword'),
    rateLimited: t('tooManyTries'),
    failed: t('signInFailed'),
  };
  const google = env.ESTA_GOOGLE_AUTH === 'on';
  return (
    <AuthFrame brand={app('name')} photoAlt={app('heroAlt')} aside={<LanguageSwitch />}>
      <div className="flex flex-col gap-1">
        <h1 className="text-h2 lg:text-h1">{t('title')}</h1>
        <p className="text-ink-muted">{app('tagline')}</p>
      </div>
      {google && error === 'google' && (
        <p role="alert" className="font-medium text-overdue">
          {t('googleFailed')}
        </p>
      )}
      <PasswordSignInForm copy={copy} />
      <div className="flex flex-col gap-4">
        <p className="text-center text-ink-muted">{t('or')}</p>
        <Link href="/sign-in/code" className={outlineClass}>
          {t('useCode')}
        </Link>
        {google && (
          <form action={signInWithGoogle}>
            <button type="submit" className={outlineClass}>
              {t('google')}
            </button>
          </form>
        )}
      </div>
      <p className="flex flex-wrap items-center justify-center gap-x-2 border-t border-rule pt-4 text-ink-2">
        {t('noAccount')}
        <Link href="/sign-up" className={linkClass}>
          {t('createAccount')}
        </Link>
      </p>
    </AuthFrame>
  );
}
