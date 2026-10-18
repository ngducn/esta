import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AuthFrame } from '@/components/auth-frame';
import { LanguageSwitch } from '../language-switch';
import { linkClass } from '../sign-in/auth-fields';
import { around, passwordCopy } from '../sign-in/copy';
import { SignUpForm, type SignUpCopy } from './sign-up-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('signUp');
  return { title: t('title') };
}

export default async function SignUpPage() {
  const [t, signIn, app, password] = await Promise.all([
    getTranslations('signUp'),
    getTranslations('signIn'),
    getTranslations('app'),
    passwordCopy(),
  ]);
  const copy: SignUpCopy = {
    intro: t('intro'),
    emailLabel: signIn('emailLabel'),
    passwordLabel: signIn('passwordLabel'),
    passwordHint: t('passwordHint'),
    password,
    submit: t('submit'),
    sending: signIn('sending'),
    invalidEmail: signIn('invalidEmail'),
    shortPassword: t('shortPassword'),
    longPassword: t('longPassword'),
    sendFailed: signIn('sendFailed'),
    rateLimited: signIn('rateLimited'),
    failed: t('failed'),
    missingCode: signIn('missingCode'),
    wrongCode: signIn('wrongCode'),
    code: {
      codeSent: around((email) => t('codeSent', { email })),
      codeLabel: signIn('codeLabel'),
      submit: t('confirm'),
      submitting: t('confirming'),
      resend: signIn('resend'),
      resendIn: around((seconds) => signIn('resendIn', { seconds })),
      changeEmail: signIn('changeEmail'),
    },
  };
  return (
    <AuthFrame brand={app('name')} photoAlt={app('heroAlt')} aside={<LanguageSwitch />}>
      <h1 className="text-h2 lg:text-h1">{t('title')}</h1>
      <SignUpForm copy={copy} />
      <p className="flex flex-wrap items-center justify-center gap-x-2 border-t border-rule pt-4 text-ink-2">
        {t('haveAccount')}
        <Link href="/sign-in" className={linkClass}>
          {t('signIn')}
        </Link>
      </p>
    </AuthFrame>
  );
}
