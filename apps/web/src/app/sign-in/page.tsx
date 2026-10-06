import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { env } from '@/server/env';
import { LanguageSwitch } from '../language-switch';
import { signInWithGoogle } from './actions';
import { SignInForm } from './sign-in-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('signIn');
  return { title: t('title') };
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const [t, app, messages, { error }] = await Promise.all([
    getTranslations('signIn'),
    getTranslations('app'),
    getMessages(),
    searchParams,
  ]);
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
      <NextIntlClientProvider messages={{ signIn: messages.signIn }}>
        <SignInForm />
      </NextIntlClientProvider>
      {google && (
        <form action={signInWithGoogle} className="flex flex-col gap-4">
          <p className="text-center">{t('or')}</p>
          {error === 'google' && (
            <p role="alert" className="font-semibold">
              {t('googleFailed')}
            </p>
          )}
          <button type="submit" className="min-h-11 w-full rounded-md border border-current px-4">
            {t('google')}
          </button>
        </form>
      )}
    </main>
  );
}
