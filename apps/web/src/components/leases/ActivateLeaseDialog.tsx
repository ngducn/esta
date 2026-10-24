'use client';

import { formatDate } from '@esta/core/format';
import type { ActivationRefusal } from '@esta/core/lease';
import { parseOptionalDateInput } from '@esta/core/parse/date-input';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { activateLease, previewActivation, type ActivationRefusalReason, type BillPreview } from '@/server/actions/leases';
import { MoneyDisplay } from '@/components/money/money-display';
import { FormAlert } from '@/components/form-alert';
import { FormSheet } from '@/components/form-sheet';
import { useNoticeToast } from '@/components/undo-toast';
import { useAction } from '@/components/use-action';
import type { PopupProps } from '@/components/use-deferred-dialog';
import { PaidThroughField } from './paid-through-field';

/**
 * LSE-2 and LSE-3: `Đã thu tiền đến hết ngày` sets paid_through_date, so what was collected before Esta is never
 * invoiced. The dialog lists what activation will bill for the date on screen before Mẹ confirms, and a refusal stays
 * beside the button that caused it.
 */
export default function ActivateLeaseDialog({
  leaseId,
  blocked,
  open,
  onOpenChange,
  finalFocus,
  onDismiss,
  onActivated,
}: PopupProps & {
  leaseId: string;
  blocked: readonly ActivationRefusal[];
  /** Runs when the dialog closes without activating. */
  onDismiss: () => void;
  onActivated: () => void;
}) {
  const t = useTranslations('leases');
  const locale = useLocale();
  const notice = useNoticeToast();
  const [paidThrough, setPaidThrough] = useState('');
  const [preview, setPreview] = useState<{ readonly paidThrough: string; readonly bills: readonly BillPreview[] | null } | null>(null);
  const [refusals, setRefusals] = useState<readonly ActivationRefusalReason[]>(blocked);
  const { pending, run } = useAction();
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
    run(
      () => activateLease(leaseId, paidThrough),
      (result) => {
        if (!result.ok) {
          setRefusals(result.reasons);
          return;
        }
        const month = result.issuedMonth === null ? 'none' : String(Number(result.issuedMonth.slice(5, 7)));
        notice(t('activated', { month }).trim());
        onActivated();
      },
      { ok: false, reasons: ['failed'] } as const,
    );

  return (
    <FormSheet
      surface="dialog"
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) onDismiss();
      }}
      finalFocus={finalFocus}
      testId="activate-dialog"
      title={t('activateTitle')}
      description={t('activateBody')}
      labels={{ cancel: t('cancel'), submit: t('activate'), pending: t('activating') }}
      submitTestId="confirm-activate"
      pending={pending}
      submitDisabled={blocked.length > 0 || bills === undefined}
      onSubmit={activate}
      error={
        listed.length === 0 ? null : (
          <div data-testid="activate-refusals" className="flex flex-col gap-2">
            {listed.map((reason) => (
              <FormAlert key={reason} message={t('refusal', { reason })} />
            ))}
          </div>
        )
      }
    >
      <PaidThroughField
        refusal={dateRefused ? 'paid_through_invalid' : null}
        onTextChange={(text) => {
          setPaidThrough(text);
          setRefusals((current) => current.filter((reason) => reason !== 'paid_through_invalid'));
        }}
      />
      {blocked.length > 0 ? null : (
        <section aria-live="polite" data-testid="activation-preview" className="flex flex-col gap-2">
          <h3 className="text-body font-medium text-ink">{t('previewTitle')}</h3>
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
                    <span className="text-body font-medium text-ink">
                      {t('invoicePeriod', { start: formatDate(bill.periodStart, locale), end: formatDate(bill.periodEnd, locale) })}
                    </span>
                    <span className="text-small text-ink-muted">{t(bill.issuesNow ? 'previewIssuesNow' : 'previewLater', { date: formatDate(bill.dueDate, locale) })}</span>
                  </span>
                  <MoneyDisplay amount={bill.rentVnd} className="text-body font-medium text-ink" />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </FormSheet>
  );
}
