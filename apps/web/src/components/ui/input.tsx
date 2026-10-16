import { Input as InputPrimitive } from '@base-ui/react/input';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(
        'min-h-touch w-full min-w-0 rounded-md border border-field bg-surface px-3.5 text-body text-ink transition-colors duration-(--duration-fast) ease-standard',
        'placeholder:text-ink-muted hover:border-ink-muted',
        'disabled:cursor-not-allowed disabled:border-rule disabled:bg-surface-2 disabled:text-ink-muted',
        'aria-invalid:border-overdue',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
