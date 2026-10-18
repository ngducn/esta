'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState, type ChangeEvent, type ReactNode, type Ref } from 'react';

const RESEND_WAIT_SECONDS = 60;

/** A message split around its one argument by the server, so these routes ship no ICU runtime. */
export type Around = readonly [before: string, after: string];

export const fieldClass =
  'min-h-touch w-full rounded-md border border-field bg-surface px-3.5 text-body text-ink transition-colors duration-(--duration-fast) ease-standard hover:border-ink-muted aria-invalid:border-overdue';
export const primaryClass =
  'inline-flex min-h-touch w-full items-center justify-center gap-2 rounded-sm bg-accent px-4 font-semibold text-on-accent transition-colors duration-(--duration-fast) ease-standard hover:bg-accent/90 disabled:opacity-60';
export const secondaryClass =
  'min-h-touch px-2 font-semibold text-ink underline decoration-ink-muted underline-offset-4 disabled:no-underline disabled:opacity-60';
export const outlineClass =
  'inline-flex min-h-touch w-full items-center justify-center rounded-sm border border-rule-strong bg-surface px-4 text-center font-semibold text-ink transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-2';
export const linkClass = 'inline-flex min-h-touch items-center font-semibold text-ink underline decoration-ink-muted underline-offset-4';

export function ResendButton({ copy, pending }: { copy: { resend: string; resendIn: Around }; pending: boolean }) {
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

export type PasswordCopy = { show: string; hide: string; showLabel: string; hideLabel: string };

type PasswordFieldProps = {
  id: string;
  label: string;
  copy: PasswordCopy;
  autoComplete: 'current-password' | 'new-password';
  invalid: boolean;
  /** Ids of the hint and error lines that describe the field. */
  describedBy: readonly string[];
  inputRef?: Ref<HTMLInputElement>;
  /** Controlled when the form must keep the password across steps; otherwise the browser owns it. */
  value?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function PasswordField({ id, label, copy, autoComplete, invalid, describedBy, inputRef, value, onChange }: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          name="password"
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={value}
          onChange={onChange}
          aria-invalid={invalid}
          aria-describedby={describedBy.length === 0 ? undefined : describedBy.join(' ')}
          className={`${fieldClass} pr-24`}
        />
        <button
          type="button"
          onClick={() => setShown((was) => !was)}
          aria-controls={id}
          aria-label={shown ? copy.hideLabel : copy.showLabel}
          className="absolute inset-y-0 right-0 inline-flex min-h-touch min-w-touch items-center justify-center gap-1.5 rounded-r-md px-3 font-semibold text-ink-muted transition-colors duration-(--duration-fast) ease-standard hover:text-ink"
        >
          {shown ? (
            <EyeOff className="size-5" strokeWidth={1.8} aria-hidden="true" />
          ) : (
            <Eye className="size-5" strokeWidth={1.8} aria-hidden="true" />
          )}
          {shown ? copy.hide : copy.show}
        </button>
      </div>
    </div>
  );
}

export type CodeStepCopy = {
  codeSent: Around;
  codeLabel: string;
  submit: string;
  submitting: string;
  resend: string;
  resendIn: Around;
  changeEmail: string;
};

type CodeStepProps = {
  action: (formData: FormData) => void;
  email: string;
  code: string;
  sentCount: number;
  intent: string;
  error: string | null;
  codeInvalid: boolean;
  pending: boolean;
  copy: CodeStepCopy;
  codeInput: Ref<HTMLInputElement>;
  /** Fields the step submits beside the code, such as the password chosen on the step before. */
  children?: ReactNode;
};

export function CodeStep({ action, email, code, sentCount, intent, error, codeInvalid, pending, copy, codeInput, children }: CodeStepProps) {
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="email" value={email} />
      <p id="code-sent" className="text-ink-2">
        {copy.codeSent[0]}
        <strong className="inline-block max-w-full wrap-anywhere">{email}</strong>
        {copy.codeSent[1]}
      </p>
      <div className="flex flex-col gap-2">
        <label htmlFor="code" className="font-semibold">
          {copy.codeLabel}
        </label>
        <input
          key={sentCount}
          ref={codeInput}
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          maxLength={12}
          defaultValue={code}
          aria-invalid={codeInvalid}
          aria-describedby={error === null ? 'code-sent' : 'code-sent code-error'}
          className={`${fieldClass} text-h2 tracking-widest tabular-nums`}
        />
        <p id="code-error" role="alert" className="min-h-6 font-semibold text-overdue">
          {error}
        </p>
      </div>
      {children}
      <button type="submit" name="intent" value={intent} disabled={pending} className={primaryClass}>
        {pending ? copy.submitting : copy.submit}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ResendButton key={sentCount} copy={copy} pending={pending} />
        <button type="submit" name="intent" value="change-email" formNoValidate disabled={pending} className={secondaryClass}>
          {copy.changeEmail}
        </button>
      </div>
    </form>
  );
}
