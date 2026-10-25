import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { StatusShape, statusMarks, type MarkStatus } from './status-shape';

export type StatusMarkProps = { status: 'overdue'; days: number } | { status: Exclude<MarkStatus, 'overdue'> };

export function StatusMark(props: StatusMarkProps) {
  const t = useTranslations('components.status');
  const word = props.status === 'overdue' ? t('overdue', { days: props.days }) : t(props.status);
  return (
    <span
      data-status={props.status}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 align-top text-small font-medium', statusMarks[props.status].pill)}
    >
      <StatusShape status={props.status} className="size-4" />
      <span>{word}</span>
    </span>
  );
}
