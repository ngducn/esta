import { Input as InputPrimitive } from '@base-ui/react/input';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(
        'min-h-control-h w-full min-w-0 rounded-md border border-border-field bg-surface px-3.5 text-body text-text transition-colors duration-(--duration-fast) ease-standard',
        'placeholder:text-text-muted hover:border-text-muted',
        'disabled:cursor-not-allowed disabled:border-border disabled:bg-fill-disabled disabled:text-text-disabled',
        'aria-invalid:border-danger-text',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
