'use client';

import { parseVndInput } from '@esta/core/parse/vnd-input';
import {
  ACQUISITION_KINDS,
  LEGAL_STATUSES,
  PROPERTY_KINDS,
  USE_MODES,
  readKindDetails,
  suggestPropertyCode,
  type KindDetailKey,
} from '@esta/core/properties/form';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { createProperty, loadCommunes, updateProperty, type PropertyWrite } from '@/app/(app)/properties/actions';
import { DateInput } from '@/components/date-input';
import { Group, TextField } from '@/components/form-parts';
import { FieldMessage } from '@/components/field-message';
import { MoneyInput } from '@/components/money/money-input';
import { StatusShape } from '@/components/status-mark';
import { Button, buttonVariants } from '@/components/ui/button';
import { useHydrated } from '@/lib/use-hydrated';
import type { AdminUnitOption, CurrentUnitSuggestion } from '@/server/address/suggest';
import { AddressPicker, FormSelect } from './address-picker';
import { KindFields } from './kind-fields';
import type { PropertyFormValues } from './property-form-values';
import { LegacyAddressSuggest } from './legacy-address-suggest';

type Invalid = { field: 'nickname' | 'code' | 'commune' | 'price' } | { field: 'detail'; key: KindDetailKey };

type FormError = { kind: 'invalid' } | { kind: 'network' } | { kind: 'code_taken'; code: string; takenBy: string };

const CODE = /^[A-Z0-9]{1,8}$/;

/**
 * One form for create and edit. Each kind's fields come from `KIND_FIELDS`, the current address from the picker, and
 * the certificate address is kept exactly as typed; the server action parses everything again with `PropertyInput`.
 */
export function PropertyForm({
  propertyId,
  initial,
  provinces,
  initialCommunes,
  otherCodes,
  cancelHref,
}: {
  propertyId: string | null;
  initial: PropertyFormValues;
  provinces: readonly AdminUnitOption[];
  initialCommunes: readonly AdminUnitOption[];
  otherCodes: readonly string[];
  cancelHref: string;
}) {
  const t = useTranslations('propertyForm');
  const tp = useTranslations('properties');
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [codeEdited, setCodeEdited] = useState(propertyId !== null);
  const [invalid, setInvalid] = useState<Invalid | null>(null);
  const [error, setError] = useState<FormError | null>(null);
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const [communes, setCommunes] = useState<{ province: string | null; options: readonly AdminUnitOption[] }>({
    province: initial.address.provinceCode,
    options: initialCommunes,
  });
  const communeCache = useRef(new Map<string, readonly AdminUnitOption[]>());

  const set = <K extends keyof PropertyFormValues>(key: K, value: PropertyFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const code = codeEdited ? values.code : suggestPropertyCode(values.nickname, otherCodes);

  const chooseProvince = (provinceCode: string, commune: { code: string; name: string } | null = null) => {
    setValues((current) => ({
      ...current,
      address: { ...current.address, provinceCode, communeCode: commune?.code ?? null, communeName: commune?.name ?? '' },
    }));
    const cached = communeCache.current.get(provinceCode);
    if (cached !== undefined || communes.province === provinceCode) {
      setCommunes({ province: provinceCode, options: cached ?? communes.options });
      return;
    }
    setCommunes({ province: provinceCode, options: [] });
    loadCommunes(provinceCode)
      .then((options) => {
        communeCache.current.set(provinceCode, options);
        setCommunes((current) => (current.province === provinceCode ? { province: provinceCode, options } : current));
      })
      .catch(() => setError({ kind: 'network' }));
  };

  const pickSuggestion = (suggestion: CurrentUnitSuggestion) =>
    chooseProvince(suggestion.provinceCode, { code: suggestion.communeCode, name: suggestion.communeName });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const fail = (field: Invalid) => {
      setInvalid(field);
      setError({ kind: 'invalid' });
    };
    if (values.nickname.trim() === '') return fail({ field: 'nickname' });
    if (!CODE.test(code)) return fail({ field: 'code' });
    const details = readKindDetails(values.kind, values.kindTexts);
    if (!details.ok) return fail({ field: 'detail', key: details.reason });
    const { address } = values;
    if (address.provinceCode !== null && address.communeCode === null) return fail({ field: 'commune' });
    const price = values.priceText.trim() === '' ? null : parseVndInput(values.priceText);
    if (price !== null && !price.ok) return fail({ field: 'price' });
    setInvalid(null);

    const input = {
      nickname: values.nickname,
      code,
      kind: values.kind,
      kind_details: details.value,
      use_mode: values.useMode,
      legal_status: values.legalStatus,
      current_address:
        address.provinceCode === null || address.communeCode === null
          ? null
          : { house_no: address.houseNo, street: address.street, commune_code: address.communeCode, province_code: address.provinceCode },
      certificate_address_text: values.certificateAddress,
      acquired_on: values.acquiredOn,
      acquisition_kind: values.acquisitionKind,
      acquisition_price_vnd: price === null ? null : price.value,
      notes: values.notes,
    };
    startTransition(async () => {
      let result: PropertyWrite;
      try {
        result = propertyId === null ? await createProperty(input) : await updateProperty(propertyId, input);
      } catch {
        setError({ kind: 'network' });
        return;
      }
      if (result.ok) {
        router.push(`/properties/${result.id}`);
        return;
      }
      if (result.reason === 'code_taken') {
        setInvalid({ field: 'code' });
        setError({ kind: 'code_taken', code: result.code, takenBy: result.takenBy });
      } else setError({ kind: result.reason === 'invalid' ? 'invalid' : 'network' });
    });
  };

  const errorText =
    error === null
      ? null
      : error.kind === 'code_taken'
        ? t('errorCodeTaken', { code: error.code, nickname: error.takenBy })
        : error.kind === 'network'
          ? t('errorNetwork')
          : t('errorInvalid');

  return (
    <form noValidate onSubmit={submit} className="flex max-w-3xl flex-col gap-5" data-testid="property-form">
      {/* Controlled fields would drop whatever is typed before React hydrates, so nothing takes input until then. */}
      <fieldset disabled={!hydrated} className="flex min-w-0 flex-col gap-5">
        <Group
          title={t('groupBasics')}
          aside={
            hydrated ? null : (
              <p role="status" data-testid="form-loading" className="text-body text-ink-muted">
                {t('formLoading')}
              </p>
            )
          }
        >
          <TextField
            label={t('nickname')}
            hint={t('nicknameHint')}
            testId="nickname"
            value={values.nickname}
            maxLength={120}
            error={invalid?.field === 'nickname' ? t('nicknameRequired') : null}
            onChange={(text) => set('nickname', text)}
          />
          <FormSelect
            label={t('kind')}
            testId="kind-select"
            value={values.kind}
            options={PROPERTY_KINDS.map((kind) => ({ value: kind, label: tp('kind', { kind }) }))}
            onChange={(kind) => set('kind', PROPERTY_KINDS.find((option) => option === kind) ?? values.kind)}
          />
          <KindFields
            kind={values.kind}
            texts={values.kindTexts}
            invalid={invalid?.field === 'detail' ? invalid.key : null}
            onChange={(key, text) => set('kindTexts', { ...values.kindTexts, [key]: text })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect
              label={t('useMode')}
              value={values.useMode}
              options={USE_MODES.map((use) => ({ value: use, label: tp('use', { use }) }))}
              onChange={(use) => set('useMode', USE_MODES.find((option) => option === use) ?? values.useMode)}
            />
            <FormSelect
              label={t('legalStatus')}
              value={values.legalStatus}
              options={LEGAL_STATUSES.map((legal) => ({ value: legal, label: tp('legal', { legal }) }))}
              onChange={(legal) => set('legalStatus', LEGAL_STATUSES.find((option) => option === legal) ?? values.legalStatus)}
            />
          </div>
          <TextField
            label={t('code')}
            hint={t('codeHint')}
            testId="code"
            value={code}
            maxLength={8}
            className="max-w-48 uppercase figures"
            error={invalid?.field === 'code' ? (error?.kind === 'code_taken' ? t('errorCodeTaken', { code: error.code, nickname: error.takenBy }) : t('codeInvalid')) : null}
            onChange={(text) => {
              setCodeEdited(true);
              set('code', text.toUpperCase().replace(/[^A-Z0-9]/g, ''));
            }}
          />
        </Group>

        <Group title={t('groupAddress')}>
          <AddressPicker
            provinces={provinces}
            communes={communes.province === values.address.provinceCode ? communes.options : []}
            loadingCommunes={values.address.provinceCode !== null && communes.options.length === 0}
            value={values.address}
            communeInvalid={invalid?.field === 'commune'}
            onProvince={(provinceCode) => chooseProvince(provinceCode)}
            onChange={(address) => set('address', address)}
          />
          {invalid?.field === 'commune' ? <FieldMessage id="commune-required" error={t('communeRequired')} /> : null}
        </Group>

        <Group title={t('groupCertificate')}>
          <LegacyAddressSuggest
            value={values.certificateAddress}
            onChange={(text) => set('certificateAddress', text)}
            pickedCommune={values.address.communeCode}
            onPick={pickSuggestion}
          />
        </Group>

        <Group title={t('groupAcquisition')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <DateInput
              label={t('acquiredOn')}
              {...(values.acquiredOn === null ? {} : { defaultValue: values.acquiredOn })}
              onValueChange={(date) => set('acquiredOn', date)}
            />
            <FormSelect
              label={t('acquisitionKind')}
              value={values.acquisitionKind ?? ''}
              options={[{ value: '', label: t('acquisitionKindNone') }, ...ACQUISITION_KINDS.map((kind) => ({ value: kind, label: t('acquisitionKindOption', { kind }) }))]}
              onChange={(kind) => set('acquisitionKind', ACQUISITION_KINDS.find((option) => option === kind) ?? null)}
            />
          </div>
          <MoneyInput label={t('acquisitionPrice')} defaultText={values.priceText} onTextChange={(text) => set('priceText', text)} />
          <NotesField value={values.notes} onChange={(text) => set('notes', text)} label={t('notes')} />
        </Group>

        <div className="flex flex-col gap-3">
          {errorText === null ? null : (
            <p role="alert" data-testid="form-error" className="flex items-start gap-2 text-body text-overdue">
              <StatusShape status="overdue" className="mt-1 size-4" />
              <span className="wrap-anywhere">{errorText}</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={pending} data-testid="save-property">
              {pending ? t('saving') : propertyId === null ? t('save') : t('saveChanges')}
            </Button>
            <Link href={cancelHref} className={buttonVariants({ variant: 'outline' })}>
              {t('cancel')}
            </Link>
          </div>
        </div>
      </fieldset>
    </form>
  );
}

function NotesField({ label, value, onChange }: { label: string; value: string; onChange: (text: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body font-semibold text-ink">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        rows={3}
        maxLength={4000}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-touch w-full rounded-md border border-field bg-surface px-3.5 py-2.5 text-body text-ink hover:border-ink-muted disabled:cursor-not-allowed disabled:border-rule disabled:bg-surface-2 disabled:text-ink-muted"
      />
    </div>
  );
}
