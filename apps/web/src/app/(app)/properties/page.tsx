import { SectionPage, sectionMetadata } from '@/components/shell/section-page';

export const generateMetadata = () => sectionMetadata('properties');

export default function PropertiesPage() {
  return <SectionPage section="properties" />;
}
