import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

/** One sentence of what is missing, one of what to do, and the single action that does it. */
export function EmptyState({ title, body, action }: { title: string; body: string; action: { label: string; href: string } }) {
  return (
    <div data-slot="empty-state" className="flex max-w-prose flex-col items-start gap-3 border-t border-rule pt-6">
      <p className="text-h3 font-semibold text-ink">{title}</p>
      <p className="text-body text-pretty text-ink-muted">{body}</p>
      <Link href={action.href} className={buttonVariants({ variant: 'primary', className: 'mt-2' })}>
        {action.label}
      </Link>
    </div>
  );
}
