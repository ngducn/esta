import type { IsoDate } from '@esta/core/date';
import { formatBps, formatDate, formatVnd, formatVndCompact } from '@esta/core/format';
import type { Vnd } from '@esta/core/money';
import { grossYieldBp, latestValuation, valuationAge, type Valuation } from '@esta/core/valuations';
import { ExternalLink } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { EstimatePill } from '@/components/estimate-pill';
import { AddValuation, RemoveValuation } from './valuation-actions';
import type { ValuationScope } from './valuation-sheet';

type Props = {
  readonly valuations: readonly Valuation[];
  readonly today: IsoDate;
  readonly monthlyRentVnd: Vnd | null;
  readonly editScope: ValuationScope | null;
};

export async function ValuationBlock({ valuations, today, monthlyRentVnd, editScope }: Props) {
  const [t, locale] = await Promise.all([getTranslations('valuations'), getLocale()]);
  const latest = latestValuation(valuations, today);
  const age = latest === undefined ? null : valuationAge(latest.asOf, today);
  const yieldBp = latest === undefined || monthlyRentVnd === null ? null : grossYieldBp(monthlyRentVnd, latest.valueVnd);
  return (
    <section aria-labelledby="valuation-title" data-testid="valuation-block" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-xs lg:p-6">
      <h2 id="valuation-title" className="text-title-3 text-text">
        {t('title')}
      </h2>
      {latest === undefined || age === null ? (
        <div className="flex flex-col gap-1">
          <p className="text-body font-medium text-text">{t('empty')}</p>
          <p className="text-body text-text-secondary">{t('emptyBody')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span data-testid="valuation-latest" data-value-vnd={latest.valueVnd} className="num text-figure-lg font-semibold tracking-tight text-text">
              {formatVndCompact(latest.valueVnd, locale)}
            </span>
            <EstimatePill label={t('estimate')} />
          </p>
          <p data-testid="valuation-meta" className="text-body text-text-secondary">
            <span className="num">{t('dated', { date: formatDate(latest.asOf, locale) })}</span>, {t('method', { method: latest.method })},{' '}
            <span data-testid="valuation-age" data-months={age.months}>
              {t('age', age)}
            </span>
          </p>
          {latest.sourceUrl === null ? null : (
            <a href={latest.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-touch w-fit items-center gap-1.5 text-body font-medium text-text underline underline-offset-4">
              {t('source')}
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          )}
          {yieldBp === null ? null : (
            <p data-testid="valuation-yield" data-yield-bp={yieldBp} className="text-body text-text">
              {t('yield', { rate: formatBps(yieldBp, locale), date: formatDate(latest.asOf, locale) })}
            </p>
          )}
        </div>
      )}
      {valuations.length === 0 ? null : (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-body font-medium text-text">{t('history')}</h3>
          <ul data-testid="valuation-history" className="flex flex-col">
            {valuations.map((valuation) => {
              const amount = formatVndCompact(valuation.valueVnd, locale);
              const date = formatDate(valuation.asOf, locale);
              return (
                <li key={valuation.id} data-valuation={valuation.id} className="flex flex-wrap items-center justify-between gap-x-3 border-t border-border py-2 first:border-t-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="num text-body font-medium text-text">{formatVnd(valuation.valueVnd, locale)}</span>
                    <span className="text-body-sm text-text-secondary">
                      <span className="num">{date}</span>, {t('method', { method: valuation.method })}
                    </span>
                  </span>
                  {editScope === null ? null : (
                    <RemoveValuation
                      valuation={valuation}
                      labels={{
                        delete: t('delete'),
                        deleteLabel: t('deleteLabel', { amount, date }),
                        deleted: t('deleted', { amount }),
                        restored: t('restored', { amount }),
                        failed: t('deleteFailed'),
                        undoFailed: t('undoFailed'),
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {editScope === null ? null : <AddValuation label={t('add')} scope={editScope} />}
    </section>
  );
}
