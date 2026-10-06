'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useState } from 'react';
import { signIn, type SignInState } from './actions';

const RESEND_WAIT_SECONDS = 60;

const initialState: SignInState = { step: 'email', email: '', error: null };

const fieldClass = 'min-h-11 w-full rounded-md border border-current px-3 text-base';
const primaryClass = 'min-h-11 w-full rounded-md border-2 border-current px-4 font-semibold disabled:opacity-60';
const secondaryClass = 'min-h-11 px-2 underline underline-offset-4 disabled:no-underline disabled:opacity-60';

function ResendButton({ pending }: { pending: boolean }) {
  const t = useTranslations('signIn');
  const [seconds, setSeconds] = useState(RESEND_WAIT_SECONDS);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((left) => Math.max(0, left - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  const waiting = seconds > 0;
  return (
    <button type="submit" name="intent" value="resend" formNoValidate disabled={waiting || pending} className={secondaryClass}>
      {waiting ? t('resendIn', { seconds }) : t('resend')}
    </button>
  );
}

export function SignInForm() {
  const t = useTranslations('signIn');
  const [state, action, pending] = useActionState(signIn, initialState);

  if (state.step === 'email') {
    const error = state.error === 'invalid-email' ? t('invalidEmail') : state.error === 'send-failed' ? t('sendFailed') : null;
    return (
      <form action={action} className="flex flex-col gap-4" noValidate>
        <p>{t('emailIntro')}</p>
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="font-semibold">
            {t('emailLabel')}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            defaultValue={state.email}
            aria-invalid={error !== null}
            aria-describedby={error === null ? undefined : 'email-error'}
            className={fieldClass}
          />
          <p id="email-error" role="alert" className="min-h-6 font-semibold">
            {error}
          </p>
        </div>
        <button type="submit" name="intent" value="send" disabled={pending} className={primaryClass}>
          {pending ? t('sending') : t('sendCode')}
        </button>
      </form>
    );
  }

  const error = state.error === 'wrong-code' ? t('wrongCode') : state.error === 'send-failed' ? t('sendFailed') : null;
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="email" value={state.email} />
      <p aria-live="polite">{t('codeSent', { email: state.email })}</p>
      <div className="flex flex-col gap-2">
        <label htmlFor="code" className="font-semibold">
          {t('codeLabel')}
        </label>
        <input
          key={state.sentCount}
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          maxLength={12}
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : 'code-error'}
          className={`${fieldClass} text-2xl tracking-widest tabular-nums`}
        />
        <p id="code-error" role="alert" className="min-h-6 font-semibold">
          {error}
        </p>
      </div>
      <button type="submit" name="intent" value="verify" disabled={pending} className={primaryClass}>
        {pending ? t('verifying') : t('verify')}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ResendButton key={state.sentCount} pending={pending} />
        <button type="submit" name="intent" value="change-email" formNoValidate disabled={pending} className={secondaryClass}>
          {t('changeEmail')}
        </button>
      </div>
    </form>
  );
}
