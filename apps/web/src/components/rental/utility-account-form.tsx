'use client';

import { UTILITY_KINDS, type UtilityAccount, type UtilityKind } from '@esta/core/schemas/units';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { saveAccount } from '@/app/(app)/properties/[id]/rental/actions';
import { useFocusAnchor } from '@/components/completeness/use-focus-anchor';
import { Group, TextField } from '@/components/form-parts';
import { FormSelect } from '@/components/properties/address-picker';
import { Button, buttonVariants } from '@/components/ui/button';
import { useHydrated } from '@/lib/use-hydrated';
import { RentalFormError, type RentalFormErrorKind } from './rental-form-error';

/** Controlled fields would drop what is typed before React hydrates, so nothing takes input until then. */
export function UtilityAccountForm({
  propertyId,
  accountId,
  initial,
  units,
}: {
  propertyId: string;
  accountId: string | null;
  initial: UtilityAccount | null;
  units: readonly { id: string; label: string }[];
}) {
  const t = useTranslations('propertyRental');
  const router = useRouter();
  const hydrated = useHydrated();
  useFocusAnchor(hydrated);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<RentalFormErrorKind>(null);
  const [values, setValues] = useState({
    kind: initial?.kind ?? ('electricity' as UtilityKind),
    provider: initial?.provider ?? '',
    customerCode: initial?.customer_code ?? '',
    holderName: initial?.holder_name ?? '',
    unitId: initial?.unit_id ?? '',
    note: initial?.note ?? '',
  });
  const set = (key: keyof typeof values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  const tabHref = `/properties/${propertyId}/rental`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const value = {
      kind: values.kind,
      provider: values.provider,
      customer_code: values.customerCode,
      holder_name: values.holderName,
      unit_id: values.unitId === '' ? null : values.unitId,
      note: values.note,
    };
    startTransition(async () => {
      const result = await saveAccount(propertyId, accountId, value).catch(() => ({ ok: false, reason: 'failed' }) as const);
      if (result.ok) {
        router.push(tabHref);
        return;
      }
      setError(result.reason === 'failed' ? 'network' : result.reason);
    });
  };

  return (
    <form noValidate onSubmit={submit} className="flex max-w-3xl flex-col gap-5" data-testid="account-form">
      <fieldset disabled={!hydrated} className="flex min-w-0 flex-col gap-5">
        {hydrated ? null : (
          <p role="status" data-testid="form-loading" className="text-body text-ink-muted">
            {t('formLoading')}
          </p>
        )}
        <Group title={t('groupAccount')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect
              label={t('kindField')}
              testId="account-kind"
              selectId="account-kind"
              value={values.kind}
              options={UTILITY_KINDS.map((kind) => ({ value: kind, label: t('utilityKind', { kind }) }))}
              onChange={(next) => set('kind')(UTILITY_KINDS.find((kind) => kind === next) ?? 'other')}
            />
            <FormSelect
              label={t('unitField')}
              testId="account-unit"
              value={values.unitId}
              options={[{ value: '', label: t('wholeProperty') }, ...units.map((unit) => ({ value: unit.id, label: unit.label }))]}
              onChange={set('unitId')}
            />
          </div>
          <TextField label={t('providerField')} hint={t('providerHint')} inputId="account-provider" value={values.provider} maxLength={120} error={null} onChange={set('provider')} />
          <TextField
            label={t('codeField')}
            hint={t('codeHint')}
            inputId="account-code"
            value={values.customerCode}
            maxLength={40}
            className="figures"
            error={null}
            onChange={set('customerCode')}
          />
          <TextField label={t('holderField')} inputId="account-holder" value={values.holderName} maxLength={200} error={null} onChange={set('holderName')} />
          <TextField label={t('noteField')} inputId="account-note" value={values.note} maxLength={1000} error={null} onChange={set('note')} />
        </Group>
        <div className="flex flex-col gap-3">
          <RentalFormError error={error} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={pending} data-testid="save-account">
              {pending ? t('saving') : t('save')}
            </Button>
            <Link href={tabHref} className={buttonVariants({ variant: 'outline' })}>
              {t('cancel')}
            </Link>
          </div>
        </div>
      </fieldset>
    </form>
  );
}
