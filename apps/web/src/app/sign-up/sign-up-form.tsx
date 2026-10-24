'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { CodeStep, fieldClass, PasswordField, primaryClass, type CodeStepCopy, type PasswordCopy } from '../sign-in/auth-fields';
import { signUp, type SignUpError, type SignUpState } from './actions';

export type SignUpCopy = {
  intro: string;
  emailLabel: string;
  passwordLabel: string;
  passwordHint: string;
  password: PasswordCopy;
  submit: string;
  sending: string;
  invalidEmail: string;
  shortPassword: string;
  longPassword: string;
  sendFailed: string;
  failed: string;
  missingCode: string;
  wrongCode: string;
  code: CodeStepCopy;
};

const ERRORS = {
  'invalid-email': { copy: 'invalidEmail', field: 'email' },
  'short-password': { copy: 'shortPassword', field: 'password' },
  'long-password': { copy: 'longPassword', field: 'password' },
  'send-failed': { copy: 'sendFailed', field: null },
  failed: { copy: 'failed', field: null },
  'missing-code': { copy: 'missingCode', field: 'code' },
  'wrong-code': { copy: 'wrongCode', field: 'code' },
} as const satisfies Record<SignUpError, { copy: keyof SignUpCopy; field: 'email' | 'password' | 'code' | null }>;

const initialState: SignUpState = { step: 'details', email: '', error: null };

export function SignUpForm({ copy }: { copy: SignUpCopy }) {
  const [state, action, pending] = useActionState(signUp, initialState);
  const [password, setPassword] = useState('');
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const error = state.error === null ? null : ERRORS[state.error];
  const message = error === null ? null : copy[error.copy];

  useEffect(() => {
    if (error?.field === 'email') emailInput.current?.focus();
    if (error?.field === 'password') passwordInput.current?.focus();
    if (error?.field === 'code') codeInput.current?.select();
  }, [state, error]);

  if (state.step === 'code') {
    return (
      <CodeStep
        action={action}
        email={state.email}
        code={state.code}
        sentCount={state.sentCount}
        intent="verify"
        error={message}
        codeInvalid={error?.field === 'code'}
        pending={pending}
        copy={copy.code}
        codeInput={codeInput}
      >
        <input type="hidden" name="password" value={password} />
      </CodeStep>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <p className="text-ink-2">{copy.intro}</p>
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
          aria-describedby={error?.field === 'email' ? 'sign-up-error' : undefined}
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <PasswordField
          id="password"
          label={copy.passwordLabel}
          copy={copy.password}
          autoComplete="new-password"
          inputRef={passwordInput}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          invalid={error?.field === 'password'}
          describedBy={error?.field === 'password' ? ['password-hint', 'sign-up-error'] : ['password-hint']}
        />
        <p id="password-hint" className="text-small text-ink-muted">
          {copy.passwordHint}
        </p>
      </div>
      <p id="sign-up-error" role="alert" className="min-h-6 font-medium text-overdue">
        {message}
      </p>
      <button type="submit" name="intent" value="send" disabled={pending} className={primaryClass}>
        {pending ? copy.sending : copy.submit}
      </button>
    </form>
  );
}
