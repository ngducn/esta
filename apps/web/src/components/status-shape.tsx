import { Archive, Calendar, CircleCheck, CircleDashed, Clock, PencilLine, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export const markStatuses = ['paid', 'due', 'upcoming', 'overdue', 'vacant', 'draft', 'ended'] as const;
export type MarkStatus = (typeof markStatuses)[number];

const outlinePill = 'border-border-strong';

const mark = (icon: LucideIcon, color: string, pill: string) => ({ icon, color, pill: `${pill} ${color}` });

/**
 * Status reads as icon, then word, then color, and each status owns a distinct silhouette so it reads in grayscale.
 * `pill` is the badge's tone; in dark a hairline in the tone's border keeps the pill's edge on a tinted ground.
 */
export const statusMarks = {
  paid: mark(CircleCheck, 'text-success-text', 'bg-success-bg dark:border-success-border'),
  due: mark(Clock, 'text-warning-text', 'bg-warning-bg dark:border-warning-border'),
  upcoming: mark(Calendar, 'text-text-secondary', outlinePill),
  overdue: mark(TriangleAlert, 'text-danger-text', 'bg-danger-bg dark:border-danger-border'),
  vacant: mark(CircleDashed, 'text-neutral-text', 'bg-neutral-bg'),
  draft: mark(PencilLine, 'text-info-text', 'bg-info-bg dark:border-info-border'),
  ended: mark(Archive, 'text-text-secondary', outlinePill),
} as const satisfies Record<MarkStatus, { icon: LucideIcon; color: string; pill: string }>;

/** The outline badge for a fact that is not a status, such as how a property is used. */
export const neutralPill = `${outlinePill} text-text-secondary`;

/** The badge around a status icon and its word; a 14px icon keeps a 2px stroke so it holds its weight. */
export const statusBadge =
  'inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-lg border border-transparent py-0.5 pr-2 pl-1.5 align-middle text-caption font-medium text-balance [&_svg]:size-icon-xs [&_svg]:stroke-2';

export function StatusShape({ status, className }: { status: MarkStatus; className?: string }) {
  const { icon: Icon, color } = statusMarks[status];
  return <Icon className={cn('size-5 shrink-0', color, className)} strokeWidth={1.75} aria-hidden="true" data-shape={status} />;
}
