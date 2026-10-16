import type { WorkerStatus } from '@esta/core/agent';
import { formatDate } from '@esta/core/format';
import { CircleCheck, CloudOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

function heartbeatTime(status: Extract<WorkerStatus, { time: string }>): string {
  return status.earlierDate === null ? status.time : `${status.time} ${formatDate(status.earlierDate, 'vi')}`;
}

/** Every member sees whether the worker is up; stale reads as a notice, never as a quiet gray line (DESIGN-BRIEF §5.5). */
export function WorkerStatusLine({ status }: { status: WorkerStatus }) {
  const t = useTranslations('assistant');
  if (status.kind === 'online') {
    return (
      <p data-testid="worker-status" data-status="online" className="flex items-start gap-2 text-body text-ink-2">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-paid" strokeWidth={2} aria-hidden="true" />
        <span className="min-w-0 break-words">{t('statusOnline', { time: heartbeatTime(status) })}</span>
      </p>
    );
  }
  return (
    <p
      data-testid="worker-status"
      data-status={status.kind}
      className="flex items-start gap-3 rounded-md bg-due-fill px-4 py-3 text-body font-medium text-due"
    >
      <CloudOff className="mt-0.5 size-5 shrink-0" strokeWidth={2} aria-hidden="true" />
      <span className="min-w-0 break-words">
        {status.kind === 'never' ? t('statusNever') : t('statusOffline', { time: heartbeatTime(status) })}
      </span>
    </p>
  );
}
