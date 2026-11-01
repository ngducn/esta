import { formatDate, formatVndCompact } from '@esta/core/format';
import type { Portfolio } from '@esta/core/valuations';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { EstimatePill } from '@/components/estimate-pill';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';

export function PortfolioFigure({ portfolio }: { portfolio: Portfolio | null }) {
  const t = useTranslations('valuations');
  const locale = useLocale();
  if (portfolio === null) return null;
  return (
    <section aria-labelledby="portfolio-title" data-testid="portfolio-figure" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="portfolio-title" className="text-title-3 text-text">
          {t('portfolioTitle')}
        </h2>
        <Link href="/properties" className={cn(buttonVariants({ variant: 'ghost' }), 'px-0')}>
          {t('portfolioOpen')}
        </Link>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span data-testid="portfolio-total" data-total-vnd={portfolio.totalVnd} className="num text-figure-lg font-semibold tracking-tight whitespace-nowrap text-text">
          {formatVndCompact(portfolio.totalVnd, locale)}
        </span>
        <EstimatePill label={t('estimate')} />
      </p>
      <p data-testid="portfolio-basis" className="text-body text-text-secondary">
        {t('portfolioBasis', { date: formatDate(portfolio.oldestAsOf, locale) })}
      </p>
      {portfolio.unvaluedCount === 0 ? null : (
        <p data-testid="portfolio-missing" data-count={portfolio.unvaluedCount} className="text-body text-text">
          {t('portfolioMissing', { count: portfolio.unvaluedCount })}
        </p>
      )}
    </section>
  );
}
