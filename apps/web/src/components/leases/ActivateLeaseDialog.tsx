'use client';

import type { IsoDate } from '@esta/core/date';
import { formatDate } from '@esta/core/format';
import type { ActivationRefusal } from '@esta/core/lease';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { activateLease, previewActivation, type ActivationRefusalReason, type BillPreview } from '@/server/actions/leases';
import { DateInput } from '@/components/date-input';
import { MoneyDisplay } from '@/components/money/money-display';
import { StatusShape } from '@/components/status-mark';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/dialog';
import { useNoticeToast } from '@/components/undo-toast';

/**
 * LSE-2 and LSE-3: `Đã thu tiền đến hết ngày` sets paid_through_date, so what was collected before Esta is never
 * invoiced. The dialog lists what activation will bill for the date on screen before Mẹ confirms, and a refusal stays
 * beside the button that caused it.
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
  const locale = useLocale();
  const notice = useNoticeToast();
  const [paidThrough, setPaidThrough] = useState<IsoDate | null>(null);
  const [preview, setPreview] = useState<{ readonly paidThrough: IsoDate | null; readonly bills: readonly BillPreview[] | null } | null>(null);
  const [refusals, setRefusals] = useState<readonly ActivationRefusalReason[]>(blocked);
  const [pending, startTransition] = useTransition();
  const bills = preview?.paidThrough === paidThrough ? preview.bills : undefined;

  useEffect(() => {
    if (blocked.length > 0) return;
    let live = true;
    void previewActivation(leaseId, paidThrough)
      .catch(() => null)
      .then((result) => {
        if (live) setPreview({ paidThrough, bills: result });
      });
    return () => {
      live = false;
    };
  }, [blocked.length, leaseId, paidThrough]);

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
        {blocked.length > 0 ? null : (
          <section aria-live="polite" data-testid="activation-preview" className="flex flex-col gap-2">
            <h3 className="text-body font-semibold text-ink">{t('previewTitle')}</h3>
            {bills === undefined ? (
              <p className="text-small text-ink-muted">{t('previewLoading')}</p>
            ) : bills === null ? (
              <p className="text-small text-overdue">{t('previewFailed')}</p>
            ) : bills.length === 0 ? (
              <p className="text-small text-ink-2">{t('previewNone')}</p>
            ) : (
              <ul className="flex flex-col rounded-md border border-rule">
                {bills.map((bill) => (
                  <li key={bill.periodStart} data-testid="preview-bill" className="flex items-start justify-between gap-3 border-b border-rule p-3 last:border-b-0">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-body font-semibold text-ink">
                        {t('invoicePeriod', { start: formatDate(bill.periodStart, locale), end: formatDate(bill.periodEnd, locale) })}
                      </span>
                      <span className="text-small text-ink-muted">{t(bill.issuesNow ? 'previewIssuesNow' : 'previewLater', { date: formatDate(bill.dueDate, locale) })}</span>
                    </span>
                    <MoneyDisplay amount={bill.rentVnd} className="text-body font-bold text-ink" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
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
          <Button type="button" data-testid="confirm-activate" disabled={pending || blocked.length > 0 || bills === undefined} onClick={activate}>
            {pending ? t('activating') : t('activate')}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
