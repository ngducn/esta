import { Input as InputPrimitive } from '@base-ui/react/input';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(
        'min-h-touch w-full min-w-0 rounded-sm border border-ink-muted bg-surface px-3 text-body text-ink transition-colors duration-(--duration-fast) ease-standard',
        'placeholder:text-ink-muted hover:border-ink',
        'disabled:cursor-not-allowed disabled:border-rule disabled:bg-ground disabled:text-ink-muted',
        'aria-invalid:border-overdue',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
