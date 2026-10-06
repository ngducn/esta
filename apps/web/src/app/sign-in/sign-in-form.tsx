'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { signIn, type SignInState } from './actions';

const RESEND_WAIT_SECONDS = 60;

/** A message split around its one argument by the server, so this route ships no ICU runtime. */
export type Around = readonly [before: string, after: string];

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
  resend: string;
  resendIn: Around;
  changeEmail: string;
};

const initialState: SignInState = { step: 'email', email: '', error: null };

const fieldClass = 'min-h-11 w-full rounded-md border border-current px-3 text-base';
const primaryClass = 'min-h-11 w-full rounded-md border-2 border-current px-4 font-semibold disabled:opacity-60';
const secondaryClass = 'min-h-11 px-2 underline underline-offset-4 disabled:no-underline disabled:opacity-60';

function ResendButton({ copy, pending }: { copy: SignInCopy; pending: boolean }) {
  const [seconds, setSeconds] = useState(RESEND_WAIT_SECONDS);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((left) => Math.max(0, left - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  const waiting = seconds > 0;
  return (
    <button type="submit" name="intent" value="resend" formNoValidate disabled={waiting || pending} className={secondaryClass}>
      {waiting ? `${copy.resendIn[0]}${seconds}${copy.resendIn[1]}` : copy.resend}
    </button>
  );
}

function sendError(copy: SignInCopy, error: 'invalid-email' | 'send-failed' | 'rate-limited' | 'wrong-code' | null) {
  if (error === null) return null;
  return {
    'invalid-email': copy.invalidEmail,
    'send-failed': copy.sendFailed,
    'rate-limited': copy.rateLimited,
    'wrong-code': copy.wrongCode,
  }[error];
}

export function SignInForm({ copy }: { copy: SignInCopy }) {
  const [state, action, pending] = useActionState(signIn, initialState);
  const codeInput = useRef<HTMLInputElement>(null);
  const error = sendError(copy, state.error);

  useEffect(() => {
    if (state.step === 'code' && state.error === 'wrong-code') codeInput.current?.select();
  }, [state]);

  if (state.step === 'email') {
    return (
      <form action={action} className="flex flex-col gap-4" noValidate>
        <p>{copy.emailIntro}</p>
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="font-semibold">
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
            aria-invalid={error !== null}
            aria-describedby={error === null ? undefined : 'email-error'}
            className={fieldClass}
          />
          <p id="email-error" role="alert" className="min-h-6 font-semibold">
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
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="email" value={state.email} />
      <p id="code-sent">
        {copy.codeSent[0]}
        <strong className="break-all">{state.email}</strong>
        {copy.codeSent[1]}
      </p>
      <div className="flex flex-col gap-2">
        <label htmlFor="code" className="font-semibold">
          {copy.codeLabel}
        </label>
        <input
          key={state.sentCount}
          ref={codeInput}
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          maxLength={12}
          defaultValue={state.code}
          aria-invalid={error !== null}
          aria-describedby={error === null ? 'code-sent' : 'code-sent code-error'}
          className={`${fieldClass} text-2xl tracking-widest tabular-nums`}
        />
        <p id="code-error" role="alert" className="min-h-6 font-semibold">
          {error}
        </p>
      </div>
      <button type="submit" name="intent" value="verify" disabled={pending} className={primaryClass}>
        {pending ? copy.verifying : copy.verify}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ResendButton key={state.sentCount} copy={copy} pending={pending} />
        <button type="submit" name="intent" value="change-email" formNoValidate disabled={pending} className={secondaryClass}>
          {copy.changeEmail}
        </button>
      </div>
    </form>
  );
}
