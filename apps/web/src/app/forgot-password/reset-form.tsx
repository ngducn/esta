'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { CodeStep, fieldClass, linkClass, PasswordField, primaryClass, type CodeStepCopy, type PasswordCopy } from '../sign-in/auth-fields';
import { resetPassword, type ResetError, type ResetState } from './actions';

export type ResetCopy = {
  intro: string;
  emailLabel: string;
  send: string;
  sending: string;
  newPasswordLabel: string;
  passwordHint: string;
  password: PasswordCopy;
  invalidEmail: string;
  sendFailed: string;
  rateLimited: string;
  missingCode: string;
  wrongCode: string;
  shortPassword: string;
  longPassword: string;
  failed: string;
  code: CodeStepCopy;
  doneTitle: string;
  doneBody: string;
  continue: string;
  backToSignIn: string;
};

const ERRORS = {
  'invalid-email': { copy: 'invalidEmail', field: 'email' },
  'send-failed': { copy: 'sendFailed', field: null },
  'rate-limited': { copy: 'rateLimited', field: null },
  'missing-code': { copy: 'missingCode', field: 'code' },
  'wrong-code': { copy: 'wrongCode', field: 'code' },
  'short-password': { copy: 'shortPassword', field: 'password' },
  'long-password': { copy: 'longPassword', field: 'password' },
  failed: { copy: 'failed', field: null },
} as const satisfies Record<ResetError, { copy: keyof ResetCopy; field: 'email' | 'code' | 'password' | null }>;

const initialState: ResetState = { step: 'email', email: '', error: null };

export function ResetForm({ copy }: { copy: ResetCopy }) {
  const [state, action, pending] = useActionState(resetPassword, initialState);
  const [password, setPassword] = useState('');
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const error = state.step === 'done' || state.error === null ? null : ERRORS[state.error];
  const message = error === null ? null : copy[error.copy];

  useEffect(() => {
    if (error?.field === 'email') emailInput.current?.focus();
    if (error?.field === 'password') passwordInput.current?.focus();
    if (error?.field === 'code') codeInput.current?.select();
  }, [state, error]);

  if (state.step === 'done') {
    return (
      <div className="flex flex-col gap-4" role="status">
        <h2 className="text-h3 font-semibold">{copy.doneTitle}</h2>
        <p className="text-ink-2">{copy.doneBody}</p>
        <Link href={state.next} className={primaryClass}>
          {copy.continue}
        </Link>
      </div>
    );
  }

  const backToSignIn = (
    <p className="flex justify-center border-t border-rule pt-4">
      <Link href="/sign-in" className={linkClass}>
        {copy.backToSignIn}
      </Link>
    </p>
  );

  if (state.step === 'code') {
    const passwordError = error?.field === 'password' ? message : null;
    return (
      <>
        <CodeStep
          action={action}
          email={state.email}
          code={state.code}
          sentCount={state.sentCount}
          intent="reset"
          error={passwordError === null ? message : null}
          codeInvalid={error?.field === 'code'}
          pending={pending}
          copy={copy.code}
          codeInput={codeInput}
        >
          <input type="email" name="username" autoComplete="username" value={state.email} readOnly hidden />
          <div className="flex flex-col gap-1">
            <PasswordField
              id="password"
              label={copy.newPasswordLabel}
              copy={copy.password}
              autoComplete="new-password"
              inputRef={passwordInput}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              invalid={passwordError !== null}
              describedBy={passwordError === null ? ['password-hint'] : ['password-hint', 'password-error']}
            />
            <p id="password-hint" className="text-small text-ink-muted">
              {copy.passwordHint}
            </p>
            <p id="password-error" role="alert" className="min-h-6 font-semibold text-overdue">
              {passwordError}
            </p>
          </div>
        </CodeStep>
        {backToSignIn}
      </>
    );
  }

  return (
    <>
      <form action={action} className="flex flex-col gap-4" noValidate>
        <p className="text-ink-2">{copy.intro}</p>
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="font-semibold">
            {copy.emailLabel}
          </label>
          <input
            ref={emailInput}
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            defaultValue={state.email}
            aria-invalid={error?.field === 'email'}
            aria-describedby={message === null ? undefined : 'email-error'}
            className={fieldClass}
          />
          <p id="email-error" role="alert" className="min-h-6 font-semibold text-overdue">
            {message}
          </p>
        </div>
        <button type="submit" name="intent" value="send" disabled={pending} className={primaryClass}>
          {pending ? copy.sending : copy.send}
        </button>
      </form>
      {backToSignIn}
    </>
  );
}
