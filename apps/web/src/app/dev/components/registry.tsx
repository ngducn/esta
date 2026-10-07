import { vnd } from '@esta/core/money';
import type { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AddressBlock } from '@/components/address-block';
import { CompletenessRing } from '@/components/completeness-ring';
import { EmptyState } from '@/components/empty-state';
import { FieldMessage } from '@/components/field-message';
import { MoneyDisplay } from '@/components/money/money-display';
import {
  SkeletonAddress,
  SkeletonButton,
  SkeletonEmptyState,
  SkeletonField,
  SkeletonMoney,
  SkeletonRing,
  SkeletonStatus,
  SkeletonTable,
} from '@/components/skeleton';
import { StatusMark } from '@/components/status-mark';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ConfirmDialogDemo, DateInputDemo, MoneyInputDemo, RentTableDemo, SheetDemo, UndoToastDemo } from './demos';

export type DevT = Awaited<ReturnType<typeof getTranslations<'devComponents'>>>;
type ComponentName = keyof IntlMessages['devComponents']['names'];
type StateName = keyof IntlMessages['devComponents']['states'];
type IntlMessages = typeof import('../../../../messages/vi.json');

export type RegistryEntry = {
  component: ComponentName;
  /** Full width for components that need the room, such as the table. */
  wide?: boolean;
  states: readonly { state: StateName; render: (t: DevT) => ReactNode }[];
};

/** Draws the focus ring a keyboard user sees, so the focus state is visible without focusing anything. */
const focusRing = {
  input: '[&_[data-slot=input]]:outline-2 [&_[data-slot=input]]:outline-offset-2 [&_[data-slot=input]]:outline-ink',
  button: '[&_[data-slot=button]]:outline-2 [&_[data-slot=button]]:outline-offset-2 [&_[data-slot=button]]:outline-ink',
  checkbox: '[&_[data-slot=checkbox]]:outline-2 [&_[data-slot=checkbox]]:-outline-offset-2 [&_[data-slot=checkbox]]:outline-ink',
} as const;

function Focused({ on, children }: { on: keyof typeof focusRing; children: ReactNode }) {
  return <div className={focusRing[on]}>{children}</div>;
}

function TextField({ t, id, value, disabled = false, error }: { t: DevT; id: string; value: string; disabled?: boolean; error?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-body font-semibold text-ink">
        {t('samples.nicknameLabel')}
      </label>
      <Input
        id={id}
        defaultValue={value}
        disabled={disabled}
        aria-invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : `${id}-message`}
      />
      {error === undefined ? null : <FieldMessage id={`${id}-message`} error={error} />}
    </div>
  );
}

function CheckboxField({ label, defaultChecked = false, disabled = false }: { label: string; defaultChecked?: boolean; disabled?: boolean }) {
  return (
    <label className="-ml-2.5 inline-flex max-w-prose cursor-pointer items-start text-body text-ink has-data-disabled:cursor-not-allowed has-data-disabled:text-ink-muted">
      <Checkbox defaultChecked={defaultChecked} disabled={disabled} />
      <span className="py-2.5 pr-2">{label}</span>
    </label>
  );
}

const rent = vnd(3_500_000);

export const registry: readonly RegistryEntry[] = [
  {
    component: 'button',
    states: [
      {
        state: 'default',
        render: (t) => (
          <div className="flex flex-wrap gap-3">
            <Button>{t('samples.record')}</Button>
            <Button variant="secondary">{t('samples.viewLease')}</Button>
            <Button variant="quiet">{t('samples.skip')}</Button>
          </div>
        ),
      },
      {
        state: 'focus',
        render: (t) => (
          <Focused on="button">
            <Button>{t('samples.record')}</Button>
          </Focused>
        ),
      },
      {
        state: 'disabled',
        render: (t) => (
          <div className="flex flex-wrap gap-3">
            <Button disabled>{t('samples.record')}</Button>
            <Button variant="secondary" disabled>
              {t('samples.viewLease')}
            </Button>
            <Button variant="quiet" disabled>
              {t('samples.skip')}
            </Button>
          </div>
        ),
      },
      {
        state: 'loading',
        render: (t) => (
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled aria-busy>
              {t('samples.saving')}
            </Button>
            <SkeletonButton />
          </div>
        ),
      },
      { state: 'long', render: (t) => <Button>{t('samples.longAction')}</Button> },
    ],
  },
  {
    component: 'input',
    states: [
      { state: 'default', render: (t) => <TextField t={t} id="input-default" value={t('samples.nickname')} /> },
      { state: 'empty', render: (t) => <TextField t={t} id="input-empty" value="" /> },
      {
        state: 'focus',
        render: (t) => (
          <Focused on="input">
            <TextField t={t} id="input-focus" value={t('samples.nickname')} />
          </Focused>
        ),
      },
      { state: 'disabled', render: (t) => <TextField t={t} id="input-disabled" value={t('samples.nickname')} disabled /> },
      { state: 'error', render: (t) => <TextField t={t} id="input-error" value="" error={t('samples.nicknameMissing')} /> },
      { state: 'long', render: (t) => <TextField t={t} id="input-long" value={t('samples.longNickname')} /> },
    ],
  },
  {
    component: 'checkbox',
    states: [
      { state: 'default', render: (t) => <CheckboxField label={t('samples.remind')} /> },
      { state: 'checked', render: (t) => <CheckboxField label={t('samples.remind')} defaultChecked /> },
      {
        state: 'focus',
        render: (t) => (
          <Focused on="checkbox">
            <CheckboxField label={t('samples.remind')} />
          </Focused>
        ),
      },
      { state: 'disabled', render: (t) => <CheckboxField label={t('samples.remind')} defaultChecked disabled /> },
      { state: 'long', render: (t) => <CheckboxField label={t('samples.longRemind')} /> },
    ],
  },
  {
    component: 'moneyDisplay',
    states: [
      { state: 'default', render: () => <MoneyDisplay amount={rent} /> },
      { state: 'compact', render: () => <MoneyDisplay amount={vnd(42_500_000)} variant="compact" /> },
      {
        state: 'signed',
        render: () => (
          <div className="flex flex-col items-start gap-1">
            <MoneyDisplay amount={rent} variant="signed" />
            <MoneyDisplay amount={vnd(-1_200_000)} variant="signed" />
          </div>
        ),
      },
      { state: 'large', render: () => <MoneyDisplay amount={vnd(51_000_000)} variant="large" /> },
      { state: 'loading', render: () => <SkeletonMoney large /> },
      {
        state: 'long',
        render: () => (
          <div className="flex flex-col items-start gap-1">
            <MoneyDisplay amount={vnd(1_234_567_890_123)} />
            <MoneyDisplay amount={vnd(12_500_000_000)} variant="large" />
          </div>
        ),
      },
    ],
  },
  {
    component: 'moneyInput',
    states: [
      { state: 'default', render: (t) => <MoneyInputDemo label={t('samples.amountLabel')} /> },
      { state: 'filled', render: (t) => <MoneyInputDemo label={t('samples.amountLabel')} defaultText="3tr5" /> },
      {
        state: 'focus',
        render: (t) => (
          <Focused on="input">
            <MoneyInputDemo label={t('samples.amountLabel')} defaultText="850k" />
          </Focused>
        ),
      },
      { state: 'disabled', render: (t) => <MoneyInputDemo label={t('samples.amountLabel')} defaultText="850k" disabled /> },
      { state: 'error', render: (t) => <MoneyInputDemo label={t('samples.amountLabel')} defaultText="abc" /> },
      { state: 'loading', render: () => <SkeletonField /> },
      { state: 'long', render: (t) => <MoneyInputDemo label={t('samples.longAmountLabel')} defaultText="1ty2" /> },
    ],
  },
  {
    component: 'dateInput',
    states: [
      { state: 'default', render: (t) => <DateInputDemo label={t('samples.dateLabel')} /> },
      { state: 'filled', render: (t) => <DateInputDemo label={t('samples.dateLabel')} defaultText="07/10/2026" /> },
      {
        state: 'focus',
        render: (t) => (
          <Focused on="input">
            <DateInputDemo label={t('samples.dateLabel')} defaultText="07/10/2026" />
          </Focused>
        ),
      },
      { state: 'disabled', render: (t) => <DateInputDemo label={t('samples.dateLabel')} defaultText="07/10/2026" disabled /> },
      { state: 'error', render: (t) => <DateInputDemo label={t('samples.dateLabel')} defaultText="31/02/2026" /> },
      { state: 'loading', render: () => <SkeletonField /> },
      { state: 'long', render: (t) => <DateInputDemo label={t('samples.longDateLabel')} defaultText="01/11/2026" /> },
    ],
  },
  {
    component: 'statusMark',
    states: [
      {
        state: 'default',
        render: () => (
          <div data-testid="status-row" className="flex flex-wrap gap-x-6 gap-y-3">
            <StatusMark status="paid" />
            <StatusMark status="due" />
            <StatusMark status="overdue" days={12} />
            <StatusMark status="vacant" />
            <StatusMark status="draft" />
            <StatusMark status="ended" />
          </div>
        ),
      },
      { state: 'long', render: () => <StatusMark status="overdue" days={1_250} /> },
      { state: 'loading', render: () => <SkeletonStatus /> },
    ],
  },
  {
    component: 'completenessRing',
    states: [
      { state: 'default', render: () => <CompletenessRing percent={70} missing={3} /> },
      { state: 'complete', render: () => <CompletenessRing percent={100} missing={0} /> },
      { state: 'empty', render: () => <CompletenessRing percent={0} missing={12} /> },
      { state: 'loading', render: () => <SkeletonRing /> },
    ],
  },
  {
    component: 'addressBlock',
    states: [
      { state: 'default', render: (t) => <AddressBlock legal={t('samples.legalAddress')} current={t('samples.currentAddress')} /> },
      { state: 'same', render: (t) => <AddressBlock legal={t('samples.currentAddress')} current={t('samples.currentAddress')} /> },
      {
        state: 'long',
        render: (t) => <AddressBlock legal={t('samples.longLegalAddress')} current={t('samples.longCurrentAddress')} />,
      },
      { state: 'empty', render: () => <AddressBlock legal={null} current={null} /> },
      { state: 'loading', render: () => <SkeletonAddress /> },
    ],
  },
  {
    component: 'dataTable',
    wide: true,
    states: [
      { state: 'default', render: () => <RentTableDemo variant="default" /> },
      { state: 'long', render: () => <RentTableDemo variant="long" /> },
      { state: 'empty', render: () => <RentTableDemo variant="empty" /> },
      { state: 'loading', render: () => <SkeletonTable /> },
    ],
  },
  {
    component: 'undoToast',
    states: [
      { state: 'default', render: () => <UndoToastDemo /> },
      { state: 'long', render: () => <UndoToastDemo long /> },
    ],
  },
  {
    component: 'confirmDialog',
    states: [
      { state: 'default', render: () => <ConfirmDialogDemo /> },
      { state: 'long', render: () => <ConfirmDialogDemo long /> },
    ],
  },
  { component: 'sheet', states: [{ state: 'default', render: () => <SheetDemo /> }] },
  {
    component: 'emptyState',
    states: [
      {
        state: 'default',
        render: (t) => (
          <EmptyState title={t('samples.emptyTitle')} body={t('samples.emptyBody')} action={{ label: t('samples.emptyAction'), href: '#empty-state' }} />
        ),
      },
      {
        state: 'long',
        render: (t) => (
          <EmptyState
            title={t('samples.longEmptyTitle')}
            body={t('samples.longEmptyBody')}
            action={{ label: t('samples.longEmptyAction'), href: '#empty-state' }}
          />
        ),
      },
      { state: 'loading', render: () => <SkeletonEmptyState /> },
    ],
  },
];

export const registrySize = registry.reduce((total, entry) => total + entry.states.length, 0);
