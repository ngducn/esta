'use client';

import { formatDate, formatVnd, type Locale } from '@esta/core/format';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { StatementLine } from '@/lib/statements/lines';

/** A held line's only hand transfer is the likely match ([app rule] DOMAIN-VN §9); among several, a person chooses. */
export function preselected(line: StatementLine): string | undefined {
  return line.hands.length === 1 ? line.hands[0]?.paymentId : undefined;
}

/**
 * A held line's hand transfers of its amount to choose from, each with its date and the bills it went to, and
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
              {t('handOption', { amount: formatVnd(hand.amount, locale), date: formatDate(hand.receivedOn, locale), bills: hand.bills.join(', ') })}
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
