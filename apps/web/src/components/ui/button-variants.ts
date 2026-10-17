import { cva } from 'class-variance-authority';

/** Kept apart from the base-ui Button so a link or a client island can take the classes without the primitive's runtime. */
export const buttonVariants = cva(
  'inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center gap-2 rounded-sm px-4 text-body font-semibold transition-colors duration-(--duration-fast) ease-standard select-none disabled:cursor-not-allowed data-disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-on-accent hover:bg-accent/90 active:bg-accent-pressed disabled:bg-rule disabled:text-ink-muted data-disabled:bg-rule data-disabled:text-ink-muted',
        secondary:
          'bg-ink text-surface hover:bg-ink/88 active:bg-ink/80 disabled:bg-rule disabled:text-ink-muted data-disabled:bg-rule data-disabled:text-ink-muted',
        outline:
          'border border-rule-strong bg-surface text-ink hover:border-field hover:bg-surface-2 active:bg-rule disabled:text-ink-muted data-disabled:text-ink-muted',
        quiet:
          'px-2 text-ink underline decoration-ink-muted underline-offset-4 hover:decoration-ink disabled:text-ink-muted data-disabled:text-ink-muted',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
);
