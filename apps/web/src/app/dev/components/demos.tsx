'use client';

import { isoDate, type IsoDate } from '@esta/core/date';
import { formatDate, formatVnd } from '@esta/core/format';
import { vnd, type Vnd } from '@esta/core/money';
import { parseDateInput } from '@esta/core/parse/date-input';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import { useLocale, useTranslations } from 'next-intl';
import { lazy, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DateInput } from '@/components/date-input';
import { MoneyInput } from '@/components/money/money-input';
import { Button } from '@/components/ui/button';
import { useUndoToast } from '@/components/undo-toast';
import { DeferredPopup, useDeferredDialog } from '@/components/use-deferred-dialog';

const loadSheetPopup = () => import('./sheet-demo-popup');
const SheetDemoPopup = lazy(loadSheetPopup);

function Emitted({ testId, value }: { testId: string; value: string | number | null }) {
  const t = useTranslations('devComponents.samples');
  return (
    <p data-testid={testId} className="text-body-sm text-text-muted">
      {value === null ? t('emittedNone') : t('emitted', { value: String(value) })}
    </p>
  );
}

export function MoneyInputDemo({ label, defaultText = '', disabled = false }: { label: string; defaultText?: string; disabled?: boolean }) {
  const initial = parseVndInput(defaultText);
  const [value, setValue] = useState<Vnd | null>(initial.ok ? initial.value : null);
  return (
    <div className="flex flex-col gap-1">
      <MoneyInput label={label} defaultText={defaultText} disabled={disabled} onValueChange={setValue} />
      <Emitted testId="money-emitted" value={value} />
    </div>
  );
}

export function DateInputDemo({ label, defaultText, disabled = false }: { label: string; defaultText?: string; disabled?: boolean }) {
  const initial = parseDateInput(defaultText ?? '');
  const [value, setValue] = useState<IsoDate | null>(initial.ok ? initial.value : null);
  return (
    <div className="flex flex-col gap-1">
      <DateInput label={label} disabled={disabled} onValueChange={setValue} {...(initial.ok ? { defaultValue: initial.value } : {})} />
      <Emitted testId="date-emitted" value={value} />
    </div>
  );
}

const ROOM_RENT = vnd(3_500_000);

export function UndoToastDemo({ long = false }: { long?: boolean }) {
  const t = useTranslations('devComponents.samples');
  const locale = useLocale();
  const showUndo = useUndoToast();
  const [paid, setPaid] = useState(false);
  const unit = t('unit', { n: 3 });
  const amount = formatVnd(ROOM_RENT, locale);
  return (
    <div className="flex flex-col items-start gap-3">
      <p data-testid="undo-state" className="text-body text-text">
        {paid ? t('paidLine', { unit, amount }) : t('unpaidLine', { unit })}
      </p>
      <Button
        disabled={paid}
        onClick={() => {
          setPaid(true);
          showUndo(long ? t('longRecorded', { amount }) : t('recorded', { amount, unit }), () => setPaid(false));
        }}
      >
        {t('recordFrom', { amount, unit })}
      </Button>
    </div>
  );
}

const LEASE_END: IsoDate = isoDate('2026-10-31');

export function ConfirmDialogDemo({ long = false }: { long?: boolean }) {
  const t = useTranslations('devComponents.samples');
  const locale = useLocale();
  const [ended, setEnded] = useState(false);
  const unit = t('unit', { n: 3 });
  const date = formatDate(LEASE_END, locale);
  return (
    <div className="flex flex-col items-start gap-3">
      <p data-testid="lease-state" className="text-body text-text">
        {ended ? t('leaseEnded', { unit }) : t('leaseActive', { unit })}
      </p>
      <ConfirmDialog
        title={long ? t('longEndLeaseTitle', { date }) : t('endLeaseTitle', { unit, date })}
        description={t('endLeaseBody')}
        triggerLabel={t('endLease')}
        confirmLabel={t('endLease')}
        onConfirm={() => setEnded(true)}
      />
    </div>
  );
}

export function SheetDemo() {
  const t = useTranslations('devComponents.samples');
  const dialog = useDeferredDialog(loadSheetPopup);
  return (
    <>
      <Button variant="secondary" {...dialog.triggerProps}>
        {t('openSheet')}
      </Button>
      <DeferredPopup dialog={dialog} popup={SheetDemoPopup} props={{}} />
    </>
  );
}
