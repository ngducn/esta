import { cva } from 'class-variance-authority';

/**
 * The design system's `es-btn`. Kept apart from the base-ui Button so a link or a client island can take the classes
 * without the primitive's runtime. Disabled is a flat fill with a reason nearby, never lowered opacity.
 */
export const buttonVariants = cva(
  'inline-flex min-h-control-h min-w-touch shrink-0 items-center justify-center gap-2 rounded-md border px-4 py-1 text-center text-label text-balance transition-colors duration-(--duration-fast) ease-standard select-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-fill-disabled disabled:text-text-disabled data-disabled:cursor-not-allowed data-disabled:border-transparent data-disabled:bg-fill-disabled data-disabled:text-text-disabled [&_svg]:pointer-events-none [&_svg]:size-icon-md [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'border-transparent bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed',
        secondary: 'border-border-strong bg-surface text-text hover:border-border-field hover:bg-fill-hover active:bg-fill-pressed',
        ghost: 'border-transparent bg-transparent text-text hover:bg-fill-hover active:bg-fill-pressed disabled:bg-transparent data-disabled:bg-transparent',
        danger: 'border-transparent bg-danger-solid text-on-danger hover:bg-red-700 active:bg-red-800',
        'danger-quiet': 'border-border-strong bg-surface text-danger-text hover:border-danger-border hover:bg-danger-bg',
      },
      size: {
        sm: 'min-h-control-sm gap-1.5 px-3 pointer-coarse:min-h-touch [&_svg]:size-icon-sm',
        md: '',
        lg: 'min-h-control-lg px-6 text-body font-medium',
      },
      block: { true: 'flex w-full' },
      icon: { true: 'w-control-h px-0' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);
