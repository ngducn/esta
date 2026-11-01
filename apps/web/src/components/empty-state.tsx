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
  tone,
  className,
}: {
  title: string;
  body?: string;
  action?: EmptyStateAction;
  icon?: LucideIcon;
  media?: ReactNode;
  /** `good` is for a filter that came back empty because nothing needs doing. */
  tone?: 'good';
  className?: string;
}) {
  const ActionIcon = action?.icon;
  return (
    <section data-slot="empty-state" className={cn('overflow-hidden rounded-lg border border-border bg-surface shadow-xs', className)}>
      {media}
      <div className="flex flex-col items-start gap-2 p-card-pad">
        <h2 className="flex items-start gap-2 text-headline text-text">
          {Icon ? <Icon className={cn('mt-0.5 size-icon-md shrink-0', tone === 'good' ? 'text-success-text' : 'text-text-secondary')} strokeWidth={1.75} aria-hidden="true" /> : null}
          <span className="min-w-0 break-words">{title}</span>
        </h2>
        {body === undefined ? null : <p className="max-w-prose text-body text-pretty text-text-secondary">{body}</p>}
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
