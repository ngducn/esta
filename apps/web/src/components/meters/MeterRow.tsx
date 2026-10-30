'use client';

import type { IsoDate } from '@esta/core/date';
import { formatMonthWithin } from '@esta/core/format';
import { consumption, unusualUse } from '@esta/core/meters';
import { parseReadingInput } from '@esta/core/parse/measure';
import { Droplet, Zap } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { KeyboardEvent } from 'react';
import { StatusShape } from '@/components/status-shape';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { MeterView } from '@/server/meters/load';

/** What a typed reading means beside the one before it: nothing yet, a refusal, or the month's use. */
export type ReadingCheck = { kind: 'empty' } | { kind: 'error'; message: string } | { kind: 'ok'; reading: number; used: number | null };

export function useReadingCheck(): (meter: MeterView, text: string) => ReadingCheck {
  const t = useTranslations('meters');
  return (meter, text) => {
    const parsed = parseReadingInput(text);
    if (!parsed.ok) return parsed.reason === 'empty' ? { kind: 'empty' } : { kind: 'error', message: t('notNumber') };
    if (meter.previous === null) return { kind: 'ok', reading: parsed.value, used: null };
    const used = consumption(meter.previous.reading, parsed.value);
    return used.ok ? { kind: 'ok', reading: parsed.value, used: used.value } : { kind: 'error', message: t('belowPrevious', { reading: meter.previous.reading }) };
  };
}

/**
 * One meter of a room: the previous reading beside a numeric input, and below it the month's use, a refusal or the 3×
 * warning. `rooms` is what the property's other meters of this kind use this month, for a meter with no history yet.
 */
export function MeterRow({
  meter,
  month,
  roomId,
  value,
  check,
  rooms,
  canEdit,
  onChange,
  onEnter,
}: {
  meter: MeterView;
  month: IsoDate;
  roomId: string;
  value: string;
  check: ReadingCheck;
  rooms: readonly number[];
  canEdit: boolean;
  onChange: (text: string) => void;
  onEnter: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const t = useTranslations('meters');
  const locale = useLocale();
  const id = `meter-${meter.id}`;
  const Icon = meter.kind === 'electricity' ? Zap : Droplet;
  const unusual = check.kind === 'ok' && check.used !== null ? unusualUse(meter.history, rooms, check.used) : null;
  return (
    <div data-testid="meter-row" data-kind={meter.kind} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
      <label id={`${id}-label`} htmlFor={id} className="col-span-2 flex items-center gap-2 text-body font-medium text-ink lg:sr-only">
        <Icon aria-hidden="true" className="size-5 text-ink-muted" strokeWidth={1.75} />
        {t('kind', { kind: meter.kind })}
      </label>
      <Input
        id={id}
        data-testid="meter-input"
        data-meter-input=""
        value={value}
        inputMode="numeric"
        enterKeyHint="next"
        autoComplete="off"
        readOnly={!canEdit}
        aria-labelledby={`${roomId} ${id}-label`}
        aria-invalid={check.kind === 'error'}
        aria-describedby={`${id}-previous ${id}-message`}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onEnter}
        className={cn('figures w-32 text-right text-lead', canEdit ? null : 'border-rule bg-surface-2')}
      />
      <div className="min-w-0 text-small">
        <p id={`${id}-previous`} data-testid="meter-previous" className="figures text-ink-muted">
          {meter.previous === null ? t('firstReading') : t('previous', { month: formatMonthWithin(meter.previous.month, month, locale), reading: meter.previous.reading })}
        </p>
        <p id={`${id}-message`} data-testid="meter-message" aria-live="polite" className="flex min-h-6 items-start gap-1.5">
          {check.kind === 'error' ? (
            <>
              <StatusShape status="overdue" className="mt-0.5 size-4" />
              <span className="min-w-0 text-overdue">{check.message}</span>
            </>
          ) : unusual !== null ? (
            <>
              <StatusShape status="due" className="mt-0.5 size-4" />
              <span data-testid="meter-anomaly" className="min-w-0 font-medium text-due">
                {t('anomaly', { usual: unusual.usual, kind: meter.kind, basis: unusual.basis })}
              </span>
            </>
          ) : check.kind === 'ok' ? (
            <span className="figures text-ink-2">{check.used === null ? null : t('used', { used: check.used, kind: meter.kind })}</span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
