import { getTranslations } from 'next-intl/server';
import { ChoiceLinks } from '@/components/choice-links';
import { REPORT_KINDS, REPORTS, type ReportKind } from '@/server/reports/load';

/** Báo cáo's reports, the tax card first, as one row of links. */
export async function ReportPicker({ current }: { current: ReportKind | 'tax' }) {
  const t = await getTranslations('reports');
  const reports = REPORT_KINDS.map((kind) => ({ key: kind, label: t(REPORTS[kind].key), href: `/reports?report=${kind}`, current: kind === current }));
  return <ChoiceLinks label={t('picker')} testId="report-picker" choices={[{ key: 'tax', label: t('tax'), href: '/reports/tax', current: current === 'tax' }, ...reports]} />;
}
