import { SectionPage, sectionMetadata } from '@/components/shell/section-page';

export const generateMetadata = () => sectionMetadata('documents');

export default function DocumentsPage() {
  return <SectionPage section="documents" />;
}
