import { formatVnd } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExpenseActions } from '@/components/expenses/expense-actions';
import { ExpenseList } from '@/components/expenses/expense-list';
import { cn } from '@/lib/utils';
import { getClock } from '@/server/clock';
import { queryParam } from '@/server/documents/vault';
import { loadPropertyExpenses } from '@/server/expenses/load';
import { requireMember } from '@/server/member';
import { loadPropertyDetail } from '@/server/properties/detail';
import { PropertyDetailFrame } from '../detail-frame';

const yearOf = (date: string) => date.slice(0, 4);

/** Thu chi (FIN-1): the property's expenses for one year, the Clock's year unless `?year=` names another with expenses. */
export default async function PropertyFinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const property = await loadPropertyDetail(id);
  if (property === null) notFound();
  const member = await requireMember();
  const canEdit = member.role !== 'viewer';
  const [rows, clock, t, locale] = await Promise.all([loadPropertyExpenses(member.household.id, id), getClock(), getTranslations('expenses'), getLocale()]);
  const thisYear = yearOf(clock.today());
  const years = [...new Set([thisYear, ...rows.map((row) => yearOf(row.paidOn))])].toSorted((a, b) => b.localeCompare(a));
  const requested = queryParam(query.year);
  const year = years.includes(requested) ? requested : thisYear;
  const shown = rows.filter((row) => yearOf(row.paidOn) === year);
  const total = vnd(shown.reduce((sum, row) => sum + row.amountVnd, 0));
  const labels = { add: t('add'), photo: t('photo') };

  return (
    <PropertyDetailFrame property={property} tab="finance" headerActions={false}>
      <section aria-labelledby="expenses-title" data-testid="expense-section" className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="expenses-title" className="text-h3 text-ink">
              {t('sectionTitle', { year })}
            </h2>
            {shown.length === 0 ? null : (
              <p data-testid="expense-total" className="text-body text-ink-2 figures">
                {t('yearTotal', { count: shown.length, amount: formatVnd(total, locale) })}
              </p>
            )}
          </div>
          {canEdit ? <ExpenseActions labels={labels} primary /> : null}
        </div>
        {years.length > 1 ? (
          <nav aria-label={t('years')}>
            <ul className="flex flex-wrap gap-2">
              {years.map((option) => (
                <li key={option}>
                  <Link
                    href={`/properties/${id}/finance?year=${option}`}
                    aria-current={option === year ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-touch items-center rounded-full border px-4 text-small font-semibold figures transition-colors duration-(--duration-fast) ease-standard',
                      option === year ? 'border-ink bg-ink text-surface' : 'border-rule-strong bg-surface text-ink hover:border-field',
                    )}
                  >
                    {option}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        {shown.length === 0 ? (
          <div data-testid="expense-empty" className="flex flex-col gap-1 text-body">
            <p className="font-semibold text-ink">{t('empty', { year })}</p>
            {canEdit ? <p className="text-ink-2">{t('emptyAction')}</p> : null}
          </div>
        ) : (
          <ExpenseList rows={shown} canEdit={canEdit} />
        )}
      </section>
    </PropertyDetailFrame>
  );
}
