'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';
import { signInWithPassword, type PasswordSignInState } from './actions';
import { fieldClass, linkClass, PasswordField, primaryClass, type PasswordCopy } from './auth-fields';

export type PasswordSignInCopy = {
  emailLabel: string;
  passwordLabel: string;
  password: PasswordCopy;
  forgotPassword: string;
  submit: string;
  submitting: string;
  invalidEmail: string;
  missingPassword: string;
  wrongPassword: string;
  rateLimited: string;
  failed: string;
};

type PasswordSignInError = NonNullable<PasswordSignInState['error']>;

const ERRORS = {
  'invalid-email': { copy: 'invalidEmail', field: 'email' },
  'missing-password': { copy: 'missingPassword', field: 'password' },
  'wrong-password': { copy: 'wrongPassword', field: 'password' },
  'rate-limited': { copy: 'rateLimited', field: null },
  failed: { copy: 'failed', field: null },
} as const satisfies Record<PasswordSignInError, { copy: keyof PasswordSignInCopy; field: 'email' | 'password' | null }>;

const initialState: PasswordSignInState = { email: '', error: null };

export function PasswordSignInForm({ copy }: { copy: PasswordSignInCopy }) {
  const [state, action, pending] = useActionState(signInWithPassword, initialState);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const error = state.error === null ? null : ERRORS[state.error];

  useEffect(() => {
    if (error?.field === 'email') emailInput.current?.focus();
    if (error?.field === 'password') passwordInput.current?.focus();
  }, [state, error]);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="font-medium">
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
          aria-describedby={error?.field === 'email' ? 'sign-in-error' : undefined}
          className={fieldClass}
        />
      </div>
      <PasswordField
        id="password"
        label={copy.passwordLabel}
        copy={copy.password}
        autoComplete="current-password"
        inputRef={passwordInput}
        invalid={error?.field === 'password'}
        describedBy={error?.field === 'password' ? ['sign-in-error'] : []}
      />
      <div className="-mt-2 flex justify-end">
        <Link href="/forgot-password" className={linkClass}>
          {copy.forgotPassword}
        </Link>
      </div>
      <p id="sign-in-error" role="alert" className="-mt-2 min-h-6 font-medium text-overdue">
        {error === null ? null : copy[error.copy]}
      </p>
      <button type="submit" name="intent" value="sign-in" disabled={pending} className={primaryClass}>
        {pending ? copy.submitting : copy.submit}
      </button>
    </form>
  );
}
