'use client';

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { cn } from '@/lib/utils';

/** The control is the full 44 px target; the drawn box inside it stays small enough to sit in a table row. */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'group/checkbox inline-flex size-touch shrink-0 items-center justify-center rounded-sm outline-offset-0',
        'data-disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-6 items-center justify-center rounded-sm border-2 border-ink-muted bg-surface transition-colors duration-(--duration-fast) ease-standard',
          'group-hover/checkbox:border-ink group-data-checked/checkbox:border-ink group-data-checked/checkbox:bg-ink group-data-checked/checkbox:text-surface',
          'group-data-indeterminate/checkbox:border-ink group-data-indeterminate/checkbox:bg-ink group-data-indeterminate/checkbox:text-surface',
          'group-data-disabled/checkbox:border-rule group-data-disabled/checkbox:bg-ground',
        )}
      >
        <CheckboxPrimitive.Indicator
          render={(indicatorProps, state) => (
            <svg
              {...indicatorProps}
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
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
