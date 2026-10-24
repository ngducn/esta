'use client';

import { BILLING_CYCLES, PERIOD_ANCHORS, PRORATIONS, TAX_PAYERS, UTILITIES_MODES, activationRefusals, type ActivationRefusal, type LeaseFormDefaults } from '@esta/core/lease';
import { parseOptionalDateInput } from '@esta/core/parse/date-input';
import { ChevronDown, ScanText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { lazy, useState, type FormEvent } from 'react';
import { saveLease } from '@/server/actions/leases';
import type { Tenant } from '@/server/leases/load';
import { DateInput } from '@/components/date-input';
import { Group, TextField } from '@/components/form-parts';
import { MoneyInput } from '@/components/money/money-input';
import { FormActions } from '@/components/form-actions';
import { FormAlert } from '@/components/form-alert';
import { FormSelect } from '@/components/properties/address-picker';
import { Button, buttonVariants } from '@/components/ui/button';
import { useNoticeToast } from '@/components/undo-toast';
import { useAction } from '@/components/use-action';
import { DeferredPopup, useDeferredDialog } from '@/components/use-deferred-dialog';
import { useHydrated } from '@/lib/use-hydrated';
import { FromContractMark } from './from-contract-mark';
import { defaultsToValues, readDraft, type Invalid, type LeaseFormValues } from './lease-form-values';
import { TenantQuickAdd } from './TenantQuickAdd';

const loadDialog = () => import('./ActivateLeaseDialog');
const ActivateLeaseDialog = lazy(loadDialog);

type FormError = 'invalid' | 'notDraft' | 'document' | 'network' | null;

const asDefault = (text: string) => {
  const date = parseOptionalDateInput(text);
  return date.ok && date.value !== null ? { defaultValue: date.value } : {};
};

export type LeaseFormUnit = { readonly id: string; readonly label: string; readonly defaults: LeaseFormDefaults };

/** A new lease filled from a scanned contract (P3-19): the contract, the fields it filled and the tenant it names. */
export type ContractPrefill = {
  readonly documentId: string;
  readonly prefilled: readonly (keyof LeaseFormValues)[];
  readonly tenant: { readonly fullName: string; readonly phone: string | null } | null;
};

/**
 * The lease form (LSE-2) for a new lease or a draft. Controlled fields would drop what is typed before React hydrates,
 * so nothing takes input until then. `Kích hoạt` saves first, so the dialog activates exactly what is on screen.
 */
export function LeaseForm({
  propertyId,
  leaseId,
  initial,
  units,
  tenants: initialTenants,
  activateOnOpen,
  contract = null,
}: {
  propertyId: string;
  leaseId: string | null;
  initial: LeaseFormValues;
  units: readonly LeaseFormUnit[];
  tenants: readonly Tenant[];
  activateOnOpen: boolean;
  contract?: ContractPrefill | null;
}) {
  const t = useTranslations('leases');
  const router = useRouter();
  const notice = useNoticeToast();
  const hydrated = useHydrated();
  const [values, setValues] = useState(initial);
  const [tenants, setTenants] = useState(initialTenants);
  const [invalid, setInvalid] = useState<Invalid>(null);
  const [error, setError] = useState<FormError>(null);
  const activation = useDeferredDialog(loadDialog, activateOnOpen && leaseId !== null);
  const [more, setMore] = useState(false);
  const { pending, run } = useAction();
  const set = <K extends keyof LeaseFormValues>(key: K, value: LeaseFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const rentalHref = `/properties/${propertyId}/rental`;
  const contractMark = (key: keyof LeaseFormValues) => (contract?.prefilled.includes(key) === true && values[key] === initial[key] ? <FromContractMark label={t('fromContract')} /> : null);
  const leaseHref = (id: string) => `${rentalHref}/leases/${id}`;

  const chooseUnit = (unitId: string) => {
    const unit = units.find((candidate) => candidate.id === unitId);
    if (unit === undefined) return;
    const contractValues = (current: LeaseFormValues) => Object.fromEntries((contract?.prefilled ?? []).map((key) => [key, current[key]]));
    setValues((current) => (leaseId === null ? { ...defaultsToValues({ ...current, unitId }, unit.defaults), ...contractValues(current), unitId } : { ...current, unitId }));
  };

  const save = (then: 'stay' | 'activate') => {
    setError(null);
    const draft = readDraft(values);
    if (!draft.ok) {
      setInvalid(draft.field);
      setError('invalid');
      return;
    }
    setInvalid(null);
    run(
      () => saveLease(propertyId, leaseId, draft.value, contract?.documentId ?? null),
      (result) => {
        if (!result.ok) {
          setError(result.reason === 'failed' ? 'network' : result.reason);
          return;
        }
        if (leaseId === null) {
          router.replace(`${leaseHref(result.id)}${then === 'activate' ? '?activate=1' : ''}`);
          if (then === 'stay') notice(t('savedDraft'));
          return;
        }
        router.refresh();
        if (then === 'activate') void loadDialog().then(() => activation.setOpen(true));
        else notice(t('savedDraft'));
      },
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save('stay');
  };

  const blocked = (): ActivationRefusal[] => {
    const draft = readDraft(values);
    if (!draft.ok) return [];
    const { tenant_party_id, start_date, rent_vnd } = draft.value;
    return activationRefusals({ status: 'draft', tenantPartyId: tenant_party_id, startDate: start_date, rentVnd: rent_vnd }, null);
  };

  const option = <T extends string | number>(list: readonly T[], label: (value: T) => string) => list.map((value) => ({ value: String(value), label: label(value) }));

  return (
    <form noValidate onSubmit={submit} className="flex max-w-3xl flex-col gap-5" data-testid="lease-form">
      <fieldset disabled={!hydrated} className="flex min-w-0 flex-col gap-5">
        {hydrated ? null : (
          <p role="status" data-testid="form-loading" className="text-body text-ink-muted">
            {t('formLoading')}
          </p>
        )}
        {contract === null ? null : (
          <p data-testid="from-contract-intro" className="flex items-start gap-3 rounded-md bg-surface-2 px-4 py-3 text-body text-ink-2">
            <ScanText className="mt-0.5 size-5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            <span className="min-w-0 break-words">{t('fromContractIntro')}</span>
          </p>
        )}
        <Group title={t('groupTenant')}>
          <FormSelect
            label={t('unitField')}
            testId="lease-unit"
            selectId="lease-unit"
            value={values.unitId}
            options={units.map((unit) => ({ value: unit.id, label: unit.label }))}
            onChange={chooseUnit}
          />
          {contractMark('unitId')}
          <FormSelect
            label={t('tenantField')}
            testId="lease-tenant"
            selectId="lease-tenant"
            value={values.tenantId}
            placeholder={t('tenantPlaceholder')}
            options={tenants.map((tenant) => ({ value: tenant.id, label: tenant.phone === null ? tenant.fullName : `${tenant.fullName} · ${tenant.phone}` }))}
            onChange={(tenantId) => set('tenantId', tenantId)}
          />
          {contractMark('tenantId')}
          <TenantQuickAdd
            initial={contract?.tenant !== null && contract?.tenant !== undefined && initial.tenantId === '' ? contract.tenant : null}
            mark={t('fromContract')}
            onAdded={(tenant) => {
              setTenants((current) => [...current, tenant].toSorted((a, b) => a.fullName.localeCompare(b.fullName, 'vi')));
              set('tenantId', tenant.id);
            }}
          />
        </Group>
        <Group title={t('groupTerm')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <DateInput label={t('startField')} {...asDefault(initial.startText)} onTextChange={(text) => set('startText', text)} />
              {contractMark('startText')}
            </div>
            <div className="flex flex-col gap-1">
              <DateInput label={t('endField')} {...asDefault(initial.endText)} onTextChange={(text) => set('endText', text)} />
              {contractMark('endText')}
              <p className="text-small text-ink-muted">{invalid === 'endBeforeStart' ? null : t('endHint')}</p>
              {invalid === 'endBeforeStart' ? (
                <p role="alert" className="text-small text-overdue">
                  {t('endBeforeStart')}
                </p>
              ) : null}
            </div>
          </div>
        </Group>
        <Group title={t('groupMoney')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <MoneyInput key={`rent-${values.unitId}`} label={t('rentField')} defaultText={values.rentText} onTextChange={(text) => set('rentText', text)} />
              {contractMark('rentText')}
              {invalid === 'rentZero' ? (
                <p role="alert" data-testid="rent-zero" className="text-small text-overdue">
                  {t('rentZero')}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <MoneyInput key={`deposit-${values.unitId}`} label={t('depositField')} defaultText={values.depositText} onTextChange={(text) => set('depositText', text)} />
              {contractMark('depositText')}
            </div>
            <div className="flex flex-col gap-1">
              <FormSelect
                label={t('cycleField')}
                testId="lease-cycle"
                selectId="lease-cycle"
                value={String(values.cycle)}
                options={option(BILLING_CYCLES, (months) => t('cycle', { months }))}
                onChange={(cycle) => set('cycle', BILLING_CYCLES.find((months) => String(months) === cycle) ?? 1)}
              />
              {contractMark('cycle')}
            </div>
            <FormSelect
              label={t('utilitiesField')}
              testId="lease-utilities"
              selectId="lease-utilities"
              value={values.utilities}
              options={option(UTILITIES_MODES, (mode) => t('utilities', { mode }))}
              onChange={(mode) => set('utilities', UTILITIES_MODES.find((value) => value === mode) ?? 'tenant_direct')}
            />
          </div>
        </Group>
        <details
          data-testid="lease-more"
          open={more || invalid === 'escalationValue' || invalid === 'escalationEvery' || invalid === 'notice'}
          onToggle={(event) => setMore(event.currentTarget.open)}
          className="group rounded-lg border border-rule bg-surface shadow-card"
        >
          <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-4 p-5 sm:px-6">
            <span className="flex flex-col gap-0.5">
              <span className="text-lead font-semibold text-ink">{t('groupMore')}</span>
              <span className="text-small text-ink-muted">{t('groupMoreHint')}</span>
            </span>
            <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-ink-muted transition-transform duration-(--duration-fast) group-open:rotate-180" />
          </summary>
          <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 sm:px-6 sm:pb-6">
            <FormSelect
              label={t('anchorField')}
              testId="lease-anchor"
              selectId="lease-anchor"
              value={values.anchor}
              options={option(PERIOD_ANCHORS, (anchor) => t('anchor', { anchor }))}
              onChange={(anchor) => set('anchor', PERIOD_ANCHORS.find((value) => value === anchor) ?? 'calendar_month')}
            />
            <FormSelect
              label={t('prorationField')}
              selectId="lease-proration"
              value={values.proration}
              options={option(PRORATIONS, (proration) => t('proration', { proration }))}
              onChange={(proration) => set('proration', PRORATIONS.find((value) => value === proration) ?? 'by_days')}
            />
            <FormSelect
              label={t('escalationField')}
              testId="lease-escalation"
              selectId="lease-escalation"
              value={values.escalation}
              options={option(['none', 'percent', 'fixed'] as const, (kind) => t('escalation', { kind }))}
              onChange={(kind) => set('escalation', kind === 'percent' || kind === 'fixed' ? kind : 'none')}
            />
            {values.escalation === 'none' ? null : (
              <>
                {values.escalation === 'percent' ? (
                  <TextField
                    label={t('escalationPercent')}
                    inputId="lease-escalation-value"
                    value={values.escalationValueText}
                    inputMode="decimal"
                    className="figures"
                    maxLength={8}
                    error={invalid === 'escalationValue' ? t('invalidPercent') : null}
                    onChange={(text) => set('escalationValueText', text)}
                  />
                ) : (
                  <MoneyInput label={t('escalationAmount')} defaultText={values.escalationValueText} onTextChange={(text) => set('escalationValueText', text)} />
                )}
                <TextField
                  label={t('escalationEvery')}
                  inputId="lease-escalation-every"
                  value={values.escalationEveryText}
                  inputMode="numeric"
                  className="figures"
                  maxLength={3}
                  error={invalid === 'escalationEvery' ? t('invalidNumber') : null}
                  onChange={(text) => set('escalationEveryText', text)}
                />
              </>
            )}
            <FormSelect
              label={t('taxField')}
              selectId="lease-tax"
              value={values.taxPayer}
              options={option(TAX_PAYERS, (payer) => t('taxPayer', { payer }))}
              onChange={(payer) => set('taxPayer', TAX_PAYERS.find((value) => value === payer) ?? 'owner')}
            />
            <TextField
              label={t('noticeField')}
              inputId="lease-notice"
              value={values.noticeText}
              inputMode="numeric"
              className="figures"
              maxLength={3}
              error={invalid === 'notice' ? t('invalidNumber') : null}
              onChange={(text) => set('noticeText', text)}
            />
          </div>
        </details>
        <FormAlert
          message={error === null ? null : { invalid: t('errorInvalid'), notDraft: t('errorNotDraft'), document: t('errorDocument'), network: t('errorNetwork') }[error]}
          data-testid="form-error"
        />
        <FormActions>
          <Link href={rentalHref} className={buttonVariants({ variant: 'quiet' })}>
            {t('cancel')}
          </Link>
          <Button type="submit" variant="outline" disabled={pending} data-testid="save-lease">
            {pending ? t('saving') : t('saveDraft')}
          </Button>
          <Button type="button" disabled={pending} data-testid="activate-lease" onPointerEnter={() => void loadDialog()} onClick={() => save('activate')}>
            {t('activate')}
          </Button>
        </FormActions>
      </fieldset>
      {leaseId === null ? null : (
        <DeferredPopup
          dialog={activation}
          popup={ActivateLeaseDialog}
          props={{
            leaseId,
            blocked: blocked(),
            onDismiss: () => (activateOnOpen ? router.replace(leaseHref(leaseId)) : router.refresh()),
            onActivated: () => router.replace(leaseHref(leaseId)),
          }}
        />
      )}
    </form>
  );
}
