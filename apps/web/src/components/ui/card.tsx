import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section data-slot="card" className={cn('rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6', className)} {...props} />;
}

export { Card };
