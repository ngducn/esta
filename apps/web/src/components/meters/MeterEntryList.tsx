'use client';

import type { IsoDate } from '@esta/core/date';
import { formatDate } from '@esta/core/format';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent, type KeyboardEvent } from 'react';
import { FieldMessage } from '@/components/field-message';
import { Button } from '@/components/ui/button';
import { useNoticeToast } from '@/components/undo-toast';
import { saveReadings, type MeterActionRefusal } from '@/server/actions/meters';
import type { MeterRoom } from '@/server/meters/load';
import { MeterRow, useReadingCheck } from './MeterRow';

const KINDS = ['electricity', 'water'] as const;

const ERRORS = {
  belowPrevious: 'errorBelowPrevious',
  aboveNext: 'errorAboveNext',
  useTooLarge: 'errorTooLarge',
  correctionTooLarge: 'errorCorrectionTooLarge',
  monthAfterToday: 'errorMonth',
  notFound: 'errorNetwork',
  failed: 'errorNetwork',
} as const satisfies Record<MeterActionRefusal, string>;

/** Enter moves to the next reading, so a whole rooming house goes in on the numeric keypad; the last one saves. */
function nextOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const inputs = [...(event.currentTarget.form?.querySelectorAll<HTMLInputElement>('[data-meter-input]') ?? [])];
  const next = inputs[inputs.indexOf(event.currentTarget) + 1];
  if (next === undefined) event.currentTarget.form?.requestSubmit();
  else next.focus();
}

/** LSE-4: every room of a rooming house on one screen, one row per room on a desktop, saved together. */
export function MeterEntryList({ propertyId, month, monthLabel, rooms, canEdit }: { propertyId: string; month: IsoDate; monthLabel: string; rooms: readonly MeterRoom[]; canEdit: boolean }) {
  const t = useTranslations('meters');
  const locale = useLocale();
  const router = useRouter();
  const notice = useNoticeToast();
  const check = useReadingCheck();
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Readonly<Record<string, string>>>(() =>
    Object.fromEntries(rooms.flatMap((room) => room.meters.map((meter) => [meter.id, meter.stored === null ? '' : String(meter.stored.reading)]))),
  );
  const meters = rooms.flatMap((room) => room.meters);
  const checks = new Map(meters.map((meter) => [meter.id, check(meter, values[meter.id] ?? '')]));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if ([...checks.values()].some((result) => result.kind === 'error')) {
      setError(t('fixFirst'));
      event.currentTarget.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setError(null);
    const readings = meters.flatMap((meter) => {
      const result = checks.get(meter.id);
      return result?.kind === 'ok' && result.reading !== meter.stored?.reading ? [{ meter_id: meter.id, reading: result.reading }] : [];
    });
    if (readings.length === 0) {
      notice(t('nothingChanged'));
      return;
    }
    startSaving(async () => {
      const result = await saveReadings({ property_id: propertyId, reading_month: month, readings }).catch(() => ({ ok: false, reason: 'failed' }) as const);
      if (!result.ok) {
        setError(t(ERRORS[result.reason]));
        return;
      }
      const { issued, unbilled } = result.value;
      notice(unbilled === 0 ? t('saved', { month: monthLabel, issued }) : `${t('saved', { month: monthLabel, issued })} ${t('unbilled', { count: unbilled })}`);
      router.refresh();
    });
  };

  return (
    <form noValidate onSubmit={submit} data-testid="meter-form" className="flex flex-col gap-4">
      <div className="rounded-lg border border-rule bg-surface shadow-card">
        <div aria-hidden="true" className="hidden border-b border-rule px-6 py-3 text-small font-medium text-ink-muted lg:grid lg:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)] lg:gap-6">
          <span>{t('roomColumn')}</span>
          {KINDS.map((kind) => (
            <span key={kind}>{t('kind', { kind })}</span>
          ))}
        </div>
        {rooms.map((room) => {
          const readOn = room.meters
            .flatMap((meter) => (meter.stored === null ? [] : [meter.stored.readOn]))
            .toSorted()
            .at(-1);
          return (
            <section
              key={room.unitId}
              aria-labelledby={`room-${room.unitId}`}
              data-testid="meter-room"
              className="grid gap-4 border-b border-rule px-4 py-4 last:border-b-0 sm:px-6 lg:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-6 lg:py-3"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 lg:flex-col lg:gap-0">
                <h2 id={`room-${room.unitId}`} className="text-lead font-semibold break-words text-ink">
                  {room.label}
                </h2>
                {readOn === undefined ? null : (
                  <p data-testid="meter-read-on" className="figures text-small text-ink-muted">
                    {t('readOn', { date: formatDate(readOn, locale) })}
                  </p>
                )}
              </div>
              {KINDS.map((kind) => {
                const meter = room.meters.find((candidate) => candidate.kind === kind);
                return meter === undefined ? (
                  <p key={kind} className="hidden text-small text-ink-muted lg:block">
                    {t('noMeter')}
                  </p>
                ) : (
                  <MeterRow
                    key={meter.id}
                    meter={meter}
                    month={month}
                    roomId={`room-${room.unitId}`}
                    value={values[meter.id] ?? ''}
                    check={checks.get(meter.id) ?? { kind: 'empty' }}
                    canEdit={canEdit}
                    onChange={(text) => setValues((current) => ({ ...current, [meter.id]: text }))}
                    onEnter={nextOnEnter}
                  />
                );
              })}
            </section>
          );
        })}
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <Button type="submit" disabled={saving} data-testid="meter-save">
            {saving ? t('saving') : t('save')}
          </Button>
          <FieldMessage id="meter-form-error" error={error} />
        </div>
      ) : null}
    </form>
  );
}
