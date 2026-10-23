import { Receipt } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { SectionPage, sectionMetadata } from '@/components/shell/section-page';

export const generateMetadata = () => sectionMetadata('reports');

export default async function ReportsPage() {
  const t = await getTranslations('taxCard');
  return <SectionPage section="reports" action={{ label: t('reportsOpen'), href: '/reports/tax', icon: Receipt }} />;
}
