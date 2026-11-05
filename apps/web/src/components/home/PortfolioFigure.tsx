import { formatDate } from '@esta/core/format';
import type { Portfolio } from '@esta/core/valuations';
import { useLocale, useTranslations } from 'next-intl';
import { EstimatePill } from '@/components/estimate-pill';
import { StatCard } from '@/components/stat-card';
import { CompactAmount } from './Amount';

export function PortfolioFigure({ portfolio }: { portfolio: Portfolio | null }) {
  const t = useTranslations('valuations');
  const th = useTranslations('home');
  const locale = useLocale();
  return (
    <StatCard
      testId="portfolio-figure"
      href="/properties"
      label={t('portfolioTitle')}
      badge={portfolio === null ? undefined : <EstimatePill label={t('estimate')} />}
      unknownLabel={th('unknownFigure')}
      value={
        portfolio === null ? null : (
          <span data-testid="portfolio-total" data-total-vnd={portfolio.totalVnd}>
            <CompactAmount amount={portfolio.totalVnd} />
          </span>
        )
      }
      sub={
        portfolio === null ? (
          <span data-testid="portfolio-basis">{th('portfolioNone')}</span>
        ) : (
          <>
            <span data-testid="portfolio-basis">{t('portfolioBasis', { date: formatDate(portfolio.oldestAsOf, locale) })}</span>
            {portfolio.unvaluedCount === 0 ? null : (
              <span data-testid="portfolio-missing" data-count={portfolio.unvaluedCount} className="mt-1 block font-medium text-text">
                {t('portfolioMissing', { count: portfolio.unvaluedCount })}
              </span>
            )}
          </>
        )
      }
    />
  );
}
