import { cn } from '@/lib/utils';

export const markStatuses = ['paid', 'due', 'upcoming', 'overdue', 'vacant', 'draft', 'ended'] as const;
export type MarkStatus = (typeof markStatuses)[number];

type Shape = { d: string; fill: boolean; dashed: boolean; stroke: number };

/**
 * Status reads as shape, then word, then color, so each status owns a distinct shape. The mark is a pill:
 * the status color draws the shape and the word on its `-fill` token (DESIGN.md Colors).
 */
export const statusMarks = {
  paid: { shape: { d: 'M4 12.5l5 5L20 6.5', fill: false, dashed: false, stroke: 2.25 }, color: 'text-paid', pill: 'bg-paid-fill text-paid' },
  due: {
    shape: { d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3.5 2', fill: false, dashed: false, stroke: 2.25 },
    color: 'text-due',
    pill: 'bg-due-fill text-due',
  },
  upcoming: {
    shape: { d: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z', fill: false, dashed: false, stroke: 2.25 },
    color: 'text-ink-muted',
    pill: 'border border-rule bg-surface-2 text-ink-muted',
  },
  overdue: {
    shape: { d: 'M12 2.5L21.5 12L12 21.5L2.5 12z', fill: true, dashed: false, stroke: 2.25 },
    color: 'text-overdue',
    pill: 'bg-overdue-fill text-overdue',
  },
  vacant: { shape: { d: 'M4.5 4.5h15v15h-15z', fill: false, dashed: false, stroke: 2.25 }, color: 'text-vacant', pill: 'bg-vacant-fill text-vacant' },
  draft: {
    shape: { d: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17z', fill: false, dashed: true, stroke: 2.25 },
    color: 'text-ink-muted',
    pill: 'border border-rule bg-surface-2 text-ink-muted',
  },
  ended: { shape: { d: 'M4 12h16', fill: false, dashed: false, stroke: 4 }, color: 'text-ink-muted', pill: 'border border-rule bg-surface-2 text-ink-muted' },
} as const satisfies Record<MarkStatus, { shape: Shape; color: string; pill: string }>;

export function StatusShape({ status, className }: { status: MarkStatus; className?: string }) {
  const { shape, color } = statusMarks[status];
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('size-5 shrink-0', color, className)}
      fill={shape.fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={shape.stroke}
      strokeDasharray={shape.dashed ? '3.4 3' : undefined}
      strokeLinecap={shape.dashed ? 'butt' : 'round'}
      strokeLinejoin="round"
      aria-hidden="true"
      data-shape={status}
    >
      <path d={shape.d} />
    </svg>
  );
}
