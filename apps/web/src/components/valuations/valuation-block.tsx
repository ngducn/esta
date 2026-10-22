import type { IsoDate } from '@esta/core/date';
import { formatBps, formatDate, formatVnd, formatVndCompact } from '@esta/core/format';
import { vnd, type Vnd } from '@esta/core/money';
import { grossYieldBp, latestValuation, valuationAge, type Valuation } from '@esta/core/valuations';
import { ExternalLink } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { EstimatePill } from '@/components/estimate-pill';
import { AddValuation, RemoveValuation } from './valuation-actions';
import type { ValuationScope } from './valuation-sheet';

type Props = {
  readonly valuations: readonly Valuation[];
  readonly today: IsoDate;
  /** The rent owed a month under the leases in effect today; `null` when none is, which shows no yield. */
  readonly monthlyRentVnd: Vnd | null;
  /** What `Thêm định giá` needs; `null` for a viewer, who records nothing. */
  readonly scope: ValuationScope | null;
};

/**
 * FIN-5 on the property's Tổng quan tab: the latest valuation as an estimate with its date, method, age and source,
 * the gross yield it implies, and every valuation recorded.
 */
export async function ValuationBlock({ valuations, today, monthlyRentVnd, scope }: Props) {
  const [t, locale] = await Promise.all([getTranslations('valuations'), getLocale()]);
  const latest = latestValuation(valuations, today);
  const age = latest === undefined ? null : valuationAge(latest.asOf, today);
  const yieldBp = latest === undefined || monthlyRentVnd === null ? null : grossYieldBp(vnd(monthlyRentVnd * 12), latest.valueVnd);
  return (
    <section aria-labelledby="valuation-title" data-testid="valuation-block" className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card lg:p-6">
      <h2 id="valuation-title" className="text-h3 text-ink">
        {t('title')}
      </h2>
      {latest === undefined || age === null ? (
        <div className="flex flex-col gap-1">
          <p className="text-body font-semibold text-ink">{t('empty')}</p>
          <p className="text-body text-ink-2">{t('emptyBody')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span data-testid="valuation-latest" data-value-vnd={latest.valueVnd} className="figures text-hero font-bold tracking-tight text-ink">
              {formatVndCompact(latest.valueVnd, locale)}
            </span>
            <EstimatePill label={t('estimate')} />
          </p>
          <p data-testid="valuation-meta" className="text-body text-ink-2">
            <span className="figures">{t('dated', { date: formatDate(latest.asOf, locale) })}</span>, {t('method', { method: latest.method })},{' '}
            <span data-testid="valuation-age" data-months={age.months}>
              {t('age', age)}
            </span>
          </p>
          {latest.sourceUrl === null ? null : (
            <a href={latest.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-touch w-fit items-center gap-1.5 text-body font-semibold text-ink underline underline-offset-4">
              {t('source')}
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          )}
          {yieldBp === null ? null : (
            <p data-testid="valuation-yield" data-yield-bp={yieldBp} className="text-body text-ink">
              {t('yield', { rate: formatBps(yieldBp, locale), date: formatDate(latest.asOf, locale) })}
            </p>
          )}
        </div>
      )}
      {valuations.length === 0 ? null : (
        <div className="flex flex-col gap-2 border-t border-rule pt-4">
          <h3 className="text-body font-semibold text-ink">{t('history')}</h3>
          <ul data-testid="valuation-history" className="flex flex-col">
            {valuations.map((valuation) => {
              const amount = formatVndCompact(valuation.valueVnd, locale);
              const date = formatDate(valuation.asOf, locale);
              return (
                <li key={valuation.id} data-valuation={valuation.id} className="flex flex-wrap items-center justify-between gap-x-3 border-t border-rule py-2 first:border-t-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="figures text-body font-semibold text-ink">{formatVnd(valuation.valueVnd, locale)}</span>
                    <span className="text-small text-ink-2">
                      <span className="figures">{date}</span>, {t('method', { method: valuation.method })}
                    </span>
                  </span>
                  {scope === null ? null : (
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
      {scope === null ? null : <AddValuation label={t('add')} scope={scope} />}
    </section>
  );
}
