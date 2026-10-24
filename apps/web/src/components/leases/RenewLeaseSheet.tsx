'use client';

import { formatDate, formatVnd } from '@esta/core/format';
import type { IsoDate } from '@esta/core/date';
import { RENEWAL_INCREASE_BPS, renewalRent } from '@esta/core/lease';
import type { Vnd } from '@esta/core/money';
import { parseOptionalDateInput } from '@esta/core/parse/date-input';
import { parsePercentBps } from '@esta/core/parse/percent';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { renewLease, type LeaseChangeRefusal, type PaidThroughRefusal } from '@/server/actions/leases';
import { DateInput } from '@/components/date-input';
import { TextField } from '@/components/form-parts';
import { MoneyDisplay } from '@/components/money/money-display';
import { FormSheet } from '@/components/form-sheet';
import { useNoticeToast } from '@/components/undo-toast';
import { useAction } from '@/components/use-action';
import type { PopupProps } from '@/components/use-deferred-dialog';
import { ChangeRefusal } from './change-refusal';
import { PaidThroughField } from './paid-through-field';

/** Empty keeps the rent; otherwise a percent `parsePercentBps` reads, inside what `renew_lease` accepts. */
function readIncrease(text: string): number | null {
  if (text.trim() === '') return 0;
  const parsed = parsePercentBps(text);
  return parsed.ok && parsed.value <= RENEWAL_INCREASE_BPS.max ? parsed.value : null;
}

/**
 * LSE-2 and SPEC §9.4 seed 7: a new lease from the day after this one ends. The preview applies the same half-up rounding
 * to 100.000 ₫ that `renew_lease` writes, so the number Mẹ confirms is the number billed. A renewal that starts before
 * today bills like activation, from the current period on, so it asks activation's question about what was collected.
 */
export default function RenewLeaseSheet({
  leaseId,
  start,
  startsBeforeToday,
  lastRentVnd,
  defaultEnd,
  leasesHref,
  open,
  onOpenChange,
  finalFocus,
}: PopupProps & {
  leaseId: string;
  start: IsoDate;
  startsBeforeToday: boolean;
  lastRentVnd: Vnd;
  defaultEnd: IsoDate;
  leasesHref: string;
}) {
  const t = useTranslations('leases');
  const locale = useLocale();
  const router = useRouter();
  const notice = useNoticeToast();
  const [increaseText, setIncreaseText] = useState('');
  const [endText, setEndText] = useState(() => formatDate(defaultEnd, locale));
  const [paidThroughText, setPaidThroughText] = useState('');
  const [refusal, setRefusal] = useState<LeaseChangeRefusal | null>(null);
  const { pending, run } = useAction();
  const increase = readIncrease(increaseText);
  const rent = increase === null ? null : renewalRent(lastRentVnd, increase);
  const end = parseOptionalDateInput(endText);
  const paidThrough = parseOptionalDateInput(paidThroughText);
  const paidThroughRefusal: PaidThroughRefusal | null = refusal === 'paid_through_invalid' || refusal === 'paid_through_before_start' ? refusal : null;

  const save = () => {
    if (increase === null || !end.ok || !paidThrough.ok) return;
    run(
      () => renewLease(leaseId, { increaseBps: increase, endDate: end.value, paidThrough: paidThroughText }),
      (result) => {
        if (!result.ok) {
          setRefusal(result.reason);
          return;
        }
        notice(t('renewed', { date: formatDate(start, locale) }));
        router.push(`${leasesHref}/${result.value}`);
        onOpenChange(false);
      },
    );
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      finalFocus={finalFocus}
      testId="renew-sheet"
      title={t('renewTitle')}
      description={t('renewBody', { date: formatDate(start, locale) })}
      labels={{ cancel: t('cancel'), submit: t('renewSave'), pending: t('working') }}
      submitTestId="renew-save"
      pending={pending}
      submitDisabled={rent === null || !end.ok || !paidThrough.ok}
      onSubmit={save}
      error={<ChangeRefusal reason={paidThroughRefusal === null ? refusal : null} />}
    >
      <TextField
        label={t('renewIncreaseField')}
        hint={t('renewIncreaseHint')}
        value={increaseText}
        onChange={(text) => {
          setIncreaseText(text);
          setRefusal(null);
        }}
        error={increase === null ? t('invalidPercent') : null}
        testId="renew-increase"
        inputMode="decimal"
        maxLength={8}
      />
      <section aria-live="polite" data-testid="renew-preview" className="flex flex-col gap-1 rounded-md border border-rule bg-surface-2 p-4">
        <span className="text-small text-ink-muted">{t('renewPreview')}</span>
        {rent === null ? <span className="text-body text-ink-2">{t('invalidPercent')}</span> : <MoneyDisplay amount={rent} variant="large" className="text-start text-ink" />}
        <span className="text-small text-ink-2">{t('renewPreviewFrom', { rent: formatVnd(lastRentVnd, locale) })}</span>
      </section>
      <DateInput
        label={t('renewEndField')}
        defaultValue={defaultEnd}
        onTextChange={(text) => {
          setEndText(text);
          setRefusal(null);
        }}
      />
      <p className="-mt-2 text-small text-ink-muted">{t('endHint')}</p>
      {startsBeforeToday ? (
        <PaidThroughField
          refusal={paidThroughRefusal}
          onTextChange={(text) => {
            setPaidThroughText(text);
            setRefusal(null);
          }}
        />
      ) : null}
    </FormSheet>
  );
}
