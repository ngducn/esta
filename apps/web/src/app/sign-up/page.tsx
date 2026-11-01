import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AuthFrame } from '@/components/auth-frame';
import { linkClass } from '../sign-in/auth-fields';
import { around, passwordCopy } from '../sign-in/copy';
import { SignUpForm, type SignUpCopy } from './sign-up-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('signUp');
  return { title: t('title') };
}

export default async function SignUpPage() {
  const [t, signIn, password] = await Promise.all([
    getTranslations('signUp'),
    getTranslations('signIn'),
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
    <AuthFrame
      eyebrow={t('eyebrow')}
      title={t('title')}
      titleEnd={t('titleEnd')}
    >
      <SignUpForm copy={copy} />
      <p className="flex flex-wrap items-center justify-center gap-x-2 border-t border-border pt-4 text-text-secondary">
        {t('haveAccount')}
        <Link href="/sign-in" className={linkClass}>
          {t('signIn')}
        </Link>
      </p>
    </AuthFrame>
  );
}
