'use client';

import { useTranslations } from 'next-intl';
import type { PaidThroughRefusal } from '@/server/actions/leases';
import { DateInput } from '@/components/date-input';
import { StatusShape } from '@/components/status-mark';

/** `Đã thu tiền đến hết ngày`: the one question activation and a late renewal ask about rent collected outside Esta. */
export function PaidThroughField({ refusal, onTextChange }: { refusal: PaidThroughRefusal | null; onTextChange: (text: string) => void }) {
  const t = useTranslations('leases');
  return (
    <div className="flex flex-col gap-1">
      <DateInput label={t('paidThroughField')} onTextChange={onTextChange} />
      {refusal === null ? (
        <p data-testid="paid-through-hint" className="text-small text-ink-muted">
          {t('paidThroughHint')}
        </p>
      ) : (
        <p role="alert" data-testid="paid-through-refused" className="flex items-start gap-2 text-small text-overdue">
          <StatusShape status="overdue" className="mt-0.5 size-4" />
          <span>{t('refusal', { reason: refusal })}</span>
        </p>
      )}
    </div>
  );
}
