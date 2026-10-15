import { SectionPage, sectionMetadata } from '@/components/shell/section-page';

export const generateMetadata = () => sectionMetadata('reports');

export default function ReportsPage() {
  return <SectionPage section="reports" />;
}
