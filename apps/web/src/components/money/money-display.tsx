import { formatVnd, formatVndCompact, type Locale } from '@esta/core/format';
import type { Vnd } from '@esta/core/money';
import { useLocale } from 'next-intl';
import { cn } from '@/lib/utils';

export type MoneyVariant = 'full' | 'compact' | 'signed' | 'large';

const MINUS = '−';

const variants: Record<MoneyVariant, { format: (amount: Vnd, locale: Locale) => string; className: string }> = {
  full: { format: formatVnd, className: '' },
  compact: { format: formatVndCompact, className: '' },
  signed: {
    format: (amount, locale) => {
      const text = formatVnd(amount, locale).replace('-', MINUS);
      return amount > 0 ? `+${text}` : text;
    },
    className: '',
  },
  large: { format: formatVnd, className: 'text-title-1 font-semibold tracking-tight sm:text-figure-lg' },
};

export function MoneyDisplay({ amount, variant = 'full', className }: { amount: Vnd; variant?: MoneyVariant; className?: string }) {
  const locale = useLocale();
  const { format, className: variantClass } = variants[variant];
  const text = format(amount, locale);
  const exact = formatVnd(amount, locale);
  return (
    <data
      value={amount}
      data-variant={variant}
      title={variant === 'compact' ? exact : undefined}
      className={cn('inline-block text-end whitespace-nowrap num', amount === 0 && 'text-text-muted', variantClass, className)}
    >
      {variant === 'compact' ? (
        <>
          <span aria-hidden="true">{text}</span>
          <span className="sr-only">{exact}</span>
        </>
      ) : (
        text
      )}
    </data>
  );
}
