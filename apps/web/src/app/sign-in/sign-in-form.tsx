'use client';

import { useActionState, useEffect, useRef } from 'react';
import { signIn, type SignInError, type SignInState } from './actions';
import { CodeStep, fieldClass, primaryClass, type Around } from './auth-fields';

export type SignInCopy = {
  emailIntro: string;
  emailLabel: string;
  sendCode: string;
  sending: string;
  invalidEmail: string;
  sendFailed: string;
  rateLimited: string;
  codeSent: Around;
  codeLabel: string;
  verify: string;
  verifying: string;
  wrongCode: string;
  missingCode: string;
  resend: string;
  resendIn: Around;
  changeEmail: string;
};

const initialState: SignInState = { step: 'email', email: '', error: null };

const ERRORS = {
  'invalid-email': { copy: 'invalidEmail', aboutValue: true },
  'missing-code': { copy: 'missingCode', aboutValue: true },
  'wrong-code': { copy: 'wrongCode', aboutValue: true },
  'send-failed': { copy: 'sendFailed', aboutValue: false },
  'rate-limited': { copy: 'rateLimited', aboutValue: false },
} as const satisfies Record<SignInError, { copy: keyof SignInCopy; aboutValue: boolean }>;

export function SignInForm({ copy }: { copy: SignInCopy }) {
  const [state, action, pending] = useActionState(signIn, initialState);
  const codeInput = useRef<HTMLInputElement>(null);
  const error = state.error === null ? null : copy[ERRORS[state.error].copy];
  const invalid = state.error !== null && ERRORS[state.error].aboutValue;

  useEffect(() => {
    if (state.step === 'code' && invalid) codeInput.current?.select();
  }, [state, invalid]);

  if (state.step === 'email') {
    return (
      <form action={action} className="flex flex-col gap-4" noValidate>
        <p className="text-ink-2">{copy.emailIntro}</p>
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="font-medium">
            {copy.emailLabel}
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
            aria-invalid={invalid}
            aria-describedby={error === null ? undefined : 'email-error'}
            className={fieldClass}
          />
          <p id="email-error" role="alert" className="min-h-6 font-medium text-overdue">
            {error}
          </p>
        </div>
        <button type="submit" name="intent" value="send" disabled={pending} className={primaryClass}>
          {pending ? copy.sending : copy.sendCode}
        </button>
      </form>
    );
  }

  return (
    <CodeStep
      action={action}
      email={state.email}
      code={state.code}
      sentCount={state.sentCount}
      intent="verify"
      error={error}
      codeInvalid={invalid}
      pending={pending}
      copy={{ ...copy, submit: copy.verify, submitting: copy.verifying }}
      codeInput={codeInput}
    />
  );
}
