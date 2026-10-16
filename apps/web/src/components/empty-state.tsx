import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type EmptyStateAction = { label: string; href: string; icon?: LucideIcon };

/** One sentence of what is missing or coming, and the single action that works now. With no such action, no button. */
export function EmptyState({
  title,
  body,
  action,
  icon: Icon,
  media,
  className,
}: {
  title: string;
  body: string;
  action?: EmptyStateAction;
  icon?: LucideIcon;
  media?: ReactNode;
  className?: string;
}) {
  const ActionIcon = action?.icon;
  return (
    <section data-slot="empty-state" className={cn('overflow-hidden rounded-lg border border-rule bg-surface shadow-card', className)}>
      {media}
      <div className="flex flex-col items-start gap-3 p-5 sm:p-6">
        <h2 className="flex items-center gap-3 text-lead font-bold text-ink">
          {Icon ? (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-tint text-accent">
              <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
            </span>
          ) : null}
          <span className="min-w-0 break-words">{title}</span>
        </h2>
        <p className="max-w-prose text-body text-pretty text-ink-2">{body}</p>
        {action ? (
          <Link href={action.href} className={buttonVariants({ variant: 'primary', className: 'mt-2' })}>
            {ActionIcon ? <ActionIcon aria-hidden="true" /> : null}
            {action.label}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
