import { boardMonthParam, parseBoardMonth } from '@esta/core/collections';
import type { ExportTable } from '@esta/core/export';
import { formatVnd } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { Download } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExpenseActions } from '@/components/expenses/expense-actions';
import { ExpenseList } from '@/components/expenses/expense-list';
import { LedgerTable } from '@/components/ledger/ledger-table';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';
import { getClock } from '@/server/clock';
import { queryParam } from '@/server/documents/vault';
import { loadPropertyExpenses } from '@/server/expenses/load';
import { loadLedgerYear, loadLedgerYears } from '@/server/ledger/load';
import { requireMember } from '@/server/member';
import { loadPropertyDetail } from '@/server/properties/detail';
import { PropertyDetailFrame } from '../detail-frame';

const total = (table: ExportTable, column: string) => {
  const cell = table.totals.cells[table.columns.findIndex((candidate) => candidate.id === column)];
  return cell?.kind === 'vnd' ? cell.value : vnd(0);
};

/**
 * Thu chi (FIN-1, FIN-2): the property's ledger for one year and its expenses below it. `?year=` picks the year;
 * `?month=2026-10` opens that month's year and marks its row.
 */
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
  const clock = await getClock();
  const today = clock.today();
  const monthParam = queryParam(query.month);
  const marked = boardMonthParam(parseBoardMonth(monthParam, today)) === monthParam ? monthParam : null;
  const years = await loadLedgerYears(member.household.id, id, today);
  const requested = Number(queryParam(query.year) || marked?.slice(0, 4));
  const year = years.includes(requested) ? requested : Number(today.slice(0, 4));
  const [ledger, rows, t, tLedger, locale] = await Promise.all([
    loadLedgerYear(member.household.id, id, year, today),
    loadPropertyExpenses(member.household.id, id),
    getTranslations('expenses'),
    getTranslations('ledger'),
    getLocale(),
  ]);
  const shown = rows.filter((row) => row.paidOn.startsWith(`${year}-`));
  const expenseTotal = vnd(shown.reduce((sum, row) => sum + row.amountVnd, 0));
  const exportHref = (format: 'csv' | 'xlsx') => `/api/export/ledger?propertyId=${id}&year=${year}&format=${format}`;

  return (
    <PropertyDetailFrame property={property} tab="finance" expenseActions={false}>
      <section aria-labelledby="ledger-title" data-testid="ledger" className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="ledger-title" className="text-h3 text-ink">
            {tLedger('title', { year })}
          </h2>
          {ledger.empty ? null : (
            <p data-testid="ledger-summary" className="text-body text-ink-2 figures">
              {tLedger('summary', {
                income: formatVnd(total(ledger.table, 'income'), locale),
                expenses: formatVnd(total(ledger.table, 'expenses'), locale),
                noi: formatVnd(total(ledger.table, 'noi'), locale),
              })}
            </p>
          )}
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
        {ledger.empty ? (
          <div data-testid="ledger-empty" className="flex flex-col gap-1 text-body">
            <p className="font-semibold text-ink">{tLedger('empty', { year })}</p>
            <p className="text-ink-2">{tLedger('emptyAction')}</p>
          </div>
        ) : (
          <>
            <LedgerTable
              table={ledger.table}
              caption={tLedger('caption', { year })}
              marked={marked?.startsWith(`${year}-`) ? { key: marked, label: tLedger('marked') } : null}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-small text-ink-muted">{tLedger('basis')}</p>
              <div role="group" aria-label={tLedger('downloads')} className="grid grid-cols-2 gap-2 sm:flex">
                <a href={exportHref('csv')} download data-testid="ledger-csv" className={buttonVariants({ variant: 'outline' })}>
                  <Download aria-hidden="true" />
                  {tLedger('downloadCsv')}
                </a>
                <a href={exportHref('xlsx')} download data-testid="ledger-xlsx" className={buttonVariants({ variant: 'outline' })}>
                  <Download aria-hidden="true" />
                  {tLedger('downloadExcel')}
                </a>
              </div>
            </div>
          </>
        )}
      </section>
      <section aria-labelledby="expenses-title" data-testid="expense-section" className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="expenses-title" className="text-h3 text-ink">
              {t('sectionTitle', { year })}
            </h2>
            {shown.length === 0 ? null : (
              <p data-testid="expense-total" className="text-body text-ink-2 figures">
                {t('yearTotal', { count: shown.length, amount: formatVnd(expenseTotal, locale) })}
              </p>
            )}
          </div>
          {canEdit ? <ExpenseActions labels={{ add: t('add'), photo: t('photo') }} primary /> : null}
        </div>
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
