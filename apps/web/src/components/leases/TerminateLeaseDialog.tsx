'use client';

import { formatDate } from '@esta/core/format';
import type { IsoDate } from '@esta/core/date';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { terminateLease, type LeaseChangeRefusal } from '@/server/actions/leases';
import { DateInput } from '@/components/date-input';
import { TextField } from '@/components/form-parts';
import { FormSheet } from '@/components/form-sheet';
import { useNoticeToast } from '@/components/undo-toast';
import { useAction } from '@/components/use-action';
import type { PopupProps } from '@/components/use-deferred-dialog';
import { IntentLink } from '@/components/shell/intent-link';
import { ChangeRefusal } from './change-refusal';
import type { IssuedBill } from './LeaseActions';

/** The first issued bill after the chosen day, which `terminate_lease` refuses to end before until it is voided. */
function BlockingBill({ bill }: { bill: IssuedBill }) {
  const t = useTranslations('leases');
  return (
    <div data-testid="terminate-blocked-by" className="flex flex-col gap-2 text-body text-ink">
      <p>{t('terminateBlockedBy', { number: bill.number })}</p>
      <IntentLink href={`/collections/invoices/${bill.id}`} className="self-start font-medium text-accent underline underline-offset-4">
        {t('terminateOpenBill', { number: bill.number })}
      </IntentLink>
    </div>
  );
}

/** LSE-2: active to terminated. The title asks the exact question, naming the room and the day (DESIGN-BRIEF voice). */
export default function TerminateLeaseDialog({
  leaseId,
  unitLabel,
  issuedBills,
  open,
  onOpenChange,
  finalFocus,
}: PopupProps & {
  leaseId: string;
  unitLabel: string;
  issuedBills: readonly IssuedBill[];
}) {
  const t = useTranslations('leases');
  const locale = useLocale();
  const router = useRouter();
  const notice = useNoticeToast();
  const [date, setDate] = useState<IsoDate | null>(null);
  const [reason, setReason] = useState('');
  const [refusal, setRefusal] = useState<LeaseChangeRefusal | null>(null);
  const { pending, run } = useAction();

  const blocking =
    refusal === 'before_issued' && date !== null ? issuedBills.toSorted((a, b) => a.periodStart.localeCompare(b.periodStart)).find((bill) => bill.periodStart > date) : undefined;

  const confirm = () => {
    if (date === null) return;
    if (reason.trim() === '') {
      setRefusal('reason_required');
      return;
    }
    run(
      () => terminateLease(leaseId, { terminatedOn: date, reason }),
      (result) => {
        if (!result.ok) {
          setRefusal(result.reason);
          return;
        }
        const ended = t('terminated', { unit: unitLabel, date: formatDate(date, locale) });
        notice(result.value.unbilled === 0 ? ended : `${ended} ${t('terminatedUnbilled', { count: result.value.unbilled })}`);
        router.refresh();
        onOpenChange(false);
      },
    );
  };

  return (
    <FormSheet
      surface="dialog"
      open={open}
      onOpenChange={onOpenChange}
      finalFocus={finalFocus}
      testId="terminate-dialog"
      title={date === null ? t('terminateTitle') : t('terminateConfirm', { unit: unitLabel, date: formatDate(date, locale) })}
      titleTestId="terminate-question"
      description={t('terminateBody')}
      labels={{ cancel: t('cancel'), submit: t('actionTerminate'), pending: t('working') }}
      submitTestId="terminate-confirm"
      pending={pending}
      submitDisabled={date === null}
      onSubmit={confirm}
      error={blocking === undefined ? <ChangeRefusal reason={refusal} /> : <BlockingBill bill={blocking} />}
    >
      <DateInput
        label={t('terminateDateField')}
        onValueChange={(value) => {
          setDate(value);
          setRefusal(null);
        }}
      />
      <TextField
        label={t('terminateReasonField')}
        value={reason}
        onChange={(text) => {
          setReason(text);
          if (refusal === 'reason_required') setRefusal(null);
        }}
        error={null}
        testId="terminate-reason"
        maxLength={1000}
      />
    </FormSheet>
  );
}
