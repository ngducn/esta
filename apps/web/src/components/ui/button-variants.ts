import { cva } from 'class-variance-authority';

/** Kept apart from the base-ui Button so a link or a client island can take the classes without the primitive's runtime. */
export const buttonVariants = cva(
  'inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center gap-2 rounded-md px-4 text-body font-medium transition-colors duration-(--duration-fast) ease-standard select-none disabled:cursor-not-allowed data-disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-on-accent hover:bg-accent/90 active:bg-accent-pressed disabled:bg-border disabled:text-text-muted data-disabled:bg-border data-disabled:text-text-muted',
        secondary:
          'bg-surface-inverse text-text-inverse hover:bg-surface-inverse/88 active:bg-surface-inverse/80 disabled:bg-border disabled:text-text-muted data-disabled:bg-border data-disabled:text-text-muted',
        outline:
          'border border-border-strong bg-surface text-text hover:border-border-field hover:bg-fill-hover active:bg-border disabled:text-text-muted data-disabled:text-text-muted',
        quiet:
          'px-2 text-text underline decoration-text-muted underline-offset-4 hover:decoration-text disabled:text-text-muted data-disabled:text-text-muted',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
);
