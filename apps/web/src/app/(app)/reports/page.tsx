import { getTranslations } from 'next-intl/server';
import { ChoiceLinks } from '@/components/choice-links';
import { EstimatePill } from '@/components/estimate-pill';
import { ReportDownloads } from '@/components/reports/report-downloads';
import { ReportPicker } from '@/components/reports/report-picker';
import { ReportTable } from '@/components/reports/report-table';
import { sectionMetadata } from '@/components/shell/section-page';
import { getClock } from '@/server/clock';
import { queryParam } from '@/server/documents/vault';
import { loadLedgerYears } from '@/server/ledger/load';
import { requireMember } from '@/server/member';
import { isReportKind, loadReport, REPORTS } from '@/server/reports/load';

export const generateMetadata = () => sectionMetadata('reports');

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [query, member, clock, nav, t] = await Promise.all([searchParams, requireMember(), getClock(), getTranslations('nav'), getTranslations('reports')]);
  const today = clock.today();
  const requested = queryParam(query.report);
  const kind = isReportKind(requested) ? requested : 'pnl';
  const years = REPORTS[kind].yearly ? await loadLedgerYears(member.household.id, today) : [];
  const asked = Number(queryParam(query.year));
  const year = years.includes(asked) ? asked : Number(today.slice(0, 4));
  const view = await loadReport(member.household.id, kind, year, today);
  const href = (format: 'xlsx' | 'pdf') => `/api/export/${kind}?year=${year}&format=${format}`;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-h2 break-words lg:text-h1">{nav('reports')}</h1>
      <ReportPicker current={kind} />
      <section aria-labelledby="report-title" data-testid="report" data-report={kind} className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 id="report-title" className="text-h3 text-ink">
              {view.title}
            </h2>
            {view.estimate === null ? null : <EstimatePill label={view.estimate} />}
          </div>
          <p className="text-body text-ink-2">{view.basis}</p>
        </div>
        <ChoiceLinks
          label={t('years')}
          testId="report-years"
          choices={years.map((option) => ({ key: String(option), label: String(option), href: `/reports?report=${kind}&year=${option}`, current: option === year }))}
        />
        {view.empty === null ? (
          <>
            <ReportTable table={view.table} caption={view.title} {...(view.strong === null ? {} : { strong: view.strong })} />
            <ReportDownloads
              failedLabel={t('downloadFailed')}
              downloads={[
                { href: href('xlsx'), file: `${view.file}.xlsx`, label: t('downloadExcel'), testId: 'report-xlsx' },
                { href: href('pdf'), file: `${view.file}.pdf`, label: t('downloadPdf'), testId: 'report-pdf' },
              ]}
            />
          </>
        ) : (
          <p data-testid="report-empty" className="text-body font-semibold text-ink">
            {view.empty}
          </p>
        )}
      </section>
    </div>
  );
}
