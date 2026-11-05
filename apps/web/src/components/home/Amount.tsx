import { formatVnd, formatVndCompact } from '@esta/core/format';
import type { Vnd } from '@esta/core/money';
import { useLocale } from 'next-intl';

/** The compact form a summary uses, with the exact amount in the tooltip. */
export function CompactAmount({ amount }: { amount: Vnd }) {
  const locale = useLocale();
  return (
    <span title={formatVnd(amount, locale)} className="num">
      {formatVndCompact(amount, locale)}
    </span>
  );
}
