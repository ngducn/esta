'use client';

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { cn } from '@/lib/utils';

/** The control is the full 44 px target; the drawn box inside it stays small enough to sit in a table row. */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'group/checkbox inline-flex size-touch shrink-0 items-center justify-center rounded-md outline-offset-0',
        'data-disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-icon-md items-center justify-center rounded-xs border-(length:--stroke-strong) border-border-field bg-surface transition-colors duration-(--duration-fast) ease-standard',
          'group-hover/checkbox:border-text-muted group-data-checked/checkbox:border-accent group-data-checked/checkbox:bg-accent group-data-checked/checkbox:text-on-accent',
          'group-data-indeterminate/checkbox:border-accent group-data-indeterminate/checkbox:bg-accent group-data-indeterminate/checkbox:text-on-accent',
          'group-data-disabled/checkbox:border-border group-data-disabled/checkbox:bg-fill-disabled',
        )}
      >
        <CheckboxPrimitive.Indicator
          render={(indicatorProps, state) => (
            <svg
              {...indicatorProps}
              viewBox="0 0 24 24"
              className="size-icon-sm"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={state.indeterminate ? 'M6 12h12' : 'M5 12.5l4.5 4.5L19 7.5'} />
            </svg>
          )}
        />
      </span>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
