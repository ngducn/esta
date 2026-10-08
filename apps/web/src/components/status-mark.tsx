import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export const markStatuses = ['paid', 'due', 'overdue', 'vacant', 'draft', 'ended'] as const;
export type MarkStatus = (typeof markStatuses)[number];

type Shape = { d: string; fill: boolean; dashed: boolean; stroke: number };

/**
 * Status reads as shape, then word, then color, so each status owns a distinct shape and
 * the word is set in the `-ink` token that reaches 4.5:1 (DESIGN.md Colors).
 */
export const statusMarks = {
  paid: { shape: { d: 'M4 12.5l5 5L20 6.5', fill: false, dashed: false, stroke: 2.25 }, shapeClass: 'text-paid', wordClass: 'text-paid-ink' },
  due: {
    shape: { d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3.5 2', fill: false, dashed: false, stroke: 2.25 },
    shapeClass: 'text-due',
    wordClass: 'text-due-ink',
  },
  overdue: {
    shape: { d: 'M12 2.5L21.5 12L12 21.5L2.5 12z', fill: true, dashed: false, stroke: 2.25 },
    shapeClass: 'text-overdue',
    wordClass: 'text-overdue-ink',
  },
  vacant: { shape: { d: 'M4.5 4.5h15v15h-15z', fill: false, dashed: false, stroke: 2.25 }, shapeClass: 'text-vacant', wordClass: 'text-vacant-ink' },
  draft: {
    shape: { d: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17z', fill: false, dashed: true, stroke: 2.25 },
    shapeClass: 'text-ink-muted',
    wordClass: 'text-ink-muted',
  },
  ended: { shape: { d: 'M4 12h16', fill: false, dashed: false, stroke: 4 }, shapeClass: 'text-ink-muted', wordClass: 'text-ink-muted' },
} as const satisfies Record<MarkStatus, { shape: Shape; shapeClass: string; wordClass: string }>;

export function StatusShape({ status, className }: { status: MarkStatus; className?: string }) {
  const { shape, shapeClass } = statusMarks[status];
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('size-5 shrink-0', shapeClass, className)}
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

export type StatusMarkProps = { status: 'overdue'; days: number } | { status: Exclude<MarkStatus, 'overdue'> };

export function StatusMark(props: StatusMarkProps) {
  const t = useTranslations('components.status');
  const word = props.status === 'overdue' ? t('overdue', { days: props.days }) : t(props.status);
  return (
    <span data-status={props.status} className="inline-flex items-center gap-2 align-top">
      <StatusShape status={props.status} />
      <span className={cn('font-semibold', statusMarks[props.status].wordClass)}>{word}</span>
    </span>
  );
}
