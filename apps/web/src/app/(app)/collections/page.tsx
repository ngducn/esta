import { SectionPage, sectionMetadata } from '@/components/shell/section-page';

export const generateMetadata = () => sectionMetadata('collections');

export default function CollectionsPage() {
  return <SectionPage section="collections" />;
}
