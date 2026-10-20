'use client';

import { formatDate, formatVnd, type Locale } from '@esta/core/format';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { StatementLine } from '@/lib/statements/lines';

/** The one hand transfer of the line's amount, when exactly one has it, is the likely match ([app rule] DOMAIN-VN §9). */
export function preselected(line: StatementLine): string | undefined {
  const same = line.hands.filter((hand) => hand.amount === line.amount);
  return same.length === 1 ? same[0]?.paymentId : undefined;
}

/**
 * A held line's hand transfers to choose from, each with its amount beside the line's when they differ, and
 * `Đã ghi tay`, which links the line to the one chosen and adds no money.
 */
export function HeldChoices({
  line,
  pick,
  onPick,
  onLink,
  disabled,
}: {
  line: StatementLine;
  pick: string | undefined;
  onPick: (paymentId: string) => void;
  onLink: () => void;
  disabled: boolean;
}) {
  const t = useTranslations('statements');
  const locale = useLocale() as Locale;
  return (
    <fieldset data-testid="statement-hands" className="mt-1 flex flex-col gap-1">
      <legend className="sr-only">{t('handLegend', { line: line.index })}</legend>
      {line.hands.map((hand) => {
        const values = { amount: formatVnd(hand.amount, locale), date: formatDate(hand.receivedOn, locale), bills: hand.bills.join(', ') };
        return (
          <label key={hand.paymentId} className="flex min-h-touch items-center gap-3 text-small text-ink">
            <input
              type="radio"
              name={`hand-${line.id}`}
              value={hand.paymentId}
              checked={pick === hand.paymentId}
              disabled={disabled}
              onChange={() => onPick(hand.paymentId)}
              className="size-5 shrink-0 accent-ink"
            />
            <span className="figures min-w-0 break-words">
              {hand.amount === line.amount ? t('handOption', values) : t('handOptionOther', { ...values, line: formatVnd(line.amount, locale) })}
            </span>
          </label>
        );
      })}
      <Button type="button" variant="outline" disabled={disabled || pick === undefined} onClick={onLink} data-testid="statement-link" className="mt-1 w-fit">
        {t('linkByHand')}
      </Button>
    </fieldset>
  );
}
