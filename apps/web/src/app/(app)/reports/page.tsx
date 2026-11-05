import { formatCell, numberOf } from '@esta/core/export';
import { FileSpreadsheet } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { EstimatePill } from '@/components/estimate-pill';
import { FilterTabs } from '@/components/filter-tabs';
import { MoneyDisplay } from '@/components/money/money-display';
import { PageHeader } from '@/components/page-header';
import { ReportDownloads } from '@/components/reports/report-downloads';
import { ReportPicker } from '@/components/reports/report-picker';
import { ReportTable } from '@/components/reports/report-table';
import { sectionMetadata } from '@/components/shell/section-page';
import { SummaryStrip, type Figure } from '@/components/summary-strip';
import { getClock } from '@/server/clock';
import { queryParam } from '@/server/documents/vault';
import { loadLedgerYears } from '@/server/ledger/load';
import { requireMember } from '@/server/member';
import { isReportKind, loadReport, REPORTS } from '@/server/reports/load';

export const generateMetadata = () => sectionMetadata('reports');

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [query, member, clock, nav, t, locale] = await Promise.all([searchParams, requireMember(), getClock(), getTranslations('nav'), getTranslations('reports'), getLocale()]);
  const today = clock.today();
  const requested = queryParam(query.report);
  const kind = isReportKind(requested) ? requested : 'pnl';
  const years = REPORTS[kind].yearly ? await loadLedgerYears(member.household.id, today) : [];
  const asked = Number(queryParam(query.year));
  const year = years.includes(asked) ? asked : Number(today.slice(0, 4));
  const view = await loadReport(member.household.id, kind, year, today);
  const { table } = view;
  const figures: Figure[] = table.columns.slice(1).flatMap((column, index): Figure[] => {
    const cell = table.totals.cells[index + 1];
    if (cell === undefined || numberOf(cell) === null) return [];
    return [{ label: column.label, value: cell.kind === 'vnd' ? <MoneyDisplay amount={cell.value} className="text-start" /> : formatCell(cell, locale) }];
  });
  const href = (format: 'xlsx' | 'pdf') => `/api/export/${kind}?year=${year}&format=${format}`;

  const downloads = [
    { href: href('xlsx'), file: `${view.file}.xlsx`, label: t('downloadExcel'), testId: 'report-xlsx' },
    { href: href('pdf'), file: `${view.file}.pdf`, label: t('downloadPdf'), testId: 'report-pdf' },
  ];

  return (
    <div className="flex flex-col gap-stack">
      <PageHeader title={nav('reports')} meta={<p>{t('lead')}</p>} />
      {view.empty === null && figures.length >= 2 ? <SummaryStrip label={t('stripLabel')} unknownLabel={t('none')} figures={figures.slice(0, 4)} /> : null}
      <div className="flex flex-wrap items-center gap-2 lg:gap-3">
        <ReportPicker current={kind} />
        {years.length < 2 ? null : (
          <FilterTabs
            label={t('years')}
            testId="report-years"
            tabs={years.map((option) => ({ key: String(option), label: String(option), count: null, href: `/reports?report=${kind}&year=${option}`, current: option === year }))}
          />
        )}
        {view.empty === null ? <ReportDownloads failedLabel={t('downloadFailed')} downloads={downloads} /> : null}
      </div>
      <section aria-labelledby="report-title" data-testid="report" data-report={kind} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 id="report-title" className="text-title-3 text-text">
              {view.title}
            </h2>
            {view.estimate === null ? null : <EstimatePill label={view.estimate} />}
          </div>
          <p className="text-body text-text-secondary">{view.basis}</p>
        </div>
        {view.empty === null ? (
          <ReportTable table={table} caption={view.title} {...(view.strong === null ? {} : { strong: view.strong })} />
        ) : (
          <EmptyState icon={FileSpreadsheet} title={view.empty} testId="report-empty" className="border-0 shadow-none" />
        )}
      </section>
    </div>
  );
}
