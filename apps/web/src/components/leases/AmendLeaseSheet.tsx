'use client';

import { formatDate } from '@esta/core/format';
import type { IsoDate } from '@esta/core/date';
import type { Vnd } from '@esta/core/money';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { amendLease, type LeaseChangeRefusal } from '@/server/actions/leases';
import { FormSelect } from '@/components/properties/address-picker';
import { TextField } from '@/components/form-parts';
import { MoneyInput } from '@/components/money/money-input';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useNoticeToast } from '@/components/undo-toast';
import { ChangeRefusal } from './change-refusal';

/**
 * LSE-2: a new monthly rent from a later period. The picker offers only the starts `amendmentStarts` allows, so a period
 * that is already invoiced or collected cannot be chosen; `amend_lease` checks the same again.
 */
export default function AmendLeaseSheet({ leaseId, starts, onClose }: { leaseId: string; starts: readonly IsoDate[]; onClose: () => void }) {
  const t = useTranslations('leases');
  const locale = useLocale();
  const router = useRouter();
  const notice = useNoticeToast();
  const [start, setStart] = useState<IsoDate | undefined>(starts[0]);
  const [rent, setRent] = useState<Vnd | null>(null);
  const [reason, setReason] = useState('');
  const [refusal, setRefusal] = useState<LeaseChangeRefusal | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      if (start === undefined || rent === null) return;
      const result = await amendLease(leaseId, { effectivePeriodStart: start, rentVnd: rent, reason }).catch(() => ({ ok: false, reason: 'failed' }) as const);
      if (!result.ok) {
        setRefusal(result.reason);
        return;
      }
      notice(t('amended', { date: formatDate(start, locale) }));
      router.refresh();
      onClose();
    });

  return (
    <Sheet open onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent data-testid="amend-sheet">
        <div className="flex flex-col gap-2">
          <SheetTitle>{t('amendTitle')}</SheetTitle>
          <SheetDescription>{t('amendBody')}</SheetDescription>
        </div>
        {start === undefined ? (
          <p data-testid="amend-no-starts" className="text-body text-ink-2">
            {t('amendNoStarts')}
          </p>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
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
            <ChangeRefusal reason={refusal} />
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <SheetClose render={<Button type="button" variant="outline" />}>{t('cancel')}</SheetClose>
              <Button type="submit" data-testid="amend-save" disabled={pending || rent === null}>
                {pending ? t('working') : t('amendSave')}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
