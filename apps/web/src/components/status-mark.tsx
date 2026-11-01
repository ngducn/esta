import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { StatusShape, statusBadge, statusMarks, type MarkStatus } from './status-shape';

export type StatusMarkProps = { status: 'overdue'; days: number } | { status: Exclude<MarkStatus, 'overdue'> };

export function StatusMark(props: StatusMarkProps) {
  const t = useTranslations('components.status');
  const word = props.status === 'overdue' ? t('overdue', { days: props.days }) : t(props.status);
  return (
    <span
      data-status={props.status}
      className={cn(statusBadge, statusMarks[props.status].pill)}
    >
      <StatusShape status={props.status} />
      <span>{word}</span>
    </span>
  );
}
