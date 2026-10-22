import { formatDate, formatVndCompact } from '@esta/core/format';
import type { Portfolio } from '@esta/core/valuations';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { EstimatePill } from '@/components/estimate-pill';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';

/**
 * FIN-5 on Home: the sum of each property's latest valuation, always an estimate, with the date it is only as fresh as
 * and how many properties have none. Nothing shows until one property has a valuation.
 */
export function PortfolioFigure({ portfolio }: { portfolio: Portfolio | null }) {
  const t = useTranslations('valuations');
  const locale = useLocale();
  if (portfolio === null) return null;
  return (
    <section aria-labelledby="portfolio-title" data-testid="portfolio-figure" className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="portfolio-title" className="text-h3 text-ink">
          {t('portfolioTitle')}
        </h2>
        <Link href="/properties" className={cn(buttonVariants({ variant: 'quiet' }), 'px-0')}>
          {t('portfolioOpen')}
        </Link>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span data-testid="portfolio-total" data-total-vnd={portfolio.totalVnd} className="figures text-hero font-bold tracking-tight whitespace-nowrap text-ink">
          {formatVndCompact(portfolio.totalVnd, locale)}
        </span>
        <EstimatePill label={t('estimate')} />
      </p>
      <p data-testid="portfolio-basis" className="text-body text-ink-2">
        {t('portfolioBasis', { date: formatDate(portfolio.oldestAsOf, locale) })}
      </p>
      {portfolio.unvaluedCount === 0 ? null : (
        <p data-testid="portfolio-missing" data-count={portfolio.unvaluedCount} className="text-body text-ink">
          {t('portfolioMissing', { count: portfolio.unvaluedCount })}
        </p>
      )}
    </section>
  );
}
