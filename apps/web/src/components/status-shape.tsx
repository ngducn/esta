import { Archive, Calendar, CircleCheck, CircleDashed, Clock, PencilLine, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export const markStatuses = ['paid', 'due', 'upcoming', 'overdue', 'vacant', 'draft', 'ended'] as const;
export type MarkStatus = (typeof markStatuses)[number];

/**
 * Status reads as icon, then word, then color, and each status owns a distinct silhouette so it reads in grayscale.
 * `pill` is the badge's tone; in dark a hairline in the tone's border keeps the pill's edge on a tinted ground.
 */
export const statusMarks = {
  paid: { icon: CircleCheck, color: 'text-success-text', pill: 'bg-success-bg text-success-text dark:border-success-border' },
  due: { icon: Clock, color: 'text-warning-text', pill: 'bg-warning-bg text-warning-text dark:border-warning-border' },
  upcoming: { icon: Calendar, color: 'text-text-secondary', pill: 'border-border-strong text-text-secondary' },
  overdue: { icon: TriangleAlert, color: 'text-danger-text', pill: 'bg-danger-bg text-danger-text dark:border-danger-border' },
  vacant: { icon: CircleDashed, color: 'text-neutral-text', pill: 'bg-neutral-bg text-neutral-text' },
  draft: { icon: PencilLine, color: 'text-info-text', pill: 'bg-info-bg text-info-text dark:border-info-border' },
  ended: { icon: Archive, color: 'text-text-secondary', pill: 'border-border-strong text-text-secondary' },
} as const satisfies Record<MarkStatus, { icon: LucideIcon; color: string; pill: string }>;

/** The badge around a status icon and its word; a 14px icon keeps a 2px stroke so it holds its weight. */
export const statusBadge =
  'inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-lg border border-transparent py-0.5 pr-2 pl-1.5 align-middle text-caption font-medium text-balance [&_svg]:size-icon-xs [&_svg]:stroke-2';

export function StatusShape({ status, className }: { status: MarkStatus; className?: string }) {
  const { icon: Icon, color } = statusMarks[status];
  return <Icon className={cn('size-5 shrink-0', color, className)} strokeWidth={1.75} aria-hidden="true" data-shape={status} />;
}
