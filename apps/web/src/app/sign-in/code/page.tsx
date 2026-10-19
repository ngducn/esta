import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AuthFrame } from '@/components/auth-frame';
import { LanguageSwitch } from '../../language-switch';
import { linkClass } from '../auth-fields';
import { around } from '../copy';
import { SignInForm, type SignInCopy } from '../sign-in-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('signIn');
  return { title: t('codeTitle') };
}

export default async function CodeSignInPage() {
  const [t, app] = await Promise.all([getTranslations('signIn'), getTranslations('app')]);
  const copy: SignInCopy = {
    emailIntro: t('emailIntro'),
    emailLabel: t('emailLabel'),
    sendCode: t('sendCode'),
    sending: t('sending'),
    invalidEmail: t('invalidEmail'),
    sendFailed: t('sendFailed'),
    rateLimited: t('rateLimited'),
    codeSent: around((email) => t('codeSent', { email })),
    codeLabel: t('codeLabel'),
    verify: t('verify'),
    verifying: t('verifying'),
    wrongCode: t('wrongCode'),
    missingCode: t('missingCode'),
    resend: t('resend'),
    resendIn: around((seconds) => t('resendIn', { seconds })),
    changeEmail: t('changeEmail'),
  };
  return (
    <AuthFrame brand={app('name')} photoAlt={app('heroAlt')} aside={<LanguageSwitch />}>
      <div className="flex flex-col gap-1">
        <h1 className="text-h2 lg:text-h1">{t('codeTitle')}</h1>
        <p className="text-ink-muted">{app('tagline')}</p>
      </div>
      <SignInForm copy={copy} />
      <p className="flex justify-center border-t border-rule pt-4">
        <Link href="/sign-in" className={linkClass}>
          {t('usePassword')}
        </Link>
      </p>
    </AuthFrame>
  );
}
