'use client';

import type { IsoDate } from '@esta/core/date';
import type { ActivationRefusal } from '@esta/core/lease';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { activateLease } from '@/server/actions/leases';
import { DateInput } from '@/components/date-input';
import { StatusShape } from '@/components/status-mark';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/dialog';
import { useNoticeToast } from '@/components/undo-toast';

type Refusal = ActivationRefusal | 'overlap' | 'failed';

/**
 * LSE-2 and LSE-3: `Đã thu tiền đến hết ngày` sets paid_through_date, so periods already collected before Esta are never
 * invoiced. A refusal stays in the dialog, beside the button that caused it.
 */
export default function ActivateLeaseDialog({
  leaseId,
  blocked,
  onClose,
  onActivated,
}: {
  leaseId: string;
  blocked: readonly ActivationRefusal[];
  onClose: () => void;
  onActivated: () => void;
}) {
  const t = useTranslations('leases');
  const notice = useNoticeToast();
  const [paidThrough, setPaidThrough] = useState<IsoDate | null>(null);
  const [refusals, setRefusals] = useState<readonly Refusal[]>(blocked);
  const [pending, startTransition] = useTransition();

  const activate = () =>
    startTransition(async () => {
      const result = await activateLease(leaseId, paidThrough).catch(() => ({ ok: false, reasons: ['failed'] }) as const);
      if (!result.ok) {
        setRefusals(result.reasons);
        return;
      }
      const month = result.issuedMonth === null ? 'none' : String(Number(result.issuedMonth.slice(5, 7)));
      notice(t('activated', { month }).trim());
      onActivated();
    });

  return (
    <AlertDialog open onOpenChange={(open) => (open ? null : onClose())}>
      <AlertDialogContent data-testid="activate-dialog" className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex flex-col gap-2">
          <AlertDialogTitle>{t('activateTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('activateBody')}</AlertDialogDescription>
        </div>
        <div className="flex flex-col gap-1">
          <DateInput label={t('paidThroughField')} onValueChange={setPaidThrough} />
          <p className="text-small text-ink-muted">{t('paidThroughHint')}</p>
        </div>
        {refusals.length === 0 ? null : (
          <div role="alert" data-testid="activate-refusals">
            <ul className="flex flex-col gap-2">
            {refusals.map((reason) => (
              <li key={reason} className="flex items-start gap-2 text-body text-overdue">
                <StatusShape status="overdue" className="mt-1 size-4" />
                <span>{t('refusal', { reason })}</span>
              </li>
            ))}
            </ul>
          </div>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <AlertDialogClose render={<Button type="button" variant="outline" />}>{t('cancel')}</AlertDialogClose>
          <Button type="button" data-testid="confirm-activate" disabled={pending || blocked.length > 0} onClick={activate}>
            {pending ? t('activating') : t('activate')}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
