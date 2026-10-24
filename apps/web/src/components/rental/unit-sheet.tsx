'use client';

import type { IsoDate } from '@esta/core/date';
import { MAX_AMOUNT_VND } from '@esta/core/money';
import { measureInputText, parseMeasureInput } from '@esta/core/parse/measure';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import { vndInputText } from '@esta/core/properties';
import { UNIT_KINDS, type Unit, type UnitKind } from '@esta/core/schemas/units';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveUnit } from '@/app/(app)/properties/[id]/rental/actions';
import { DateInput } from '@/components/date-input';
import { TextField } from '@/components/form-parts';
import { MoneyInput } from '@/components/money/money-input';
import { FormSelect } from '@/components/properties/address-picker';
import { FormSheet } from '@/components/form-sheet';
import { Button } from '@/components/ui/button';
import { useAction } from '@/components/use-action';
import type { PopupProps } from '@/components/use-deferred-dialog';
import { RentalFormError, type RentalFormErrorKind } from './rental-form-error';

type Invalid = 'label' | 'area' | 'rent' | null;

/** Five fields, so a sheet rather than a page (DESIGN-BRIEF §5.3). The whole unit keeps its kind, and `whole` is offered only when no other unit exists. */
export default function UnitSheet({
  propertyId,
  unit,
  otherUnits,
  open,
  onOpenChange,
  finalFocus,
  onDelete,
}: PopupProps & {
  propertyId: string;
  unit: Unit | null;
  otherUnits: number;
  /** `null` for a new unit and for the `whole` unit, which has no delete. */
  onDelete: ((unit: Unit) => void) | null;
}) {
  const t = useTranslations('propertyRental');
  const router = useRouter();
  const [label, setLabel] = useState(unit?.label ?? '');
  const [kind, setKind] = useState<UnitKind>(unit?.kind ?? 'room');
  const [area, setArea] = useState(unit === null || unit.area_m2 === null ? '' : measureInputText(unit.area_m2));
  const [rentText, setRentText] = useState(unit === null || unit.list_rent_vnd === null ? '' : vndInputText(unit.list_rent_vnd));
  const [availableFrom, setAvailableFrom] = useState<IsoDate | null>(unit?.available_from ?? null);
  const [invalid, setInvalid] = useState<Invalid>(null);
  const [error, setError] = useState<RentalFormErrorKind>(null);
  const { pending, run } = useAction();
  const kinds = unit?.kind === 'whole' ? (['whole'] as const) : UNIT_KINDS.filter((option) => option !== 'whole' || otherUnits === 0);

  const submit = () => {
    const areaValue = area.trim() === '' ? { ok: true as const, value: null } : parseMeasureInput(area, 'area');
    const rent = rentText.trim() === '' ? { ok: true as const, value: null } : parseVndInput(rentText);
    const rentOk = rent.ok && (rent.value === null || rent.value <= MAX_AMOUNT_VND);
    const wrong: Invalid = label.trim() === '' ? 'label' : !areaValue.ok ? 'area' : !rentOk ? 'rent' : null;
    setInvalid(wrong);
    if (wrong !== null || !areaValue.ok || !rent.ok) {
      setError('invalid');
      return;
    }
    setError(null);
    const value = { label, kind, area_m2: areaValue.value, list_rent_vnd: rent.value, available_from: availableFrom };
    run(
      () => saveUnit(propertyId, unit?.id ?? null, value),
      (result) => {
        if (result.ok) {
          router.refresh();
          onOpenChange(false);
          return;
        }
        setError(result.reason === 'failed' ? 'network' : result.reason);
      },
    );
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      finalFocus={finalFocus}
      testId="unit-sheet"
      title={unit === null ? t('unitSheetNew') : t('unitSheetEdit', { label: unit.label })}
      description={t('unitSheetBody')}
      labels={{ cancel: t('cancel'), submit: t('save'), pending: t('saving') }}
      submitTestId="save-unit"
      pending={pending}
      onSubmit={submit}
      error={<RentalFormError error={error} />}
      leading={
        unit === null || onDelete === null ? null : (
          <Button
            type="button"
            variant="quiet"
            data-testid="delete-unit"
            aria-label={t('deleteLabel', { label: unit.label })}
            className="text-overdue sm:mr-auto"
            onClick={() => {
              onDelete(unit);
              onOpenChange(false);
            }}
          >
            <Trash2 aria-hidden="true" />
            {t('delete')}
          </Button>
        )
      }
    >
      <TextField label={t('labelField')} hint={t('labelHint')} inputId="unit-label" value={label} maxLength={80} error={invalid === 'label' ? t('labelRequired') : null} onChange={setLabel} />
      <FormSelect
        label={t('kindField')}
        testId="unit-kind"
        value={kind}
        options={kinds.map((option) => ({ value: option, label: t('unitKind', { kind: option }) }))}
        onChange={(next) => setKind(UNIT_KINDS.find((option) => option === next) ?? 'room')}
      />
      <TextField
        label={t('areaField')}
        inputId="unit-area"
        value={area}
        maxLength={20}
        inputMode="decimal"
        className="figures"
        error={invalid === 'area' ? t('areaInvalid') : null}
        onChange={setArea}
      />
      <MoneyInput label={t('rentField')} defaultText={rentText} onTextChange={setRentText} />
      <DateInput label={t('availableField')} {...(availableFrom === null ? {} : { defaultValue: availableFrom })} onValueChange={setAvailableFrom} />
    </FormSheet>
  );
}
