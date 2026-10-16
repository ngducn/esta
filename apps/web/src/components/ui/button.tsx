import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center gap-2 rounded-sm px-4 text-body font-semibold transition-colors duration-(--duration-fast) ease-standard select-none disabled:cursor-not-allowed data-disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-ink text-surface hover:bg-ink/88 active:bg-ink/80 disabled:bg-rule disabled:text-ink-muted data-disabled:bg-rule data-disabled:text-ink-muted',
        secondary:
          'border border-ink-muted bg-surface text-ink hover:border-ink active:bg-rule/40 disabled:border-rule disabled:text-ink-muted data-disabled:border-rule data-disabled:text-ink-muted',
        quiet:
          'px-2 text-ink underline decoration-ink-muted underline-offset-4 hover:decoration-ink disabled:text-ink-muted data-disabled:text-ink-muted',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
);

function Button({ className, variant, ...props }: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant }), className)} {...props} />;
}

export { Button, buttonVariants };
