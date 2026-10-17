'use client';

import type { IsoDate } from '@esta/core/date';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import { vndInputText } from '@esta/core/properties';
import { parseAreaInput } from '@esta/core/properties/area';
import { UNIT_KINDS, type Unit, type UnitKind } from '@esta/core/schemas/units';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { saveUnit } from '@/app/(app)/properties/[id]/rental/actions';
import { DateInput } from '@/components/date-input';
import { TextField } from '@/components/form-parts';
import { MoneyInput } from '@/components/money/money-input';
import { FormSelect } from '@/components/properties/address-picker';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { RentalFormError, type RentalFormErrorKind } from './rental-form-error';

type Invalid = 'label' | 'area' | 'rent' | null;

/** Five fields, so a sheet rather than a page (DESIGN-BRIEF §5.3). `whole` is offered only when no other unit exists. */
export default function UnitSheet({
  propertyId,
  unit,
  otherUnits,
  onClose,
  onDelete,
}: {
  propertyId: string;
  unit: Unit | null;
  otherUnits: number;
  onClose: () => void;
  /** `null` for a new unit and for the `whole` unit, which has no delete. */
  onDelete: ((unit: Unit) => void) | null;
}) {
  const t = useTranslations('propertyRental');
  const router = useRouter();
  const [label, setLabel] = useState(unit?.label ?? '');
  const [kind, setKind] = useState<UnitKind>(unit?.kind ?? 'room');
  const [area, setArea] = useState(unit?.area_m2 === null || unit === null ? '' : String(unit.area_m2).replace('.', ','));
  const [rentText, setRentText] = useState(unit?.list_rent_vnd === null || unit === null ? '' : vndInputText(unit.list_rent_vnd));
  const [availableFrom, setAvailableFrom] = useState<IsoDate | null>(unit?.available_from ?? null);
  const [invalid, setInvalid] = useState<Invalid>(null);
  const [error, setError] = useState<RentalFormErrorKind>(null);
  const [pending, startTransition] = useTransition();
  const kinds = UNIT_KINDS.filter((option) => option !== 'whole' || otherUnits === 0 || unit?.kind === 'whole');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const areaValue = area.trim() === '' ? { ok: true as const, value: null } : parseAreaInput(area);
    const rent = rentText.trim() === '' ? { ok: true as const, value: null } : parseVndInput(rentText);
    const wrong: Invalid = label.trim() === '' ? 'label' : !areaValue.ok ? 'area' : !rent.ok ? 'rent' : null;
    setInvalid(wrong);
    if (wrong !== null || !areaValue.ok || !rent.ok) {
      setError('invalid');
      return;
    }
    setError(null);
    startTransition(async () => {
      const value = { label, kind, area_m2: areaValue.value, list_rent_vnd: rent.value, available_from: availableFrom };
      const result = await saveUnit(propertyId, unit?.id ?? null, value).catch(() => ({ ok: false, reason: 'failed' }) as const);
      if (result.ok) {
        router.refresh();
        onClose();
        return;
      }
      setError(result.reason === 'failed' ? 'network' : result.reason);
    });
  };

  return (
    <Sheet open onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent data-testid="unit-sheet">
        <div className="flex flex-col gap-1">
          <SheetTitle>{unit === null ? t('unitSheetNew') : t('unitSheetEdit', { label: unit.label })}</SheetTitle>
          <SheetDescription>{t('unitSheetBody')}</SheetDescription>
        </div>
        <form noValidate onSubmit={submit} className="flex flex-col gap-5">
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
          <RentalFormError error={error} />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {unit === null || onDelete === null ? null : (
              <Button
                type="button"
                variant="quiet"
                data-testid="delete-unit"
                aria-label={t('deleteLabel', { label: unit.label })}
                className="text-overdue sm:mr-auto"
                onClick={() => {
                  onDelete(unit);
                  onClose();
                }}
              >
                <Trash2 aria-hidden="true" />
                {t('delete')}
              </Button>
            )}
            <SheetClose render={<Button type="button" variant="outline" />}>{t('cancel')}</SheetClose>
            <Button type="submit" disabled={pending} data-testid="save-unit">
              {pending ? t('saving') : t('save')}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
