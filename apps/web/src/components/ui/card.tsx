import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A white surface on the gray ground. Structure inside it comes from rules and spacing, never another card. */
function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section data-slot="card" className={cn('rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6', className)} {...props} />;
}

export { Card };
