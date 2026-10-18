'use client';

import { BILLING_CYCLES, PERIOD_ANCHORS, PRORATIONS, TAX_PAYERS, UTILITIES_MODES, activationRefusals, type ActivationRefusal, type LeaseFormDefaults } from '@esta/core/lease';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { lazy, Suspense, useState, useTransition, type FormEvent } from 'react';
import { saveLease } from '@/server/actions/leases';
import type { Tenant } from '@/server/leases/load';
import { DateInput } from '@/components/date-input';
import { Group, TextField } from '@/components/form-parts';
import { MoneyInput } from '@/components/money/money-input';
import { FormSelect } from '@/components/properties/address-picker';
import { Button, buttonVariants } from '@/components/ui/button';
import { useNoticeToast } from '@/components/undo-toast';
import { useHydrated } from '@/lib/use-hydrated';
import { defaultsToValues, readDraft, type Invalid, type LeaseFormValues } from './lease-form-values';
import { TenantQuickAdd } from './TenantQuickAdd';

const loadDialog = () => import('./ActivateLeaseDialog');
const ActivateLeaseDialog = lazy(loadDialog);

type FormError = 'invalid' | 'notDraft' | 'network' | null;

export type LeaseFormUnit = { readonly id: string; readonly label: string; readonly defaults: LeaseFormDefaults };

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
}: {
  propertyId: string;
  leaseId: string | null;
  initial: LeaseFormValues;
  units: readonly LeaseFormUnit[];
  tenants: readonly Tenant[];
  activateOnOpen: boolean;
}) {
  const t = useTranslations('leases');
  const router = useRouter();
  const notice = useNoticeToast();
  const hydrated = useHydrated();
  const [values, setValues] = useState(initial);
  const [tenants, setTenants] = useState(initialTenants);
  const [invalid, setInvalid] = useState<Invalid>(null);
  const [error, setError] = useState<FormError>(null);
  const [activating, setActivating] = useState(activateOnOpen && leaseId !== null);
  const [more, setMore] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof LeaseFormValues>(key: K, value: LeaseFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const rentalHref = `/properties/${propertyId}/rental`;
  const leaseHref = (id: string) => `${rentalHref}/leases/${id}`;

  const chooseUnit = (unitId: string) => {
    const unit = units.find((candidate) => candidate.id === unitId);
    if (unit === undefined) return;
    setValues((current) => (leaseId === null ? defaultsToValues({ ...current, unitId }, unit.defaults) : { ...current, unitId }));
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
    startTransition(async () => {
      const result = await saveLease(propertyId, leaseId, draft.value).catch(() => ({ ok: false, reason: 'failed' }) as const);
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
      if (then === 'activate') void loadDialog().then(() => setActivating(true));
      else notice(t('savedDraft'));
    });
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
        <Group title={t('groupTenant')}>
          <FormSelect
            label={t('unitField')}
            testId="lease-unit"
            selectId="lease-unit"
            value={values.unitId}
            options={units.map((unit) => ({ value: unit.id, label: unit.label }))}
            onChange={chooseUnit}
          />
          <FormSelect
            label={t('tenantField')}
            testId="lease-tenant"
            selectId="lease-tenant"
            value={values.tenantId}
            placeholder={t('tenantPlaceholder')}
            options={tenants.map((tenant) => ({ value: tenant.id, label: tenant.phone === null ? tenant.fullName : `${tenant.fullName} · ${tenant.phone}` }))}
            onChange={(tenantId) => set('tenantId', tenantId)}
          />
          <TenantQuickAdd
            onAdded={(tenant) => {
              setTenants((current) => [...current, tenant].toSorted((a, b) => a.fullName.localeCompare(b.fullName, 'vi')));
              set('tenantId', tenant.id);
            }}
          />
        </Group>
        <Group title={t('groupTerm')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <DateInput label={t('startField')} {...(values.start === null ? {} : { defaultValue: values.start })} onValueChange={(start) => set('start', start)} />
            <div className="flex flex-col gap-1">
              <DateInput label={t('endField')} {...(values.end === null ? {} : { defaultValue: values.end })} onValueChange={(end) => set('end', end)} />
              <p className="text-small text-ink-muted">{invalid === 'end' ? null : t('endHint')}</p>
              {invalid === 'end' ? (
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
              {invalid === 'rentZero' ? (
                <p role="alert" data-testid="rent-zero" className="text-small text-overdue">
                  {t('rentZero')}
                </p>
              ) : null}
            </div>
            <MoneyInput key={`deposit-${values.unitId}`} label={t('depositField')} defaultText={values.depositText} onTextChange={(text) => set('depositText', text)} />
            <FormSelect
              label={t('cycleField')}
              testId="lease-cycle"
              selectId="lease-cycle"
              value={String(values.cycle)}
              options={option(BILLING_CYCLES, (months) => t('cycle', { months }))}
              onChange={(cycle) => set('cycle', BILLING_CYCLES.find((months) => String(months) === cycle) ?? 1)}
            />
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
              <span className="text-lead font-bold text-ink">{t('groupMore')}</span>
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
        {error === null ? null : (
          <p role="alert" data-testid="form-error" className="text-body text-overdue">
            {{ invalid: t('errorInvalid'), notDraft: t('errorNotDraft'), network: t('errorNetwork') }[error]}
          </p>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link href={rentalHref} className={buttonVariants({ variant: 'quiet' })}>
            {t('cancel')}
          </Link>
          <Button type="submit" variant="outline" disabled={pending} data-testid="save-lease">
            {pending ? t('saving') : t('saveDraft')}
          </Button>
          <Button type="button" disabled={pending} data-testid="activate-lease" onPointerEnter={() => void loadDialog()} onClick={() => save('activate')}>
            {t('activate')}
          </Button>
        </div>
      </fieldset>
      {activating && leaseId !== null ? (
        <Suspense fallback={null}>
          <ActivateLeaseDialog
            leaseId={leaseId}
            blocked={blocked()}
            onClose={() => {
              setActivating(false);
              if (activateOnOpen) router.replace(leaseHref(leaseId));
              else router.refresh();
            }}
            onActivated={() => router.replace(leaseHref(leaseId))}
          />
        </Suspense>
      ) : null}
    </form>
  );
}
