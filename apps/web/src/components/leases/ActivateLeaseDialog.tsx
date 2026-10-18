'use client';

import { formatDate } from '@esta/core/format';
import type { ActivationRefusal } from '@esta/core/lease';
import { parseOptionalDateInput } from '@esta/core/parse/date-input';
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
  const [paidThrough, setPaidThrough] = useState('');
  const [preview, setPreview] = useState<{ readonly paidThrough: string; readonly bills: readonly BillPreview[] | null } | null>(null);
  const [refusals, setRefusals] = useState<readonly ActivationRefusalReason[]>(blocked);
  const [pending, startTransition] = useTransition();
  const readable = parseOptionalDateInput(paidThrough).ok;
  const bills = readable && preview?.paidThrough === paidThrough ? preview.bills : undefined;
  const dateRefused = refusals.includes('paid_through_invalid');
  const listed = refusals.filter((reason) => reason !== 'paid_through_invalid');

  useEffect(() => {
    if (blocked.length > 0 || !readable) return;
    let live = true;
    void previewActivation(leaseId, paidThrough)
      .catch(() => null)
      .then((result) => {
        if (live) setPreview({ paidThrough, bills: result });
      });
    return () => {
      live = false;
    };
  }, [blocked.length, leaseId, paidThrough, readable]);

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
          <DateInput
            label={t('paidThroughField')}
            onTextChange={(text) => {
              setPaidThrough(text);
              setRefusals((current) => current.filter((reason) => reason !== 'paid_through_invalid'));
            }}
          />
          {dateRefused ? (
            <p role="alert" data-testid="paid-through-refused" className="flex items-start gap-2 text-small text-overdue">
              <StatusShape status="overdue" className="mt-0.5 size-4" />
              <span>{t('refusal', { reason: 'paid_through_invalid' })}</span>
            </p>
          ) : (
            <p className="text-small text-ink-muted">{t('paidThroughHint')}</p>
          )}
        </div>
        {blocked.length > 0 ? null : (
          <section aria-live="polite" data-testid="activation-preview" className="flex flex-col gap-2">
            <h3 className="text-body font-semibold text-ink">{t('previewTitle')}</h3>
            {!readable ? (
              <p className="text-small text-ink-muted">{t('previewNeedsDate')}</p>
            ) : bills === undefined ? (
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
        {listed.length === 0 ? null : (
          <div role="alert" data-testid="activate-refusals">
            <ul className="flex flex-col gap-2">
            {listed.map((reason) => (
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
