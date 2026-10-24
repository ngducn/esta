'use client';

import { formatDate } from '@esta/core/format';
import type { IsoDate } from '@esta/core/date';
import type { Vnd } from '@esta/core/money';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { amendLease, type LeaseChangeRefusal } from '@/server/actions/leases';
import { FormSelect } from '@/components/properties/address-picker';
import { TextField } from '@/components/form-parts';
import { MoneyInput } from '@/components/money/money-input';
import { FormSheet } from '@/components/form-sheet';
import { useNoticeToast } from '@/components/undo-toast';
import { useAction } from '@/components/use-action';
import type { PopupProps } from '@/components/use-deferred-dialog';
import { ChangeRefusal } from './change-refusal';

/**
 * LSE-2: a new monthly rent from a later period. The picker offers only the starts `amendmentStarts` allows, so a period
 * that is already invoiced or collected cannot be chosen; `amend_lease` checks the same again.
 */
export default function AmendLeaseSheet({ leaseId, starts, open, onOpenChange, finalFocus }: PopupProps & { leaseId: string; starts: readonly IsoDate[] }) {
  const t = useTranslations('leases');
  const locale = useLocale();
  const router = useRouter();
  const notice = useNoticeToast();
  const [start, setStart] = useState<IsoDate | undefined>(starts[0]);
  const [rent, setRent] = useState<Vnd | null>(null);
  const [reason, setReason] = useState('');
  const [refusal, setRefusal] = useState<LeaseChangeRefusal | null>(null);
  const { pending, run } = useAction();

  const save = () => {
    if (start === undefined || rent === null) return;
    run(
      () => amendLease(leaseId, { effectivePeriodStart: start, rentVnd: rent, reason }),
      (result) => {
        if (!result.ok) {
          setRefusal(result.reason);
          return;
        }
        notice(t('amended', { date: formatDate(start, locale) }));
        router.refresh();
        onOpenChange(false);
      },
    );
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      finalFocus={finalFocus}
      testId="amend-sheet"
      title={t('amendTitle')}
      description={t('amendBody')}
      labels={{ cancel: t('cancel'), submit: t('amendSave'), pending: t('working') }}
      submitTestId="amend-save"
      pending={pending}
      submitDisabled={rent === null}
      onSubmit={start === undefined ? null : save}
      error={start === undefined ? null : <ChangeRefusal reason={refusal} />}
    >
      {start === undefined ? (
        <p data-testid="amend-no-starts" className="text-body text-ink-2">
          {t('amendNoStarts')}
        </p>
      ) : (
        <>
          <FormSelect
            label={t('amendStartField')}
            testId="amend-start"
            value={start}
            options={starts.map((candidate) => ({ value: candidate, label: t('amendStartOption', { start: formatDate(candidate, locale) }) }))}
            onChange={(value) => {
              setStart(starts.find((candidate) => candidate === value) ?? starts[0]);
              setRefusal(null);
            }}
          />
          <MoneyInput label={t('amendRentField')} onValueChange={(value) => setRent(value !== null && value > 0 ? value : null)} />
          <TextField label={t('amendReasonField')} value={reason} onChange={setReason} error={null} testId="amend-reason" maxLength={1000} />
        </>
      )}
    </FormSheet>
  );
}
