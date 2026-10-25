import type { ComponentProps } from 'react';
import { StatusShape } from '@/components/status-shape';
import { cn } from '@/lib/utils';

/** The one error line beside the control that caused it, with the overdue diamond so it never relies on color. */
export function FormAlert({ message, className, ...rest }: { message: string | null } & Omit<ComponentProps<'p'>, 'children' | 'role'>) {
  if (message === null) return null;
  return (
    <p role="alert" className={cn('flex items-start gap-2 text-body text-overdue', className)} {...rest}>
      <StatusShape status="overdue" className="mt-1 size-4" />
      <span className="min-w-0 wrap-anywhere">{message}</span>
    </p>
  );
}
