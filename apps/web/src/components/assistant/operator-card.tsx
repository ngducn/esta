import { businessDate, type Instant } from '@esta/core';
import { wallTime } from '@esta/core/agent';
import { formatDate } from '@esta/core/format';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { env } from '@/server/env';

/** An operator tool's time stamp, `07/10/2026 09:00` in the business timezone; operators read it in Vietnamese order. */
export const operatorTime = (instant: Instant) => `${formatDate(businessDate(instant, env.ESTA_TIMEZONE), 'vi')} ${wallTime(instant, env.ESTA_TIMEZONE)}`;

export function CardHeading({ id, icon: Icon, children }: { id: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <h2 id={id} className="flex items-center gap-3 text-lead font-semibold text-ink">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-2">
        <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </h2>
  );
}

/** One card of the operator tools: a heading with its icon, then what it shows. */
export function OperatorCard({ id, icon, title, children }: { id: string; icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} data-testid={id} className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <CardHeading id={`${id}-heading`} icon={icon}>
        {title}
      </CardHeading>
      {children}
    </section>
  );
}
