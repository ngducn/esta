'use client';

import { Check, type LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { FieldMessage } from '@/components/field-message';
import { cn } from '@/lib/utils';

export type SelectionOption = {
  value: string;
  title: string;
  description?: string;
  icon: LucideIcon;
};

/** One chosen card among a few that each need a sentence; only the filled mark shows which, so hover and focus never read as chosen. */
export function SelectionCards({
  legend,
  options,
  value,
  onChange,
  testId,
  error = null,
  narrow = false,
  children,
}: {
  legend: string;
  options: readonly SelectionOption[];
  value: string;
  onChange: (value: string) => void;
  testId?: string;
  error?: string | null;
  /** Cards with a title only: two to a row on a phone. */
  narrow?: boolean;
  children?: ReactNode;
}) {
  const name = useId();
  return (
    <fieldset data-testid={testId} className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-body font-medium text-text">{legend}</legend>
      <div className={cn('grid gap-3', narrow ? 'grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))]' : 'grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]')}>
        {options.map(({ value: optionValue, title, description, icon: Icon }) => (
          <label
            key={optionValue}
            className="relative flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-4 text-text transition-colors duration-(--duration-fast) ease-standard hover:border-border-strong active:bg-fill-hover has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring"
          >
            <input
              type="radio"
              name={name}
              value={optionValue}
              checked={value === optionValue}
              onChange={() => onChange(optionValue)}
              data-testid={testId === undefined ? undefined : `${testId}-${optionValue}`}
              className="peer sr-only"
            />
            <span className="flex min-w-0 flex-1 items-start gap-3">
              <Icon className="mt-0.5 size-icon-md shrink-0 text-text-secondary" strokeWidth={1.8} aria-hidden="true" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-body font-medium wrap-break-word">{title}</span>
                {description === undefined ? null : <span className="text-body-sm text-text-secondary">{description}</span>}
              </span>
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex size-icon-md shrink-0 items-center justify-center rounded-full border-[1.5px] bg-surface text-on-accent transition-colors duration-(--duration-fast) ease-standard',
                error === null ? 'border-border-field' : 'border-danger-text',
                'peer-checked:border-accent peer-checked:bg-accent [&>svg]:scale-60 [&>svg]:opacity-0 peer-checked:[&>svg]:scale-100 peer-checked:[&>svg]:opacity-100',
              )}
            >
              <Check className="size-icon-xs transition-[opacity,transform] duration-(--duration-base) ease-standard" strokeWidth={3} />
            </span>
          </label>
        ))}
      </div>
      {children}
      {error === null ? null : <FieldMessage id={`${name}-message`} error={error} />}
    </fieldset>
  );
}
