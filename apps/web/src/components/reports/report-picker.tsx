import { getTranslations } from 'next-intl/server';
import { FilterTabs } from '@/components/filter-tabs';
import { REPORT_KINDS, REPORTS, type ReportKind } from '@/server/reports/load';

export async function ReportPicker({ current }: { current: ReportKind | 'tax' }) {
  const t = await getTranslations('reports');
  const tab = (key: string, label: string, href: string) => ({ key, label, href, count: null, current: key === current });
  const tabs = [tab('tax', t('tax'), '/reports/tax'), ...REPORT_KINDS.map((kind) => tab(kind, t(REPORTS[kind].key), `/reports?report=${kind}`))];
  return <FilterTabs label={t('picker')} testId="report-picker" ariaCurrent="page" tabs={tabs} />;
}
