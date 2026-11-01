import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthFrame } from '@/components/auth-frame';
import { around, passwordCopy } from '../sign-in/copy';
import { ResetForm, type ResetCopy } from './reset-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('resetPassword');
  return { title: t('title') };
}

export default async function ForgotPasswordPage() {
  const [t, signIn, signUp, password] = await Promise.all([
    getTranslations('resetPassword'),
    getTranslations('signIn'),
    getTranslations('signUp'),
    passwordCopy(),
  ]);
  const copy: ResetCopy = {
    intro: t('intro'),
    emailLabel: signIn('emailLabel'),
    send: signIn('sendCode'),
    sending: signIn('sending'),
    newPasswordLabel: t('newPasswordLabel'),
    passwordHint: signUp('passwordHint'),
    password,
    invalidEmail: signIn('invalidEmail'),
    sendFailed: signIn('sendFailed'),
    missingCode: signIn('missingCode'),
    wrongCode: signIn('wrongCode'),
    shortPassword: signUp('shortPassword'),
    longPassword: signUp('longPassword'),
    failed: t('failed'),
    code: {
      codeSent: around((email) => t('codeSent', { email })),
      codeLabel: signIn('codeLabel'),
      submit: t('submit'),
      submitting: t('saving'),
      resend: signIn('resend'),
      resendIn: around((seconds) => signIn('resendIn', { seconds })),
      changeEmail: signIn('changeEmail'),
    },
    doneTitle: t('doneTitle'),
    doneBody: t('doneBody'),
    continue: t('continue'),
    backToSignIn: t('backToSignIn'),
  };
  return (
    <AuthFrame
      eyebrow={t('eyebrow')}
      title={t('title')}
      titleEnd={t('titleEnd')}
    >
      <ResetForm copy={copy} />
    </AuthFrame>
  );
}
