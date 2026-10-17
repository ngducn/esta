'use client';

import { useId, type ReactNode } from 'react';
import { FieldMessage } from '@/components/field-message';
import { Input } from '@/components/ui/input';

export function Group({ id, title, aside, children }: { id?: string; title: string; aside?: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return (
    <section id={id} aria-labelledby={headingId} className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="text-lead font-bold text-ink">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function TextField({
  label,
  hint,
  value,
  onChange,
  error,
  testId,
  inputId,
  className,
  maxLength,
  inputMode,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (text: string) => void;
  error: string | null;
  testId?: string;
  inputId?: string;
  className?: string;
  maxLength: number;
  inputMode?: 'text' | 'decimal' | 'numeric';
}) {
  const generated = useId();
  const id = inputId ?? generated;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body font-semibold text-ink">
        {label}
      </label>
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-small text-ink-muted">
          {hint}
        </p>
      )}
      <Input
        id={id}
        data-testid={testId}
        value={value}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete="off"
        aria-invalid={error !== null}
        aria-describedby={hint === undefined ? `${id}-message` : `${id}-hint ${id}-message`}
        onChange={(event) => onChange(event.target.value)}
        className={className === undefined ? 'mt-1' : `mt-1 ${className}`}
      />
      <FieldMessage id={`${id}-message`} error={error} />
    </div>
  );
}
