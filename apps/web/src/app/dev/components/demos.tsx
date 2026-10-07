'use client';

import { isoDate, type IsoDate } from '@esta/core/date';
import { formatDate, formatVnd } from '@esta/core/format';
import { vnd, type Vnd } from '@esta/core/money';
import { parseDateInput } from '@esta/core/parse/date-input';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable, type DataColumn } from '@/components/data-table';
import { DateInput } from '@/components/date-input';
import { EmptyState } from '@/components/empty-state';
import { MoneyDisplay } from '@/components/money/money-display';
import { MoneyInput } from '@/components/money/money-input';
import { StatusMark, type StatusMarkProps } from '@/components/status-mark';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useUndoToast } from '@/components/undo-toast';

function Emitted({ testId, value }: { testId: string; value: string | number | null }) {
  const t = useTranslations('devComponents.samples');
  return (
    <p data-testid={testId} className="text-small text-ink-muted">
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

type RentRow = { n: number; tenant: string; mark: StatusMarkProps; amount: Vnd };

const tenants = [
  'Đặng Thị Demo',
  'Nguyễn Văn Demo',
  'Trần Minh Demo',
  'Lê Thị Demo Hường',
  'Phạm Văn Demo Ước',
  'Võ Thị Demo',
  'Hoàng Văn Demo',
  'Bùi Thị Demo',
  'Đỗ Minh Demo',
  'Ngô Thị Demo',
  'Dương Văn Demo',
  'Lý Thị Demo',
];
const marks: StatusMarkProps[] = [{ status: 'paid' }, { status: 'due' }, { status: 'overdue', days: 12 }, { status: 'paid' }];

const rentRows: RentRow[] = tenants.map((tenant, i) => ({
  n: i + 1,
  tenant,
  mark: marks[i % marks.length] ?? { status: 'due' },
  amount: vnd(2_800_000 + (i % 5) * 350_000),
}));

const longRows: RentRow[] = [
  { n: 12, tenant: 'Nguyễn Thị Demo Hường và Trần Văn Demo Ước, đại diện hộ gia đình', mark: { status: 'overdue', days: 120 }, amount: vnd(12_500_000) },
  { n: 7, tenant: 'Công ty Trách nhiệm Hữu hạn Thương mại Dịch vụ Demo Đông Hòa', mark: { status: 'due' }, amount: vnd(1_250_000_000) },
];

export function RentTableDemo({ variant }: { variant: 'default' | 'long' | 'empty' }) {
  const t = useTranslations('devComponents.samples');
  const columns: DataColumn<RentRow>[] = [
    { id: 'unit', header: t('unitHeader'), cell: (row) => t('unit', { n: row.n }) },
    { id: 'tenant', header: t('tenantHeader'), cell: (row) => row.tenant },
    { id: 'status', header: t('statusHeader'), cell: (row) => <StatusMark {...row.mark} /> },
    { id: 'amount', header: t('amountHeader'), amount: true, cell: (row) => <MoneyDisplay amount={row.amount} /> },
  ];
  const rows = variant === 'default' ? rentRows : variant === 'long' ? longRows : [];
  return (
    <DataTable
      caption={t('tableCaption')}
      columns={columns}
      rows={rows}
      rowId={(row) => String(row.n)}
      rowLabel={(row) => t('unit', { n: row.n })}
      selectable
      empty={<EmptyState title={t('tableEmptyTitle')} body={t('tableEmptyBody')} action={{ label: t('tableEmptyAction'), href: '#data-table' }} />}
    />
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
      <p data-testid="undo-state" className="text-body text-ink">
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
      <p data-testid="lease-state" className="text-body text-ink">
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
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="secondary" />}>{t('openSheet')}</SheetTrigger>
      <SheetContent>
        <div className="flex flex-col gap-1">
          <SheetTitle>{t('sheetTitle')}</SheetTitle>
          <SheetDescription>{t('sheetBody')}</SheetDescription>
        </div>
        <MoneyInput label={t('amountLabel')} defaultText="3tr5" />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <SheetClose render={<Button variant="secondary" />}>{t('close')}</SheetClose>
          <SheetClose render={<Button />}>{t('record')}</SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
