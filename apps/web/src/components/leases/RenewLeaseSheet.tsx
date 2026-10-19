'use client';

import { formatDate, formatVnd } from '@esta/core/format';
import type { IsoDate } from '@esta/core/date';
import { RENEWAL_INCREASE_BPS, renewalRent } from '@esta/core/lease';
import type { Vnd } from '@esta/core/money';
import { parseOptionalDateInput } from '@esta/core/parse/date-input';
import { parsePercentBps } from '@esta/core/parse/percent';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { renewLease, type LeaseChangeRefusal } from '@/server/actions/leases';
import { DateInput } from '@/components/date-input';
import { TextField } from '@/components/form-parts';
import { MoneyDisplay } from '@/components/money/money-display';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useNoticeToast } from '@/components/undo-toast';
import { ChangeRefusal } from './change-refusal';

/** Empty keeps the rent; otherwise a percent `parsePercentBps` reads, inside what `renew_lease` accepts. */
function readIncrease(text: string): number | null {
  if (text.trim() === '') return 0;
  const parsed = parsePercentBps(text);
  return parsed.ok && parsed.value <= RENEWAL_INCREASE_BPS.max ? parsed.value : null;
}

/**
 * LSE-2 and SPEC §9.4 seed 7: a new lease from the day after this one ends. The preview applies the same half-up rounding
 * to 100.000 ₫ that `renew_lease` writes, so the number Mẹ confirms is the number billed.
 */
export default function RenewLeaseSheet({
  leaseId,
  start,
  lastRentVnd,
  defaultEnd,
  leasesHref,
  onClose,
}: {
  leaseId: string;
  start: IsoDate;
  lastRentVnd: Vnd;
  defaultEnd: IsoDate;
  leasesHref: string;
  onClose: () => void;
}) {
  const t = useTranslations('leases');
  const locale = useLocale();
  const router = useRouter();
  const notice = useNoticeToast();
  const [increaseText, setIncreaseText] = useState('');
  const [endText, setEndText] = useState(() => formatDate(defaultEnd, locale));
  const [refusal, setRefusal] = useState<LeaseChangeRefusal | null>(null);
  const [pending, startTransition] = useTransition();
  const increase = readIncrease(increaseText);
  const rent = increase === null ? null : renewalRent(lastRentVnd, increase);
  const end = parseOptionalDateInput(endText);

  const save = () =>
    startTransition(async () => {
      if (increase === null || !end.ok) return;
      const result = await renewLease(leaseId, { increaseBps: increase, endDate: end.value }).catch(() => ({ ok: false, reason: 'failed' }) as const);
      if (!result.ok) {
        setRefusal(result.reason);
        return;
      }
      notice(t('renewed', { date: formatDate(start, locale) }));
      router.push(`${leasesHref}/${result.value}`);
      onClose();
    });

  return (
    <Sheet open onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent data-testid="renew-sheet">
        <div className="flex flex-col gap-2">
          <SheetTitle>{t('renewTitle')}</SheetTitle>
          <SheetDescription>{t('renewBody', { date: formatDate(start, locale) })}</SheetDescription>
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
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
          <ChangeRefusal reason={refusal} />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <SheetClose render={<Button type="button" variant="outline" />}>{t('cancel')}</SheetClose>
            <Button type="submit" data-testid="renew-save" disabled={pending || rent === null || !end.ok}>
              {pending ? t('working') : t('renewSave')}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
